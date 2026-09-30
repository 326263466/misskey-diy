/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, defineComponent, h, nextTick, reactive } from 'vue';
import type { App, VNode } from 'vue';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import MkLightbox from '@/components/MkLightbox.vue';
import MkPopupMenu from '@/components/MkPopupMenu.vue';
import MkContextMenu from '@/components/MkContextMenu.vue';
import { hotkeyDirective } from '@/directives/hotkey.js';
import * as os from '@/os.js';

const preferences = vi.hoisted(() => ({ animation: false, useNativeUiForVideoAudioPlayer: false, menuStyle: 'popup' }));

vi.mock('misskey-js', () => ({}));
vi.mock('@/os.js', () => ({ claimZIndex: () => 1000, popupMenu: vi.fn(), contextMenu: vi.fn() }));
vi.mock('@/preferences.js', () => ({ prefer: { s: preferences } }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/utility/touch.js', () => ({ isTouchUsing: false, lastPointerType: 'mouse' }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release: vi.fn() }) }));
vi.mock('@/utility/get-file-menu.js', () => ({ getFileMenu: () => [] }));
vi.mock('@/utility/sensitive-file.js', () => ({ shouldHideFileByDefault: () => false, canRevealFile: async () => true }));
vi.mock('@/utility/media-has-audio.js', () => ({ default: async () => true }));
vi.mock('@/components/MkBlurhash.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkLightbox.item.audio-visualizer.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			volume: 'Volume', settings: 'Settings', close: 'Close', menu: 'Menu',
			_mediaControls: {
				play: 'Play', pause: 'Pause', seek: 'Playback position', mute: 'Mute', unmute: 'Unmute',
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
let originalUrl: string;
const popups = new Set<{ app: App; host: HTMLElement }>();
const nativePlay = HTMLMediaElement.prototype.play;
const nativePause = HTMLMediaElement.prototype.pause;
const resizeErrors: string[] = [];
const onWindowError = (ev: ErrorEvent) => {
	if (ev.message.startsWith('ResizeObserver loop')) resizeErrors.push(ev.message);
};
const themeStyle = [
	'--MI_THEME-fg:#dadada', '--MI_THEME-accent:#86b300', '--MI_THEME-accentedBg:#86b30026',
	'--MI_THEME-panel:#25282e', '--MI_THEME-popup:#2c3036', '--MI_THEME-shadow:#0008',
	'--MI_THEME-modalBg:#000c', '--MI_THEME-divider:#ffffff1a', '--MI_THEME-focus:#86b3004d',
	'--MI_THEME-switchOffBg:#ffffff1a', '--MI_THEME-switchOffFg:#dadada',
	'--MI_THEME-switchOnBg:#86b300', '--MI_THEME-switchOnFg:#fff', '--MI-radius:12px', 'color:var(--MI_THEME-fg)',
].join(';');

async function nextFrame() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
}

function mountMenu(render: (onClosed: () => void) => VNode): Promise<void> {
	return new Promise(resolve => {
		const popupHost = document.createElement('div');
		popupHost.style.cssText = themeStyle;
		document.body.append(popupHost);
		const onClosed = () => {
			popupApp.unmount();
			popupHost.remove();
			popups.delete(popup);
			resolve();
		};
		const popupApp = createApp({ render: () => render(onClosed) });
		const popup = { app: popupApp, host: popupHost };
		popups.add(popup);
		popupApp.directive('hotkey', hotkeyDirective);
		popupApp.directive('tooltip', {});
		for (const name of ['MkEllipsis', 'MkAvatar', 'MkA', 'MkUserName']) popupApp.component(name, { render: () => null });
		popupApp.mount(popupHost);
	});
}

beforeEach(async () => {
	originalUrl = window.location.href;
	resizeErrors.length = 0;
	window.addEventListener('error', onWindowError);
	preferences.animation = false;
	vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
	vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
	vi.mocked(os.popupMenu).mockReset().mockImplementation((items, anchor, options) => mountMenu(onClosed => h(MkPopupMenu, {
		items: items.filter(item => item != null),
		anchorElement: anchor instanceof HTMLElement ? anchor : null,
		returnFocusTo: anchor instanceof HTMLElement ? anchor : null,
		align: options?.align,
		onClosing: options?.onClosing,
		onActioned: options?.onAction,
		onClosed: () => {
			options?.onClosed?.();
			onClosed();
		},
	})));
	vi.mocked(os.contextMenu).mockReset().mockImplementation((items, ev) => {
		ev.preventDefault();
		return mountMenu(onClosed => h(MkContextMenu, { items, ev, onClosed }));
	});
	await page.viewport(1200, 800);
});

afterEach(async () => {
	if (document.fullscreenElement) await document.exitFullscreen();
	for (const popup of popups) {
		popup.app.unmount();
		popup.host.remove();
	}
	popups.clear();
	app?.unmount();
	host?.remove();
	window.history.replaceState(null, '', originalUrl);
	vi.restoreAllMocks();
	await nextFrame();
	window.removeEventListener('error', onWindowError);
	expect(resizeErrors).toEqual([]);
});

async function mountGallery({ mockMediaState = true, width = 1920, height = 1080, count = 2, sourceElement = undefined as HTMLElement | undefined } = {}) {
	host = document.createElement('div');
	host.style.cssText = themeStyle;
	document.body.append(host);
	const closed = vi.fn();
	const contents = reactive(Array.from({ length: count }, (_, index) => ({
		id: `video-${index}`, type: 'video' as const, url: `data:video/webm;base64,#${index}`,
		width, height, filename: `Gallery video ${index + 1}.webm`, sourceElement,
	})));
	app = createApp({
		render: () => h(MkLightbox, {
			defaultIndex: 1,
			contents,
			onClosed: closed,
		}),
	});
	app.directive('hotkey', hotkeyDirective);
	app.component('MkLoading', { render: () => null });
	app.component('MkCondensedLine', defineComponent({ render() { return h('span', this.$slots.default?.()); } }));
	app.mount(host);
	await nextFrame();
	const video = host.querySelector<HTMLVideoElement>('video')!;
	const player = video.closest<HTMLElement>('[class*="contentWrapper"]')!.parentElement!.parentElement!.parentElement!;
	if (mockMediaState) {
		Object.defineProperties(video, {
			duration: { value: 120 },
			readyState: { value: HTMLMediaElement.HAVE_ENOUGH_DATA },
		});
		video.dispatchEvent(new Event('loadedmetadata'));
		video.dispatchEvent(new Event('canplay'));
	}
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d')!;
	context.scale(width / 1920, height / 1080);
	const sky = context.createLinearGradient(0, 0, 0, 1080);
	sky.addColorStop(0, '#26465b');
	sky.addColorStop(1, '#99b9b4');
	context.fillStyle = sky;
	context.fillRect(0, 0, 1920, 1080);
	context.fillStyle = '#efc984';
	context.beginPath();
	context.arc(1450, 260, 110, 0, Math.PI * 2);
	context.fill();
	context.fillStyle = '#1c4644';
	context.beginPath();
	context.moveTo(0, 850);
	context.lineTo(480, 360);
	context.lineTo(1000, 890);
	context.lineTo(1450, 550);
	context.lineTo(1920, 880);
	context.lineTo(1920, 1080);
	context.lineTo(0, 1080);
	context.fill();
	video.poster = canvas.toDataURL();
	await document.fonts.ready;
	await nextFrame();
	expect(host.querySelectorAll('video')).toHaveLength(1);
	expect(video.src).toContain('#1');
	return { video, player, closed };
}

function mockPlayback(video: HTMLVideoElement, initiallyPaused = true) {
	let paused = initiallyPaused;
	Object.defineProperty(video, 'paused', { get: () => paused });
	const play = vi.mocked(HTMLMediaElement.prototype.play).mockClear().mockImplementation(async function (this: HTMLMediaElement) {
		if (this === video) paused = false;
		this.dispatchEvent(new Event('play'));
		this.dispatchEvent(new Event('playing'));
	});
	const pause = vi.mocked(HTMLMediaElement.prototype.pause).mockClear().mockImplementation(function (this: HTMLMediaElement) {
		if (this === video) paused = true;
		this.dispatchEvent(new Event('pause'));
	});
	if (!initiallyPaused) {
		video.dispatchEvent(new Event('play'));
		video.dispatchEvent(new Event('playing'));
	}
	return { play, pause };
}

function getFooter(player: HTMLElement) {
	return player.querySelector<HTMLElement>('[class*="footer"]')!;
}

function getFrame(video: HTMLVideoElement) {
	return video.closest<HTMLElement>('[class*="contentWrapper"]')!;
}

test.each([false, true])('opens video with an immediate backdrop and settles smoothly (thumbnail=%s)', async withThumbnail => {
	preferences.animation = true;
	const thumbnail = document.createElement('div');
	thumbnail.style.cssText = 'position:fixed;left:20px;top:20px;width:240px;height:135px';
	document.body.append(thumbnail);
	try {
		const { video } = await mountGallery({ sourceElement: withThumbnail ? thumbnail : undefined });
		const backdrop = host!.querySelector<HTMLElement>('._modalBg')!;
		expect(getComputedStyle(backdrop).opacity).toBe('1');
		await new Promise(resolve => setTimeout(resolve, 250));
		expect(getComputedStyle(getFrame(video)).opacity).toBe('1');
		await expectGalleryLayout(video);
		const settledBounds = video.getBoundingClientRect();
		await nextFrame();
		const bounds = video.getBoundingClientRect();
		expect(settledBounds.width).toBeCloseTo(bounds.width, 1);
		expect(settledBounds.height).toBeCloseTo(bounds.height, 1);
	} finally {
		thumbnail.remove();
	}
});

function getPlaySurface(player: HTMLElement) {
	return player.querySelector<HTMLElement>('[class*="playIconWrapper"]')!;
}

function expectFooterAttached(player: HTMLElement, video: HTMLVideoElement) {
	const drawn = video.getBoundingClientRect();
	const bounds = getFooter(player).getBoundingClientRect();
	expect(bounds.left).toBeCloseTo(drawn.left, 0);
	expect(bounds.right).toBeCloseTo(drawn.right, 0);
	expect(bounds.bottom).toBeCloseTo(drawn.bottom, 0);
}

async function expectExpandedLayout(player: HTMLElement, video: HTMLVideoElement) {
	await expect.poll(() => {
		const box = video.getBoundingClientRect();
		return [box.left, box.top, box.width - window.innerWidth, box.height - window.innerHeight].map(Math.round);
	}).toEqual([0, 0, 0, 0]);
	const bounds = player.getBoundingClientRect();
	expect(Math.round(bounds.width)).toBe(window.innerWidth);
	expect(Math.round(bounds.height)).toBe(window.innerHeight);
	const footer = getFooter(player);
	const footerBounds = footer.getBoundingClientRect();
	expect(footerBounds.left).toBeCloseTo(bounds.left, 0);
	expect(footerBounds.right).toBeCloseTo(bounds.right, 0);
	expect(footerBounds.bottom).toBeCloseTo(bounds.bottom, 0);
	expect(footerBounds.top).toBeGreaterThan(bounds.bottom - 160);
	for (const control of footer.querySelectorAll<HTMLElement>('button, input')) {
		const box = control.getBoundingClientRect();
		expect(box.left).toBeGreaterThanOrEqual(bounds.left);
		expect(box.right).toBeLessThanOrEqual(bounds.right);
		expect(box.top).toBeGreaterThanOrEqual(bounds.top);
		expect(box.bottom).toBeLessThanOrEqual(bounds.bottom);
	}
	expect(player.querySelector('video')).toBe(video);
}

async function expectGalleryLayout(video: HTMLVideoElement) {
	await expect.poll(() => getFrame(video).getAnimations()).toHaveLength(0);
	await expect.poll(() => video.getBoundingClientRect().width).toBeLessThan(window.innerWidth);
	await expect.poll(() => {
		const box = video.getBoundingClientRect();
		return Math.round(box.left + box.width / 2);
	}).toBe(Math.round(window.innerWidth / 2));
	const box = video.getBoundingClientRect();
	expect(box.width).toBeLessThan(window.innerWidth);
	expect(box.height).toBeLessThan(window.innerHeight);
	expect(box.left).toBeGreaterThanOrEqual(0);
	expect(box.top).toBeGreaterThanOrEqual(0);
	expect(box.right).toBeLessThanOrEqual(window.innerWidth);
	expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);
}

test.each([
	{ viewportWidth: 1200, viewportHeight: 800, width: 1920, height: 1080, name: 'wide-landscape' },
	{ viewportWidth: 1200, viewportHeight: 800, width: 1080, height: 1920, name: 'wide-portrait' },
	{ viewportWidth: 360, viewportHeight: 740, width: 1920, height: 1080, name: 'narrow-landscape' },
	{ viewportWidth: 360, viewportHeight: 740, width: 1080, height: 1920, name: 'narrow-portrait' },
])('keeps the transparent control panel attached to the video in the $name gallery layout', async ({ viewportWidth, viewportHeight, width, height, name }) => {
	await page.viewport(viewportWidth, viewportHeight);
	const { player, video } = await mountGallery({ width, height });
	await expectGalleryLayout(video);
	const footer = getFooter(player);
	const panel = footer.querySelector<HTMLElement>('[class*="mediaControl"]')!;
	const panelBounds = panel.getBoundingClientRect();
	expect(panelBounds.left + panelBounds.width / 2).toBeCloseTo(window.innerWidth / 2, 0);
	expectFooterAttached(player, video);
	expect(panelBounds.width).toBeCloseTo(video.getBoundingClientRect().width, 0);
	const footerBounds = footer.getBoundingClientRect();
	expect(footerBounds.left).toBeGreaterThanOrEqual(0);
	expect(footerBounds.right).toBeLessThanOrEqual(window.innerWidth);
	expect(footerBounds.bottom).toBeLessThanOrEqual(window.innerHeight);
	for (const control of footer.querySelectorAll<HTMLElement>('button, input')) {
		const isVolume = control.getAttribute('aria-label') === 'Volume';
		if (isVolume) {
			control.focus();
			await nextFrame();
		}
		const bounds = control.getBoundingClientRect();
		expect(bounds.left).toBeGreaterThanOrEqual(panelBounds.left);
		expect(bounds.right).toBeLessThanOrEqual(panelBounds.right);
		expect(bounds.top).toBeGreaterThanOrEqual(isVolume ? video.getBoundingClientRect().top : footerBounds.top);
		expect(bounds.bottom).toBeLessThanOrEqual(footerBounds.bottom);
		const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
		expect(control.contains(hit), `${control.outerHTML.slice(0, 160)} hit ${hit?.outerHTML.slice(0, 200)}`).toBe(true);
		if (isVolume) {
			control.blur();
			await nextFrame();
		}
	}
	await page.screenshot({ element: player, path: `../e2e/artifacts/component-browser/video-gallery-${name}.png` });
});

test.each(['previous', 'next'])('animates the %s gallery arrow on hover and press and restores it on leaving', async direction => {
	preferences.animation = true;
	const { player, video, closed } = await mountGallery({ count: 3 });
	const main = player.parentElement!.parentElement!.parentElement!;
	const button = main.querySelectorAll<HTMLButtonElement>(':scope > button')[direction === 'previous' ? 0 : 1];
	const icon = button.firstElementChild as HTMLElement;
	const initial = icon.getBoundingClientRect();
	const initialCenter = initial.left + initial.width / 2;
	await page.elementLocator(button).hover();
	await expect.poll(() => {
		const bounds = icon.getBoundingClientRect();
		return (bounds.left + bounds.width / 2 - initialCenter) * (direction === 'previous' ? -1 : 1);
	}).toBeGreaterThan(1);
	await expect.poll(() => icon.getBoundingClientRect().width).toBeGreaterThan(initial.width);
	await page.elementLocator(video).hover({ position: { x: 100, y: 100 } });
	await expect.poll(() => {
		const bounds = icon.getBoundingClientRect();
		return bounds.left + bounds.width / 2;
	}).toBeCloseTo(initialCenter, 1);
	await expect.poll(() => icon.getBoundingClientRect().width).toBeCloseTo(initial.width, 1);
	expect(player.querySelector('video')).toBe(video);
	expect(closed).not.toHaveBeenCalled();
	const pressedWidth = new Promise<number>(resolve => {
		button.addEventListener('pointerdown', () => {
			window.setTimeout(() => resolve(icon.getBoundingClientRect().width), 220);
		}, { once: true });
	});
	await page.elementLocator(button).click({ delay: 300 });
	expect(await pressedWidth).toBeLessThan(initial.width);
	await expect.poll(() => {
		const nextVideo = host?.querySelector<HTMLVideoElement>(`video[src$="#${direction === 'previous' ? 0 : 2}"]`);
		if (!nextVideo) return null;
		const bounds = nextVideo.getBoundingClientRect();
		return Math.round(bounds.left + bounds.width / 2);
	}).toBe(Math.round(window.innerWidth / 2));
	expect(closed).not.toHaveBeenCalled();
});

test.each(['gallery', 'browser', 'webpage'])('animates the central play button on hover and press and plays once in %s mode', async mode => {
	preferences.animation = true;
	const { player, video, closed } = await mountGallery();
	if (mode !== 'gallery') {
		await page.getByRole('button', { name: mode === 'browser' ? 'Enter fullscreen' : 'Enter webpage fullscreen', exact: true }).click();
		await expectExpandedLayout(player, video);
	}
	const button = page.elementLocator(getPlaySurface(player)).getByRole('button', { name: 'Play', exact: true });
	const element = button.element() as HTMLButtonElement;
	await page.elementLocator(video).hover({ position: { x: 100, y: 100 } });
	await expect.poll(() => player.getAnimations({ subtree: true })).toHaveLength(0);
	const initialWidth = element.getBoundingClientRect().width;
	const { play } = mockPlayback(video);
	await button.hover();
	await expect.poll(() => element.getBoundingClientRect().width).toBeGreaterThan(initialWidth + 1);
	await page.elementLocator(video).hover({ position: { x: 100, y: 100 } });
	await expect.poll(() => element.getBoundingClientRect().width).toBeCloseTo(initialWidth, 1);
	const pressedWidth = new Promise<number>(resolve => {
		element.addEventListener('pointerdown', () => {
			window.setTimeout(() => resolve(element.getBoundingClientRect().width), 220);
		}, { once: true });
	});
	await button.click({ delay: 300 });
	expect(await pressedWidth).toBeLessThan(initialWidth);
	expect(video.paused).toBe(false);
	expect(play).toHaveBeenCalledOnce();
	await expect.element(element).not.toBeInTheDocument();
	expect(player.querySelector('video')).toBe(video);
	expect(document.fullscreenElement).toBe(mode === 'browser' ? player : null);
	expect(closed).not.toHaveBeenCalled();
});

test.each([false, true])('restores paused playback when double-clicking the disappearing central button with animation %s', async animation => {
	preferences.animation = animation;
	const { player, video, closed } = await mountGallery();
	const { play, pause } = mockPlayback(video);
	const source = video.getAttribute('src');
	const button = page.elementLocator(getPlaySurface(player)).getByRole('button', { name: 'Play', exact: true });
	await button.dblClick({ delay: 150 });
	await expect.poll(() => document.fullscreenElement).toBe(player);
	await expectExpandedLayout(player, video);
	expect(video.paused).toBe(true);
	await page.elementLocator(video).dblClick({ delay: 150, position: { x: 100, y: 100 } });
	await expect.poll(() => document.fullscreenElement).toBeNull();
	await expectGalleryLayout(video);
	expect(video.paused).toBe(true);
	expect(play).toHaveBeenCalledTimes(2);
	expect(pause).toHaveBeenCalledTimes(2);
	expect(player.querySelector('video')).toBe(video);
	expect(video.getAttribute('src')).toBe(source);
	expect(closed).not.toHaveBeenCalled();
});

test.each(['gallery', 'browser', 'webpage'])('opens the project context menu on the video in %s mode', async mode => {
	const { player, video, closed } = await mountGallery();
	if (mode !== 'gallery') {
		await page.getByRole('button', { name: mode === 'browser' ? 'Enter fullscreen' : 'Enter webpage fullscreen', exact: true }).click();
		await expectExpandedLayout(player, video);
	}
	await page.elementLocator(video).click({ button: 'right', position: { x: 100, y: 100 } });
	const menu = page.getByRole('menu');
	await expect.element(menu).toBeVisible();
	expect(menu.element().querySelector('._popup')).not.toBeNull();
	expect(os.contextMenu).toHaveBeenCalledOnce();
	if (mode === 'browser') expect(document.fullscreenElement?.contains(menu.element())).toBe(true);
	const bounds = menu.element().getBoundingClientRect();
	expect(bounds.left).toBeGreaterThanOrEqual(0);
	expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
	expect(bounds.top).toBeGreaterThanOrEqual(0);
	expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);
	expect(menu.element().querySelectorAll('[role^="menuitem"]').length).toBeGreaterThan(0);
	await page.screenshot({ path: `../e2e/artifacts/component-browser/video-context-menu-${mode}.png` });
	await page.getByRole('menuitem', { name: 'Mute' }).click();
	await expect.poll(() => video.volume).toBe(0);
	expect(video.muted).toBe(true);
	await expect.element(menu).not.toBeInTheDocument();
	expect(player.querySelector('video')).toBe(video);
	expect(document.fullscreenElement).toBe(mode === 'browser' ? player : null);
	expect(closed).not.toHaveBeenCalled();
});

test.each(['browser', 'webpage'])('fills the viewport with overlay controls for %s fullscreen on the second gallery item', async mode => {
	const { player, video, closed } = await mountGallery();
	const initial = video.getBoundingClientRect();
	expect(initial.width).toBeLessThan(window.innerWidth);
	expect(initial.height).toBeLessThan(window.innerHeight);
	await page.getByRole('button', { name: mode === 'browser' ? 'Enter fullscreen' : 'Enter webpage fullscreen', exact: true }).click();
	await expect.poll(() => document.fullscreenElement).toBe(mode === 'browser' ? player : null);
	await expectExpandedLayout(player, video);
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	const speed = page.getByRole('menuitem', { name: 'Playback speed' });
	await expect.element(speed).toBeVisible();
	if (mode === 'browser') expect(document.fullscreenElement?.contains(speed.element())).toBe(true);
	await speed.hover();
	const rate = page.getByRole('menuitemradio', { name: '1.5x', exact: true });
	await expect.element(rate).toBeVisible();
	if (mode === 'browser') expect(document.fullscreenElement?.contains(rate.element())).toBe(true);
	const options = document.querySelectorAll<HTMLElement>('[role="menuitemradio"]');
	expect(options).toHaveLength(7);
	for (const option of options) {
		option.scrollIntoView({ block: 'nearest' });
		await nextFrame();
		const bounds = option.getBoundingClientRect();
		expect(bounds.left).toBeGreaterThanOrEqual(0);
		expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
		expect(bounds.top).toBeGreaterThanOrEqual(0);
		expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);
		expect(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)?.closest('[role="menuitemradio"]')).toBe(option);
	}
	await rate.click();
	expect(video.playbackRate).toBe(1.5);
	await page.screenshot({ element: player, path: `../e2e/artifacts/component-browser/video-${mode}-fullscreen.png` });
	await page.elementLocator(document.body).click({ position: { x: 20, y: 20 }, force: true });
	await expect.element(page.getByRole('menu')).not.toBeInTheDocument();
	await page.viewport(760, 560);
	await expectExpandedLayout(player, video);
	await page.getByRole('button', { name: mode === 'browser' ? 'Exit fullscreen' : 'Exit webpage fullscreen', exact: true }).click();
	await expect.poll(() => document.fullscreenElement).toBeNull();
	await expect.poll(() => video.getBoundingClientRect().width).toBeLessThan(window.innerWidth);
	expect(player.querySelector('video')).toBe(video);
	expect(closed).not.toHaveBeenCalled();
});

