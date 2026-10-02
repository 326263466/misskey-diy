/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import '@/style.scss';
import MkToast from '@/components/MkToast.vue';
import { hotkeyDirective } from '@/directives/hotkey.js';
import { prefer } from '@/preferences.js';

vi.mock('@/os.js', () => ({ claimZIndex: () => 1000 }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: true, menuStyle: 'drawer' } } }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'smartphone' }));

const fixtures: { app: App; host: HTMLElement }[] = [];

async function mountToast(message = '已复制到剪贴板', dark = false) {
	const host = document.createElement('div');
	host.style.cssText = 'position:relative;min-height:100vh;background:var(--MI_THEME-bg);color:var(--MI_THEME-fg);--MI_THEME-accent:#86b300;--MI_THEME-accentedBg:rgba(134,179,0,0.15);--MI_THEME-divider:rgba(128,128,128,0.2);--MI_THEME-shadow:rgba(0,0,0,0.15);--MI_THEME-modalBg:rgba(0,0,0,0.3);--MI-modalBgFilter:blur(4px);';
	host.style.setProperty('--MI_THEME-bg', dark ? '#17191f' : '#f2f3f5');
	host.style.setProperty('--MI_THEME-panel', dark ? '#21242c' : '#fff');
	host.style.setProperty('--MI_THEME-fg', dark ? '#c9ced8' : '#555');
	document.body.append(host);
	const background = document.createElement('div');
	background.style.cssText = 'padding:32px;';
	host.append(background);
	const trigger = document.createElement('button');
	trigger.textContent = '复制链接';
	trigger.style.cssText = 'padding:12px 24px;font:inherit;';
	background.append(trigger);
	for (const text of ['Misskey', '主页', '最近的动态']) {
		const panel = document.createElement('div');
		panel.textContent = text;
		panel.style.cssText = 'padding:32px;margin-top:24px;border-radius:8px;background:var(--MI_THEME-panel);';
		background.append(panel);
	}
	const showing = ref(false);
	const closed = vi.fn();
	const backgroundAction = vi.fn();
	let openedAt = 0;
	trigger.addEventListener('click', () => {
		backgroundAction();
		openedAt = performance.now();
		showing.value = true;
	});
	const mount = document.createElement('div');
	host.append(mount);
	const app = createApp({ render: () => showing.value ? h(MkToast, { message, onClosed: closed }) : null });
	app.directive('hotkey', hotkeyDirective);
	app.mount(mount);
	fixtures.push({ app, host });
	trigger.focus();
	trigger.click();
	await nextTick();
	const backdrop = host.querySelector<HTMLElement>('._modalBg')!;
	const root = backdrop.parentElement!;
	const card = host.querySelector<HTMLElement>('[role="dialog"]')!;
	return {
		host, background, trigger, root, backdrop, card, closed, backgroundAction,
		async settle() {
			await expect.poll(() => getComputedStyle(backdrop).opacity).toBe('1');
			await expect.poll(() => getComputedStyle(card.parentElement!).transform).toBe('none');
		},
		async waitUntil(milliseconds: number) {
			await new Promise<void>(resolve => window.setTimeout(resolve, Math.max(0, openedAt + milliseconds - performance.now())));
		},
	};
}

function assertToastLayout(card: HTMLElement) {
	const rect = card.getBoundingClientRect();
	expect(rect.left + rect.width / 2).toBeCloseTo(window.innerWidth / 2, 1);
	expect(rect.top + rect.height / 2).toBeCloseTo(window.innerHeight / 2, 1);
	expect(rect.left).toBeGreaterThanOrEqual(0);
	expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
	expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
	const icon = card.querySelector<HTMLElement>('[aria-hidden="true"]')!.getBoundingClientRect();
	const message = document.getElementById(card.getAttribute('aria-labelledby')!)!.getBoundingClientRect();
	expect(icon.bottom).toBeLessThan(message.top);
	expect(icon.left + icon.width / 2).toBeCloseTo(rect.left + rect.width / 2, 1);
}

beforeEach(async () => {
	prefer.s.animation = true;
	await page.viewport(1000, 700);
});

