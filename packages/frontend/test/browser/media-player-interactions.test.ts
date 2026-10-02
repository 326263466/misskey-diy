/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, defineComponent, h, nextTick, reactive, shallowRef } from 'vue';
import type { App } from 'vue';
import type { entities } from 'misskey-js';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import MkLightbox from '@/components/MkLightbox.vue';
import MkAudioVisualizer from '@/components/MkLightbox.item.audio-visualizer.vue';
import { hotkeyDirective } from '@/directives/hotkey.js';
import * as os from '@/os.js';
import * as sensitiveFiles from '@/utility/sensitive-file.js';

const preferences = vi.hoisted(() => ({ animation: true, useNativeUiForVideoAudioPlayer: false, menuStyle: 'popup' }));

vi.mock('misskey-js', () => ({}));
vi.mock('@/os.js', () => ({ claimZIndex: () => 1000, popupMenu: vi.fn(), contextMenu: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/theme.js', () => ({ themeManager: { on: vi.fn(), off: vi.fn(), currentCompiledTheme: { accent: '#86b300' } } }));
vi.mock('@/preferences.js', () => ({ prefer: { s: preferences } }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/utility/touch.js', () => ({ isTouchUsing: false, lastPointerType: 'mouse' }));
vi.mock('@/utility/get-file-menu.js', () => ({ getFileMenu: () => [] }));
vi.mock('@/utility/sensitive-file.js', () => ({ shouldHideFileByDefault: vi.fn(() => false), canRevealFile: vi.fn(async () => true) }));
vi.mock('@/utility/media-has-audio.js', () => ({ default: async () => true }));
vi.mock('@/components/MkBlurhash.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			volume: 'Volume', settings: 'Settings', close: 'Close', menu: 'Menu', goBack: 'Previous', next: 'Next', loading: 'Loading', retry: 'Retry',
			_mediaControls: {
				play: 'Play', pause: 'Pause', seek: 'Playback position', mute: 'Mute', unmute: 'Unmute',
				loadFailed: 'Media could not be loaded. Please retry.',
				enterFullscreen: 'Enter fullscreen', exitFullscreen: 'Exit fullscreen',
				enterWebFullscreen: 'Enter webpage fullscreen', exitWebFullscreen: 'Exit webpage fullscreen',
				playbackRate: 'Playback speed', loop: 'Loop', pip: 'Picture in picture',
			},
		},
		tsx: { _mediaControls: { buffered: ({ percent }: { percent: number }) => `${percent}% buffered` } },
	},
}));

let app: App | undefined;
let host: HTMLElement | undefined;
let audioUrl: string;
let originalUrl: string;

function createAudioUrl() {
	// The same silent PCM fixture as audio-player-layout, decoded by the real browser.
	const bytes = new Uint8Array(44 + 16000);
	const header = new DataView(bytes.buffer);
	for (const [offset, text] of [[0, 'RIFF'], [8, 'WAVEfmt '], [36, 'data']] as const) {
		bytes.set(new TextEncoder().encode(text), offset);
	}
	header.setUint32(4, bytes.length - 8, true);
	header.setUint32(16, 16, true);
	header.setUint16(20, 1, true);
	header.setUint16(22, 1, true);
	header.setUint32(24, 8000, true);
	header.setUint32(28, 8000, true);
	header.setUint16(32, 1, true);
	header.setUint16(34, 8, true);
	header.setUint32(40, bytes.length - 44, true);
	bytes.fill(128, 44);
	return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
}

async function settle() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
	await expect.poll(() => host?.getAnimations({ subtree: true }).length ?? 0).toBe(0);
}

beforeEach(async () => {
	vi.stubGlobal('_DEV_', false);
	preferences.animation = true;
	originalUrl = window.location.href;
	audioUrl = createAudioUrl();
	vi.spyOn(window.history, 'back').mockImplementation(() => {});
	vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
	vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
	// Invalid video fixtures should not generate real decoder failures in interaction tests.
	vi.spyOn(HTMLMediaElement.prototype, 'error', 'get').mockReturnValue(null);
	vi.mocked(os.popupMenu).mockReset().mockResolvedValue();
	vi.mocked(os.contextMenu).mockReset().mockImplementation(async (_items, ev) => { ev.preventDefault(); });
	vi.mocked(sensitiveFiles.shouldHideFileByDefault).mockReturnValue(false);
	vi.mocked(sensitiveFiles.canRevealFile).mockReset().mockResolvedValue(true);
	await page.viewport(1200, 800);
});