test('returns to webpage fullscreen after the browser exits, then Escape restores the gallery without replacing the video', async () => {
	const { player, video, closed } = await mountGallery();
	await page.getByRole('button', { name: 'Enter webpage fullscreen', exact: true }).click();
	await expectExpandedLayout(player, video);
	await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
	await expect.poll(() => document.fullscreenElement).toBe(player);
	await expectExpandedLayout(player, video);
	// Exiting through the browser UI dispatches the same fullscreenchange event.
	await document.exitFullscreen();
	await expect.element(page.getByRole('button', { name: 'Exit webpage fullscreen', exact: true })).toBeVisible();
	await expectExpandedLayout(player, video);
	player.focus();
	await userEvent.keyboard('{Escape}');
	await expect.element(page.getByRole('button', { name: 'Enter webpage fullscreen', exact: true })).toBeVisible();
	expect(document.fullscreenElement).toBeNull();
	expect(video.getBoundingClientRect().width).toBeLessThan(window.innerWidth);
	expect(player.querySelector('video')).toBe(video);
	expect(closed).not.toHaveBeenCalled();
});

test.each([true, false])('preserves paused=%s when double-clicking the video 300ms apart to enter and exit native fullscreen', async initiallyPaused => {
	const { player, video, closed } = await mountGallery();
	const { play, pause } = mockPlayback(video, initiallyPaused);
	const source = video.getAttribute('src');
	const clickTimes: number[] = [];
	player.addEventListener('click', ev => clickTimes.push(ev.timeStamp), { capture: true });
	// Playwright waits before each mouseup and between clicks, giving a 300ms click interval.
	await page.elementLocator(video).dblClick({ delay: 150, position: { x: 100, y: 100 } });
	expect(clickTimes[1] - clickTimes[0]).toBeGreaterThanOrEqual(300);
	await expect.poll(() => document.fullscreenElement).toBe(player);
	await expectExpandedLayout(player, video);
	expect(video.paused).toBe(initiallyPaused);
	await page.elementLocator(video).dblClick({ delay: 150, position: { x: 100, y: 100 } });
	await expect.poll(() => document.fullscreenElement).toBeNull();
	await expect.poll(() => video.getBoundingClientRect().width).toBeLessThan(window.innerWidth);
	expect(video.paused).toBe(initiallyPaused);
	expect(player.querySelector('video')).toBe(video);
	expect(play).toHaveBeenCalledTimes(2);
	expect(pause).toHaveBeenCalledTimes(2);
	expect(video.getAttribute('src')).toBe(source);
	expect(closed).not.toHaveBeenCalled();
});

