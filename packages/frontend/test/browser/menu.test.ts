/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cdp, page, userEvent } from 'vitest/browser';
import type { CDPSession } from '@vitest/browser-playwright';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import MkContextMenu from '@/components/MkContextMenu.vue';
import MkPopupMenu from '@/components/MkPopupMenu.vue';
import type { MenuItem } from '@/types/menu.js';
import { hotkeyDirective } from '@/directives/hotkey.js';
import { prefer } from '@/preferences.js';
import { MENU_GAP, VIEWPORT_MARGIN } from '@/utility/menu-position.js';
import { lastPointerType } from '@/utility/touch.js';

vi.mock('@/os.js', () => ({ claimZIndex: () => 1000, popupMenu: vi.fn() }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: true, menuStyle: 'popup' } } }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release: () => {} }) }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { none: 'None' } } }));

type MenuKind = 'context' | 'popup';
const fixtures: { app: App; host: HTMLElement }[] = [];

async function nextFrame() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
}

function mountMenu(kind: MenuKind, x: number, y: number, options: { count?: number; wide?: boolean; child?: boolean; childIndex?: number; fixed?: boolean; scroll?: boolean; triggerWidth?: number; items?: MenuItem[] } = {}) {
	const host = document.createElement('div');
	host.style.height = options.scroll ? '2000px' : '100vh';
	document.body.append(host);
	const showing = ref(false);
	const anchor = document.createElement('button');
	anchor.textContent = 'More';
	const triggerWidth = options.triggerWidth ?? 24;
	anchor.style.cssText = `position:${options.fixed ? 'fixed' : 'absolute'};left:${x - triggerWidth / 2}px;top:${y - 12 + (options.scroll && !options.fixed ? 600 : 0)}px;width:${triggerWidth}px;height:24px;padding:0;`;
	host.append(anchor);
	const action = vi.fn();
	const count = options.count ?? 10;
	const items: MenuItem[] = options.items ?? Array.from({ length: count }, (_, index) => ({
		text: `Action ${index}${options.wide ? ' long menu label'.repeat(6) : ''}`,
		action,
	}));
	if (options.child) items[options.childIndex ?? 0] = { type: 'parent', text: 'Children', children: [{ text: 'Child action', action }] };
	let ev: PointerEvent;
	const open = (event: PointerEvent) => {
		event.preventDefault();
		ev = event;
		showing.value = true;
	};
	if (kind === 'context') host.addEventListener('contextmenu', open);
	else anchor.addEventListener('click', open);
	const mount = document.createElement('div');
	host.append(mount);
	const app = createApp({
		render: () => showing.value
			? kind === 'context'
				? h(MkContextMenu, { items, ev, onClosed: () => { showing.value = false; } })
				: h(MkPopupMenu, { items, anchorElement: anchor, width: options.wide ? 400 : 200, onClosed: () => { showing.value = false; } })
			: null,
	});
	app.directive('hotkey', hotkeyDirective);
	for (const name of ['MkEllipsis', 'MkAvatar', 'MkA', 'MkUserName']) app.component(name, { render: () => null });
	app.mount(mount);
	fixtures.push({ app, host });
	return {
		action,
		anchor,
		root: () => host.querySelector<HTMLElement>('[role="menu"]')!,
		items: () => host.querySelector<HTMLElement>('[role="menu"] ._popup')!,
		guard: () => host.querySelector<HTMLElement>('[role="menu"] > [aria-hidden="true"]'),
		/** position 是相对触发元素的点击点，用来验证菜单不随点击位置漂移 */
		async open(position?: { x: number; y: number }) {
			if (options.scroll) {
				window.scrollTo({ top: 600, behavior: 'instant' });
				expect(window.scrollY).toBe(600);
			}
			await page.elementLocator(anchor).click({ button: kind === 'context' ? 'right' : 'left', position, force: true });
			await nextTick();
			await nextTick();
			if (options.scroll) expect(window.scrollY).toBe(600);
		},
	};
}

