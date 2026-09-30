/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import type { entities } from 'misskey-js';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import MkMediaAudio from '@/components/MkMediaAudio.vue';
import MkMediaVideo from '@/components/MkMediaVideo.vue';

const preferences = vi.hoisted(() => ({ animation: true, highlightSensitiveMedia: false, dataSaver: { media: false } }));
vi.mock('misskey-js', () => ({}));
vi.mock('@/preferences.js', () => ({ prefer: { s: preferences } }));
vi.mock('@/os.js', () => ({ popupMenu: vi.fn(), contextMenu: vi.fn() }));
vi.mock('@/utility/get-file-menu.js', () => ({ getFileMenu: () => [] }));
vi.mock('@/utility/sensitive-file.js', () => ({ shouldHideFileByDefault: () => false, canRevealFile: async () => true }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { audio: 'Audio', menu: 'Menu', hide: 'Hide', _mediaControls: { play: 'Play' } } } }));

let app: App | undefined;
let host: HTMLElement | undefined;

async function mountThumbnail(kind: 'audio' | 'video') {
	host = document.createElement('div');
	host.style.cssText = 'width:320px;height:180px;padding:20px;--MI_THEME-accent:#86b300;--MI_THEME-fgOnAccent:#fff;';
	document.body.append(host);
	const mediaClick = vi.fn();
	const file = { isSensitive: false, thumbnailUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="180"/%3E' } as entities.DriveFile;
	app = createApp({
		render: () => kind === 'audio'
			? h(MkMediaAudio, { audio: file, onMediaClick: mediaClick, style: 'height:100%;' })
			: h(MkMediaVideo, { video: file, onMediaClick: mediaClick, style: 'height:100%;' }),
	});
	app.directive('panel', () => {});
	app.mount(host);
	await nextTick();
	await document.fonts.ready;
	const root = host.querySelector<HTMLElement>('[role="button"]')!;
	const hitArea = root.querySelector<HTMLElement>('[class*="playIcon"] [class*="playIcon"]')!;
	const icon = hitArea.firstElementChild as HTMLElement;
	await page.elementLocator(host).hover({ position: { x: 1, y: 1 } });
	await expect.poll(() => icon.getAnimations().length).toBe(0);
	return { root, hitArea, icon, mediaClick };
}

afterEach(() => {
	app?.unmount();
	host?.remove();
	preferences.animation = true;
});

test.each(['audio', 'video'] as const)('sizes the %s rabbit play icon by its container and keeps the resting ears inside the head', async kind => {
	preferences.animation = false;
	await page.viewport(1200, 900);
	const { icon } = await mountThumbnail(kind);
	const widths: number[] = [];
	for (const width of [160, 280, 800]) {
		host!.style.width = `${width}px`;
		await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
		widths.push(icon.getBoundingClientRect().width);
		const head = icon.querySelector<SVGPathElement>('[class*="head"]')!;
		const ears = icon.querySelectorAll<SVGGElement>('[class*="earL"], [class*="earR"]');
		expect(ears).toHaveLength(2);
		for (const ear of ears) {
			expect(ear.getBoundingClientRect().top).toBeGreaterThan(head.getBoundingClientRect().top);
			expect(ear.getBoundingClientRect().bottom).toBeLessThan(head.getBoundingClientRect().bottom);
		}
	}
	expect(widths[0]).toBeCloseTo(28, 1);
	expect(widths[1]).toBeGreaterThan(widths[0]);
	expect(widths[2]).toBeCloseTo(44, 1);
	await page.screenshot({ element: host!, path: `../e2e/artifacts/component-browser/${kind}-thumbnail-glass-sizing.png` });
});

test.each(['audio', 'video'] as const)('animates the %s thumbnail play icon from the whole surface and opens it once', async kind => {
	const { root, hitArea, icon, mediaClick } = await mountThumbnail(kind);
	const initialWidth = icon.getBoundingClientRect().width;
	const initialHitRect = hitArea.getBoundingClientRect();
	const rabbit = icon.querySelector<SVGSVGElement>('[class*="rabbit"]')!;
	const head = icon.querySelector<SVGPathElement>('[class*="head"]')!;
	const ears = icon.querySelectorAll<SVGGElement>('[class*="earL"], [class*="earR"]');
	const initialOpacity = getComputedStyle(rabbit).opacity;
	const button = page.elementLocator(hitArea);
	await page.screenshot({ element: host!, path: `../e2e/artifacts/component-browser/${kind}-thumbnail-rest.png` });
	await page.elementLocator(root).hover({ position: { x: 12, y: 12 } });
	await expect.poll(() => icon.getBoundingClientRect().width).toBeCloseTo(initialWidth * 1.12, 1);
	for (const ear of ears) {
		await expect.poll(() => ear.getBoundingClientRect().top).toBeLessThan(head.getBoundingClientRect().top);
	}
	await button.hover();
	await expect.poll(() => icon.getBoundingClientRect().width).toBeCloseTo(initialWidth * 1.12, 1);
	expect(hitArea.getBoundingClientRect().width).toBe(initialHitRect.width);
	expect(hitArea.getBoundingClientRect().left).toBe(initialHitRect.left);
	expect(icon.getBoundingClientRect().left + icon.getBoundingClientRect().width / 2).toBeCloseTo(initialHitRect.left + initialHitRect.width / 2, 1);
	expect(getComputedStyle(icon).filter).toBe('none');
	expect(getComputedStyle(rabbit).opacity).toBe(initialOpacity);
	await expect.poll(() => icon.getAnimations({ subtree: true }).length).toBe(0);
	await page.screenshot({ element: host!, path: `../e2e/artifacts/component-browser/${kind}-thumbnail-hover.png` });
	expect(getComputedStyle(icon).cursor).toBe('pointer');
	await page.elementLocator(host!).hover({ position: { x: 1, y: 1 } });
	await expect.poll(() => icon.getBoundingClientRect().width).toBeCloseTo(initialWidth, 1);
	const pressedWidth = new Promise<number>(resolve => {
		root.addEventListener('pointerdown', () => {
			window.setTimeout(() => {
				expect(hitArea.getBoundingClientRect().width).toBe(initialHitRect.width);
				resolve(icon.getBoundingClientRect().width);
			}, 220);
		}, { once: true });
	});
	await page.elementLocator(root).click({ position: { x: 12, y: 12 }, delay: 300 });
	expect(await pressedWidth).toBeCloseTo(initialWidth * 0.94, 1);
	expect(mediaClick).toHaveBeenCalledTimes(1);
});

test.each(['audio', 'video'] as const)('keeps the %s thumbnail play icon still when animations are disabled', async kind => {
	preferences.animation = false;
	const { root, hitArea, icon, mediaClick } = await mountThumbnail(kind);
	const initialWidth = icon.getBoundingClientRect().width;
	const initialHitWidth = hitArea.getBoundingClientRect().width;
	const ears = icon.querySelectorAll<SVGGElement>('[class*="earL"], [class*="earR"]');
	const initialEars = Array.from(ears, ear => getComputedStyle(ear).transform);
	const button = page.elementLocator(hitArea);
	await page.elementLocator(root).hover({ position: { x: 12, y: 12 } });
	await button.hover();
	expect(icon.getAnimations({ subtree: true })).toHaveLength(0);
	expect(icon.getBoundingClientRect().width).toBe(initialWidth);
	expect(hitArea.getBoundingClientRect().width).toBe(initialHitWidth);
	expect(Array.from(ears, ear => getComputedStyle(ear).transform)).toEqual(initialEars);
	const pressedWidth = new Promise<number>(resolve => {
		root.addEventListener('pointerdown', () => {
			window.setTimeout(() => resolve(icon.getBoundingClientRect().width), 220);
		}, { once: true });
	});
	await page.elementLocator(root).click({ position: { x: 12, y: 12 }, delay: 300 });
	expect(await pressedWidth).toBe(initialWidth);
	expect(hitArea.getBoundingClientRect().width).toBe(initialHitWidth);
	expect(mediaClick).toHaveBeenCalledTimes(1);
});
