/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));

let createProtection: typeof import('@/utility/draft-file-protection.js')['createDraftFileProtection'];
const protections: ReturnType<typeof createProtection>[] = [];
let writeStorage: ReturnType<typeof vi.fn>;
const pendingKeys = () => Object.keys(localStorage).filter(key => key.startsWith('misskey:draftFileProtection:'));

function create(accountId = 'self', options: { transient?: boolean } = {}) {
	const protection = createProtection({ id: accountId, token: `token-${accountId}` }, options);
	if (!options.transient) protection.markPersisted();
	protections.push(protection);
	return protection;
}

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>(done => { resolve = done; });
	return { promise, resolve };
}

function stubLocks() {
	const held = new Set<string>();
	vi.stubGlobal('navigator', { locks: {
		request: (name: string, optionsOrCallback: unknown, callback?: (lock: { name: string } | null) => Promise<unknown>) => {
			const run = callback ?? optionsOrCallback as (lock: { name: string } | null) => Promise<unknown>;
			if (held.has(name)) return Promise.resolve(run(null));
			held.add(name);
			return Promise.resolve(run({ name })).finally(() => { held.delete(name); });
		},
	} });
}

beforeEach(async () => {
	vi.resetModules();
	vi.useFakeTimers();
	mocks.api.mockReset().mockResolvedValue(undefined);
	const storage: Record<string, string> = {};
	writeStorage = vi.fn((key: string, value: string) => { storage[key] = value; });
	vi.stubGlobal('localStorage', new Proxy({
		getItem: (key: string) => storage[key] ?? null,
		setItem: writeStorage,
		removeItem: (key: string) => { delete storage[key]; },
	}, { ownKeys: () => Object.keys(storage), getOwnPropertyDescriptor: () => ({ configurable: true, enumerable: true }) }));
	vi.stubGlobal('navigator', { locks: undefined });
	({ createDraftFileProtection: createProtection } = await import('@/utility/draft-file-protection.js'));
});

