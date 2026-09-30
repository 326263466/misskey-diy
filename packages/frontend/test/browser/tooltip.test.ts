/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick, ref, withDirectives } from 'vue';
import type { Component, Ref } from 'vue';
import '@/style.scss';
import { tooltipDirective } from '@/directives/tooltip.js';
import { prefer } from '@/preferences.js';

type TooltipProps = {
	showing: Ref<boolean>;
	text: string;
	anchorElement: Pick<HTMLElement, 'getBoundingClientRect'>;
	direction: 'top' | 'bottom' | 'left' | 'right';
};

const mocks = vi.hoisted(() => ({
	claimZIndex: () => 1000,
	popup: vi.fn<(component: Component, props: TooltipProps, events: { closed: () => void }) => { dispose: () => void }>(),
	alert: vi.fn(),
}));

const mfmComponentName = 'Mfm';

vi.mock('@/os.js', () => mocks);
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: true } } }));
vi.mock('@/utility/touch.js', () => ({ isTouchUsing: false }));

let root: HTMLElement;
const disposers: (() => void)[] = [];

async function nextFrame() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
}

function waitForTooltip() {
	return new Promise<HTMLElement>(resolve => {
		const observer = new MutationObserver(() => {
			const tooltip = root.querySelector<HTMLElement>('[role="tooltip"]');
			if (!tooltip) return;
			observer.disconnect();
			resolve(tooltip);
		});
		observer.observe(root, { childList: true, subtree: true });
		disposers.push(() => observer.disconnect());
	});
}

function mountTrigger(modifiers: Record<string, boolean> = {}, text = 'Reply') {
	const host = document.createElement('div');
	root.append(host);
	const count = ref('2');
	const app = createApp({
		render: () => withDirectives(h('button', {
			type: 'button',
			style: 'position:absolute;left:240px;top:100px;display:flex;align-items:center;gap:10px;padding:8px;border:0;font:inherit;',
		}, [
			h('i', { style: 'display:block;flex:none;width:20px;height:20px;' }),
			h('span', count.value),
		]), [[tooltipDirective, text, undefined, modifiers]]),
	});
	app.mount(host);
	disposers.push(() => { app.unmount(); host.remove(); });
	const trigger = host.querySelector('button')!;
	return { trigger, count, icon: trigger.querySelector('i')! };
}

function entrance(panel: HTMLElement) {
	const animation = panel.getAnimations().find(item => item instanceof CSSAnimation)!;
	expect(animation).toBeDefined();
	const style = getComputedStyle(panel);
	expect(style.animationDuration).toBe('0.15s');
	expect(style.animationTimingFunction).toBe('ease-out');
	expect(style.animationFillMode).toBe('both');
	const frames = (animation.effect as KeyframeEffect).getKeyframes();
	expect(frames[0].opacity).toBe('0');
	expect(frames.at(-1)!.opacity).toBe('1');
	const name = style.animationName;
	animation.pause();
	animation.currentTime = 0;
	const initial = panel.getBoundingClientRect();
	const initialArrow = panel.lastElementChild!.getBoundingClientRect();
	for (const time of [25, 75, 125, 150]) {
		animation.currentTime = time;
		const rect = panel.getBoundingClientRect();
		const arrow = panel.lastElementChild!.getBoundingClientRect();
		for (const field of ['x', 'y', 'width', 'height'] as const) {
			expect(rect[field], `tooltip ${field} at ${time}ms`).toBeCloseTo(initial[field], 3);
			expect(arrow[field], `arrow ${field} at ${time}ms`).toBeCloseTo(initialArrow[field], 3);
		}
	}
	animation.currentTime = 75;
	const halfway = getComputedStyle(panel);
	expect(Number(halfway.opacity)).toBeGreaterThan(0);
	expect(Number(halfway.opacity)).toBeLessThan(1);
	animation.finish();
	return name;
}

beforeEach(async () => {
	prefer.s.animation = true;
	await page.viewport(1000, 700);
	root = document.createElement('div');
	root.style.cssText = 'font-family:Georgia,serif;--MI_THEME-bg:rgb(242,243,245);--MI_THEME-fg:rgb(85,85,85);';
	document.body.append(root);
	mocks.popup.mockImplementation((component, props, events) => {
		const host = document.createElement('div');
		root.append(host);
		const app = createApp({ render: () => h(component, { ...props, showing: props.showing.value, onClosed: events.closed }) });
		app.component(mfmComponentName, { render: () => null });
		app.mount(host);
		let disposed = false;
		const dispose = () => {
			if (disposed) return;
			disposed = true;
			app.unmount();
			host.remove();
		};
		disposers.push(dispose);
		return { dispose };
	});
});

