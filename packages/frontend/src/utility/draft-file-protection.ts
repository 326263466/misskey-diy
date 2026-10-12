/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';
import { genId } from '@/utility/id.js';
import { misskeyApi } from '@/utility/misskey-api.js';

type DraftRequest = { draftId: string; fileIds: string[]; text: string; delete?: boolean };
type PendingDraft = { request: DraftRequest; revision: string };
type Account = { id: string; token?: string };
const prefix = 'misskey:draftFileProtection:';
const transientPrefix = 'misskey:transientDraftProtection:';
const closedPrefix = 'misskey:closedDraftProtection:';
const running = new Map<string, Promise<boolean>>();
const retries = new Map<string, number>();
const observers = new Map<string, Set<(saved: boolean) => void>>();
const ownedDrafts = new Set<string>();

function read(key: string): PendingDraft | null {
	try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}

function hasSavedDraft(accountId: string, draftId: string) {
	return Object.keys(localStorage).some(key => (key === 'drafts' || key === 'chatMessageDrafts' || key.startsWith(`misskey:articleDraft:${accountId}`) || key.startsWith(`misskey:editDraft:${accountId}:`) || key.startsWith(`misskey:chatDraft:${accountId}:`)) && localStorage.getItem(key)?.includes(JSON.stringify(draftId)));
}

function synchronize(account: Account, key: string): Promise<boolean> {
	const active = running.get(key);
	if (active) return active;
	const execute = async () => {
		for (let pending = read(key); pending; pending = read(key)) {
			try {
				await misskeyApi('drive/files/draft', pending.request, account.token);
				// 输入可能已更新，不能让较早完成的请求清掉新内容。
				if (read(key)?.revision === pending.revision) localStorage.removeItem(key);
			} catch {
				for (const observer of observers.get(key) ?? []) observer(false);
				if (!retries.has(key)) retries.set(key, window.setTimeout(() => {
					retries.delete(key);
					void synchronize(account, key);
				}, 30_000));
				return false;
			}
		}
		window.clearTimeout(retries.get(key));
		retries.delete(key);
		for (const observer of observers.get(key) ?? []) observer(true);
		return true;
	};
	// 刷新或其他窗口也会重放队列，按草稿加锁，避免删除请求被旧更新覆盖。
	const promise = (navigator.locks ? navigator.locks.request(key, execute) : execute()).finally(() => { running.delete(key); });
	running.set(key, promise);
	return promise;
}

export function resumeDraftFileProtection(account: Account) {
	const accountPrefix = `${prefix}${account.id}:`;
	const transientAccountPrefix = `${transientPrefix}${account.id}:`;
	const closedAccountPrefix = `${closedPrefix}${account.id}:`;
	const replay = () => {
		try {
			for (const key of Object.keys(localStorage)) {
				if (key.startsWith(closedAccountPrefix) && Number(localStorage.getItem(key)) < Date.now()) localStorage.removeItem(key);
				if (key.startsWith(accountPrefix)) void synchronize(account, key);
				if (key.startsWith(transientAccountPrefix) && navigator.locks) {
					const id = key.slice(transientAccountPrefix.length);
					void navigator.locks.request(`${accountPrefix}${id}:owner`, { ifAvailable: true }, async lock => {
						if (!lock || !localStorage.getItem(key)) return;
						// 保存正文后、清掉预约标记前崩溃时，已有草稿仍须保留。
						if (hasSavedDraft(account.id, id)) { localStorage.removeItem(key); return; }
						const queueKey = `${accountPrefix}${id}`;
						localStorage.setItem(queueKey, JSON.stringify({ request: { draftId: id, fileIds: [], text: '', delete: true }, revision: genId() } satisfies PendingDraft));
						localStorage.removeItem(key);
						await synchronize(account, queueKey);
					}).catch(() => { /* 下次启动或联网时重试。 */ });
				}
			}
		} catch { /* 存储不可用时，由当前编辑器显示未保护状态。 */ }
	};
	replay();
	window.addEventListener('online', replay);
	return () => { window.removeEventListener('online', replay); };
}