afterEach(async () => {
	// Let the gallery release its real focus trap before unmounting.
	host?.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click();
	await settle();
	app?.unmount();
	host?.remove();
	URL.revokeObjectURL(audioUrl);
	window.history.replaceState(null, '', originalUrl);
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

async function mountGallery(kind: 'audio' | 'video', count = 1, onInitialRender?: () => void, dimensions = { width: 1600, height: 900 }) {
	host = document.createElement('div');
	host.style.cssText = [
		'--MI_THEME-fg:#526176', '--MI_THEME-accent:#86b300', '--MI_THEME-accentedBg:#86b30026',
		'--MI_THEME-panel:#fff', '--MI_THEME-fgOnAccent:#fff', '--MI_THEME-modalBg:#0005',
		'--MI_THEME-divider:#0002', '--MI_THEME-focus:#86b30080', '--MI-radius:12px',
		'color:var(--MI_THEME-fg)',
	].join(';');
	document.body.append(host);
	const closed = vi.fn();
	const contents = reactive(Array.from({ length: count }, (_, index) => ({
		id: `${kind}-${index}`, type: kind,
		url: `${kind === 'audio' ? audioUrl : 'data:video/webm;base64,'}#${index}`,
		...dimensions, filename: `Player demo ${index + 1}.${kind === 'audio' ? 'wav' : 'webm'}`,
	})));
	app = createApp({
		render: () => h(MkLightbox, {
			contents, defaultIndex: count === 1 ? 0 : 1, onClosed: closed,
			user: {
				id: 'audio-owner', username: 'audio-owner', name: 'Audio owner', host: null,
				avatarUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="128" height="128"%3E%3Crect width="128" height="128" fill="%23324443"/%3E%3Ccircle cx="64" cy="64" r="46" fill="%23546f67"/%3E%3Ccircle cx="64" cy="64" r="30" fill="%23324443"/%3E%3C/svg%3E',
				avatarBlurhash: null, avatarDecorations: [], isBot: false, isCat: false, emojis: {}, onlineStatus: 'unknown',
			},
		}),
	});
	app.directive('hotkey', hotkeyDirective);
	app.component('MkLoading', { render: () => h('div', { 'data-testid': 'media-loading' }) });
	app.component('MkCondensedLine', defineComponent({ render() { return h('span', this.$slots.default?.()); } }));
	app.mount(host);
	await nextTick();
	onInitialRender?.();
	await expect.poll(() => host?.querySelector(kind === 'audio' ? 'canvas' : 'video'), { timeout: 10000 }).not.toBeNull();
	const media = host.querySelector<HTMLMediaElement>(kind)!;
	if (kind === 'audio') {
		await expect.poll(() => media.readyState).toBe(HTMLMediaElement.HAVE_ENOUGH_DATA);
	} else {
		Object.defineProperties(media, {
			duration: { value: 120 }, readyState: { value: HTMLMediaElement.HAVE_ENOUGH_DATA },
		});
		media.dispatchEvent(new Event('loadedmetadata'));
		media.dispatchEvent(new Event('canplay'));
	}
	await document.fonts.ready;
	const surface = host.querySelector<HTMLCanvasElement | HTMLVideoElement>(kind === 'audio' ? 'canvas' : 'video')!;
	const content = surface.closest<HTMLElement>('[class*="contentWrapper"]')!;
	const main = content.parentElement!.parentElement!;
	const player = main.parentElement!;
	const footer = content.querySelector<HTMLElement>('[class*="footer"]')!;
	await page.elementLocator(surface).hover({ position: { x: 60, y: 60 } });
	await settle();
	return { media, surface, main, player, footer, closed };
}

function mockPlayback(media: HTMLMediaElement) {
	let paused = true;
	Object.defineProperty(media, 'paused', { configurable: true, get: () => paused });
	const play = vi.mocked(HTMLMediaElement.prototype.play).mockClear().mockImplementation(async function (this: HTMLMediaElement) {
		if (this === media) paused = false;
		this.dispatchEvent(new Event('play'));
		this.dispatchEvent(new Event('playing'));
	});
	vi.mocked(HTMLMediaElement.prototype.pause).mockClear().mockImplementation(function (this: HTMLMediaElement) {
		if (this === media) paused = true;
		this.dispatchEvent(new Event('pause'));
	});
	return play;
}

test.each([
	{ width: 1200, height: 800, videoWidth: 1600, videoHeight: 900 },
	{ width: 390, height: 844, videoWidth: 900, videoHeight: 1600 },
	{ width: 900, height: 700, videoWidth: 900, videoHeight: 2400 },
])('attaches controls to the video at $width × $height, including after resize', async ({ width, height, videoWidth, videoHeight }) => {
	await page.viewport(width, height);
	const { surface, footer, closed } = await mountGallery('video', 1, undefined, { width: videoWidth, height: videoHeight });
	const checkAlignment = () => {
		const videoRect = surface.getBoundingClientRect();
		const footerRect = footer.getBoundingClientRect();
		expect(videoRect.width / videoRect.height).toBeCloseTo(16 / 9, 2);
		expect(getComputedStyle(surface).objectFit).toBe('contain');
		expect(footerRect.left).toBeCloseTo(videoRect.left, 0);
		expect(footerRect.right).toBeCloseTo(videoRect.right, 0);
		expect(footerRect.bottom).toBeCloseTo(videoRect.bottom, 0);
		expect(footerRect.top).toBeGreaterThan(videoRect.top);
		for (const control of footer.querySelectorAll<HTMLElement>('button, input')) {
			const rect = control.getBoundingClientRect();
			expect(rect.left).toBeGreaterThanOrEqual(footerRect.left - 1);
			expect(rect.right).toBeLessThanOrEqual(footerRect.right + 1);
			expect(rect.bottom).toBeLessThanOrEqual(footerRect.bottom + 1);
		}
	};
	checkAlignment();
	footer.click();
	expect(closed).not.toHaveBeenCalled();
	if (width === 1200) {
		// Bright, varied scenery makes the translucent controls visible in visual review.
		surface.style.backgroundImage = 'linear-gradient(145deg, #73b9ca, #d9b698 45%, #465f48 65%, #234659)';
		await page.screenshot({ path: '../e2e/artifacts/component-browser/media-player-glass-controls.png' });
	}
	await page.viewport(width + 80, height + 60);
	await settle();
	checkAlignment();
});

test.each(['audio', 'video'] as const)('bounds the %s glass play icon size and keeps antenna roots outside its body', async kind => {
	preferences.animation = false;
	await page.viewport(480, 600);
	const { main, surface, player } = await mountGallery(kind);
	const button = main.querySelector<HTMLButtonElement>('[class*="playIconWrapper"] button[aria-label="Play"]')!;
	const small = button.getBoundingClientRect().width;
	expect(small).toBeGreaterThanOrEqual(48);
	expect(small).toBeLessThanOrEqual(72);
	await page.viewport(2200, 1600);
	await settle();
	const large = button.getBoundingClientRect().width;
	expect(large).toBeGreaterThan(small);
	expect(large).toBeLessThanOrEqual(72);
	const antenna = button.querySelector<HTMLElement>('[class*="antenna"]')!;
	const body = button.querySelector<HTMLElement>('[class*="body"]')!;
	expect(antenna.getBoundingClientRect().bottom).toBeLessThanOrEqual(body.getBoundingClientRect().top + 0.1);
	expect(getComputedStyle(antenna).overflow).toBe('hidden');
	if (kind === 'video') {
		await page.elementLocator(player).getByRole('button', { name: 'Enter webpage fullscreen' }).click();
		await page.elementLocator(surface).hover({ position: { x: 60, y: 60 } });
		await settle();
		await new Promise(resolve => window.setTimeout(resolve, 200));
		expect(button.getBoundingClientRect().width).toBeCloseTo(96, 1);
	}
	await page.screenshot({ element: button, path: `../e2e/artifacts/component-browser/${kind}-player-glass-sizing.png` });
});

test.each(['audio', 'video'] as const)('keeps the central %s play button hidden while autoplay is pending and allows retry after rejection', async kind => {
	let rejectPlayback!: (reason: Error) => void;
	vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() => new Promise<void>((_resolve, reject) => {
		rejectPlayback = reject;
	}));
	const { media, main, closed } = await mountGallery(kind, 1, () => {
		expect(host!.querySelector('[class*="playIconWrapper"] button[aria-label="Play"]')).toBeNull();
		expect(host!.querySelector('[data-testid="media-loading"]')).toBeNull();
	});
	const centralButton = () => main.querySelector<HTMLButtonElement>('[class*="playIconWrapper"] button[aria-label="Play"]');
	expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
	expect(main.querySelector('[class*="playbackFeedback"]')).toBeNull();
	expect(centralButton()).toBeNull();
	await expect.element(page.elementLocator(main)).toBeVisible();
	await expect.element(page.getByText('Loading', { exact: true })).toBeVisible();
	expect(host!.querySelectorAll('[data-testid="media-loading"]')).toHaveLength(1);
	expect(main.querySelector('[class*="playbackFeedback"]')).toBeNull();
	expect(centralButton()).toBeNull();
	rejectPlayback(new DOMException('Autoplay blocked', 'NotAllowedError'));
	await expect.poll(centralButton).not.toBeNull();
	expect(host!.querySelector('[data-testid="media-loading"]')).toBeNull();
	const play = mockPlayback(media);
	await page.elementLocator(centralButton()!).click();
	expect(play).toHaveBeenCalledOnce();
	await expect.poll(centralButton).toBeNull();
	expect(closed).not.toHaveBeenCalled();
});

test.each(['audio', 'video'] as const)('shows a terminal %s failure with retry instead of leaving a spinner or play icon', async kind => {
	const { media, main } = await mountGallery(kind);
	vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('Decode failed', 'NotSupportedError'));
	main.querySelector<HTMLButtonElement>('[class*="playIconWrapper"] button[aria-label="Play"]')!.click();
	await expect.element(page.getByText('Media could not be loaded. Please retry.')).toBeVisible();
	expect(main.querySelector('[class*="playIconWrapper"] button[aria-label="Play"]')).toBeNull();
	expect(main.querySelector('[data-testid="media-loading"]')).toBeNull();
	const load = vi.spyOn(media, 'load').mockImplementation(() => {});
	const play = mockPlayback(media);
	await page.getByRole('button', { name: 'Retry', exact: true }).click();
	expect(load).toHaveBeenCalledOnce();
	expect(play).toHaveBeenCalledOnce();
	expect(main.querySelector('[role="alert"]')).toBeNull();
});