afterEach(() => {
	for (const dispose of disposers.splice(0).reverse()) dispose();
	root.remove();
	vi.clearAllMocks();
});

describe('shared tooltip behavior in a real browser', () => {
	test('delays hover by 600ms while noDelay keeps the same entrance animation', async () => {
		let sharedAnimation = '';
		for (const noDelay of [false, true]) {
			const fixture = mountTrigger({ noDelay }, '张三');
			const shown = waitForTooltip();
			const startedAt = performance.now();
			fixture.trigger.dispatchEvent(new MouseEvent('mouseenter'));
			if (noDelay) {
				expect(mocks.popup).toHaveBeenCalledOnce();
			} else {
				expect(mocks.popup).not.toHaveBeenCalled();
				await new Promise<void>(resolve => window.setTimeout(resolve, 500));
				expect(mocks.popup).not.toHaveBeenCalled();
			}
			const panel = await shown;
			if (!noDelay) expect(performance.now() - startedAt).toBeGreaterThanOrEqual(580);
			const animationName = entrance(panel);
			if (noDelay) expect(animationName).toBe(sharedAnimation);
			else sharedAnimation = animationName;
			fixture.trigger.dispatchEvent(new MouseEvent('mouseleave'));
			await nextFrame();
			expect(panel.getAnimations()).toHaveLength(0);
			await expect.poll(() => panel.isConnected, { interval: 10, timeout: 500 }).toBe(false);
			mocks.popup.mockClear();
		}
	});

	test('centers the panel and arrow on the icon as its counter grows', async () => {
		const fixture = mountTrigger({ noDelay: true, icon: true });
		const shown = waitForTooltip();
		fixture.trigger.dispatchEvent(new MouseEvent('mouseenter'));
		const panel = await shown;
		entrance(panel);
		await nextFrame();
		const originalWidth = fixture.trigger.getBoundingClientRect().width;
		for (const count of ['2', '1234567890']) {
			fixture.count.value = count;
			await nextFrame();
			const buttonRect = fixture.trigger.getBoundingClientRect();
			const iconRect = fixture.icon.getBoundingClientRect();
			const panelRect = panel.getBoundingClientRect();
			const arrowRect = panel.lastElementChild!.getBoundingClientRect();
			const center = iconRect.left + iconRect.width / 2;
			expect(Math.abs(panelRect.left + panelRect.width / 2 - center)).toBeLessThanOrEqual(0.5);
			expect(arrowRect.left + arrowRect.width / 2).toBeCloseTo(center, 1);
			expect(panelRect.top - buttonRect.bottom).toBeCloseTo(12, 1);
		}
		expect(fixture.trigger.getBoundingClientRect().width).toBeGreaterThan(originalWidth + 40);
	});

	test.each([
		{ text: 'Reply', background: 'rgb(242, 243, 245)', foreground: 'rgb(85, 85, 85)' },
		{ text: 'A longer tooltip label', background: 'rgb(23, 25, 31)', foreground: 'rgb(201, 206, 216)' },
	])('retains the theme, font and fixed small arrow without animations for "$text"', async ({ text, background, foreground }) => {
		prefer.s.animation = false;
		root.style.setProperty('--MI_THEME-bg', background);
		root.style.setProperty('--MI_THEME-fg', foreground);
		const fixture = mountTrigger({ noDelay: true }, text);
		const shown = waitForTooltip();
		fixture.trigger.dispatchEvent(new MouseEvent('mouseenter'));
		const panel = await shown;
		await nextFrame();
		const style = getComputedStyle(panel);
		const arrow = getComputedStyle(panel.lastElementChild!);
		expect(panel.getAnimations()).toHaveLength(0);
		expect(style.opacity).toBe('1');
		expect(style.transform).toBe('none');
		expect(style.backgroundColor).toBe(foreground);
		expect(style.color).toBe(background);
		expect(style.fontFamily).toBe(getComputedStyle(root).fontFamily);
		expect(style.borderRadius).toBe('4px');
		expect(arrow.width).toBe('6px');
		expect(arrow.height).toBe('6px');
		expect(arrow.backgroundColor).toBe(foreground);
		expect(arrow.borderTopLeftRadius).toBe('2px');
	});
});