afterEach(() => {
	for (const protection of protections.splice(0)) protection.dispose();
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

test('串行登记变更和发布后的解除请求，旧响应不会丢掉最新草稿', async () => {
	const first = deferred();
	const second = deferred();
	mocks.api.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
	const protection = create();
	const initial = protection.update(['file-a'], '');
	const edited = protection.update(['file-b'], 'https://example.test/new');
	await vi.advanceTimersByTimeAsync(0);
	expect(mocks.api).toHaveBeenCalledTimes(1);
	first.resolve();
	await vi.advanceTimersByTimeAsync(0);
	expect(mocks.api).toHaveBeenNthCalledWith(2, 'drive/files/draft', expect.objectContaining({ draftId: protection.id, fileIds: ['file-b'], text: 'https://example.test/new' }), 'token-self');
	const originalId = protection.id;
	const released = protection.release();
	await vi.advanceTimersByTimeAsync(0);
	expect(mocks.api).toHaveBeenCalledTimes(2);
	second.resolve();
	await Promise.all([initial, edited, released]);
	expect(mocks.api).toHaveBeenLastCalledWith('drive/files/draft', expect.objectContaining({ draftId: originalId, delete: true }), 'token-self');
	expect(pendingKeys()).toHaveLength(0);
	expect(protection.status.value).toBe('saved');
});

test('离线失败保留待登记内容，联网后重试并更新保护状态', async () => {
	mocks.api.mockRejectedValueOnce(new Error('offline'));
	const protection = create();
	expect(await protection.update(['file-a'], '')).toBe(false);
	expect(protection.status.value).toBe('failed');
	expect(pendingKeys()).toHaveLength(1);
	window.dispatchEvent(new Event('online'));
	await vi.advanceTimersByTimeAsync(0);
	expect(mocks.api).toHaveBeenCalledTimes(2);
	expect(mocks.api.mock.calls.every(call => !call[1].delete)).toBe(true);
	expect(protection.status.value).toBe('saved');
	expect(pendingKeys()).toHaveLength(0);
});

test('解除失败可以重放，其他账号不会代替原账号发送', async () => {
	const original = create();
	const originalId = original.id;
	await original.update(['file-a'], '');
	mocks.api.mockRejectedValueOnce(new Error('offline'));
	expect(await original.release()).toBe(false);
	original.dispose();
	mocks.api.mockClear();
	create('other');
	expect(mocks.api).not.toHaveBeenCalled();
	create();
	await vi.advanceTimersByTimeAsync(0);
	expect(mocks.api).toHaveBeenCalledOnce();
	expect(mocks.api).toHaveBeenCalledWith('drive/files/draft', expect.objectContaining({ draftId: originalId, delete: true }), 'token-self');
	expect(pendingKeys()).toHaveLength(0);
});

test('本地队列无法写入时不宣称附件已保护，恢复存储后可重新登记', async () => {
	const protection = create();
	writeStorage.mockImplementationOnce(() => { throw new Error('quota'); });
	expect(await protection.update(['file-a'], '')).toBe(false);
	expect(mocks.api).not.toHaveBeenCalled();
	expect(protection.status.value).toBe('failed');
	expect(await protection.update(['file-a'], '')).toBe(true);
	expect(protection.status.value).toBe('saved');
});

test('较早的登记成功不会清掉最新正文保存失败的提示', async () => {
	const earlier = deferred();
	mocks.api.mockReturnValueOnce(earlier.promise);
	const protection = create();
	const initial = protection.update(['file-a'], '');
	await vi.advanceTimersByTimeAsync(0);
	protection.markStorageFailed();
	protection.markPersisted();
	earlier.resolve();
	await initial;
	expect(protection.status.value).toBe('failed');
	expect(await protection.update(['file-b'], '')).toBe(true);
	expect(protection.status.value).toBe('saved');
});

test('没有跨窗口锁时恢复草稿使用独立引用，避免覆盖其他窗口', async () => {
	const first = create();
	const second = create();
	await second.restore(first.id);
	expect(second.id).not.toBe(first.id);
	await first.update(['file-a'], '');
	await second.update(['file-b'], '');
	expect(mocks.api).toHaveBeenNthCalledWith(1, 'drive/files/draft', expect.objectContaining({ draftId: first.id, fileIds: ['file-a'] }), 'token-self');
	expect(mocks.api).toHaveBeenNthCalledWith(2, 'drive/files/draft', expect.objectContaining({ draftId: second.id, fileIds: ['file-b'] }), 'token-self');
	first.dispose();
	const restored = create();
	await restored.restore(first.id);
	expect(restored.id).not.toBe(first.id);
});

test('未完成首次登记也会解除上传预留引用', async () => {
	const protection = create();
	const originalId = protection.id;
	await protection.release();
	expect(mocks.api).toHaveBeenCalledWith('drive/files/draft', expect.objectContaining({ draftId: originalId, delete: true }), 'token-self');
	expect(protection.id).not.toBe(originalId);
});

test('只有取得草稿所有权锁的编辑器复用已保存的引用', async () => {
	stubLocks();
	const first = create();
	const competing = create();
	await competing.restore(first.id);
	expect(competing.id).not.toBe(first.id);
	first.dispose();
	await vi.advanceTimersByTimeAsync(0);
	const restored = create();
	await restored.restore(first.id);
	expect(restored.id).toBe(first.id);
});

test('清空再添加不会关闭草稿，显式解除后新附件使用新 ID', async () => {
	const protection = create();
	const originalId = protection.id;
	await protection.update(['file-a'], '');
	await protection.update([], '');
	await protection.update(['file-b'], '');
	expect(mocks.api.mock.calls.every(call => call[1].draftId === originalId && !call[1].delete)).toBe(true);
	await protection.release();
	const newId = protection.id;
	expect(newId).not.toBe(originalId);
	protection.markPersisted();
	await protection.update(['file-c'], '');
	expect(mocks.api).toHaveBeenLastCalledWith('drive/files/draft', expect.objectContaining({ draftId: newId, fileIds: ['file-c'] }), 'token-self');
});

test('未保存的新帖进入 bfcache 时保留，实际离开后解除', async () => {
	const protection = create('self', { transient: true });
	const originalId = protection.id;
	await protection.update(['file-a'], '');
	mocks.api.mockClear();
	const cached = new Event('pagehide');
	Object.defineProperty(cached, 'persisted', { value: true });
	window.dispatchEvent(cached);
	await vi.advanceTimersByTimeAsync(0);
	expect(mocks.api).not.toHaveBeenCalled();
	expect(protection.id).toBe(originalId);
	window.dispatchEvent(new Event('pagehide'));
	await vi.advanceTimersByTimeAsync(0);
	expect(mocks.api).toHaveBeenCalledWith('drive/files/draft', expect.objectContaining({ draftId: originalId, delete: true }), 'token-self');
});

test('启动恢复仅清理已消失窗口的预约，仍打开的窗口保持保护', async () => {
	stubLocks();
	const protection = create('self', { transient: true });
	const originalId = protection.id;
	await protection.update(['file-a'], '');
	mocks.api.mockClear();
	create();
	await vi.advanceTimersByTimeAsync(0);
	expect(mocks.api).not.toHaveBeenCalled();
	protection.dispose();
	await vi.advanceTimersByTimeAsync(0);
	create();
	await vi.advanceTimersByTimeAsync(0);
	expect(mocks.api).toHaveBeenCalledWith('drive/files/draft', expect.objectContaining({ draftId: originalId, delete: true }), 'token-self');
});

test('正文已持久保存时，遗留的上传预约标记不会误清草稿附件', async () => {
	stubLocks();
	const protection = create('self', { transient: true });
	const originalId = protection.id;
	localStorage.setItem('drafts', JSON.stringify({ 'edit:note': { fileProtectionId: originalId } }));
	protection.dispose();
	await vi.advanceTimersByTimeAsync(0);
	create();
	await vi.advanceTimersByTimeAsync(0);
	expect(mocks.api).not.toHaveBeenCalled();
	expect(localStorage.getItem('drafts')).toContain(originalId);
});