test.each(['audio', 'video'] as const)('reports a %s network failure during buffering and does not auto-retry', async kind => {
	const { media, main } = await mountGallery(kind);
	const play = mockPlayback(media);
	main.querySelector<HTMLButtonElement>('[class*="playIconWrapper"] button[aria-label="Play"]')!.click();
	await nextTick();
	media.dispatchEvent(new Event('waiting'));
	Object.defineProperty(media, 'error', { configurable: true, value: { code: 2 } });
	media.dispatchEvent(new Event('error'));
	await expect.element(page.getByText('Media could not be loaded. Please retry.')).toBeVisible();
	media.dispatchEvent(new Event('canplay'));
	await nextTick();
	expect(play).toHaveBeenCalledOnce();
	expect(main.querySelector('[data-testid="media-loading"]')).toBeNull();
});

test.each(['audio', 'video'] as const)('resumes an interrupted %s request on canplay without undoing a user pause', async kind => {
	const { media, main, footer } = await mountGallery(kind);
	vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('Load interrupted', 'AbortError'));
	main.querySelector<HTMLButtonElement>('[class*="playIconWrapper"] button[aria-label="Play"]')!.click();
	await settle();
	const play = mockPlayback(media);
	media.dispatchEvent(new Event('canplay'));
	await nextTick();
	expect(play).toHaveBeenCalledOnce();
	footer.querySelector<HTMLButtonElement>('button[aria-label="Pause"]')!.click();
	media.dispatchEvent(new Event('canplay'));
	await nextTick();
	expect(play).toHaveBeenCalledOnce();
	expect(media.paused).toBe(true);
});

