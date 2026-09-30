/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import MkSelect from '@/components/MkSelect.vue';
import MkPopupMenu from '@/components/MkPopupMenu.vue';
import type { OptionValue } from '@/types/option-value.js';
import { hotkeyDirective } from '@/directives/hotkey.js';
import * as os from '@/os.js';

vi.mock('@/os.js', () => ({ claimZIndex: () => 1000, popupMenu: vi.fn() }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: true, menuStyle: 'popup' } } }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release: () => {} }) }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { none: 'None' } } }));

const fixtures: { app: App; host: HTMLElement }[] = [];

function configureApp(app: App) {
	app.directive('hotkey', hotkeyDirective);
	app.directive('adaptive-border', () => {});
	for (const name of ['MkEllipsis', 'MkAvatar', 'MkA', 'MkUserName']) app.component(name, { render: () => null });
}

async function nextFrame() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
}

function mountSelect(options: { x?: number; y?: number; width?: number; zoom?: number; count?: number; scroller?: boolean } = {}) {
	const host = document.createElement('div');
	const selectHost = document.createElement('div');
	selectHost.style.cssText = `position:absolute;left:${options.x ?? 600}px;top:${options.y ?? 100}px;width:${options.width ?? 130}px;zoom:${options.zoom ?? 1};`;
	let scroller: HTMLElement | undefined;
	if (options.scroller) {
		scroller = document.createElement('div');
		scroller.style.cssText = 'position:absolute;left:100px;top:80px;width:700px;height:340px;overflow:auto;';
		const content = document.createElement('div');
		content.style.cssText = 'position:relative;height:1000px;';
		content.append(selectHost);
		scroller.append(content);
		host.append(scroller);
	} else {
		host.append(selectHost);
	}
	const model = ref<OptionValue>(0);
	const items = Array.from({ length: options.count ?? 2 }, (_, value) => ({ value, label: value === 0 ? 'Newest first' : value === 1 ? 'Oldest first' : `Order ${value}` }));
	const app = createApp({
		render: () => h(MkSelect, { items, modelValue: model.value, 'onUpdate:modelValue': value => { model.value = value; } }),
	});
	configureApp(app);
	document.body.append(host);
	app.mount(selectHost);
	fixtures.push({ app, host });
	const anchor = selectHost.querySelector<HTMLElement>('[tabindex="0"]')!;
	return {
		anchor,
		selectHost,
		scroller,
		menu: () => document.querySelector<HTMLElement>('[role="menu"]')!,
		items: () => document.querySelector<HTMLElement>('[role="menu"] > ._popup')!,
		async open() {
			await page.elementLocator(anchor).click({ force: true });
			await nextFrame();
			await nextFrame();
		},
	};
}

function assertVisible(rect: DOMRect) {
	expect(rect.left).toBeGreaterThanOrEqual(15.9);
	expect(rect.top).toBeGreaterThanOrEqual(15.9);
	expect(rect.right).toBeLessThanOrEqual(window.innerWidth - 15.9);
	expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight - 15.9);
}

beforeEach(async () => {
	await page.viewport(1000, 800);
	document.body.style.overflow = 'visible';
	document.documentElement.style.scrollBehavior = 'auto';
	window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
	vi.mocked(os.popupMenu).mockImplementation((items, source, options = {}) => {
		const host = document.createElement('div');
		document.body.append(host);
		return new Promise<void>(resolve => {
			const app = createApp({
				render: () => h(MkPopupMenu, {
					// os.popupMenu 自身会丢弃 null 项，mock 也保持同样行为
					items: items.filter(x => x != null),
					anchorElement: source instanceof HTMLElement ? source : null,
					width: options.width,
					matchAnchorWidth: options.matchAnchorWidth,
					onClosing: options.onClosing,
					onClosed: resolve,
				}),
			});
			configureApp(app);
			app.mount(host);
			fixtures.push({ app, host });
		});
	});
});

afterEach(() => {
	for (const { app, host } of fixtures.splice(0).reverse()) {
		app.unmount();
		host.remove();
	}
	document.body.style.overflow = '';
	document.documentElement.style.scrollBehavior = '';
	window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
	vi.clearAllMocks();
});