test.each(['gallery', 'browser', 'webpage'])('immediately toggles playback on surface clicks and retains control actions in %s mode', async mode => {
	const { player, video, closed } = await mountGallery();
	if (mode !== 'gallery') {
		await page.getByRole('button', { name: mode === 'browser' ? 'Enter fullscreen' : 'Enter webpage fullscreen', exact: true }).click();
		await expectExpandedLayout(player, video);
	}
	const { play, pause } = mockPlayback(video);
	for (const expectedPaused of [false, true, false]) {
		await page.elementLocator(video).click({ position: { x: 100, y: 100 } });
		expect(video.paused).toBe(expectedPaused);
		await expect.element(page.elementLocator(getFooter(player)).getByRole('button', { name: expectedPaused ? 'Play' : 'Pause', exact: true })).toBeVisible();
		expect(document.fullscreenElement).toBe(mode === 'browser' ? player : null);
	}
	expect(play).toHaveBeenCalledTimes(2);
	expect(pause).toHaveBeenCalledOnce();
	expect(player.querySelector('video')).toBe(video);
	expect(closed).not.toHaveBeenCalled();
});

test.each(['Volume', 'Playback position'])('exits webpage fullscreen with Escape while %s is focused', async label => {
	const { player, video, closed } = await mountGallery();
	await page.getByRole('button', { name: 'Enter webpage fullscreen', exact: true }).click();
	await expectExpandedLayout(player, video);
	player.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!.focus();
	await userEvent.keyboard('{Escape}');
	await expect.element(page.getByRole('button', { name: 'Enter webpage fullscreen', exact: true })).toBeVisible();
	expect(video.getBoundingClientRect().width).toBeLessThan(window.innerWidth);
	expect(closed).not.toHaveBeenCalled();
});

