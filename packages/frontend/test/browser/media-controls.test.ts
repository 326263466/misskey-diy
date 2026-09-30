/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, nextTick, ref, shallowRef } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import MkLightboxControls from '@/components/MkLightbox.item.controls.vue';
import MkContextMenu from '@/components/MkContextMenu.vue';
import MkPopupMenu from '@/components/MkPopupMenu.vue';
import { DI } from '@/di.js';
import { hotkeyDirective } from '@/directives/hotkey.js';
import * as os from '@/os.js';

vi.mock('@/os.js', () => ({ claimZIndex: () => 1000, popupMenu: vi.fn(), contextMenu: vi.fn() }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: true, menuStyle: 'popup' } } }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/utility/media-has-audio.js', () => ({ default: async () => true }));
vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			volume: 'Volume',
			settings: 'Settings',
			none: 'None',
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
let video: HTMLVideoElement | undefined;
const menus: { app: App; host: HTMLElement }[] = [];

function mountMenu(app: App, host: HTMLElement) {
	app.directive('hotkey', hotkeyDirective);
	app.directive('adaptive-border', () => {});
	app.directive('tooltip', () => {});
	for (const name of ['MkEllipsis', 'MkAvatar', 'MkA', 'MkUserName']) app.component(name, { render: () => null });
	app.mount(host);
	menus.push({ app, host });
}

beforeEach(async () => {
	await page.viewport(1200, 700);
	vi.mocked(os.popupMenu).mockImplementation((items, source, options = {}) => {
		const menuHost = document.createElement('div');
		document.body.append(menuHost);
		return new Promise<void>(resolve => {
			const menuApp = createApp({
				render: () => h(MkPopupMenu, {
					items: items.filter(item => item != null),
					anchorElement: source instanceof HTMLElement ? source : null,
					align: options.align,
					onClosing: options.onClosing,
					onActioned: options.onAction,
					onClosed: resolve,
				}),
			});
			mountMenu(menuApp, menuHost);
		});
	});
	vi.mocked(os.contextMenu).mockImplementation((items, event) => {
		event.preventDefault();
		const menuHost = document.createElement('div');
		document.body.append(menuHost);
		const showing = ref(true);
		return new Promise<void>(resolve => {
			const menuApp = createApp({
				render: () => showing.value ? h(MkContextMenu, {
					items,
					ev: event,
					onClosed: () => {
						showing.value = false;
						resolve();
					},
				}) : null,
			});
			mountMenu(menuApp, menuHost);
		});
	});
});

async function mountControls(width: number) {
	host = document.createElement('div');
	host.style.cssText = `width:${width}px;height:240px;position:relative;container-type:inline-size;--MI_THEME-fg:#333;--MI_THEME-accent:#38a;`;
	document.body.append(host);
	video = document.createElement('video');
	video.hidden = true;
	Object.defineProperty(video, 'duration', { value: 36000 });
	const controlsHost = document.createElement('div');
	controlsHost.style.cssText = 'position:absolute;bottom:0;left:0;right:0;';
	host.append(video, controlsHost);
	const volume = ref(0.5);
	const webFullscreen = ref(false);
	const controls = shallowRef<InstanceType<typeof MkLightboxControls> | null>(null);
	app = createApp({
		setup: () => () => h(MkLightboxControls, {
			ref: controls,
			volume: volume.value,
			'onUpdate:volume': (to: number) => { volume.value = to; },
			webFullscreen: webFullscreen.value,
			'onUpdate:webFullscreen': (to: boolean) => { webFullscreen.value = to; },
			playerEl: host,
		}),
	});
	app.provide(DI.mkLightboxItemMediaEl, shallowRef(video));
	app.mount(controlsHost);
	await nextTick();
	await document.fonts.ready;
	const root = controlsHost.firstElementChild as HTMLElement;
	root.addEventListener('contextmenu', event => controls.value!.showContextMenu(event));
	return { volume, webFullscreen, controls, root, slider: host.querySelector<HTMLInputElement>('input[aria-label="Volume"]')! };
}

afterEach(async () => {
	for (const menu of menus.splice(0).reverse()) {
		menu.app.unmount();
		menu.host.remove();
	}
	if (document.fullscreenElement) await document.exitFullscreen();
	app?.unmount();
	host?.remove();
	video?.remove();
	vi.clearAllMocks();
});

test.each([320, 360, 1000])('keeps volume and fullscreen controls within a %i px player', async width => {
	await page.viewport(1200, 700);
	const { root } = await mountControls(width);
	const bounds = root.getBoundingClientRect();
	for (const control of root.querySelectorAll<HTMLElement>('button, input, span')) {
		const rect = control.getBoundingClientRect();
		expect(rect.left).toBeGreaterThanOrEqual(bounds.left - 1);
		expect(rect.right).toBeLessThanOrEqual(bounds.right + 1);
	}
});

test('updates volume by keyboard with one-percent steps', async () => {
	const { volume, slider } = await mountControls(360);
	slider.focus();
	await userEvent.keyboard('{ArrowRight}');
	expect(volume.value).toBe(0.51);
	expect(slider.getAttribute('aria-valuetext')).toBe('51%');
	expect(video?.volume).toBe(0.51);
});