/**
 * 按钮菜单默认贴锚点左边缘（start 对齐）；溢出时整体切到与右边缘齐平（end 对齐），
 * 两边都放不下才夹进视口。
 */
function expectedLeft(anchor: DOMRect, width: number) {
	const minX = VIEWPORT_MARGIN;
	const maxX = window.innerWidth - VIEWPORT_MARGIN;
	const start = anchor.left;
	const end = anchor.right - width;
	const fits = (value: number) => value >= minX && value + width <= maxX;
	const aligned = fits(start) || !fits(end) ? start : end;
	return Math.max(minX, Math.min(aligned, maxX - width));
}

/** 子菜单可能落在父菜单任意一侧，取实际那一侧的间距 */
function submenuGap(root: HTMLElement, child: HTMLElement) {
	const rootRect = root.getBoundingClientRect();
	const childRect = child.getBoundingClientRect();
	return childRect.left >= rootRect.right ? childRect.left - rootRect.right : rootRect.left - childRect.right;
}

async function openSubmenu(fixture: ReturnType<typeof mountMenu>, label = 'Action') {
	const root = fixture.root();
	const item = Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(element => element.textContent?.includes(label) || element.textContent?.includes('Children'))!;
	await expect.poll(() => getComputedStyle(item).pointerEvents).toBe('auto');
	await page.elementLocator(item).hover({ force: true });
	await expect.poll(() => root.querySelector('[role="menu"]')).not.toBeNull();
	return { root, item };
}

async function movePointer(x: number, y: number) {
	const frame = window.frameElement!.getBoundingClientRect();
	await (cdp() as CDPSession).send('Input.dispatchMouseEvent', {
		type: 'mouseMoved',
		x: frame.left + x * frame.width / window.innerWidth,
		y: frame.top + y * frame.height / window.innerHeight,
	});
	await nextFrame();
}

function assertNoInitialSelection(root: HTMLElement, x: number, y: number) {
	expect(root.querySelector('[role^="menuitem"]:hover')).toBeNull();
	expect(document.elementFromPoint(x, y)?.closest('[role^="menuitem"]')).toBeNull();
	expect(document.activeElement?.getAttribute('role') ?? '').not.toMatch(/^menuitem/);
}

function assertVisible(element: HTMLElement) {
	const rect = element.getBoundingClientRect();
	expect(rect.left).toBeGreaterThanOrEqual(0);
	expect(rect.top).toBeGreaterThanOrEqual(0);
	expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
	expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
}

beforeEach(async () => {
	prefer.s.animation = true;
	prefer.s.menuStyle = 'popup';
	document.body.style.overflow = 'visible';
	document.documentElement.style.scrollBehavior = 'auto';
	await page.viewport(1000, 800);
	window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
});

afterEach(() => {
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
	document.body.style.overflow = '';
	document.documentElement.style.scrollBehavior = '';
	window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
});

test('keeps an open context menu visible when the viewport shrinks', async () => {
	const fixture = mountMenu('context', 900, 100);
	await fixture.open();
	await nextFrame();
	await page.viewport(700, 800);
	await nextFrame();
	assertVisible(fixture.root());
});

test('keeps a submenu visible when an outer container scrolls', async () => {
	const fixture = mountMenu('popup', 900, 100, { child: true });
	const scroller = document.createElement('div');
	scroller.style.cssText = 'position:relative;width:1000px;height:800px;overflow:auto;';
	const content = document.createElement('div');
	content.style.cssText = 'position:relative;width:2000px;height:800px;';
	fixture.anchor.replaceWith(scroller);
	scroller.append(content);
	content.append(fixture.anchor);
	await fixture.open();
	const { root } = await openSubmenu(fixture);
	await nextFrame();
	scroller.scrollLeft = 750;
	await nextFrame();
	const child = root.querySelector<HTMLElement>('[role="menu"]')!;
	assertVisible(root);
	assertVisible(child);
	expect(submenuGap(root, child)).toBeCloseTo(MENU_GAP, 1);
});