test.each(['gallery', 'browser', 'webpage'])('toggles playback exactly once with Space in %s mode without stealing control keystrokes', async mode => {
	const { player, video } = await mountGallery();
	if (mode !== 'gallery') {
		await page.getByRole('button', { name: mode === 'browser' ? 'Enter fullscreen' : 'Enter webpage fullscreen', exact: true }).click();
	}
	const { play, pause } = mockPlayback(video);
	player.focus();
	await userEvent.keyboard(' ');
	expect(play).toHaveBeenCalledOnce();
	expect(video.paused).toBe(false);
	player.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', repeat: true, bubbles: true, cancelable: true }));
	expect(pause).not.toHaveBeenCalled();
	await userEvent.keyboard(' ');
	expect(pause).toHaveBeenCalledOnce();
	for (const slider of player.querySelectorAll<HTMLInputElement>('input[type="range"]')) {
		slider.focus();
		await userEvent.keyboard(' ');
	}
	expect(play).toHaveBeenCalledOnce();
	expect(pause).toHaveBeenCalledOnce();
	const footer = getFooter(player);
	(footer.querySelector('button[aria-label="Play"]') as HTMLButtonElement).focus();
	await userEvent.keyboard(' ');
	expect(play).toHaveBeenCalledTimes(2);
	expect(pause).toHaveBeenCalledOnce();
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	await expect.element(page.getByRole('menu')).toBeVisible();
	player.focus();
	await userEvent.keyboard(' ');
	expect(play).toHaveBeenCalledTimes(2);
	expect(pause).toHaveBeenCalledOnce();
});

