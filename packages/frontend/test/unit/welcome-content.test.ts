/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import WelcomeContent from '@/pages/welcome.timeline.vue';

const mocks = vi.hoisted(() => ({ api: vi.fn(), get: vi.fn(), instance: { ugcVisibilityForVisitor: 'all' } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api, misskeyApiGet: mocks.get }));
vi.mock('@/instance.js', () => ({ instance: mocks.instance }));
vi.mock('@/components/MkArticlePreview.vue', () => ({ default: { props: ['article'], template: '<article>{{ article.title }}</article>' } }));
vi.mock('@/pages/welcome.timeline.note.vue', () => ({ default: { props: ['note'], template: '<article>{{ note.text }}</article>' } }));
beforeEach(() => {
	vi.clearAllMocks();
	mocks.instance.ugcVisibilityForVisitor = 'all';
	vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
	mocks.get.mockResolvedValue([{ id: 'featured', text: 'Featured post', visibility: 'public' }]);
	mocks.api.mockImplementation((endpoint: string) => Promise.resolve(endpoint === 'articles/list'
		? [{ id: 'article', title: 'Home article', user: { host: null } }]
		: [{ id: 'recent', text: 'Recent post', visibility: 'public' }, { id: 'recent', text: 'Recent post', visibility: 'public' }]));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('keeps the original featured selection without mixing in other sources', async () => {
	const view = render(WelcomeContent);
	await waitFor(() => expect(view.container.querySelectorAll('article')).toHaveLength(1));
	expect(view.container.querySelector('article')?.textContent).toBe('Featured post');
	expect(mocks.api).not.toHaveBeenCalled();
	const signal = mocks.get.mock.calls[0][2] as AbortSignal;
	expect(mocks.get).toHaveBeenCalledExactlyOnceWith('notes/featured', {}, signal);
	view.unmount();
	expect(signal.aborted).toBe(true);
});

test('uses anonymous public content only when the featured algorithm returns no results', async () => {
	mocks.get.mockResolvedValue([]);
	const view = render(WelcomeContent);
	await waitFor(() => expect(view.container.querySelectorAll('article')).toHaveLength(2));
	const previews = [...view.container.querySelectorAll('article')];
	expect(previews.map(e => e.textContent)).toEqual(['Home article', 'Recent post']);
	expect(previews.every(preview => preview.hasAttribute('inert'))).toBe(true);
	const signal = mocks.get.mock.calls[0][2] as AbortSignal;
	expect(mocks.api).toHaveBeenCalledWith('notes/local-timeline', { limit: 10, withRenotes: false }, null, signal);
	expect(mocks.api).toHaveBeenCalledWith('articles/list', { limit: 10 }, null, signal);
});

test('keeps eligible public notes when the fallback article service fails', async () => {
	mocks.get.mockResolvedValue([]);
	mocks.api.mockImplementation((endpoint: string) => endpoint === 'articles/list' ? Promise.reject(new Error('offline')) : Promise.resolve([
		{ id: 'recent', text: 'Recent post', visibility: 'public' },
		{ id: 'hidden', text: 'Hidden post', visibility: 'public', isHidden: true },
		{ id: 'private', text: 'Private post', visibility: 'followers' },
	]));
	const view = render(WelcomeContent);
	await waitFor(() => expect(view.container.querySelector('article')?.textContent).toBe('Recent post'));
	expect(view.container.querySelectorAll('article')).toHaveLength(1);
});

test('does not use fallback content when visitors cannot view content or the featured request fails', async () => {
	mocks.instance.ugcVisibilityForVisitor = 'none';
	mocks.get.mockResolvedValue([]);
	const hidden = render(WelcomeContent);
	await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));
	expect(mocks.api).not.toHaveBeenCalled();
	expect(hidden.container.querySelector('article')).toBeNull();
	hidden.unmount();
	mocks.instance.ugcVisibilityForVisitor = 'all';
	mocks.get.mockRejectedValue(new Error('forbidden'));
	const failed = render(WelcomeContent);
	await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
	expect(mocks.api).not.toHaveBeenCalled();
	expect(failed.container.querySelector('article')).toBeNull();
});

test('keeps article fallback within the local-only visitor policy', async () => {
	mocks.instance.ugcVisibilityForVisitor = 'local';
	mocks.get.mockResolvedValue([]);
	mocks.api.mockImplementation((endpoint: string) => Promise.resolve(endpoint === 'articles/list' ? [
		{ id: 'local', title: 'Local article', user: { host: null } },
		{ id: 'remote', title: 'Remote article', user: { host: 'remote.example' } },
	] : []));
	const view = render(WelcomeContent);
	await waitFor(() => expect(view.container.querySelector('article')?.textContent).toBe('Local article'));
	expect(view.container.querySelectorAll('article')).toHaveLength(1);
});