test.each(['removed', 'hidden'])('keeps a popup and its submenu in place after the anchor is %s', async state => {
	const fixture = mountMenu('popup', 400, 200, { child: true });
	await fixture.open();
	const { root, item } = await openSubmenu(fixture);
	await nextFrame();
	const initialRect = root.getBoundingClientRect();
	const anchorRect = fixture.anchor.getBoundingClientRect();
	expect(initialRect.left).toBeCloseTo(anchorRect.left, 1);
	expect(initialRect.top - anchorRect.bottom).toBeCloseTo(MENU_GAP, 1);

	if (state === 'removed') fixture.anchor.remove();
	else fixture.anchor.style.display = 'none';
	window.dispatchEvent(new Event('resize'));
	for (let frame = 0; frame < 3; frame++) {
		await nextFrame();
		const rect = root.getBoundingClientRect();
		const child = root.querySelector<HTMLElement>('[role="menu"]')!;
		expect(rect.left).toBeCloseTo(initialRect.left, 1);
		expect(rect.top).toBeCloseTo(initialRect.top, 1);
		expect(submenuGap(root, child)).toBeCloseTo(MENU_GAP, 1);
		expect(child.querySelector('[role="menuitem"]')!.getBoundingClientRect().top).toBeCloseTo(item.getBoundingClientRect().top, 1);
		assertVisible(root);
		assertVisible(child);
	}
});

describe('context menus anchor to the pointer', () => {
	test.each([
		{ x: 100, y: 100, right: true, below: true },
		{ x: 900, y: 100, right: false, below: true },
		{ x: 100, y: 700, right: true, below: false },
		{ x: 900, y: 700, right: false, below: false },
	])('keeps the same safe gap throughout opening at ($x, $y)', async ({ x, y, right, below }) => {
		const fixture = mountMenu('context', x, y);
		await fixture.open();
		for (let frame = 0; frame < 8; frame++) {
			const root = fixture.root();
			const rect = root.getBoundingClientRect();
			expect(right ? rect.left - x : x - rect.right).toBeCloseTo(MENU_GAP, 1);
			expect(below ? rect.top - y : y - rect.bottom).toBeCloseTo(MENU_GAP, 1);
			assertNoInitialSelection(root, x, y);
			assertVisible(root);
			await nextFrame();
		}
		await page.elementLocator(document.body).click({ position: { x, y }, force: true });
		expect(fixture.action).not.toHaveBeenCalled();
	});

	test.each([
		{ x: 100, count: 22, scrolls: false },
		{ x: 900, count: 22, scrolls: false },
		{ x: 100, count: 32, scrolls: true },
		{ x: 900, count: 32, scrolls: true },
	])('uses a safe side edge and scrolls only when necessary (x=$x, scrolls=$scrolls)', async ({ x, count, scrolls }) => {
		const y = 500;
		const fixture = mountMenu('context', x, y, { count });
		await fixture.open();
		await nextFrame();
		const root = fixture.root();
		const menu = fixture.items();
		const rect = root.getBoundingClientRect();
		expect(x === 100 ? rect.left - x : x - rect.right).toBeCloseTo(MENU_GAP, 1);
		expect(rect.top).toBeLessThan(y);
		expect(rect.bottom).toBeGreaterThan(y);
		expect(menu.scrollHeight > menu.clientHeight).toBe(scrolls);
		assertVisible(root);
		assertNoInitialSelection(root, x, y);
	});

	test.each([100, 700])('uses the top or bottom edge for a wide menu at y=%s', async y => {
		await page.viewport(600, 800);
		const fixture = mountMenu('context', 300, y, { wide: true });
		await fixture.open();
		await nextFrame();
		const root = fixture.root();
		const rect = root.getBoundingClientRect();
		expect(rect.width).toBe(400);
		expect(y === 100 ? rect.top - y : y - rect.bottom).toBeCloseTo(MENU_GAP, 1);
		expect(fixture.guard()).toBeNull();
		assertVisible(root);
		assertNoInitialSelection(root, 300, y);
	});

	test('ignores stationary repeated clicks when no side can avoid the pointer, then accepts an intentional click', async () => {
		await page.viewport(600, 800);
		const fixture = mountMenu('context', 300, 400, { wide: true, count: 22 });
		await fixture.open();
		await nextFrame();
		assertVisible(fixture.root());
		assertNoInitialSelection(fixture.root(), 300, 400);
		expect(fixture.guard()).not.toBeNull();
		for (let click = 0; click < 2; click++) {
			await page.elementLocator(document.body).click({ position: { x: 300, y: 400 }, force: true });
			await page.elementLocator(document.body).click({ position: { x: 300, y: 400 }, button: 'right', force: true });
			assertNoInitialSelection(fixture.root(), 300, 400);
			expect(fixture.guard()).not.toBeNull();
			expect(fixture.action).not.toHaveBeenCalled();
		}
		await page.elementLocator(fixture.guard()!).hover({ position: { x: 20, y: 20 }, force: true });
		await nextTick();
		expect(fixture.guard()).toBeNull();
		await page.elementLocator(fixture.root().querySelector('[role="menuitem"]')!).click();
		expect(fixture.action).toHaveBeenCalledOnce();
	});

	test('protects a mouse opening after switching away from touch input', async () => {
		await page.viewport(600, 800);
		window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' }));
		expect(lastPointerType).toBe('touch');
		const fixture = mountMenu('context', 300, 400, { wide: true, count: 22 });
		await fixture.open();
		expect(lastPointerType).toBe('mouse');
		expect(fixture.guard()).not.toBeNull();
		assertNoInitialSelection(fixture.root(), 300, 400);
	});

	test('scrolls a protected oversized menu with the first wheel event', async () => {
		await page.viewport(600, 800);
		const fixture = mountMenu('context', 300, 400, { wide: true, count: 32 });
		await fixture.open();
		const guard = fixture.guard()!;
		await expect.poll(() => getComputedStyle(guard).pointerEvents).toBe('auto');
		const frame = window.frameElement!.getBoundingClientRect();
		await (cdp() as CDPSession).send('Input.dispatchMouseEvent', {
			type: 'mouseWheel',
			x: frame.left + 300 * frame.width / window.innerWidth,
			y: frame.top + 400 * frame.height / window.innerHeight,
			deltaX: 0,
			deltaY: 120,
		});
		const menu = fixture.items();
		await expect.poll(() => menu.scrollTop).toBeGreaterThan(0);
		expect(fixture.guard()).toBeNull();
		expect(window.scrollY).toBe(0);
		expect(fixture.action).not.toHaveBeenCalled();
	});
});