test('keeps fullscreen controls available for pointer, keyboard focus, and an open menu', async () => {
	const { player, video } = await mountGallery();
	mockPlayback(video, false);
	await page.getByRole('button', { name: 'Enter webpage fullscreen', exact: true }).click();
	const footer = getFooter(player);
	const volume = player.querySelector<HTMLInputElement>('input[aria-label="Volume"]')!;
	await page.elementLocator(volume).hover();
	await new Promise(resolve => setTimeout(resolve, 2800));
	expect(getComputedStyle(footer).opacity).toBe('1');
	await page.elementLocator(video).hover({ position: { x: 100, y: 100 } });
	await userEvent.keyboard('{Tab}');
	volume.focus();
	await new Promise(resolve => setTimeout(resolve, 2800));
	expect(getComputedStyle(footer).opacity).toBe('1');
	expect(footer.inert).toBe(false);
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	await expect.element(page.getByRole('menu')).toBeVisible();
	await page.getByRole('menu').hover();
	await new Promise(resolve => setTimeout(resolve, 2800));
	expect(getComputedStyle(footer).opacity).toBe('1');
}, 15000);

test.each(['browser', 'webpage'])('uses fullscreen arrow shortcuts with clamped seek and volume while preserving range input keys in %s mode', async mode => {
	const { player, video } = await mountGallery();
	const source = video.src;
	await page.getByRole('button', { name: mode === 'browser' ? 'Enter fullscreen' : 'Enter webpage fullscreen', exact: true }).click();
	await expect.poll(() => document.fullscreenElement).toBe(mode === 'browser' ? player : null);
	await expectExpandedLayout(player, video);
	await expect.poll(() => document.activeElement).toBe(player);
	expect(video.volume).toBe(0.5);
	expect(player.querySelector<HTMLInputElement>('input[aria-label="Volume"]')!.getAttribute('aria-valuetext')).toBe('50%');
	const settings = player.querySelector<HTMLButtonElement>('button[aria-label="Settings"]')!;
	video.currentTime = 30;
	await userEvent.keyboard('{ArrowRight}');
	expect(video.currentTime).toBe(35);
	settings.focus();
	await userEvent.keyboard('{ArrowLeft}');
	expect(video.currentTime).toBe(30);
	video.currentTime = 119;
	await userEvent.keyboard('{ArrowRight}');
	expect(video.currentTime).toBe(120);
	video.currentTime = 1;
	await userEvent.keyboard('{ArrowLeft}');
	expect(video.currentTime).toBe(0);
	const initialVolume = video.volume;
	await userEvent.keyboard('{ArrowUp}');
	expect(video.volume).toBeCloseTo(initialVolume + 0.05);
	await userEvent.keyboard('{ArrowDown}');
	expect(video.volume).toBeCloseTo(initialVolume);
	const volume = player.querySelector<HTMLInputElement>('input[aria-label="Volume"]')!;
	for (const [value, key, expected] of [['0.99', '{ArrowUp}', 1], ['0.01', '{ArrowDown}', 0]] as const) {
		volume.value = value;
		volume.dispatchEvent(new Event('input', { bubbles: true }));
		await nextTick();
		settings.focus();
		await userEvent.keyboard(key);
		expect(video.volume).toBe(expected);
	}
	volume.focus();
	await userEvent.keyboard('{ArrowRight}');
	expect(video.volume).toBeGreaterThan(0);
	expect(video.currentTime).toBe(0);
	settings.focus();
	settings.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true, cancelable: true }));
	expect(video.currentTime).toBe(0);
	await page.elementLocator(settings).click();
	await expect.element(page.getByRole('menu')).toBeVisible();
	player.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
	expect(video.currentTime).toBe(0);
	expect(video.src).toBe(source);
	expect(player.querySelector('video')).toBe(video);
});

