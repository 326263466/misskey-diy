/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import { computed, h, nextTick, ref, shallowReactive } from 'vue';
import MkPagination from '@/components/MkPagination.vue';
import MkResult from '@/components/global/MkResult.vue';
import { Paginator } from '@/utility/paginator.js';
import { appearDirective } from '@/directives/appear.js';
import { prefer } from '@/preferences.js';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => ({ contextMenu: vi.fn() }));
vi.mock('@/instance.js', () => ({ instance: {} }));
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
	const currentProps = shallowReactive({ paginator, ...props });
	// VTU 会把包含 ref 的初始 prop 单独保存，setProps 无法覆盖它；用父组件模拟真实切换。
	const view = render({
		render: () => h(MkPagination, { ...currentProps }, {
			default: ({ items }: { items: { id: string }[] }) => items.map(item => h('article', { key: item.id }, item.id)),
		}),
	}, {
		global: {
			stubs: { transition: false, MkLoading: { template: '<div role="status"/>' }, MkResult: true, MkError: true },
			directives: { appear: appearDirective },
		},
	});
	return {
		...view,
		async rerender(updated: Partial<typeof currentProps>) {
			Object.assign(currentProps, updated);
			await nextTick();
		},
	};
}

function intersect(visible = true) {
	for (const [target, callback] of observers) {
		callback([{ target, isIntersecting: visible } as IntersectionObserverEntry], {} as IntersectionObserver);
	}
}

beforeEach(() => {
	prefer.s.animation = false;
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
	test('请求过程中不显示空状态文案和操作，刷新时立即隐藏', async () => {
		const view = render(MkResult, {
			props: { type: 'empty', loading: true, text: '没有数据' },
			slots: { default: '<button>创建第一项</button>' },
			global: { stubs: { MkLoading: { template: '<div role="status"/>' }, MkSystemIcon: true } },
		});
		expect(view.getByRole('status')).toBeTruthy();
		expect(view.queryByText('没有数据')).toBeNull();
		expect(view.queryByRole('button', { name: '创建第一项' })).toBeNull();

		await view.rerender({ loading: false });
		expect(view.queryByRole('status')).toBeNull();
		expect(view.getByText('没有数据')).toBeTruthy();
		expect(view.getByRole('button', { name: '创建第一项' })).toBeTruthy();

		await view.rerender({ loading: true });
		expect(view.getByRole('status')).toBeTruthy();
		expect(view.queryByText('没有数据')).toBeNull();
		expect(view.queryByRole('button', { name: '创建第一项' })).toBeNull();
	});

	test('切换分页器加载新标签，返回已加载标签保留结果', async () => {
		mocks.api.mockResolvedValueOnce(rows(2)).mockResolvedValueOnce(rows(1, 80));
		const first = new Paginator('notes/timeline', { canFetchDetection: 'limit' });
		const second = new Paginator('notes/timeline', { canFetchDetection: 'limit' });
		const view = renderPagination(first);
		await waitFor(() => expect(view.container.querySelectorAll('article')).toHaveLength(2));
		await view.rerender({ paginator: second });
		await waitFor(() => expect(view.getByText('0080')).toBeTruthy());
		expect(view.queryByText('0100')).toBeNull();
		await view.rerender({ paginator: first });
		await waitFor(() => expect(view.getByText('0100')).toBeTruthy());
		expect(view.queryByText('0080')).toBeNull();
		expect(mocks.api).toHaveBeenCalledTimes(2);
	});

	test('参数监听跟随当前分页器，回到参数已变化的标签重新加载', async () => {
		const firstWithFiles = ref(false);
		const secondWithFiles = ref(true);
		const first = new Paginator('notes/timeline', { computedParams: computed(() => ({ withFiles: firstWithFiles.value })) });
		const second = new Paginator('notes/timeline', { computedParams: computed(() => ({ withFiles: secondWithFiles.value })) });
		const view = renderPagination(first);
		await waitFor(() => expect(first.fetching.value).toBe(false));
		await view.rerender({ paginator: second });
		await waitFor(() => expect(second.fetching.value).toBe(false));
		mocks.api.mockClear();
		firstWithFiles.value = true;
		await nextTick();
		expect(mocks.api).not.toHaveBeenCalled();
		secondWithFiles.value = false;
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('notes/timeline', expect.objectContaining({ withFiles: false })));
		expect(mocks.api).toHaveBeenCalledTimes(1);
		await view.rerender({ paginator: first });
		await waitFor(() => expect(mocks.api).toHaveBeenLastCalledWith('notes/timeline', expect.objectContaining({ withFiles: true })));
	});

	test.each([
		{ showLoading: true, pageEmpty: true, animation: false },
		{ showLoading: false, pageEmpty: true, animation: false },
		{ showLoading: true, pageEmpty: false, animation: true },
		{ showLoading: false, pageEmpty: false, animation: true },
	])('加载、刷新和切换标签时不提前显示空状态：%o', async ({ showLoading, pageEmpty, animation }) => {
		prefer.s.animation = animation;
		let finish!: (value: ReturnType<typeof rows>) => void;
		mocks.api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
		const paginator = new Paginator('notes/timeline', { canFetchDetection: 'limit' });
		const view = renderPagination(paginator, { showLoading, pageEmpty });
		expect(view.queryByRole('status') != null).toBe(showLoading);
		expect(view.container.querySelector('mk-result-stub')).toBeNull();
		finish([]);
		await waitFor(() => expect(view.container.querySelector('mk-result-stub')).not.toBeNull());
		expect(view.queryByRole('status')).toBeNull();

		mocks.api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
		const reload = paginator.reload();
		await nextTick();
		expect(view.queryByRole('status') != null).toBe(showLoading);
		expect(view.container.querySelector('mk-result-stub')).toBeNull();
		finish(rows(1));
		await reload;
		await waitFor(() => expect(view.container.querySelectorAll('article')).toHaveLength(1));
		expect(view.container.querySelector('mk-result-stub')).toBeNull();

		mocks.api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
		await view.rerender({ paginator: new Paginator('notes/timeline', { canFetchDetection: 'limit' }) });
		expect(view.queryByRole('status') != null).toBe(showLoading);
		expect(view.container.querySelector('mk-result-stub')).toBeNull();
		finish([]);
		await waitFor(() => expect(view.container.querySelector('mk-result-stub')).not.toBeNull());
	});

	test('silent pagination keeps existing rows and still appends the next page', async () => {
		let finish!: (value: ReturnType<typeof rows>) => void;
		mocks.api.mockResolvedValueOnce(rows(15)).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
		const paginator = new Paginator('notes/timeline', { canFetchDetection: 'limit' });
		const view = renderPagination(paginator, { showLoading: false });
		await waitFor(() => expect(observers.size).toBe(1));
		intersect();
		await waitFor(() => expect(paginator.fetchingOlder.value).toBe(true));
		expect(view.queryByRole('status')).toBeNull();
		expect(view.container.querySelectorAll('article')).toHaveLength(15);
		finish(rows(1, 85));
		await waitFor(() => expect(view.container.querySelectorAll('article')).toHaveLength(16));
		expect(paginator.canFetchOlder.value).toBe(false);
	});

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