test('keeps the standard settings menu and speed submenu usable inside browser fullscreen', async () => {
	await mountControls(600);
	await page.getByRole('button', { name: 'Enter fullscreen' }).click();
	await expect.poll(() => document.fullscreenElement).toBe(host);
	expect(document.fullscreenElement?.contains(video!)).toBe(true);
	expect(document.fullscreenElement?.querySelector('input[aria-label="Volume"]')).toBeTruthy();
	await expect.element(page.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible();
	await page.getByRole('button', { name: 'Settings' }).click();
	const speed = page.getByRole('menuitem', { name: 'Playback speed' });
	await expect.element(speed).toBeVisible();
	const speedElement = speed.element();
	expect(document.fullscreenElement?.contains(speedElement)).toBe(true);
	const loop = page.getByRole('menuitemcheckbox', { name: 'Loop' });
	await loop.click();
	expect(video?.loop).toBe(true);
	speed.element().focus();
	await userEvent.keyboard('{Enter}');
	const faster = page.getByRole('menuitemradio', { name: '1.5x', exact: true });
	await expect.element(faster).toBeVisible();
	expect(document.fullscreenElement?.contains(faster.element())).toBe(true);
	await faster.click();
	expect(video?.playbackRate).toBe(1.5);
	for (const menu of document.querySelectorAll<HTMLElement>('[role="menu"]')) {
		const bounds = menu.getBoundingClientRect();
		expect(bounds.left).toBeGreaterThanOrEqual(0);
		expect(bounds.top).toBeGreaterThanOrEqual(0);
		expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
		expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);
	}
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => document.querySelectorAll('[role="menuitemradio"]').length).toBe(0);
	await expect.element(speed).toBeVisible();
	expect(document.fullscreenElement).toBe(host);
	await userEvent.keyboard('{Escape}');
	await expect.element(speedElement).not.toBeVisible();
	expect(document.fullscreenElement).toBe(host);
	const settings = page.getByRole('button', { name: 'Settings' });
	await expect.element(settings).toHaveAttribute('aria-expanded', 'false');
	expect(document.activeElement).toBe(settings.element());
	await page.getByRole('button', { name: 'Exit fullscreen' }).click();
	await expect.poll(() => document.fullscreenElement).toBeNull();
});

test('closes settings when browser fullscreen ends and restores the player controls', async () => {
	const { volume, root } = await mountControls(600);
	await page.getByRole('button', { name: 'Enter fullscreen' }).click();
	await expect.poll(() => document.fullscreenElement).toBe(host);
	const settings = page.getByRole('button', { name: 'Settings' });
	await settings.click();
	const speed = page.getByRole('menuitem', { name: 'Playback speed' });
	await expect.element(speed).toBeVisible();
	const speedElement = speed.element();
	expect(root.closest('[inert]')).not.toBeNull();
	await document.exitFullscreen();
	await expect.poll(() => document.fullscreenElement).toBeNull();
	await expect.element(speedElement).not.toBeVisible();
	expect(root.closest('[inert]')).toBeNull();
	await expect.element(settings).toHaveAttribute('aria-expanded', 'false');
	await page.getByRole('button', { name: 'Mute', exact: true }).click();
	expect(volume.value).toBe(0);
	await settings.click();
	await expect.element(speed).toBeVisible();
	await page.getByRole('menuitemcheckbox', { name: 'Loop' }).click();
	expect(video?.loop).toBe(true);
});

test('toggles webpage fullscreen without entering browser fullscreen', async () => {
	const { webFullscreen } = await mountControls(600);
	await page.getByRole('button', { name: 'Enter webpage fullscreen' }).click();
	expect(webFullscreen.value).toBe(true);
	expect(document.fullscreenElement).toBeNull();
	await page.getByRole('button', { name: 'Exit webpage fullscreen' }).click();
	expect(webFullscreen.value).toBe(false);
	expect(document.fullscreenElement).toBeNull();
});

test('uses the standard context menu and speed submenu inside browser fullscreen', async () => {
	const { root, volume, controls } = await mountControls(600);
	await page.getByRole('button', { name: 'Enter fullscreen' }).click();
	await expect.poll(() => document.fullscreenElement).toBe(host);
	const openContextMenu = () => page.elementLocator(root).click({ button: 'right', position: { x: 300, y: root.getBoundingClientRect().height - 12 } });
	await openContextMenu();
	const mute = page.getByRole('menuitem', { name: 'Mute' });
	await expect.element(mute).toBeVisible();
	expect(document.fullscreenElement?.contains(mute.element())).toBe(true);
	expect(controls.value!.menuShowing).toBe(true);
	await mute.click();
	expect(volume.value).toBe(0);
	await expect.poll(() => controls.value!.menuShowing).toBe(false);
	await openContextMenu();
	await expect.element(page.getByRole('menuitem', { name: 'Unmute' })).toBeVisible();
	page.getByRole('menuitem', { name: 'Playback speed' }).element().focus();
	await userEvent.keyboard('{Enter}');
	const faster = page.getByRole('menuitemradio', { name: '1.5x', exact: true });
	await expect.element(faster).toBeVisible();
	expect(document.fullscreenElement?.contains(faster.element())).toBe(true);
	await faster.click();
	expect(video?.playbackRate).toBe(1.5);
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => document.querySelectorAll('[role="menuitemradio"]').length).toBe(0);
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => controls.value!.menuShowing).toBe(false);
	expect(document.fullscreenElement).toBe(host);
	await openContextMenu();
	await page.getByRole('menuitem', { name: 'Exit fullscreen' }).click();
	await expect.poll(() => document.fullscreenElement).toBeNull();
	await expect.poll(() => controls.value!.menuShowing).toBe(false);
});