describe('button menus anchor to the trigger element', () => {
	test.each([
		{ x: 100, y: 100, below: true },
		{ x: 900, y: 100, below: true },
		{ x: 100, y: 700, below: false },
		{ x: 900, y: 700, below: false },
	])('hangs off the trigger edge with a stable gap at ($x, $y)', async ({ x, y, below }) => {
		const fixture = mountMenu('popup', x, y);
		await fixture.open();
		for (let frame = 0; frame < 8; frame++) {
			const root = fixture.root();
			const rect = root.getBoundingClientRect();
			const anchor = fixture.anchor.getBoundingClientRect();
			expect(rect.left).toBeCloseTo(expectedLeft(anchor, rect.width), 1);
			expect(below ? rect.top - anchor.bottom : anchor.top - rect.bottom).toBeCloseTo(MENU_GAP, 1);
			// 按钮菜单不落在指针下，所以不需要初始指针守卫
			expect(fixture.guard()).toBeNull();
			assertNoInitialSelection(root, x, y);
			assertVisible(root);
			await nextFrame();
		}
		await page.elementLocator(document.body).click({ position: { x, y }, force: true });
		expect(fixture.action).not.toHaveBeenCalled();
	});

	// 贴的是触发元素左边缘，所以点按钮的哪一侧都落在同一处，不跟着指针漂
	test.each([
		{ triggerWidth: 160, at: 'start' },
		{ triggerWidth: 160, at: 'end' },
		{ triggerWidth: 320, at: 'start' },
		{ triggerWidth: 320, at: 'end' },
	])('ignores where a $triggerWidth px trigger is clicked ($at)', async ({ triggerWidth, at }) => {
		const fixture = mountMenu('popup', 400, 100, { triggerWidth });
		await fixture.open({ x: at === 'start' ? 4 : triggerWidth - 4, y: 12 });
		await nextFrame();
		const rect = fixture.root().getBoundingClientRect();
		const anchor = fixture.anchor.getBoundingClientRect();
		expect(rect.left).toBeCloseTo(anchor.left, 1);
		expect(rect.top - anchor.bottom).toBeCloseTo(MENU_GAP, 1);
		assertVisible(fixture.root());
	});

	test('flips to the side instead of shrinking when neither above nor below fits', async () => {
		await page.viewport(1000, 400);
		const fixture = mountMenu('popup', 100, 200, { count: 8 });
		await fixture.open();
		await nextFrame();
		const root = fixture.root();
		const menu = fixture.items();
		const anchor = fixture.anchor.getBoundingClientRect();
		expect(root.getBoundingClientRect().left - anchor.right).toBeCloseTo(MENU_GAP, 1);
		expect(menu.scrollHeight).toBe(menu.clientHeight);
		assertVisible(root);
	});

	// 上下都放不下就换到侧面，侧面也放不下（比整个视口还高）才退化成滚动
	test.each([
		{ count: 18, scrolls: false },
		{ count: 32, scrolls: true },
	])('flips to the side for a long menu, scrolling only past the viewport (count=$count)', async ({ count, scrolls }) => {
		const fixture = mountMenu('popup', 100, 500, { count });
		await fixture.open();
		await nextFrame();
		const root = fixture.root();
		const menu = fixture.items();
		const anchor = fixture.anchor.getBoundingClientRect();
		expect(root.getBoundingClientRect().left - anchor.right).toBeCloseTo(MENU_GAP, 1);
		expect(menu.scrollHeight > menu.clientHeight).toBe(scrolls);
		assertVisible(root);
	});

	test('keeps keyboard navigation available', async () => {
		await page.viewport(600, 800);
		const fixture = mountMenu('popup', 300, 400, { wide: true, count: 22 });
		await fixture.open();
		const firstItem = fixture.root().querySelector<HTMLElement>('[role="menuitem"]')!;
		await expect.poll(() => getComputedStyle(firstItem).pointerEvents).toBe('auto');
		await userEvent.keyboard('{ArrowDown}');
		expect(document.activeElement === firstItem).toBe(true);
		await userEvent.keyboard('{Enter}');
		expect(fixture.action).toHaveBeenCalledOnce();
	});

	test('scrolls an oversized menu with the wheel without moving the page', async () => {
		await page.viewport(600, 800);
		const fixture = mountMenu('popup', 300, 400, { wide: true, count: 32 });
		await fixture.open();
		await nextFrame();
		const menu = fixture.items();
		await expect.poll(() => getComputedStyle(menu).pointerEvents).toBe('auto');
		const target = menu.getBoundingClientRect();
		const frame = window.frameElement!.getBoundingClientRect();
		await (cdp() as CDPSession).send('Input.dispatchMouseEvent', {
			type: 'mouseWheel',
			x: frame.left + (target.left + target.width / 2) * frame.width / window.innerWidth,
			y: frame.top + (target.top + target.height / 2) * frame.height / window.innerHeight,
			deltaX: 0,
			deltaY: 120,
		});
		await expect.poll(() => menu.scrollTop).toBeGreaterThan(0);
		expect(window.scrollY).toBe(0);
		expect(fixture.action).not.toHaveBeenCalled();
	});

	test.each([false, true])('keeps viewport coordinates correct on a scrolled document (fixed=%s)', async fixed => {
		const fixture = mountMenu('popup', 900, 700, { fixed, scroll: true });
		await fixture.open();
		await nextFrame();
		const root = fixture.root();
		assertVisible(root);
		assertNoInitialSelection(root, 900, 700);
		const rect = root.getBoundingClientRect();
		const anchor = fixture.anchor.getBoundingClientRect();
		expect(rect.left).toBeCloseTo(expectedLeft(anchor, rect.width), 1);
		expect(anchor.top - rect.bottom).toBeCloseTo(MENU_GAP, 1);
	});
});

