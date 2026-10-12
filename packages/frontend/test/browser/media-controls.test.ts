/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, nextTick, ref, shallowRef } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import 'virtual:tabler-icons.css';
import MkLightboxControls from '@/components/MkLightbox.item.controls.vue';
import MkPopupMenu from '@/components/MkPopupMenu.vue';
import { DI } from '@/di.js';
import { hotkeyDirective } from '@/directives/hotkey.js';
import * as os from '@/os.js';

vi.mock('@/os.js', () => ({ claimZIndex: () => 1000, popupMenu: vi.fn() }));
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
	const controls = shallowRef<InstanceType<typeof MkLightboxControls> | null>(null);
	app = createApp({
		setup: () => () => h(MkLightboxControls, {
			ref: controls,
			volume: volume.value,
			'onUpdate:volume': (to: number) => { volume.value = to; },
		}),
	});
	app.provide(DI.mkLightboxItemMediaEl, shallowRef(video));
	app.mount(controlsHost);
	await nextTick();
	await document.fonts.ready;
	const root = controlsHost.firstElementChild as HTMLElement;
	return { volume, root, slider: host.querySelectorAll<HTMLInputElement>('input')[1] };
}

afterEach(() => {
	for (const menu of menus.splice(0).reverse()) {
		menu.app.unmount();
		menu.host.remove();
	}
	app?.unmount();
	host?.remove();
	video?.remove();
	vi.clearAllMocks();
});

test('updates volume through the native keyboard range control', async () => {
	const { volume, slider } = await mountControls(600);
	slider.focus();
	await userEvent.keyboard('{ArrowRight}');
	expect(Number(volume.value)).toBeCloseTo(0.51, 2);
	expect(video?.volume).toBeCloseTo(0.51, 2);
});

test('keeps the standard settings menu and speed submenu usable', async () => {
	const { root } = await mountControls(600);
	await page.elementLocator(root.querySelector('.ti-settings')!.closest('button')!).click();
	const speed = page.getByRole('menuitem', { name: 'Playback speed' });
	await expect.element(speed).toBeVisible();
	await page.getByRole('menuitemcheckbox', { name: 'Loop' }).click();
	expect(video?.loop).toBe(true);
	speed.element().focus();
	await userEvent.keyboard('{Enter}');
	const faster = page.getByRole('menuitemradio', { name: '1.5x', exact: true });
	await expect.element(faster).toBeVisible();
	await faster.click();
	expect(video?.playbackRate).toBe(1.5);
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => document.querySelectorAll('[role="menuitemradio"]').length).toBe(0);
	await expect.element(speed).toBeVisible();
});