export function createDraftFileProtection(account: Account, options: { transient?: boolean } = {}) {
	let draftId = `composer:${crypto.randomUUID()}`;
	const status = ref<'saved' | 'pending' | 'failed'>('saved');
	let revision = 0;
	let lastRequest = '';
	let storageFailed = false;
	const accountPrefix = `${prefix}${account.id}:`;
	const stopReplay = resumeDraftFileProtection(account);
	const observedKeys = new Set<string>();
	const observer = (saved: boolean) => { status.value = saved && !storageFailed ? 'saved' : 'failed'; };
	let disposed = false;
	let releaseOwnership = () => {};
	let generation = 0;
	let persisted = false;
	const transientKey = (id: string) => `${transientPrefix}${account.id}:${id}`;
	const closedKey = (id: string) => `${closedPrefix}${account.id}:${id}`;
	const reserveTransient = () => {
		if (options.transient || !persisted) localStorage.setItem(transientKey(draftId), '1');
	};

	function claim(id: string): Promise<boolean> {
		const expectedGeneration = generation;
		const key = `${accountPrefix}${id}:owner`;
		if (!navigator.locks) {
			// 无跨窗口锁时无法证明旧编辑器已关闭，保守保留它的引用。
			if (id !== draftId) return Promise.resolve(false);
			if (ownedDrafts.has(key)) return Promise.resolve(false);
			ownedDrafts.add(key);
			releaseOwnership = () => { ownedDrafts.delete(key); };
			return Promise.resolve(true);
		}
		return new Promise(resolve => {
			void navigator.locks.request(key, { ifAvailable: true }, async lock => {
				if (!lock || disposed || expectedGeneration !== generation) { resolve(false); return; }
				const released = new Promise<void>(done => { releaseOwnership = done; });
				resolve(true);
				await released;
			}).catch(() => resolve(false));
		});
	}

	let ownershipReady = claim(draftId);

	function restore(id: unknown) {
		const previous = ownershipReady;
		const expectedGeneration = generation;
		ownershipReady = (async () => {
			await previous;
			if (disposed || expectedGeneration !== generation || typeof id !== 'string' || !/^composer:[a-zA-Z0-9_-]+$/.test(id) || id.length > 100 || id === draftId || localStorage.getItem(closedKey(id)) || read(`${accountPrefix}${id}`)?.request.delete) return true;
			const releasePrevious = releaseOwnership;
			// 同一草稿同时被两个窗口恢复时，各自登记，避免一个窗口清空另一个窗口的附件。
			if (await claim(id)) {
				releasePrevious();
				draftId = id;
				lastRequest = 'restored';
			}
			return true;
		})();
		return ownershipReady;
	}

	function markStorageFailed() {
		storageFailed = true;
		revision++;
		status.value = 'failed';
	}

	async function update(fileIds: string[], text: string) {
		const expectedGeneration = generation;
		await ownershipReady;
		if (expectedGeneration !== generation) return false;
		// 普通文字没有文件引用；首次打开空编辑器也不需要登记空草稿。
		if (!lastRequest && fileIds.length === 0 && !/https?:\/\/|\/(?:files|drive)\//i.test(text)) return true;
		const request: DraftRequest = { draftId, fileIds: [...new Set(fileIds)], text };
		const serialized = JSON.stringify(request);
		if (serialized === lastRequest && status.value === 'saved') return true;
		lastRequest = serialized;
		const current = ++revision;
		status.value = 'pending';
		const key = `${accountPrefix}${draftId}`;
		if (!observers.has(key)) observers.set(key, new Set());
		observers.get(key)!.add(observer);
		observedKeys.add(key);
		try {
			reserveTransient();
			localStorage.setItem(key, JSON.stringify({ request, revision: genId() } satisfies PendingDraft));
			storageFailed = false;
		} catch {
			markStorageFailed();
			return false;
		}
		const saved = await synchronize(account, key);
		if (current === revision) status.value = saved ? 'saved' : 'failed';
		return saved;
	}

	function release() {
		const releasedId = draftId;
		const key = `${accountPrefix}${releasedId}`;
		try {
			// 先同步落盘，浏览器关闭时也能在下次启动补发解除请求。
			localStorage.setItem(closedKey(releasedId), String(Date.now() + 30 * 24 * 60 * 60 * 1000));
			localStorage.setItem(key, JSON.stringify({ request: { draftId: releasedId, fileIds: [], text: '', delete: true }, revision: genId() } satisfies PendingDraft));
		} catch {
			markStorageFailed();
			return Promise.resolve(false);
		}
		try { localStorage.removeItem(transientKey(releasedId)); } catch { /* 解除队列已落盘，标记可在重放时清理。 */ }
		generation++;
		revision++;
		observers.get(key)?.delete(observer);
		if (observers.get(key)?.size === 0) observers.delete(key);
		observedKeys.delete(key);
		releaseOwnership();
		draftId = `composer:${crypto.randomUUID()}`;
		persisted = false;
		lastRequest = '';
		storageFailed = false;
		status.value = 'saved';
		ownershipReady = claim(draftId);
		return synchronize(account, key);
	}

	const onPageHide = (event: PageTransitionEvent) => {
		if (options.transient && !event.persisted) void release();
	};
	window.addEventListener('pagehide', onPageHide);

	return {
		status,
		get id() { reserveTransient(); return draftId; },
		markPersisted() {
			if (options.transient) return;
			persisted = true;
			try { localStorage.removeItem(transientKey(draftId)); } catch { /* 恢复时会检查已经保存的正文。 */ }
		},
		markStorageFailed,
		restore,
		update,
		release,
		dispose: () => {
			disposed = true;
			releaseOwnership();
			window.removeEventListener('pagehide', onPageHide);
			stopReplay();
			for (const key of observedKeys) {
				observers.get(key)?.delete(observer);
				if (observers.get(key)?.size === 0) observers.delete(key);
			}
		},
	};
}
