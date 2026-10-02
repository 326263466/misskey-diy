/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import WelcomeTimeline from '@/pages/welcome.timeline.vue';

const api = vi.hoisted(() => ({ featured: vi.fn(), recent: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApiGet: api.featured, misskeyApi: api.recent }));
vi.mock('@/pages/welcome.timeline.note.vue', () => ({ default: {
	props: ['note'], template: '<div :data-note="note.id">{{ note.text }}</div>',
} }));

beforeEach(() => {
	api.featured.mockReset().mockResolvedValue([]);
	api.recent.mockReset().mockResolvedValue([]);
	vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

test('falls back to recent local posts when there are no featured posts', async () => {
	api.recent.mockResolvedValue([{ id: 'recent', text: 'Recent post' }]);
	const view = render(WelcomeTimeline);
	await waitFor(() => expect(view.getAllByText('Recent post')).toHaveLength(2));
	expect(view.container.querySelector('[aria-hidden="true"]')?.hasAttribute('inert')).toBe(true);
	expect(api.recent).toHaveBeenCalledWith('notes', { local: true, limit: 20 }, undefined, expect.any(AbortSignal));
});

test('keeps featured posts first and removes duplicates from recent posts', async () => {
	api.featured.mockResolvedValue([{ id: 'popular', text: 'Popular' }]);
	api.recent.mockResolvedValue([{ id: 'popular', text: 'Popular' }, { id: 'recent', text: 'Recent' }]);
	const view = render(WelcomeTimeline);
	await waitFor(() => expect(view.container.querySelectorAll('[data-note]')).toHaveLength(4));
	expect([...view.container.querySelectorAll('[data-note]')].map(el => el.getAttribute('data-note'))).toEqual(['popular', 'recent', 'popular', 'recent']);
});

test('fills a tall viewport by repeating a short list', async () => {
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(100);
	vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
	api.recent.mockResolvedValue([{ id: 'recent', text: 'Recent' }]);
	const view = render(WelcomeTimeline);
	await waitFor(() => expect(view.getAllByText('Recent')).toHaveLength(10));
});

test('recovers from featured failure and aborts requests when removed', async () => {
	api.featured.mockRejectedValue(new Error('Unavailable'));
	api.recent.mockResolvedValue([{ id: 'recent', text: 'Recent' }]);
	const view = render(WelcomeTimeline);
	await waitFor(() => expect(view.getAllByText('Recent')).toHaveLength(2));
	const signal = api.featured.mock.calls[0][3] as AbortSignal;
	view.unmount();
	expect(signal.aborted).toBe(true);
});

test('keeps the repeat count stable with gaps between posts', async () => {
	let resize: () => void = () => {};
	vi.stubGlobal('ResizeObserver', class {
		constructor(callback: () => void) { resize = callback; }
		observe() {}
		disconnect() {}
	});
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
		return this.children.length * 500 - 16;
	});
	vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(990);
	vi.spyOn(window, 'getComputedStyle').mockReturnValue({ rowGap: '16px' } as CSSStyleDeclaration);
	api.recent.mockResolvedValue([{ id: 'recent', text: 'Recent' }]);
	const view = render(WelcomeTimeline);
	await waitFor(() => expect(view.getAllByText('Recent')).toHaveLength(6));
	resize();
	await waitFor(() => expect(view.getAllByText('Recent')).toHaveLength(6));
});