describe.each(['context', 'popup'] as const)('%s submenus', kind => {
	test.each([100, 900])('crosses the submenu gap in both directions and closes on a sibling at x=%s', async x => {
		prefer.s.animation = false;
		const fixture = mountMenu(kind, x, 100, { child: true });
		await fixture.open();
		const { root, item } = await openSubmenu(fixture);
		const child = root.querySelector<HTMLElement>('[role="menu"]')!;
		const childItem = child.querySelector<HTMLElement>('[role="menuitem"]')!;
		const parentRect = item.getBoundingClientRect();
		const childRect = childItem.getBoundingClientRect();
		const y = parentRect.top + parentRect.height / 2;
		const start = parentRect.left + parentRect.width / 2;
		const end = childRect.left + childRect.width / 2;
		const direction = Math.sign(end - start);
		// 逐像素经过父项边缘与实际空隙，避免一次 hover 跳过断开的通路。
		for (let cursor = start; direction * (end - cursor) > 0; cursor += direction * 2) {
			await movePointer(cursor, y);
			expect(root.querySelector('[role="menu"]')).toBe(child);
		}
		for (let cursor = end; direction * (cursor - start) > 0; cursor -= direction * 2) {
			await movePointer(cursor, y);
			expect(root.querySelector('[role="menu"]')).toBe(child);
		}

		// 朝子菜单方向略微斜移到相邻行，旧预测锥会吞掉该行的 hover。
		const siblingRect = item.nextElementSibling!.getBoundingClientRect();
		await movePointer(start + direction * 15, siblingRect.top + siblingRect.height / 2);
		expect(root.querySelector('[role="menu"]')).toBeNull();
	});

	test('closes a submenu immediately when the pointer leaves the whole menu', async () => {
		prefer.s.animation = false;
		const fixture = mountMenu(kind, 100, 100, { child: true });
		await fixture.open();
		const { root } = await openSubmenu(fixture);
		await movePointer(900, 700);
		expect(root.querySelector('[role="menu"]')).toBeNull();
	});

	test.each([100, 660])('crosses a vertical submenu gap at y=%s on a narrow desktop viewport', async y => {
		prefer.s.animation = false;
		await page.viewport(360, 800);
		const fixture = mountMenu(kind, 180, y, { items: [{
			type: 'parent', text: 'Children', children: Array.from({ length: 5 }, (_, index) => ({ text: `Child ${index}`, action: vi.fn() })),
		}] });
		await fixture.open();
		const { root, item } = await openSubmenu(fixture);
		const child = root.querySelector<HTMLElement>('[role="menu"]')!;
		const parentRect = item.getBoundingClientRect();
		const childRect = child.querySelector('[role="menuitem"]')!.getBoundingClientRect();
		const x = Math.max(parentRect.left, childRect.left) + 20;
		const start = parentRect.top + parentRect.height / 2;
		const end = childRect.top + childRect.height / 2;
		const direction = Math.sign(end - start);
		expect(direction).toBe(y === 100 ? 1 : -1);
		for (let cursor = start; direction * (end - cursor) > 0; cursor += direction * 2) {
			await movePointer(x, cursor);
			expect(root.querySelector('[role="menu"]')).toBe(child);
		}
		for (let cursor = end; direction * (cursor - start) > 0; cursor -= direction * 2) {
			await movePointer(x, cursor);
			expect(root.querySelector('[role="menu"]')).toBe(child);
		}
	});

	test('does not let a vertical submenu bridge intercept another parent item', async () => {
		prefer.s.animation = false;
		await page.viewport(360, 800);
		const fixture = mountMenu(kind, 180, 100, { child: true, count: 2 });
		await fixture.open();
		const { root, item } = await openSubmenu(fixture);
		const siblingRect = item.nextElementSibling!.getBoundingClientRect();
		await movePointer(siblingRect.left + 20, siblingRect.top + 2);
		expect(root.querySelector('[role="menu"]')).toBeNull();
	});

	test('keeps ancestor menus open while moving through nested submenus', async () => {
		prefer.s.animation = false;
		const action = vi.fn();
		const fixture = mountMenu(kind, 100, 100, { items: [{
			type: 'parent', text: 'Children', children: [
				{ type: 'parent', text: 'Nested', children: [{ text: 'Leaf', action }] },
				{ text: 'Sibling', action },
			],
		}] });
		await fixture.open();
		const { root } = await openSubmenu(fixture);
		const child = root.querySelector<HTMLElement>('[role="menu"]')!;
		const nested = child.querySelector<HTMLElement>('[role="menuitem"]')!;
		await page.elementLocator(nested).hover();
		await expect.poll(() => child.querySelector('[role="menu"]')).not.toBeNull();
		const grandchild = child.querySelector<HTMLElement>('[role="menu"]')!;
		const leaf = grandchild.querySelector<HTMLElement>('[role="menuitem"]')!;
		await page.elementLocator(leaf).hover();
		expect(root.querySelector('[role="menu"]')).toBe(child);
		expect(child.querySelector('[role="menu"]')).toBe(grandchild);
		await page.elementLocator(nested.nextElementSibling!).hover();
		await nextTick();
		expect(child.querySelector('[role="menu"]')).toBeNull();
		expect(root.querySelector('[role="menu"]')).toBe(child);
	});

	test.each([100, 900])('opens a submenu without overlap during the parent fade-in at x=%s', async x => {
		await import('@/components/MkMenu.child.vue');
		const fixture = mountMenu(kind, x, 100, { child: true });
		await fixture.open();
		const { root, item } = await openSubmenu(fixture);
		for (let frame = 0; frame < 8; frame++) {
			const child = root.querySelector<HTMLElement>('[role="menu"]')!;
			expect(submenuGap(root, child)).toBeCloseTo(MENU_GAP, 1);
			expect(child.querySelector('[role="menuitem"]')!.getBoundingClientRect().top).toBeCloseTo(item.getBoundingClientRect().top, 1);
			assertVisible(child);
			expect(child.querySelector('[role^="menuitem"]:hover')).toBeNull();
			await nextFrame();
		}
		await page.elementLocator(root.querySelector('[role="menu"]')!.querySelector('[role="menuitem"]')!).click();
		expect(fixture.action).toHaveBeenCalledOnce();
	});

	test('keeps a submenu aligned with its parent item while the parent menu scrolls', async () => {
		const fixture = mountMenu(kind, 100, 500, { child: true, childIndex: 8, count: 32 });
		await fixture.open();
		const { root, item } = await openSubmenu(fixture, 'Children');
		const menu = fixture.items();
		await nextFrame();
		menu.scrollTop = 60;
		// 滚动会把别的项送到静止的指针下，父项因此可能失去悬停；重新悬停再验证跟随关系
		await page.elementLocator(item).hover({ force: true });
		await expect.poll(() => root.querySelector('[role="menu"]')).not.toBeNull();
		await nextFrame();
		const child = root.querySelector<HTMLElement>('[role="menu"]')!;
		expect(child.querySelector('[role="menuitem"]')!.getBoundingClientRect().top).toBeCloseTo(item.getBoundingClientRect().top, 1);
		assertVisible(child);
	});

	test('keeps an open submenu visible when the viewport shrinks', async () => {
		const fixture = mountMenu(kind, 300, 100, { child: true });
		await fixture.open();
		const { root } = await openSubmenu(fixture);
		await nextFrame();
		await page.viewport(700, 800);
		await nextFrame();
		const child = root.querySelector<HTMLElement>('[role="menu"]')!;
		assertVisible(child);
		expect(submenuGap(root, child)).toBeCloseTo(MENU_GAP, 1);
	});
});
