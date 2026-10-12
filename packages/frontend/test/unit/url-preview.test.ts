/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, assert, afterEach, expect, vi } from 'vitest';
import { render, cleanup, type RenderResult } from '@testing-library/vue';
import { nextTick } from 'vue';
import type { SummalyResult } from '@misskey-dev/summaly';
import MkEllipsis from '@/components/global/MkEllipsis.vue';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import { i18n } from '@/i18n.js';
import { popup } from '@/os.js';

vi.mock('@/components/MkButton.vue', () => ({ default: { emits: ['click'], template: '<button @click="$emit(\'click\', $event)"><slot/></button>' } }));
vi.mock('@/os.js', () => ({ popup: vi.fn(() => ({ dispose: vi.fn() })) }));
vi.mock('@/instance.js', () => ({ instance: { enableUrlPreview: true } }));
vi.mock('@/store.js', () => ({ store: { s: { darkMode: false } } }));

const components = { MkEllipsis };

describe('MkUrlPreview', () => {
	const renderPreviewBy = async (summary: Partial<SummalyResult> | null, url = summary?.url ?? 'https://example.local'): Promise<RenderResult> => {
		if (summary && !summary.player) {
			summary.player = {
				url: null,
				width: null,
				height: null,
				allow: [],
			};
		}

		fetchMock.mockOnceIf((req) => {
			const url = new URL(req.url);
			return url.pathname === '/url';
		}, () => {
			return {
				status: 200,
				body: JSON.stringify(summary),
			};
		});

		const result = render(MkUrlPreview, {
			props: { url },
			global: { components },
		});

		await new Promise<void>(resolve => {
			const observer = new MutationObserver(() => {
				resolve();
				observer.disconnect();
			});
			observer.observe(result.container, { childList: true, subtree: true });
		});

		return result;
	};

	const renderAndOpenPreview = async (summary: Partial<SummalyResult>): Promise<HTMLIFrameElement | null> => {
		const mkUrlPreview = await renderPreviewBy(summary);
		const buttons = mkUrlPreview.getAllByRole('button');
		buttons[0].click();
		// Wait for the click event to be fired
		await Promise.resolve();

		return mkUrlPreview.container.querySelector('iframe');
	};

	afterEach(() => {
		fetchMock.resetMocks();
		cleanup();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	test.each(['network', 'json', 'http'])('shows the address, fallback title and description after a %s failure', async failure => {
		fetchMock.mockOnceIf(req => new URL(req.url).pathname === '/url', () => {
			if (failure === 'network') return Promise.reject(new Error('Connection lost'));
			return Promise.resolve({ body: failure === 'json' ? 'not JSON' : '{}', status: failure === 'http' ? 422 : 200 });
		});
		const view = render(MkUrlPreview, {
			props: { url: 'https://example.test/unavailable' },
			global: { components },
		});
		await view.findByText(i18n.ts.urlPreviewFallbackDescription);
		expect(view.getByRole('link').getAttribute('href')).toBe('https://example.test/unavailable');
		expect(view.getByRole('heading').textContent).toBe(i18n.ts.urlPreviewFallbackTitle);
		expect(view.getAllByText('example.test')).toHaveLength(1);
		expect(view.queryByText('https://example.test/unavailable')).toBeNull();
	});

	test('aborts a stalled preview and shows the link after the timeout', async () => {
		vi.useFakeTimers();
		vi.spyOn(window, 'fetch').mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
			init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
		}));
		const view = render(MkUrlPreview, { props: { url: 'https://example.test/slow' }, global: { components } });
		await vi.advanceTimersByTimeAsync(30000);
		await nextTick();
		expect(view.getByText(i18n.ts.urlPreviewFallbackDescription)).toBeTruthy();
		expect(view.getByRole('heading').textContent).toBe(i18n.ts.urlPreviewFallbackTitle);
		expect(view.getAllByText('example.test')).toHaveLength(1);
		expect(view.getByRole('link').getAttribute('href')).toBe('https://example.test/slow');
	});

	test.each([
		{ name: 'null metadata', summary: null },
		{ name: 'empty metadata', summary: {} },
		{ name: 'an address without metadata', summary: { url: 'https://example.test/article' } },
		{ name: 'blank metadata', summary: { title: '  ', description: '\n ' } },
		{ name: 'an address used as the title', summary: { title: 'example.test' } },
		{ name: 'a URL used as the title', summary: { title: 'https://example.test/article' } },
		{ name: 'a title without a description', summary: { title: 'BudsAI' }, title: 'BudsAI' },
		{ name: 'a description without a title', summary: { description: 'Unified API gateway' }, description: 'Unified API gateway' },
		{ name: 'real metadata without a URL', summary: { title: 'BudsAI', description: 'Unified API gateway', sitename: 'BudsAI' }, title: 'BudsAI', description: 'Unified API gateway' },
	])('keeps three content rows with $name', async ({ summary, title, description }) => {
		const view = await renderPreviewBy(summary, 'https://example.test/article');
		expect(view.getByRole('link').getAttribute('href')).toBe('https://example.test/article');
		expect(view.getByRole('heading').textContent).toBe(title ?? i18n.ts.urlPreviewFallbackTitle);
		expect(view.getByText(description ?? i18n.ts.urlPreviewFallbackDescription)).toBeTruthy();
		expect(view.getAllByText('example.test')).toHaveLength(1);
		expect(view.container.querySelectorAll('article h1, article p')).toHaveLength(3);
	});

	test('keeps the original site address when the preview request changes the hostname', async () => {
		const view = await renderPreviewBy({ title: 'Music video', description: 'Music description' }, 'https://music.youtube.com/watch?v=example');
		expect(view.getByText('music.youtube.com')).toBeTruthy();
		expect(view.getByRole('link').getAttribute('href')).toBe('https://music.youtube.com/watch?v=example');
		expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent('https://www.youtube.com/watch?v=example')), expect.any(Object));
	});

	test('cancels the preview request when the hover panel is unmounted', async () => {
		let signal: AbortSignal | null | undefined;
		vi.spyOn(window, 'fetch').mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
			signal = init!.signal;
			signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
		}));
		const view = render(MkUrlPreview, { props: { url: 'https://example.test/slow' }, global: { components } });
		view.unmount();
		await nextTick();
		expect(signal?.aborted).toBe(true);
	});

	test('Should render the description', async () => {
		const mkUrlPreview = await renderPreviewBy({
			url: 'https://example.local',
			description: 'Mocked description',
		});
		mkUrlPreview.getByText('Mocked description');
		expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/url?'), expect.objectContaining({ cache: 'no-cache', signal: expect.any(AbortSignal) }));
	});

	test('Having a player should render a button', async () => {
		const mkUrlPreview = await renderPreviewBy({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: null,
				allow: [],
			},
		});
		const buttons = mkUrlPreview.getAllByRole('button');
		assert.strictEqual(buttons.length, 2, 'two buttons');
	});

	test('opens a player from partial metadata using the requested URL', async () => {
		const view = await renderPreviewBy({
			title: 'Video title',
			player: { url: 'https://example.local/player', width: null, height: null, allow: [] },
		}, 'https://example.local/video');
		view.getByRole('button', { name: i18n.ts.openInWindow }).click();
		expect(popup).toHaveBeenCalledWith(expect.any(Object), {
			urlOrSummalyResult: expect.objectContaining({ url: 'https://example.local/video', title: 'Video title' }),
		}, expect.any(Object));
	});

	test('Having a player should setup the iframe', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: null,
				allow: [],
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.src, 'https://example.local/player?autoplay=1&auto_play=1');
		assert.strictEqual(
			iframe?.sandbox.toString(),
			'allow-popups allow-popups-to-escape-sandbox allow-scripts allow-storage-access-by-user-activation allow-same-origin',
		);
	});

	test('Having a player with `allow` field should set permissions', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: null,
				allow: ['fullscreen', 'web-share'],
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.allow, 'fullscreen;web-share');
	});

	test('A Summaly proxy response without allow falls back to the default', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: null,
				allow: undefined as any,
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.allow, 'autoplay;encrypted-media;fullscreen');
	});

	test('Filtering the allow list from the Summaly proxy', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: null,
				allow: ['autoplay', 'camera', 'fullscreen'],
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.allow, 'autoplay;fullscreen');
	});

	test('Having a player width should keep the fixed aspect ratio', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: 400,
				height: 200,
				allow: [],
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.parentElement?.style.paddingTop, '50%');
	});

	test('Having a player width should keep the fixed height', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: 200,
				allow: [],
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.parentElement?.style.paddingTop, '200px');
	});

	test('Loading a tweet in iframe', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://twitter.com/i/web/status/1685072521782325249',
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.getAttribute('allow'), 'fullscreen;web-share');
		assert.strictEqual(iframe?.getAttribute('sandbox'), 'allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin');
	});

	test('Loading a post in iframe', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://x.com/i/web/status/1685072521782325249',
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.getAttribute('allow'), 'fullscreen;web-share');
		assert.strictEqual(iframe?.getAttribute('sandbox'), 'allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin');
	});
});