test.each(['audio', 'video'] as const)('pauses pending %s playback immediately when closing the gallery', async kind => {
	let finishPlayback!: () => void;
	const play = vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() => new Promise<void>(resolve => {
		finishPlayback = resolve;
	}));
	const { media, closed } = await mountGallery(kind);
	const pause = vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
	const playCalls = play.mock.calls.length;
	host!.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
	expect(pause).toHaveBeenCalled();
	expect(pause.mock.instances[0]).toBe(media);
	finishPlayback();
	await settle();
	expect(play).toHaveBeenCalledTimes(playCalls);
	await expect.poll(() => closed.mock.calls.length).toBe(1);
});

test.each(['audio', 'video'] as const)('does not flash loading feedback for quickly started %s playback', async kind => {
	const { media, main } = await mountGallery(kind);
	let finishPlayback!: () => void;
	vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() => new Promise<void>(resolve => {
		finishPlayback = resolve;
	}));
	const loadingNodes: Node[] = [];
	const observer = new MutationObserver(records => {
		for (const record of records) {
			for (const node of record.addedNodes) {
				if (node instanceof Element && (node.matches('[role="status"]') || node.querySelector('[role="status"]'))) loadingNodes.push(node);
			}
		}
	});
	observer.observe(main, { childList: true, subtree: true });
	try {
		main.querySelector<HTMLButtonElement>('[class*="playIconWrapper"] button[aria-label="Play"]')!.click();
		await nextTick();
		await new Promise(resolve => window.setTimeout(resolve, 50));
		media.dispatchEvent(new Event('play'));
		media.dispatchEvent(new Event('playing'));
		finishPlayback();
		await new Promise(resolve => window.setTimeout(resolve, 250));
		await nextTick();
		expect(loadingNodes).toHaveLength(0);
		expect(main.querySelector('[role="status"]')).toBeNull();
	} finally {
		observer.disconnect();
	}
});

test.each(['audio', 'video'] as const)('delays the %s loading indicator and keeps it exclusive with the play button', async kind => {
	const { media, main, closed } = await mountGallery(kind);
	let finishPlayback!: () => void;
	const play = vi.mocked(HTMLMediaElement.prototype.play).mockClear().mockImplementation(() => new Promise<void>(resolve => {
		finishPlayback = resolve;
	}));
	await page.elementLocator(main.querySelector<HTMLElement>('[class*="playIconWrapper"]')!).getByRole('button', { name: 'Play', exact: true }).click();
	expect(play).toHaveBeenCalledOnce();
	expect(main.querySelector('[class*="playIconWrapper"] button[aria-label="Play"]')).toBeNull();
	expect(host!.querySelector('[data-testid="media-loading"]')).toBeNull();
	await expect.element(page.elementLocator(main)).toBeVisible();
	await expect.element(page.getByText('Loading', { exact: true })).toBeVisible();
	expect(host!.querySelectorAll('[data-testid="media-loading"]')).toHaveLength(1);
	expect(main.querySelector('[class*="playIconWrapper"] button[aria-label="Play"]')).toBeNull();
	expect(main.querySelector('[class*="playbackFeedback"]')).toBeNull();
	media.dispatchEvent(new Event('play'));
	media.dispatchEvent(new Event('playing'));
	finishPlayback();
	await settle();
	expect(host!.querySelector('[data-testid="media-loading"]')).toBeNull();
	expect(main.querySelector('[class*="playIconWrapper"] button[aria-label="Play"]')).toBeNull();
	expect(closed).not.toHaveBeenCalled();
});

