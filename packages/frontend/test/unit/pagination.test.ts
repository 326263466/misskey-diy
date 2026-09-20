/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import { h } from 'vue';
import MkPagination from '@/components/MkPagination.vue';
import { Paginator } from '@/utility/paginator.js';
import { appearDirective } from '@/directives/appear.js';
import { prefer } from '@/preferences.js';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => ({ contextMenu: vi.fn() }));
vi.mock('@/components/MkPullToRefresh.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/MkPaginationControl.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/preferences.js', async () => {
	const { reactive } = await import('vue');
	return { prefer: { s: reactive({ animation: false, enablePullToRefresh: false }) } };
});

const observers = new Map<Element, IntersectionObserverCallback>();

function rows(count: number, start = 100) {
	return Array.from({ length: count }, (_, i) => ({ id: String(start - i).padStart(4, '0'), createdAt: '2026-09-09T00:00:00Z' }));
}

function renderPagination(paginator: Paginator<'notes/timeline'>, props = {}) {
	return render(MkPagination, {
		props: { paginator, ...props },
		slots: { default: ({ items }: { items: { id: string }[] }) => items.map(item => h('article', { key: item.id }, item.id)) },
		global: {
			stubs: { MkLoading: { template: '<div role="status"/>' }, MkResult: true, MkError: true },
			directives: { appear: appearDirective },
		},
	});
}

function intersect(visible = true) {
	for (const [target, callback] of observers) {
		callback([{ target, isIntersecting: visible } as IntersectionObserverEntry], {} as IntersectionObserver);
	}
}

beforeEach(() => {
	mocks.api.mockReset().mockResolvedValue([]);
	vi.stubGlobal('IntersectionObserver', class {
		private target?: Element;
		constructor(private callback: IntersectionObserverCallback) {}
		observe(target: Element) {
			this.target = target;
			observers.set(target, this.callback);
		}
		disconnect() {
			if (this.target) observers.delete(this.target);
		}
	});
});

afterEach(() => {
	cleanup();
	observers.clear();
	vi.unstubAllGlobals();
});

