/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import MkStreamingNotesTimeline from '@/components/MkStreamingNotesTimeline.vue';

const mocks = vi.hoisted(() => ({ api: vi.fn(), poll: null as (() => Promise<void>) | null }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/store.js', () => ({ store: { s: { realtimeMode: false } } }));
vi.mock('@/components/MkNote.vue', () => ({ default: { props: { note: Object }, template: '<div data-note>{{ note.id }}</div>' } }));
vi.mock('@@/js/use-interval.js', () => ({ useInterval: (callback: () => Promise<void>) => { mocks.poll = callback; } }));

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
	return { promise, resolve, reject };
}

function mount() {
	return render(MkStreamingNotesTimeline, {
		props: { src: 'home', pageEmpty: true },
		global: { directives: { appear: {} }, stubs: {
			MkLoading: { template: '<div data-state="loading"/>' },
			MkError: { emits: ['retry'], template: '<button data-state="error" @click="$emit(\'retry\')"/>' },
			MkResult: { props: { type: String }, template: '<div :data-state="type"/>' },
			MkAd: true,
		} },
	});
}

const state = (view: ReturnType<typeof render>) => view.container.querySelector('[data-state]')?.getAttribute('data-state') ?? null;

beforeEach(() => mocks.api.mockReset());
afterEach(cleanup);

test('首载和空列表轮询未完成时只显示加载，返回空数组后才显示空状态', async () => {
	const request = deferred<unknown[]>();
	mocks.api.mockReturnValueOnce(request.promise).mockResolvedValue([]);
	const view = mount();
	expect(state(view)).toBe('loading');
	await Promise.resolve();
	expect(view.container.querySelector('[data-state="empty"]')).toBeNull();

	request.resolve([]);
	await waitFor(() => expect(state(view)).toBe('empty'));

	const poll = deferred<unknown[]>();
	mocks.api.mockReturnValueOnce(poll.promise);
	await mocks.poll!();
	expect(state(view)).toBe('loading');
	expect(view.container.querySelector('[data-state="empty"]')).toBeNull();
	poll.resolve([]);
	await waitFor(() => expect(state(view)).toBe('empty'));
});

test('返回数据后直接展示列表，不经过空状态', async () => {
	const request = deferred<unknown[]>();
	const hasMore = deferred<unknown[]>();
	mocks.api.mockReturnValueOnce(request.promise).mockReturnValue(hasMore.promise);
	const view = mount();
	expect(state(view)).toBe('loading');

	request.resolve([{ id: 'n1', createdAt: new Date().toISOString() }]);
	// 后续是否还有更多的探测请求尚未返回时，列表也应已显示。
	await waitFor(() => expect(view.container.querySelector('[data-note]')?.textContent).toBe('n1'));
	expect(state(view)).toBeNull();
	hasMore.resolve([]);
});

test('重试期间显示加载而不是旧的错误或空状态', async () => {
	mocks.api.mockRejectedValueOnce(new Error('network'));
	const view = mount();
	await waitFor(() => expect(state(view)).toBe('error'));

	const retry = deferred<unknown[]>();
	mocks.api.mockReturnValueOnce(retry.promise).mockResolvedValue([]);
	await fireEvent.click(view.container.querySelector('[data-state="error"]')!);
	expect(state(view)).toBe('loading');

	retry.resolve([]);
	await waitFor(() => expect(state(view)).toBe('empty'));
});