describe('select dropdown layout in a real browser', () => {
	test.each([
		{ width: 130, zoom: 1 },
		{ width: 130.5, zoom: 1 },
		{ width: 130, zoom: 1.25 },
	])('matches a narrow select at width=$width and local zoom=$zoom', async ({ width, zoom }) => {
		const fixture = mountSelect({ x: 400, width, zoom });
		await fixture.open();
		for (let frame = 0; frame < 8; frame++) {
			const anchor = fixture.anchor.getBoundingClientRect();
			const menu = fixture.menu().getBoundingClientRect();
			expect(menu.width).toBeCloseTo(anchor.width, 1);
			expect(menu.left).toBeCloseTo(anchor.left, 1);
			expect(menu.top - anchor.bottom).toBeCloseTo(8, 1);
			assertVisible(menu);
			await nextFrame();
		}
	});

	test('moves the dropdown just enough to stay inside the right viewport edge', async () => {
		const fixture = mountSelect({ x: 865 });
		await fixture.open();
		const anchor = fixture.anchor.getBoundingClientRect();
		const menu = fixture.menu().getBoundingClientRect();
		expect(menu.width).toBeCloseTo(anchor.width, 1);
		expect(menu.right).toBeCloseTo(window.innerWidth - 16, 1);
		expect(menu.top - anchor.bottom).toBeCloseTo(8, 1);
		assertVisible(menu);
	});

	test('opens above a select near the bottom without overlapping it', async () => {
		const fixture = mountSelect({ y: 730 });
		await fixture.open();
		const anchor = fixture.anchor.getBoundingClientRect();
		const menu = fixture.menu().getBoundingClientRect();
		expect(menu.left).toBeCloseTo(anchor.left, 1);
		expect(anchor.top - menu.bottom).toBeCloseTo(8, 1);
		expect(fixture.items().scrollHeight).toBe(fixture.items().clientHeight);
		assertVisible(menu);
	});

	test('scrolls a long option list within the available space below its select', async () => {
		const fixture = mountSelect({ y: 300, count: 40 });
		await fixture.open();
		const anchor = fixture.anchor.getBoundingClientRect();
		const menu = fixture.menu().getBoundingClientRect();
		expect(menu.left).toBeCloseTo(anchor.left, 1);
		expect(menu.top - anchor.bottom).toBeCloseTo(8, 1);
		expect(fixture.items().scrollHeight).toBeGreaterThan(fixture.items().clientHeight);
		assertVisible(menu);
		fixture.items().scrollTop = 120;
		await nextFrame();
		expect(fixture.items().scrollTop).toBe(120);
		expect(fixture.menu().getBoundingClientRect().top - fixture.anchor.getBoundingClientRect().bottom).toBeCloseTo(8, 1);
	});

	test('restores the full list after a viewport resize and follows changes to select width', async () => {
		await page.viewport(1000, 450);
		const fixture = mountSelect({ y: 160, count: 20 });
		await fixture.open();
		expect(fixture.items().scrollHeight).toBeGreaterThan(fixture.items().clientHeight);
		await page.viewport(1000, 1000);
		await expect.poll(() => fixture.items().scrollHeight - fixture.items().clientHeight).toBe(0);
		fixture.selectHost.style.width = '178.5px';
		await expect.poll(() => fixture.menu().getBoundingClientRect().width).toBeCloseTo(178.5, 1);
		const anchor = fixture.anchor.getBoundingClientRect();
		const menu = fixture.menu().getBoundingClientRect();
		expect(menu.left).toBeCloseTo(anchor.left, 1);
		expect(menu.top - anchor.bottom).toBeCloseTo(8, 1);
		assertVisible(menu);
	});

	test('tracks a select inside an independently scrolling panel', async () => {
		const fixture = mountSelect({ x: 350, y: 160, scroller: true });
		await fixture.open();
		const originalTop = fixture.menu().getBoundingClientRect().top;
		fixture.scroller!.scrollTop = 80;
		await expect.poll(() => fixture.menu().getBoundingClientRect().top).toBeCloseTo(originalTop - 80, 1);
		const anchor = fixture.anchor.getBoundingClientRect();
		const menu = fixture.menu().getBoundingClientRect();
		expect(menu.left).toBeCloseTo(anchor.left, 1);
		expect(menu.top - anchor.bottom).toBeCloseTo(8, 1);
		assertVisible(menu);
	});
});