test.each(['audio', 'video'] as const)('stops %s playback when the gallery is directly unmounted', async kind => {
	const backgroundButton = document.createElement('button');
	document.body.append(backgroundButton);
	try {
		const { media } = await mountGallery(kind);
		expect(backgroundButton.inert).toBe(true);
		mockPlayback(media);
		await media.play();
		expect(media.paused).toBe(false);
		app!.unmount();
		app = undefined;
		expect(media.paused).toBe(true);
		expect(backgroundButton.inert).toBe(false);
		backgroundButton.focus();
		expect(document.activeElement).toBe(backgroundButton);
	} finally {
		backgroundButton.remove();
	}
});

test.each(['cancel', 'deactivate', 'continue'] as const)('only resumes an audio fallback with a current playback request after %s', async action => {
	host = document.createElement('div');
	host.style.cssText = 'width:400px;height:240px';
	document.body.append(host);
	const state = reactive({ active: true });
	const visualizer = shallowRef<InstanceType<typeof MkAudioVisualizer> | null>(null);
	app = createApp({ render: () => h(MkAudioVisualizer, {
		ref: visualizer,
		content: { id: 'fallback', type: 'audio', url: 'data:audio/wav;base64,UklGRg==', filename: 'fallback.wav' },
		active: state.active,
		isPlaying: false,
		volume: 0.5,
	}) });
	app.mount(host);
	await nextTick();
	const original = host.querySelector('audio')!;
	expect(original.crossOrigin).toBe('anonymous');
	const play = vi.mocked(HTMLMediaElement.prototype.play).mockClear();
	const pause = vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
	original.dispatchEvent(new Event('play'));
	Object.defineProperty(original, 'error', { configurable: true, value: { code: 4 } });
	if (action === 'cancel') visualizer.value!.cancelPlayback();
	if (action === 'deactivate') state.active = false;
	await nextTick();
	original.dispatchEvent(new Event('pause'));
	original.dispatchEvent(new Event('error'));
	await nextTick();
	await nextTick();
	const replacement = host.querySelector('audio')!;
	expect(replacement).not.toBe(original);
	expect(replacement.crossOrigin).toBeNull();
	expect(play).toHaveBeenCalledTimes(action === 'continue' ? 1 : 0);
	if (action === 'continue') expect(play.mock.contexts[0]).toBe(replacement);
	expect(pause.mock.contexts).toContain(original);
	pause.mockClear();
	app.unmount();
	app = undefined;
	expect(pause.mock.contexts).toContain(replacement);
});

test.each(['close', 'deactivate'] as const)('ignores a delayed sensitive-media reveal after %s', async action => {
	vi.mocked(sensitiveFiles.shouldHideFileByDefault).mockReturnValue(true);
	let finishReveal!: (allowed: boolean) => void;
	vi.mocked(sensitiveFiles.canRevealFile).mockImplementation(() => new Promise<boolean>(resolve => { finishReveal = resolve; }));
	host = document.createElement('div');
	document.body.append(host);
	const closed = vi.fn();
	app = createApp({ render: () => h(MkLightbox, {
		defaultIndex: 0,
		contents: [0, 1].map(index => ({
			id: `sensitive-${index}`, type: 'video' as const, url: `data:video/webm;base64,#${index}`, filename: `sensitive-${index}.webm`,
			width: 1600, height: 900,
			file: { id: String(index), isSensitive: true } as entities.DriveFile,
		})),
		onClosed: closed,
	}) });
	app.directive('hotkey', hotkeyDirective);
	app.component('MkLoading', { render: () => null });
	app.component('MkCondensedLine', defineComponent({ render() { return h('span', this.$slots.default?.()); } }));
	app.mount(host);
	await nextTick();
	(host.querySelector('[data-gallery-click-action="hidden"]') as HTMLElement).click();
	expect(sensitiveFiles.canRevealFile).toHaveBeenCalledOnce();
	if (action === 'close') {
		host.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
	} else {
		await page.getByRole('button', { name: 'Next', exact: true }).click();
	}
	finishReveal(true);
	await nextTick();
	await nextTick();
	expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
	expect(host.querySelector('video')).toBeNull();
	if (action === 'close') await expect.poll(() => closed.mock.calls.length).toBe(1);
});

