/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, defineComponent, h, nextTick, reactive } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import MkLightbox from '@/components/MkLightbox.vue';
import MkPopupMenu from '@/components/MkPopupMenu.vue';
import { hotkeyDirective } from '@/directives/hotkey.js';
import * as os from '@/os.js';

const preferences = vi.hoisted(() => ({ animation: false, useNativeUiForVideoAudioPlayer: false, menuStyle: 'popup' }));

vi.mock('misskey-js', () => ({}));
vi.mock('@/os.js', () => ({ claimZIndex: () => 1000, popupMenu: vi.fn(), contextMenu: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/theme.js', () => ({ themeManager: { on: vi.fn(), off: vi.fn(), currentCompiledTheme: { accent: '#86b300' } } }));
vi.mock('@/preferences.js', () => ({ prefer: { s: preferences } }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/utility/touch.js', () => ({ isTouchUsing: false, lastPointerType: 'mouse' }));
vi.mock('@/utility/get-file-menu.js', () => ({ getFileMenu: () => [] }));
vi.mock('@/utility/sensitive-file.js', () => ({ shouldHideFileByDefault: () => false, canRevealFile: async () => true }));
vi.mock('@/components/MkBlurhash.vue', () => ({ default: { render: () => null } }));
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
let audioUrl: string;
let originalUrl: string;
const menus = new Set<{ app: App; host: HTMLElement }>();
const themeStyle = [
	'--MI_THEME-fg:#dadada', '--MI_THEME-accent:#86b300', '--MI_THEME-accentedBg:#86b30026',
	'--MI_THEME-panel:#25282e', '--MI_THEME-popup:#2c3036', '--MI_THEME-shadow:#0008',
	'--MI_THEME-modalBg:#000c', '--MI_THEME-divider:#ffffff1a', '--MI_THEME-focus:#86b3004d',
	'--MI_THEME-switchOffBg:#ffffff1a', '--MI_THEME-switchOffFg:#dadada',
	'--MI_THEME-switchOnBg:#86b300', '--MI_THEME-switchOnFg:#fff', '--MI-radius:12px',
	'color:var(--MI_THEME-fg)',
].join(';');

async function nextFrame() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
}

function createAudioUrl() {
	// Two seconds of silent 8-bit mono PCM, decoded by the browser itself.
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

beforeEach(() => {
	preferences.animation = false;
	originalUrl = window.location.href;
	audioUrl = createAudioUrl();
	vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
	vi.mocked(os.popupMenu).mockReset().mockImplementation((items, anchor, options = {}) => {
		const menuHost = document.createElement('div');
		menuHost.style.cssText = themeStyle;
		document.body.append(menuHost);
		return new Promise<void>(resolve => {
			const menuApp = createApp({
				render: () => h(MkPopupMenu, {
					items: items.filter(item => item != null),
					anchorElement: anchor instanceof HTMLElement ? anchor : null,
					returnFocusTo: anchor instanceof HTMLElement ? anchor : null,
					align: options.align,
					onClosing: options.onClosing,
					onActioned: options.onAction,
					onClosed: () => {
						options.onClosed?.();
						menuApp.unmount();
						menuHost.remove();
						menus.delete(menu);
						resolve();
					},
				}),
			});
			const menu = { app: menuApp, host: menuHost };
			menus.add(menu);
			menuApp.directive('hotkey', hotkeyDirective);
			menuApp.directive('tooltip', {});
			menuApp.directive('adaptive-border', {});
			for (const name of ['MkEllipsis', 'MkAvatar', 'MkA', 'MkUserName']) menuApp.component(name, { render: () => null });
			menuApp.mount(menuHost);
		});
	});
});

afterEach(async () => {
	for (const menu of menus) {
		menu.app.unmount();
		menu.host.remove();
	}
	menus.clear();
	// Closing first lets the real gallery focus trap release before unmounting.
	host?.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click();
	await nextFrame();
	app?.unmount();
	host?.remove();
	URL.revokeObjectURL(audioUrl);
	window.history.replaceState(null, '', originalUrl);
	vi.restoreAllMocks();
});

async function mountGallery(onFirstRender?: (element: HTMLElement) => void) {
	host = document.createElement('div');
	host.style.cssText = themeStyle;
	document.body.append(host);
	const contents = reactive([{ id: 'audio', type: 'audio' as const, url: audioUrl, filename: 'Audio layout.wav' }]);
	app = createApp({
		render: () => h(MkLightbox, {
			contents,
			user: {
				id: 'audio-owner', username: 'audio-owner', name: 'Audio owner', host: null,
				avatarUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32"%3E%3Ccircle cx="16" cy="16" r="16" fill="%2386b300"/%3E%3C/svg%3E',
				avatarBlurhash: null, avatarDecorations: [], isBot: false, isCat: false, emojis: {}, onlineStatus: 'unknown',
			},
		}),
	});
	app.directive('hotkey', hotkeyDirective);
	app.component('MkLoading', { render: () => null });
	app.component('MkCondensedLine', defineComponent({ render() { return h('span', this.$slots.default?.()); } }));
	app.mount(host);
	onFirstRender?.(host);
	await expect.poll(() => host?.querySelector('canvas'), { timeout: 10000 }).not.toBeNull();
	const audio = host.querySelector('audio')!;
	await expect.poll(() => audio.readyState).toBe(HTMLMediaElement.HAVE_ENOUGH_DATA);
	await document.fonts.ready;
	await nextFrame();
	const canvas = host.querySelector('canvas')!;
	const footer = canvas.closest<HTMLElement>('[class*="contentWrapper"]')!.querySelector<HTMLElement>('[class*="footer"]')!;
	await expect.element(page.elementLocator(footer).getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
	return { audio, canvas, footer };
}

test('mounts the music box in the first opening frame without waiting for another component chunk', async () => {
	preferences.animation = true;
	await mountGallery(element => {
		expect(element.querySelector('audio')).not.toBeNull();
		expect(element.querySelector('canvas')).not.toBeNull();
	});
});

async function expectAttachedLayout(canvas: HTMLCanvasElement, footer: HTMLElement) {
	await expect.poll(() => {
		const canvasBounds = canvas.getBoundingClientRect();
		const footerBounds = footer.getBoundingClientRect();
		return [
			footerBounds.bottom - canvasBounds.bottom,
			footerBounds.left - canvasBounds.left,
			footerBounds.right - canvasBounds.right,
		].map(value => Math.round(value * 10) / 10);
	}).toEqual([0, 0, 0]);
	const bounds = canvas.getBoundingClientRect();
	expect(bounds.width / bounds.height).toBeCloseTo(16 / 9, 2);
	expect(bounds.width).toBeGreaterThan(200);
	expect(bounds.top).toBeGreaterThanOrEqual(0);
	expect(footer.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight);
	const controls = footer.querySelectorAll<HTMLElement>('button, input');
	expect(controls).toHaveLength(5);
	for (const control of controls) {
		const rect = control.getBoundingClientRect();
		expect(rect.width).toBeGreaterThan(0);
		expect(rect.height).toBeGreaterThan(0);
		expect(rect.left).toBeGreaterThanOrEqual(0);
		expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
		expect(rect.top).toBeGreaterThanOrEqual(0);
		expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
		await expect.poll(() => {
			const current = control.getBoundingClientRect();
			const hit = document.elementFromPoint(current.left + current.width / 2, current.top + current.height / 2);
			return hit != null && control.contains(hit);
		}).toBe(true);
	}
}

test.each([[1200, 800], [360, 640]])('attaches audio controls to the visualizer at %i × %i with usable controls', async (width, height) => {
	await page.viewport(width, height);
	const { audio, canvas, footer } = await mountGallery();
	await expectAttachedLayout(canvas, footer);
	if (width === 1200) await page.screenshot({ path: '../e2e/artifacts/component-browser/audio-player-glass-controls.png' });
	vi.mocked(HTMLMediaElement.prototype.play).mockClear();
	await page.elementLocator(footer).getByRole('button', { name: 'Play', exact: true }).click();
	expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
	await page.getByRole('button', { name: 'Mute', exact: true }).click();
	await expect.element(page.getByRole('slider', { name: 'Volume', exact: true })).toHaveAttribute('aria-valuetext', '0%');
	await page.getByRole('button', { name: 'Unmute', exact: true }).click();
	await expect.element(page.getByRole('button', { name: 'Mute', exact: true })).toBeVisible();
	const volume = page.getByRole('slider', { name: 'Volume', exact: true });
	await volume.click();
	const volumeAfterClick = Number((volume.element() as HTMLInputElement).value);
	expect(volumeAfterClick).toBeGreaterThan(0.35);
	expect(volumeAfterClick).toBeLessThan(0.65);
	await userEvent.keyboard('{ArrowRight}');
	expect(Number((volume.element() as HTMLInputElement).value)).toBeCloseTo(volumeAfterClick + 0.01, 2);
	await page.getByRole('slider', { name: 'Playback position', exact: true }).click();
	await expect.poll(() => audio.currentTime).toBeCloseTo(audio.duration / 2, 1);
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	await page.getByRole('menuitemcheckbox', { name: 'Loop' }).click();
	expect(audio.loop).toBe(true);
	const speed = page.getByRole('menuitem', { name: 'Playback speed' });
	const speedElement = speed.element();
	await userEvent.keyboard('{Escape}');
	await expect.element(speedElement).not.toBeVisible();
	await page.viewport(width === 1200 ? 360 : 1200, height === 800 ? 640 : 800);
	await expectAttachedLayout(canvas, footer);
	expect(host?.querySelector('audio')).toBe(audio);
	expect(host?.querySelector('canvas')).toBe(canvas);
});

test('animates the central audio play button on hover and press and plays once', async () => {
	preferences.animation = true;
	await page.viewport(1200, 800);
	const { audio, canvas } = await mountGallery();
	const button = page.elementLocator(canvas.parentElement!).getByRole('button', { name: 'Play', exact: true });
	const element = button.element() as HTMLButtonElement;
	const icon = element.querySelector('span')!;
	await page.getByRole('button', { name: 'Close', exact: true }).hover();
	await expect.poll(() => host!.getAnimations({ subtree: true })).toHaveLength(0);
	const initialWidth = icon.getBoundingClientRect().width;
	const play = vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(async function (this: HTMLMediaElement) {
		this.dispatchEvent(new Event('play'));
		this.dispatchEvent(new Event('playing'));
	});
	play.mockClear();
	await button.hover();
	await expect.poll(() => icon.getBoundingClientRect().width).toBeGreaterThan(initialWidth + 1);
	await page.getByRole('button', { name: 'Close', exact: true }).hover();
	await expect.poll(() => icon.getBoundingClientRect().width).toBeCloseTo(initialWidth, 1);
	const pressedWidth = new Promise<number>(resolve => {
		element.addEventListener('pointerdown', () => {
			window.setTimeout(() => resolve(icon.getBoundingClientRect().width), 220);
		}, { once: true });
	});
	await button.click({ delay: 300 });
	expect(await pressedWidth).toBeLessThan(initialWidth);
	expect(play).toHaveBeenCalledOnce();
	await expect.element(element).not.toBeInTheDocument();
	expect(host?.querySelector('audio')).toBe(audio);
	expect(host?.querySelector('canvas')).toBe(canvas);
});
