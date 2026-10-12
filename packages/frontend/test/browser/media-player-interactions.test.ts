/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, defineComponent, h, nextTick, reactive } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import 'virtual:tabler-icons.css';
import MkLightbox from '@/components/MkLightbox.vue';
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
	host?.querySelector('.ti-x')?.closest('button')?.click();
	await settle();
	app?.unmount();
	host?.remove();
	URL.revokeObjectURL(audioUrl);
	window.history.replaceState(null, '', originalUrl);
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

async function mountGallery(kind: 'audio' | 'video', count = 1) {
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
		width: 1600, height: 900, filename: `Player demo ${index + 1}.${kind === 'audio' ? 'wav' : 'webm'}`,
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
	const footer = player.querySelector<HTMLElement>('[class*="footer"]')!;
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

test.each(['audio', 'video'] as const)('closes the %s gallery from the blank stage beside the player', async kind => {
	const { surface, main, closed } = await mountGallery(kind);
	const stage = main.getBoundingClientRect();
	expect(surface.getBoundingClientRect().left - stage.left).toBeGreaterThan(8);
	await page.elementLocator(main).click({ position: { x: 4, y: Math.round(stage.height / 2) } });
	await expect.poll(() => closed.mock.calls.length).toBe(1);
});

test.each(['audio', 'video'] as const)('toggles %s playback from the media surface and bottom controls', async kind => {
	const { media, surface, footer, closed } = await mountGallery(kind);
	const play = mockPlayback(media);
	await page.elementLocator(surface).click({ position: { x: 60, y: 60 } });
	await expect.poll(() => play.mock.calls.length).toBe(1);
	expect(media.paused).toBe(false);
	await page.elementLocator(footer.querySelector('.ti-player-pause')!.closest('button')!).click();
	expect(media.paused).toBe(true);
	expect(play).toHaveBeenCalledOnce();
	expect(closed).not.toHaveBeenCalled();
});

test('closes from the gap between the video picture and the previous arrow', async () => {
	const { media, main, closed } = await mountGallery('video', 3);
	const play = mockPlayback(media);
	media.style.width = '400px';
	const videoLeft = media.getBoundingClientRect().left;
	const previousRight = host!.querySelector('.ti-arrow-left')!.closest('button')!.getBoundingClientRect().right;
	expect(videoLeft).toBeGreaterThan(previousRight);
	await page.elementLocator(main).click({ position: { x: (videoLeft + previousRight) / 2, y: window.innerHeight / 2 } });
	await expect.poll(() => closed.mock.calls.length).toBe(1);
	expect(play).not.toHaveBeenCalled();
});

test.each(['mouse', 'keyboard'] as const)('switches gallery media with %s navigation', async input => {
	const { player, closed } = await mountGallery('video', 3);
	for (const [icon, key, index] of [['.ti-arrow-right', '{ArrowRight}', 2], ['.ti-arrow-left', '{ArrowLeft}', 1]] as const) {
		if (input === 'mouse') {
			await page.elementLocator(host!.querySelector(icon)!.closest('button')!).click();
		} else {
			player.closest<HTMLElement>('[tabindex]')?.focus();
			await userEvent.keyboard(key);
		}
		await expect.poll(() => {
			const current = host!.querySelector<HTMLVideoElement>('video[src$="#' + index + '"]');
			if (!current) return null;
			const rect = current.getBoundingClientRect();
			return rect.left + rect.width / 2;
		}).toBeCloseTo(window.innerWidth / 2, 1);
	}
	expect(closed).not.toHaveBeenCalled();
});