test('keeps the centered video play icon the same size after double-click fullscreen and restore', async () => {
	const { media, surface, main, player, closed } = await mountGallery('video');
	const play = mockPlayback(media);
	const iconBounds = async () => {
		// Match the same hover state in both layouts; hover feedback remains intentional.
		await page.elementLocator(surface).hover({ position: { x: 60, y: 60 } });
		await settle();
		const button = main.querySelector<HTMLButtonElement>('[class*="playIconWrapper"] button[aria-label="Play"]')!;
		const icon = button.firstElementChild as HTMLElement;
		const picture = surface.getBoundingClientRect();
		const bounds = icon.getBoundingClientRect();
		expect(bounds.left + bounds.width / 2).toBeCloseTo(picture.left + picture.width / 2, 1);
		expect(bounds.top + bounds.height / 2).toBeCloseTo(picture.top + picture.height / 2, 1);
		return { width: bounds.width, height: bounds.height };
	};
	const originalBounds = await iconBounds();
	for (let attempt = 0; attempt < 2; attempt++) {
		await page.elementLocator(surface).dblClick({ position: { x: 60, y: 60 } });
		await expect.poll(() => document.fullscreenElement).toBe(player);
		expect(await iconBounds()).toEqual(originalBounds);
		await page.elementLocator(surface).dblClick({ position: { x: 60, y: 60 } });
		await expect.poll(() => document.fullscreenElement).toBeNull();
		expect(await iconBounds()).toEqual(originalBounds);
	}
	expect(play).not.toHaveBeenCalled();
	expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
	expect(media.paused).toBe(true);
	expect(closed).not.toHaveBeenCalled();
});

test.each(['surface', 'center button'] as const)('plays once after a single video %s click while preserving immediate bottom controls', async target => {
	const { media, surface, main, footer } = await mountGallery('video');
	const play = mockPlayback(media);
	if (target === 'surface') {
		await page.elementLocator(surface).click({ position: { x: 60, y: 60 } });
	} else {
		await page.elementLocator(main.querySelector<HTMLElement>('[class*="playIconWrapper"]')!).getByRole('button', { name: 'Play', exact: true }).click();
	}
	expect(play).not.toHaveBeenCalled();
	await expect.poll(() => play.mock.calls.length).toBe(1);
	expect(media.paused).toBe(false);
	await page.elementLocator(footer).getByRole('button', { name: 'Pause', exact: true }).click();
	expect(media.paused).toBe(true);
	expect(play).toHaveBeenCalledOnce();
});

test.each(['audio', 'video'] as const)('animates the central %s button on hover and press, then plays exactly once without closing', async kind => {
	const { media, surface, main, player, closed } = await mountGallery(kind);
	const play = mockPlayback(media);
	const button = page.elementLocator(main.querySelector<HTMLElement>('[class*="playIconWrapper"]')!).getByRole('button', { name: 'Play', exact: true });
	const element = button.element() as HTMLButtonElement;
	const icon = element.firstElementChild as HTMLElement;
	const initialWidth = icon.getBoundingClientRect().width;
	const initialHitRect = element.getBoundingClientRect();
	const body = element.querySelector<HTMLElement>('[class*="body"]')!;
	const initialGlass = getComputedStyle(body).backgroundImage;
	await button.hover();
	await expect.poll(() => icon.getBoundingClientRect().width).toBeCloseTo(initialWidth * 1.12, 1);
	expect(element.getBoundingClientRect().width).toBe(initialHitRect.width);
	expect(element.getBoundingClientRect().left).toBe(initialHitRect.left);
	expect(icon.getBoundingClientRect().left + icon.getBoundingClientRect().width / 2).toBeCloseTo(initialHitRect.left + initialHitRect.width / 2, 1);
	expect(getComputedStyle(element).filter).toBe('none');
	expect(getComputedStyle(body).backgroundImage).toBe(initialGlass);
	await page.elementLocator(surface).hover({ position: { x: 60, y: 60 } });
	await expect.poll(() => icon.getBoundingClientRect().width).toBeCloseTo(initialWidth, 1);
	const pressedWidth = new Promise<number>(resolve => {
		element.addEventListener('pointerdown', () => {
			window.setTimeout(() => {
				expect(element.getBoundingClientRect().width).toBe(initialHitRect.width);
				resolve(icon.getBoundingClientRect().width);
			}, 220);
		}, { once: true });
	});
	await button.click({ delay: 300 });
	expect(await pressedWidth).toBeCloseTo(initialWidth * 0.94, 1);
	await settle();
	expect(play).toHaveBeenCalledOnce();
	expect(media.paused).toBe(false);
	await expect.element(element).not.toBeInTheDocument();
	await expect.element(player).toBeVisible();
	expect(closed).not.toHaveBeenCalled();
});

test.each(['audio', 'video'] as const)('plays %s once from the central button with Enter and Space', async kind => {
	const { media, main, closed } = await mountGallery(kind);
	const play = mockPlayback(media);
	for (const key of ['{Enter}', ' ']) {
		play.mockClear();
		const button = page.elementLocator(main.querySelector<HTMLElement>('[class*="playIconWrapper"]')!).getByRole('button', { name: 'Play', exact: true });
		(button.element() as HTMLButtonElement).focus();
		await userEvent.keyboard(key);
		await settle();
		expect(play).toHaveBeenCalledOnce();
		expect(media.paused).toBe(false);
		expect(closed).not.toHaveBeenCalled();
		media.pause();
		await nextTick();
	}
});