test.each(['browser', 'webpage'])('hides controls after a pointer click into %s fullscreen and restores them on pointer movement', async mode => {
	const { player, video } = await mountGallery();
	const { pause } = mockPlayback(video, false);
	await page.getByRole('button', { name: mode === 'browser' ? 'Enter fullscreen' : 'Enter webpage fullscreen', exact: true }).click();
	await expect.poll(() => document.fullscreenElement).toBe(mode === 'browser' ? player : null);
	await expectExpandedLayout(player, video);
	await page.elementLocator(video).hover({ position: { x: 100, y: 100 } });
	const footer = getFooter(player);
	await expect.poll(() => getComputedStyle(footer).opacity, { timeout: 3000 }).toBe('0');
	expect(footer.inert).toBe(true);
	await page.screenshot({ element: player, path: `../e2e/artifacts/component-browser/video-${mode}-controls-hidden.png` });
	await page.elementLocator(video).hover({ position: { x: 150, y: 150 } });
	await expect.poll(() => getComputedStyle(footer).opacity).toBe('1');
	expect(footer.inert).toBe(false);
	await expect.poll(() => getComputedStyle(footer).opacity, { timeout: 3500 }).toBe('0');
	await expectExpandedLayout(player, video);
	await userEvent.keyboard(' ');
	expect(pause).toHaveBeenCalledOnce();
	expect(video.paused).toBe(true);
	await expect.poll(() => getComputedStyle(footer).opacity).toBe('1');
	await expectExpandedLayout(player, video);
}, 10000);