afterEach(async () => {
	document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	await nextTick();
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
});

describe('toast overlays in a real browser', () => {
	test('keeps blur outside fading ancestors during opening and dismisses through the backdrop without click-through', async () => {
		const fixture = await mountToast();
		expect(Number(getComputedStyle(fixture.backdrop).opacity)).toBeLessThan(1);
		for (let frame = 0; frame < 8; frame++) {
			for (let ancestor = fixture.backdrop.parentElement; ancestor; ancestor = ancestor.parentElement) {
				expect(getComputedStyle(ancestor).opacity).toBe('1');
			}
			expect(getComputedStyle(fixture.backdrop).backdropFilter).toBe('blur(4px)');
			expect(fixture.backdrop.getBoundingClientRect().width).toBe(window.innerWidth);
			expect(fixture.backdrop.getBoundingClientRect().height).toBe(window.innerHeight);
			await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
		}
		await fixture.settle();
		assertToastLayout(fixture.card);
		const message = document.getElementById(fixture.card.getAttribute('aria-labelledby')!)!;
		const messageStyle = getComputedStyle(message);
		const textHeight = message.getBoundingClientRect().height - parseFloat(messageStyle.paddingTop) - parseFloat(messageStyle.paddingBottom);
		expect(textHeight).toBeCloseTo(parseFloat(messageStyle.lineHeight), 1);
		expect(fixture.card.textContent?.trim()).toBe('已复制到剪贴板');
		expect(fixture.card.getAttribute('aria-modal')).toBe('true');
		expect(fixture.root.querySelector('button')).toBeNull();
		expect(fixture.background.inert).toBe(true);
		expect(document.activeElement === fixture.card).toBe(true);
		await page.elementLocator(fixture.card).click({ force: true });
		expect(fixture.closed).not.toHaveBeenCalled();
		await new Promise<void>(resolve => window.setTimeout(resolve, 120));
		const rect = fixture.trigger.getBoundingClientRect();
		await page.elementLocator(document.body).click({ position: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, force: true });
		await expect.poll(() => fixture.closed.mock.calls.length).toBe(1);
		expect(fixture.card.checkVisibility()).toBe(false);
		expect(fixture.backgroundAction).toHaveBeenCalledOnce();
		expect(fixture.background.inert).toBe(false);
		expect(document.activeElement === fixture.trigger).toBe(true);
	});

	test.each([true, false])('dismisses with Escape and restores focus (animation=%s)', async animation => {
		prefer.s.animation = animation;
		const fixture = await mountToast('已复制到剪贴板', !animation);
		await fixture.settle();
		assertToastLayout(fixture.card);
		expect(document.activeElement === fixture.card).toBe(true);
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => fixture.closed.mock.calls.length).toBe(1);
		expect(fixture.card.checkVisibility()).toBe(false);
		expect(fixture.background.inert).toBe(false);
		expect(document.activeElement === fixture.trigger).toBe(true);
		await fixture.waitUntil(3300);
		expect(fixture.closed).toHaveBeenCalledOnce();
	}, 10000);

	test('wraps an unbroken message without horizontal overflow on a 320px screen', async () => {
		await page.viewport(320, 640);
		const message = 'https://example.com/' + 'longmessage'.repeat(20);
		const fixture = await mountToast(message);
		await fixture.settle();
		assertToastLayout(fixture.card);
		expect(fixture.card.scrollWidth).toBe(fixture.card.clientWidth);
		expect(document.documentElement.scrollWidth).toBe(window.innerWidth);
		expect(fixture.card.textContent?.trim()).toBe(message);
	});

	test('automatically disappears after three seconds and restores focus', async () => {
		const fixture = await mountToast();
		await fixture.waitUntil(2800);
		expect(fixture.closed).not.toHaveBeenCalled();
		expect(fixture.card.checkVisibility()).toBe(true);
		await expect.poll(() => fixture.closed.mock.calls.length, { timeout: 1000 }).toBe(1);
		expect(fixture.card.checkVisibility()).toBe(false);
		expect(fixture.background.inert).toBe(false);
		expect(document.activeElement === fixture.trigger).toBe(true);
	}, 10000);
});