test.each([
	{ kind: 'audio', animation: true }, { kind: 'video', animation: true },
	{ kind: 'audio', animation: false }, { kind: 'video', animation: false },
] as const)('shows the paused $kind play button immediately without transient feedback (animation=$animation)', async ({ kind, animation }) => {
	preferences.animation = animation;
	const { media, surface, main, closed } = await mountGallery(kind);
	const play = mockPlayback(media);
	const feedback = () => main.querySelector<HTMLElement>('[class*="playbackFeedback"]');
	expect(feedback()).toBeNull();
	await page.elementLocator(surface).click({ position: { x: 100, y: 100 } });
	expect(play).toHaveBeenCalledOnce();
	expect(media.paused).toBe(false);
	await nextTick();
	expect(feedback()).toBeNull();
	expect(main.querySelector('[class*="playIconWrapper"] button[aria-label="Play"]')).toBeNull();
	await page.elementLocator(surface).click({ position: { x: 100, y: 100 } });
	expect(media.paused).toBe(true);
	expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
	expect(play).toHaveBeenCalledOnce();
	await nextTick();
	expect(feedback()).toBeNull();
	expect(main.querySelector('[class*="playIconWrapper"] button[aria-label="Play"]')).not.toBeNull();
	expect(closed).not.toHaveBeenCalled();
});

test.each(['audio', 'video'] as const)('closes %s from blank space without toggling playback', async kind => {
	const { media, main, closed } = await mountGallery(kind);
	const play = mockPlayback(media);
	await page.elementLocator(main).click({ position: { x: 10, y: 100 } });
	await expect.poll(() => closed.mock.calls.length).toBe(1);
	expect(play).not.toHaveBeenCalled();
});

test('closes from the gap between the video picture and the previous arrow', async () => {
	const { media, main, closed } = await mountGallery('video', 3);
	const play = mockPlayback(media);
	media.style.width = '400px';
	const videoLeft = media.getBoundingClientRect().left;
	const previousRight = page.getByRole('button', { name: 'Previous', exact: true }).element().getBoundingClientRect().right;
	expect(videoLeft).toBeGreaterThan(previousRight);
	await page.elementLocator(main).click({ position: { x: (videoLeft + previousRight) / 2, y: window.innerHeight / 2 } });
	await expect.poll(() => closed.mock.calls.length).toBe(1);
	expect(play).not.toHaveBeenCalled();
});

test('does not close fullscreen playback from empty header or footer space', async () => {
	const { player, footer, closed } = await mountGallery('video');
	await page.getByRole('button', { name: 'Enter webpage fullscreen', exact: true }).click();
	await settle();
	const header = player.querySelector<HTMLElement>('[class*="header"]')!;
	header.click();
	footer.click();
	await settle();
	expect(closed).not.toHaveBeenCalled();
	await expect.element(player).toBeVisible();
});

test.each(['mouse', 'keyboard'] as const)('uses and clears the same gallery arrow feedback for %s navigation', async input => {
	const { player, closed } = await mountGallery('video', 5);
	for (const [label, key, index] of [['Next', '{ArrowRight}', 2], ['Previous', '{ArrowLeft}', 1]] as const) {
		const button = page.getByRole('button', { name: label, exact: true });
		const element = button.element() as HTMLButtonElement;
		const icon = element.firstElementChild as HTMLElement;
		if (input === 'mouse') {
			await button.click();
		} else {
			player.focus();
			await userEvent.keyboard(key);
		}
		expect(element.className).toContain('_pressed_');
		await expect.poll(() => parseFloat(getComputedStyle(icon).scale)).toBeLessThan(1);
		await expect.poll(() => element.className).not.toContain('_pressed_');
		await expect.poll(() => parseFloat(getComputedStyle(icon).scale)).toBeGreaterThan(1);
		await expect.poll(() => element.className).not.toContain('_feedback_');
		await expect.poll(() => {
			const current = host!.querySelector<HTMLVideoElement>(`video[src$="#${index}"]`)!;
			const rect = current.getBoundingClientRect();
			return rect.left + rect.width / 2;
		}).toBeCloseTo(window.innerWidth / 2, 1);
	}
	expect(closed).not.toHaveBeenCalled();
});

test.each([
	{ label: 'Previous', key: '{ArrowLeft}' },
	{ label: 'Next', key: '{ArrowRight}' },
])('keeps $label visible for keyboard feedback when reaching the gallery edge', async ({ label, key }) => {
	const { player, closed } = await mountGallery('video', 3);
	const element = page.getByRole('button', { name: label, exact: true }).element() as HTMLButtonElement;
	const icon = element.firstElementChild as HTMLElement;
	player.focus();
	await userEvent.keyboard(key);
	expect(element.isConnected).toBe(true);
	expect(element.disabled).toBe(true);
	expect(element.className).toContain('_pressed_');
	await expect.poll(() => parseFloat(getComputedStyle(icon).scale)).toBeLessThan(1);
	await expect.poll(() => parseFloat(getComputedStyle(icon).scale)).toBeGreaterThan(1);
	await expect.poll(() => element.isConnected).toBe(false);
	expect(closed).not.toHaveBeenCalled();
});

