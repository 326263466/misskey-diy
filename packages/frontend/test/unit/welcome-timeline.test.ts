/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import WelcomeTimeline from '@/pages/welcome.timeline.vue';

const api = vi.hoisted(() => ({ featured: vi.fn(), recent: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApiGet: api.featured,
	misskeyApi: (endpoint: string, ...args: unknown[]) => endpoint === 'articles/list' ? Promise.resolve([]) : api.recent(endpoint, ...args),
}));
vi.mock('@/instance.js', () => ({ instance: { ugcVisibilityForVisitor: 'all' } }));
vi.mock('@@/js/scroll.js', () => ({ getScrollContainer: (el: HTMLElement) => el.parentElement }));
vi.mock('@/components/MkArticlePreview.vue', () => ({ default: {
	props: ['article'], template: '<article>{{ article.title }}</article>',
} }));
vi.mock('@/pages/welcome.timeline.note.vue', () => ({ default: {
	props: ['note'], template: '<div :data-note="note.id">{{ note.text }}</div>',
} }));

let resize: () => void;

beforeEach(() => {
	api.featured.mockReset().mockResolvedValue([]);
	api.recent.mockReset().mockResolvedValue([]);
	resize = () => {};
	vi.stubGlobal('ResizeObserver', class {
		constructor(callback: () => void) { resize = callback; }
		observe() {}
		disconnect() {}
	});
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
		return this.children.length * 200;
	});
	vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

test('falls back to recent local posts when there are no featured posts', async () => {
	api.recent.mockResolvedValue([{ id: 'recent', text: 'Recent post', visibility: 'public' }]);
	const view = render(WelcomeTimeline);
	await waitFor(() => expect(view.getAllByText('Recent post')).toHaveLength(6));
	expect(view.container.querySelector('[aria-hidden="true"]')?.hasAttribute('inert')).toBe(true);
	expect(api.recent).toHaveBeenCalledWith('notes/local-timeline', { limit: 10, withRenotes: false }, null, expect.any(AbortSignal));
});

test('loops the original featured selection without adding recent posts', async () => {
	api.featured.mockResolvedValue([
		{ id: 'popular-a', text: 'Popular A' },
		{ id: 'popular-b', text: 'Popular B' },
		{ id: 'popular-c', text: 'Popular C' },
	]);
	const view = render(WelcomeTimeline);
	await waitFor(() => expect(view.container.querySelectorAll('[data-note]')).toHaveLength(6));
	expect([...view.container.querySelectorAll('[data-note]')].map(el => el.getAttribute('data-note'))).toEqual(['popular-a', 'popular-b', 'popular-c', 'popular-a', 'popular-b', 'popular-c']);
	expect(api.recent).not.toHaveBeenCalled();
});

test('fills a tall viewport with a short list and refits after content grows', async () => {
	let noteHeight = 100;
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
		return this.children.length * noteHeight;
	});
	api.recent.mockResolvedValue([{ id: 'recent', text: 'Recent', visibility: 'public' }]);
	const view = render(WelcomeTimeline);
	await waitFor(() => expect(view.getAllByText('Recent')).toHaveLength(10));
	noteHeight = 200;
	resize();
	await waitFor(() => expect(view.getAllByText('Recent')).toHaveLength(6));
});

test('does not bypass a failed featured request and aborts when removed', async () => {
	api.featured.mockRejectedValue(new Error('Unavailable'));
	const view = render(WelcomeTimeline);
	await waitFor(() => expect(api.featured).toHaveBeenCalledTimes(1));
	expect(api.recent).not.toHaveBeenCalled();
	expect(view.container.querySelector('[data-note]')).toBeNull();
	const signal = api.featured.mock.calls[0][2] as AbortSignal;
	view.unmount();
	expect(signal.aborted).toBe(true);
});

test('keeps the repeat count stable with gaps between posts', async () => {
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
		return this.children.length * 500 - 16;
	});
	vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(990);
	vi.spyOn(window, 'getComputedStyle').mockReturnValue({ rowGap: '16px' } as CSSStyleDeclaration);
	api.recent.mockResolvedValue([{ id: 'recent', text: 'Recent', visibility: 'public' }]);
	const view = render(WelcomeTimeline);
	await waitFor(() => expect(view.getAllByText('Recent')).toHaveLength(6));
	resize();
	await waitFor(() => expect(view.getAllByText('Recent')).toHaveLength(6));
});