test.each(['browser', 'webpage'])('closes the gallery cleanly from %s fullscreen', async mode => {
	const { player, closed } = await mountGallery();
	await page.getByRole('button', { name: mode === 'browser' ? 'Enter fullscreen' : 'Enter webpage fullscreen', exact: true }).click();
	await page.elementLocator(player).getByRole('button', { name: 'Close', exact: true }).click();
	await expect.poll(() => document.fullscreenElement).toBeNull();
	await expect.poll(() => closed.mock.calls.length).toBe(1);
	await expect.element(page.elementLocator(player)).not.toBeVisible();
});

test.each(['browser', 'webpage'])('resizes the second video without carousel animation before, during, or after %s fullscreen', async mode => {
	preferences.animation = true;
	const { player, video } = await mountGallery();
	const source = video.getAttribute('src');
	const carousel = player.parentElement!.parentElement!;
	const slideTransitions = vi.fn();
	carousel.addEventListener('transitionrun', ev => {
		if (ev.target === carousel && ev.propertyName === 'translate') slideTransitions();
	});
	const resize = async (expanded: boolean) => {
		for (const [width, height] of [[1040, 740], [760, 560], [1180, 780]]) {
			await page.viewport(width, height);
			await nextFrame();
			if (expanded) {
				await expectExpandedLayout(player, video);
			} else {
				await expectGalleryLayout(video);
			}
			expect(parseFloat(getComputedStyle(carousel).translate)).toBe(-window.innerWidth);
			expect(getComputedStyle(carousel).transitionDuration).toBe('0s');
			expect(carousel.getAnimations().filter(animation => animation instanceof CSSTransition && animation.transitionProperty === 'translate')).toHaveLength(0);
			expect(player.querySelector('video')).toBe(video);
			expect(video.getAttribute('src')).toBe(source);
		}
	};
	await resize(false);
	await page.getByRole('button', { name: mode === 'browser' ? 'Enter fullscreen' : 'Enter webpage fullscreen', exact: true }).click();
	await expect.poll(() => document.fullscreenElement).toBe(mode === 'browser' ? player : null);
	await resize(true);
	await page.getByRole('button', { name: mode === 'browser' ? 'Exit fullscreen' : 'Exit webpage fullscreen', exact: true }).click();
	await expect.poll(() => document.fullscreenElement).toBeNull();
	await resize(false);
	expect(slideTransitions).not.toHaveBeenCalled();
});

test('switches webpage fullscreen without synchronously reading the player layout', async () => {
	preferences.animation = true;
	const { player, video } = await mountGallery();
	const heightRead = vi.spyOn(player, 'offsetHeight', 'get');
	for (const name of ['Enter webpage fullscreen', 'Exit webpage fullscreen']) {
		const button = player.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
		button.click();
		await nextTick();
		expect(heightRead).not.toHaveBeenCalled();
	}
	await expectGalleryLayout(video);
});

test.each([true, false])('switches webpage fullscreen immediately without animating the media with site animation %s', async animationEnabled => {
	preferences.animation = animationEnabled;
	const { player, video } = await mountGallery();
	const frame = getFrame(video);
	const animate = vi.spyOn(frame, 'animate');
	for (const name of ['Enter webpage fullscreen', 'Exit webpage fullscreen']) {
		animate.mockClear();
		const previousWidth = video.getBoundingClientRect().width;
		player.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!.click();
		await nextFrame();
		expect(animate).not.toHaveBeenCalled();
		expect(frame.getAnimations()).toHaveLength(0);
		expect(frame.parentElement!.getAnimations()).toHaveLength(0);
		expect(video.getBoundingClientRect().width).not.toBe(previousWidth);
		expect(player.querySelector('video')).toBe(video);
	}
	await expectGalleryLayout(video);
});

test('does not layer a webpage transition onto native fullscreen', async () => {
	preferences.animation = true;
	const { player, video } = await mountGallery();
	await page.getByRole('button', { name: 'Enter webpage fullscreen', exact: true }).click();
	await expectExpandedLayout(player, video);
	const animate = vi.spyOn(getFrame(video), 'animate');
	await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
	await expect.poll(() => document.fullscreenElement).toBe(player);
	expect(animate).not.toHaveBeenCalled();
	expect(video.getAnimations()).toHaveLength(0);
	await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
	await expect.poll(() => document.fullscreenElement).toBeNull();
	expect(animate).not.toHaveBeenCalled();
	await expectExpandedLayout(player, video);
});