test('moves and scales navigation arrows on hover, resets on leave, and switches media on click', async () => {
	const { media, surface, closed } = await mountGallery('audio', 3);
	const centerX = (element: Element) => {
		const rect = element.getBoundingClientRect();
		return rect.left + rect.width / 2;
	};
	for (const [label, direction] of [['Previous', -1], ['Next', 1]] as const) {
		const button = page.getByRole('button', { name: label, exact: true });
		const icon = button.element().firstElementChild!;
		const originalWidth = icon.getBoundingClientRect().width;
		const originalX = centerX(icon);
		await button.hover();
		await expect.poll(() => icon.getBoundingClientRect().width).toBeGreaterThan(originalWidth + 1);
		await expect.poll(() => (centerX(icon) - originalX) * direction).toBeGreaterThan(1);
		await page.elementLocator(surface).hover({ position: { x: 60, y: 60 } });
		await expect.poll(() => icon.getBoundingClientRect().width).toBeCloseTo(originalWidth, 1);
		await expect.poll(() => centerX(icon)).toBeCloseTo(originalX, 1);
	}
	await page.screenshot({ path: '../e2e/artifacts/component-browser/media-player-restored.png' });
	for (const [label, index] of [['Previous', 0], ['Next', 1], ['Next', 2]] as const) {
		await page.getByRole('button', { name: label, exact: true }).click();
		await expect.poll(() => host?.querySelector(`audio[src$="#${index}"]`)).not.toBeNull();
		const current = host!.querySelector(`audio[src$="#${index}"]`)!.parentElement!.querySelector('canvas')!;
		await expect.poll(() => centerX(current)).toBeCloseTo(window.innerWidth / 2, 1);
	}
	await expect.element(page.getByRole('button', { name: 'Next', exact: true })).not.toBeInTheDocument();
	expect(host?.contains(media)).toBe(true);
	expect(closed).not.toHaveBeenCalled();
});

test.each(['audio', 'video'] as const)('shares playback, mute, speed, and loop context menus between the %s surface and bottom controls', async kind => {
	const { surface, footer, closed } = await mountGallery(kind);
	for (const target of [surface, footer]) {
		await page.elementLocator(target).click({ button: 'right', position: { x: 60, y: 30 } });
		const items = vi.mocked(os.contextMenu).mock.lastCall?.[0];
		expect(items).toEqual(expect.arrayContaining([
			expect.objectContaining({ text: 'Play' }), expect.objectContaining({ text: 'Mute' }),
			expect.objectContaining({ type: 'radio', text: 'Playback speed' }),
			expect.objectContaining({ type: 'switch', text: 'Loop' }),
		]));
	}
	const calls = vi.mocked(os.contextMenu).mock.calls;
	expect(calls).toHaveLength(2);
	// Actions may be new closures; both entry points still share the same settings refs.
	expect(calls[1][0]).toEqual(calls[0][0].map(item => 'action' in item ? { ...item, action: expect.any(Function) } : item));
	await page.elementLocator(footer).getByRole('button', { name: 'Settings', exact: true }).click();
	expect(os.popupMenu).toHaveBeenCalledOnce();
	expect(vi.mocked(os.popupMenu).mock.lastCall?.[0]).toEqual(expect.arrayContaining([
		expect.objectContaining({ type: 'radio', text: 'Playback speed' }),
		expect.objectContaining({ type: 'switch', text: 'Loop' }),
	]));
	expect(closed).not.toHaveBeenCalled();
});

test.each(['audio', 'video'] as const)('keeps the %s play and navigation icons still when animations are disabled', async kind => {
	preferences.animation = false;
	const { main } = await mountGallery(kind, 3);
	const controls = [
		page.elementLocator(main.querySelector<HTMLElement>('[class*="playIconWrapper"]')!).getByRole('button', { name: 'Play', exact: true }),
		page.getByRole('button', { name: 'Previous', exact: true }),
		page.getByRole('button', { name: 'Next', exact: true }),
	];
	for (const button of controls) {
		const element = button.element();
		const icon = element.querySelector('span') ?? element;
		const initialRect = icon.getBoundingClientRect();
		await button.hover();
		await settle();
		expect(icon.getBoundingClientRect().width).toBeCloseTo(initialRect.width, 1);
		expect(icon.getBoundingClientRect().left).toBeCloseTo(initialRect.left, 1);
	}
	const centralButton = controls[0];
	const centralElement = centralButton.element() as HTMLElement;
	const centralIcon = centralElement.firstElementChild as HTMLElement;
	const hitWidth = centralElement.getBoundingClientRect().width;
	const iconWidth = centralIcon.getBoundingClientRect().width;
	const pressedWidths = new Promise<number[]>(resolve => {
		centralElement.addEventListener('pointerdown', () => {
			window.setTimeout(() => resolve([centralElement.getBoundingClientRect().width, centralIcon.getBoundingClientRect().width]), 220);
		}, { once: true });
	});
	await centralButton.click({ delay: 300 });
	expect(await pressedWidths).toEqual([hitWidth, iconWidth]);
});
