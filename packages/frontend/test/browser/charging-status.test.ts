/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import MkCustomStatusIcon from '@/components/MkCustomStatusIcon.vue';
import { customStatusIcons } from '@/utility/status-icons.js';

const preferences = vi.hoisted(() => ({ animation: true }));
vi.mock('@/preferences.js', () => ({ prefer: { s: preferences } }));

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let app: App | undefined;
let host: HTMLElement | undefined;

async function settle(): Promise<void> {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

async function mountIcons(sizes: number[] = [40]): Promise<HTMLElement[]> {
	host = document.createElement('div');
	host.style.cssText = 'display:flex;align-items:center;gap:24px;width:max-content;padding:24px;background:#282f32;color:#fff;font:12px sans-serif;';
	document.body.append(host);
	app = createApp({ render: () => sizes.map(size => h('div', { style: 'display:grid;justify-items:center;gap:12px;' }, [
		h(MkCustomStatusIcon, { icon: 'battery', style: `--MI-statusIconSize:${size}px` }),
		h('span', `${size}px`),
	])) });
	app.mount(host);
	await settle();
	return Array.from(host.querySelectorAll<HTMLElement>('[data-custom-status-icon="battery"]'));
}

function chargingFill(badge: HTMLElement): CSSStyleDeclaration {
	return getComputedStyle(badge.firstElementChild!.firstElementChild!, '::after');
}

async function mountAllStatuses(): Promise<HTMLElement[]> {
	host = document.createElement('div');
	document.body.append(host);
	app = createApp({ render: () => customStatusIcons.map(icon => h(MkCustomStatusIcon, { icon, style: '--MI-statusIconSize:36px' })) });
	app.mount(host);
	await settle();
	return Array.from(host.querySelectorAll<HTMLElement>('[data-custom-status-icon]'));
}

test('all selectable statuses animate automatically without interaction, unless reduced motion is enabled', async () => {
	const badges = await mountAllStatuses();
	for (const badge of badges) {
		const animations = badge.getAnimations({ subtree: true });
		if (reducedMotion) {
			expect(animations).toHaveLength(0);
			continue;
		}
		expect(animations.length, badge.dataset.customStatusIcon).toBeGreaterThan(0);
		for (const animation of animations) {
			expect(animation.playState).toBe('running');
			expect(animation.effect!.getTiming().iterations).toBe(Infinity);
			const keyframes = (animation.effect as KeyframeEffect).getKeyframes();
			expect(keyframes[0].transform).toBe(keyframes.at(-1)!.transform);
		}
	}
});

test('all selectable statuses remain static when app animations are disabled', async () => {
	preferences.animation = false;
	const badges = await mountAllStatuses();
	for (const badge of badges) {
		expect(badge.getAnimations({ subtree: true })).toHaveLength(0);
	}
});

function expectShapeInsideCircle(badge: HTMLElement): void {
	const radius = badge.getBoundingClientRect().width / 2;
	for (const shape of badge.querySelectorAll<HTMLElement>('span')) {
		for (const pseudo of ['::before', '::after']) {
			const style = getComputedStyle(shape, pseudo);
			const left = Number.parseFloat(style.left);
			const top = Number.parseFloat(style.top);
			const width = Number.parseFloat(style.width);
			const height = Number.parseFloat(style.height);
			const [originX, originY] = style.transformOrigin.split(' ').map(Number.parseFloat);
			const matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
			for (const [x, y] of [[0, 0], [width, 0], [0, height], [width, height]]) {
				const point = matrix.transformPoint(new DOMPoint(x - originX, y - originY));
				const distance = Math.hypot(left + originX + point.x - radius, top + originY + point.y - radius);
				expect(distance).toBeLessThanOrEqual(radius + 0.1);
			}
		}
	}
}

afterEach(() => {
	app?.unmount();
	host?.remove();
	app = undefined;
	host = undefined;
	preferences.animation = true;
});

test('renders redesigned statuses at avatar and picker sizes', async () => {
	preferences.animation = false;
	host = document.createElement('div');
	host.style.cssText = 'display:flex;gap:28px;width:max-content;padding:28px;background:#f2f3f5;color:#252933;font:14px sans-serif;';
	document.body.append(host);
	const icons = [{ icon: 'battery', label: '充电中' }, { icon: 'focus', label: '专注中' }, { icon: 'car', label: '在路上' }, { icon: 'vacation', label: '度假中' }] as const;
	app = createApp({ render: () => icons.map(({ icon, label }) => h('div', { style: 'display:grid;justify-items:center;gap:18px;padding:18px;background:white;border-radius:12px;' }, [
		h(MkCustomStatusIcon, { icon, style: '--MI-statusIconSize:64px' }),
		h('strong', label),
		h('div', { style: 'display:flex;align-items:center;gap:10px;' }, [16, 22, 36].map(size => h(MkCustomStatusIcon, { icon, style: `--MI-statusIconSize:${size}px` }))),
	])) });
	app.mount(host);
	await settle();
	expect(host.querySelectorAll('[data-custom-status-icon]')).toHaveLength(16);
	await page.screenshot({ element: host, path: '../e2e/artifacts/component-browser/redesigned-status-icons.png' });
});

test('keeps the battery, terminal, lightning and charge inside the circular badge at every display size', async () => {
	const sizes = [12, 22, 40];
	const badges = await mountIcons(sizes);
	for (const [index, badge] of badges.entries()) {
		expect(badge.getBoundingClientRect().width).toBe(sizes[index]);
		expect(badge.getBoundingClientRect().height).toBe(sizes[index]);
		expect(badge.querySelector('i, svg, img')).toBeNull();
		expect(getComputedStyle(badge).backgroundImage).toContain('linear-gradient');
		expect(getComputedStyle(badge).borderRadius).toBe('50%');
		for (const animation of badge.getAnimations({ subtree: true })) {
			animation.pause();
			animation.currentTime = Number(animation.effect!.getTiming().duration) * 0.8;
		}
		expectShapeInsideCircle(badge);
	}
	await page.screenshot({ element: host!, path: `../e2e/artifacts/component-browser/charging-status-sizes-${reducedMotion ? 'reduced' : 'animated'}.png` });
});

test.skipIf(reducedMotion)('fills the charging battery over time when animation is enabled', async () => {
	const [badge] = await mountIcons();
	const animations = badge.getAnimations({ subtree: true });
	expect(animations).toHaveLength(1);
	const animation = animations[0];
	await animation.ready;
	expect(animation.playState).toBe('running');
	const initialTime = Number(animation.currentTime);
	const initialFill = chargingFill(badge).transform;
	await expect.poll(() => Number(animation.currentTime)).toBeGreaterThan(initialTime + 100);
	await expect.poll(() => chargingFill(badge).transform).not.toBe(initialFill);
	expect(animation.effect!.getTiming().iterations).toBe(Infinity);
	animation.pause();
	const duration = Number(animation.effect!.getTiming().duration);
	animation.currentTime = duration * 0.1;
	const lowCharge = new DOMMatrix(chargingFill(badge).transform).a;
	animation.currentTime = duration * 0.8;
	const fullCharge = new DOMMatrix(chargingFill(badge).transform).a;
	expect(lowCharge).toBeLessThan(fullCharge);
	expect(fullCharge).toBeCloseTo(1);
});

test('keeps a visible static charge and lightning when app animations are disabled', async () => {
	preferences.animation = false;
	const [badge] = await mountIcons();
	const initialFill = chargingFill(badge).transform;
	expect(badge.getAnimations({ subtree: true })).toHaveLength(0);
	expect(new DOMMatrix(initialFill).a).toBeGreaterThan(0);
	const lightning = getComputedStyle(badge.firstElementChild!.firstElementChild!, '::before');
	expect(lightning.clipPath).toContain('polygon');
	expect(lightning.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
	await settle();
	expect(chargingFill(badge).transform).toBe(initialFill);
});

test.skipIf(!reducedMotion)('respects system reduced motion even when app animations are enabled', async () => {
	expect(preferences.animation).toBe(true);
	const [badge] = await mountIcons();
	expect(badge.getAnimations({ subtree: true })).toHaveLength(0);
	const initialFill = chargingFill(badge).transform;
	expect(new DOMMatrix(initialFill).a).toBeGreaterThan(0);
	await settle();
	expect(chargingFill(badge).transform).toBe(initialFill);
});