test.each([
	{ theme: 'light', panel: '#ffffff', foreground: '#333333' },
	{ theme: 'dark', panel: '#25282e', foreground: '#dadada' },
])('keeps fullscreen overlay controls readable without resizing the video in the $theme theme', async ({ theme, panel, foreground }) => {
	const { player, video } = await mountGallery();
	host!.style.setProperty('--MI_THEME-panel', panel);
	host!.style.setProperty('--MI_THEME-fg', foreground);
	for (const mode of ['webpage', 'browser']) {
		await page.getByRole('button', { name: mode === 'browser' ? 'Enter fullscreen' : 'Enter webpage fullscreen', exact: true }).click();
		await expectExpandedLayout(player, video);
		const volume = player.querySelector<HTMLInputElement>('input[aria-label="Volume"]')!;
		const controls = volume.closest<HTMLElement>('[class*="mediaControl"]')!;
		expect(getComputedStyle(player).backgroundColor).toBe('rgb(0, 0, 0)');
		expect(getComputedStyle(controls).backgroundColor).toBe('rgba(0, 0, 0, 0)');
		expect(getComputedStyle(controls).color).toBe('rgb(255, 255, 255)');
		expect(getComputedStyle(getFooter(player)).backgroundImage).toContain('linear-gradient');
		expect(getComputedStyle(getFooter(player)).backdropFilter).toBe('none');
		for (const slider of controls.querySelectorAll<HTMLInputElement>('input[type="range"]')) {
			const trackColor = document.createElement('span');
			trackColor.style.backgroundColor = 'var(--sliderBg)';
			slider.parentElement!.append(trackColor);
			expect(getComputedStyle(trackColor).backgroundColor).toBe('color(srgb 1 1 1 / 0.25)');
			trackColor.remove();
		}
		await page.screenshot({ element: player, path: `../e2e/artifacts/component-browser/video-${mode}-${theme}-controls.png` });
		await page.getByRole('button', { name: mode === 'browser' ? 'Exit fullscreen' : 'Exit webpage fullscreen', exact: true }).click();
		await expect.poll(() => document.fullscreenElement).toBeNull();
		await expectGalleryLayout(video);
	}
});

test('continues presenting video frames after resizing and double-click fullscreen without reloading', async () => {
	preferences.animation = true;
	const { player, video } = await mountGallery({ mockMediaState: false });
	vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(nativePlay);
	vi.mocked(HTMLMediaElement.prototype.pause).mockImplementation(nativePause);
	const canvas = document.createElement('canvas');
	canvas.width = 320;
	canvas.height = 180;
	const context = canvas.getContext('2d')!;
	const stream = canvas.captureStream(30);
	let drawFrame = 0;
	let drawnFrames = 0;
	let videoFrame = 0;
	let presentedFrames = 0;
	const draw = () => {
		context.fillStyle = `hsl(${drawnFrames++ % 360} 60% 40%)`;
		context.fillRect(0, 0, canvas.width, canvas.height);
		drawFrame = requestAnimationFrame(draw);
	};
	const recordFrame: VideoFrameRequestCallback = (_now, metadata) => {
		presentedFrames = metadata.presentedFrames;
		videoFrame = video.requestVideoFrameCallback(recordFrame);
	};
	draw();
	video.srcObject = stream;
	video.muted = true;
	videoFrame = video.requestVideoFrameCallback(recordFrame);
	try {
		await video.play();
		await expect.poll(() => presentedFrames).toBeGreaterThan(0);
		const loadstart = vi.fn();
		video.addEventListener('loadstart', loadstart);
		const source = video.getAttribute('src');
		const expectPlaybackContinues = async () => {
			const previousFrames = presentedFrames;
			await expect.poll(() => presentedFrames).toBeGreaterThan(previousFrames);
			expect(video.paused).toBe(false);
			expect(player.querySelector('video')).toBe(video);
			expect(video.srcObject).toBe(stream);
			expect(video.getAttribute('src')).toBe(source);
			expect(loadstart).not.toHaveBeenCalled();
		};
		await page.getByRole('button', { name: 'Enter webpage fullscreen', exact: true }).click();
		await expectExpandedLayout(player, video);
		await expectPlaybackContinues();
		await page.viewport(800, 600);
		await expectExpandedLayout(player, video);
		await expectPlaybackContinues();
		await page.elementLocator(video).dblClick();
		await expect.poll(() => document.fullscreenElement).toBe(player);
		await expectExpandedLayout(player, video);
		await expectPlaybackContinues();
		await page.viewport(1120, 760);
		await expectExpandedLayout(player, video);
		await expectPlaybackContinues();
		await page.elementLocator(video).dblClick();
		await expect.poll(() => document.fullscreenElement).toBeNull();
		await expectExpandedLayout(player, video);
		await expectPlaybackContinues();
		await page.getByRole('button', { name: 'Exit webpage fullscreen', exact: true }).click();
		await expectGalleryLayout(video);
		await expectPlaybackContinues();
	} finally {
		cancelAnimationFrame(drawFrame);
		video.cancelVideoFrameCallback(videoFrame);
		for (const track of stream.getTracks()) track.stop();
	}
});

test.each(['close', 'previous item'])('does not repeat a play button request after %s', async action => {
	const { player, video, closed } = await mountGallery();
	const { play } = mockPlayback(video);
	(video.parentElement!.querySelector('button[aria-label="Play"]') as HTMLButtonElement).click();
	expect(play).toHaveBeenCalledOnce();
	expect(video.paused).toBe(false);
	if (action === 'close') {
		player.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
	} else {
		const main = player.parentElement!.parentElement!.parentElement!;
		main.querySelector<HTMLButtonElement>(':scope > button')!.click();
	}
	await nextFrame();
	// Activating another item may play its media; the original click runs only once.
	expect(play.mock.contexts.filter(context => context === video)).toHaveLength(1);
	if (action === 'close') await expect.poll(() => closed.mock.calls.length).toBe(1);
});

test('immediately pauses from the playback control after clicking the central play button', async () => {
	const { player, video } = await mountGallery();
	const { play, pause } = mockPlayback(video);
	await page.elementLocator(getPlaySurface(player)).getByRole('button', { name: 'Play', exact: true }).click();
	expect(play).toHaveBeenCalledOnce();
	expect(video.paused).toBe(false);
	await page.elementLocator(getFooter(player)).getByRole('button', { name: 'Pause', exact: true }).click();
	expect(video.paused).toBe(true);
	expect(play).toHaveBeenCalledOnce();
	expect(pause).toHaveBeenCalledOnce();
});