describe('分页边界', () => {
	test('空列表没有下一页', async () => {
		const paginator = new Paginator('notes/timeline', {});
		await paginator.init();
		expect(paginator.canFetchOlder.value).toBe(false);
		expect(mocks.api).toHaveBeenCalledTimes(1);
	});

	test('不足一页时确认已到底，刷新不会误报下一页', async () => {
		mocks.api.mockResolvedValueOnce(rows(3));
		const paginator = new Paginator('notes/timeline', {});
		await paginator.init();
		expect(paginator.items.value).toHaveLength(3);
		expect(paginator.canFetchOlder.value).toBe(false);
		expect(mocks.api).toHaveBeenLastCalledWith('notes/timeline', expect.objectContaining({ limit: 1, untilId: '0098', allowPartial: false }));
	});

	test('部分返回的短页仍能继续加载后续内容', async () => {
		mocks.api.mockResolvedValueOnce(rows(3)).mockResolvedValueOnce(rows(1, 97));
		const paginator = new Paginator('notes/timeline', {});
		await paginator.init();
		expect(paginator.canFetchOlder.value).toBe(true);
		mocks.api.mockResolvedValueOnce(rows(2, 97));
		await paginator.fetchOlder();
		expect(paginator.items.value.map(item => item.id)).toEqual(['0100', '0099', '0098', '0097', '0096']);
		expect(paginator.canFetchOlder.value).toBe(false);
	});

	test('按请求的实际页大小判断结束', async () => {
		mocks.api.mockResolvedValueOnce(rows(19));
		const paginator = new Paginator('notes/timeline', { limit: 20, canFetchDetection: 'limit' });
		await paginator.init();
		expect(paginator.canFetchOlder.value).toBe(false);
		expect(mocks.api).toHaveBeenCalledTimes(1);
	});

	test('追加页按 30 条判断，不沿用首屏的 15 条阈值', async () => {
		mocks.api.mockResolvedValueOnce(rows(15)).mockResolvedValueOnce(rows(20, 85));
		const paginator = new Paginator('notes/timeline', { canFetchDetection: 'limit' });
		await paginator.init();
		await paginator.fetchOlder();
		expect(paginator.items.value).toHaveLength(35);
		expect(paginator.canFetchOlder.value).toBe(false);
	});

	test('不可分页接口即使满页也没有下一页', async () => {
		mocks.api.mockResolvedValueOnce(rows(15));
		const paginator = new Paginator('notes/timeline', { noPaging: true, canFetchDetection: 'limit' });
		await paginator.init();
		await paginator.fetchNewer();
		expect(paginator.canFetchOlder.value).toBe(false);
		expect(mocks.api).toHaveBeenCalledTimes(1);
	});

	test('offset 接口从已返回记录后确认下一页', async () => {
		mocks.api.mockResolvedValueOnce(rows(3)).mockResolvedValueOnce(rows(1, 97));
		const paginator = new Paginator('notes/timeline', { offsetMode: true });
		await paginator.init();
		expect(mocks.api).toHaveBeenLastCalledWith('notes/timeline', expect.objectContaining({ offset: 3, limit: 1 }));
	});

	test('刷新后忽略旧分页请求，避免混入旧筛选结果', async () => {
		mocks.api.mockResolvedValueOnce(rows(15));
		const paginator = new Paginator('notes/timeline', {});
		await paginator.init();
		let resolve!: (value: ReturnType<typeof rows>) => void;
		mocks.api.mockImplementationOnce(() => new Promise(value => { resolve = value; }));
		const loading = paginator.fetchOlder();
		await paginator.reload();
		resolve(rows(30, 85));
		await loading;
		expect(paginator.items.value).toEqual([]);
		expect(paginator.canFetchOlder.value).toBe(false);
		expect(paginator.fetchingOlder.value).toBe(false);
	});
});

describe('自动加载', () => {
	test('短列表不显示加载更多或创建观察点', async () => {
		mocks.api.mockResolvedValueOnce(rows(2));
		const view = renderPagination(new Paginator('notes/timeline', {}));
		await waitFor(() => expect(view.container.querySelectorAll('article')).toHaveLength(2));
		expect(view.queryByRole('button')).toBeNull();
		expect(observers.size).toBe(0);
	});

	test('自动模式仅在边界进入视口后追加，成功后重新观察，到底后移除', async () => {
		mocks.api.mockResolvedValueOnce(rows(15)).mockResolvedValueOnce(rows(30, 85));
		const view = renderPagination(new Paginator('notes/timeline', {}));
		await waitFor(() => expect(observers.size).toBe(1));
		expect(mocks.api).toHaveBeenCalledTimes(1);
		expect(view.queryByRole('button')).toBeNull();
		const firstTarget = [...observers.keys()][0];
		intersect();
		await waitFor(() => expect(view.container.querySelectorAll('article')).toHaveLength(45));
		expect([...observers.keys()][0]).not.toBe(firstTarget);
		intersect();
		await waitFor(() => expect(observers.size).toBe(0));
		expect(view.queryByRole('status')).toBeNull();
	});

	test('请求失败不会反复重建观察点并无限请求', async () => {
		mocks.api.mockResolvedValueOnce(rows(15)).mockRejectedValueOnce(new Error('offline'));
		const paginator = new Paginator('notes/timeline', {});
		renderPagination(paginator);
		await waitFor(() => expect(observers.size).toBe(1));
		const target = [...observers.keys()][0];
		intersect();
		await waitFor(() => expect(paginator.fetchingOlder.value).toBe(false));
		expect([...observers.keys()][0]).toBe(target);
		expect(mocks.api).toHaveBeenCalledTimes(2);
	});
});
