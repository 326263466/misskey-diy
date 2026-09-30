/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { computed, nextTick, ref } from 'vue';
import MkMenu from '@/components/MkMenu.vue';
import { hotkeyDirective } from '@/directives/hotkey.js';
import * as os from '@/os.js';
import type { MenuGrid, MenuItem, MenuParent } from '@/types/menu.js';

const inputDevice = vi.hoisted(() => ({ touch: false, pointerType: 'mouse' }));
vi.mock('@/utility/touch.js', () => ({
	get isTouchUsing() { return inputDevice.touch; },
	get lastPointerType() { return inputDevice.pointerType; },
}));
vi.mock('@/os.js', () => ({ popupMenu: vi.fn() }));

function renderMenu(props: { guardInitialPointer?: boolean; asDrawer?: boolean } = { guardInitialPointer: true }) {
	const action = vi.fn();
	const view = render(MkMenu, {
		props: { items: [{ text: 'Action', action }], ...props },
		global: { directives: { hotkey: hotkeyDirective } },
	});
	const menu = view.getByRole('menu');
	const openingGuard = () => menu.querySelector<HTMLElement>(':scope > [aria-hidden="true"]');
	return { ...view, menu, openingGuard, action };
}

afterEach(() => {
	cleanup();
	inputDevice.touch = false;
	inputDevice.pointerType = 'mouse';
	vi.unstubAllGlobals();
	vi.mocked(os.popupMenu).mockReset();
});

describe('menu opening pointer protection', () => {
	test('blocks stationary clicks without focusing or activating an item', async () => {
		const { menu, openingGuard, action } = renderMenu();
		await nextTick();
		const onMousedown = vi.fn();
		menu.addEventListener('mousedown', onMousedown);
		for (let i = 0; i < 2; i++) {
			await fireEvent.mouseDown(openingGuard()!);
			await fireEvent.click(openingGuard()!);
			await fireEvent.contextMenu(openingGuard()!);
		}
		expect(openingGuard()).not.toBeNull();
		expect(action).not.toHaveBeenCalled();
		expect(onMousedown).not.toHaveBeenCalled();
		expect(document.activeElement?.getAttribute('role')).not.toBe('menuitem');
	});

	test('only releases the guard after actual pointer movement', async () => {
		const { getByRole, openingGuard, action } = renderMenu();
		await fireEvent.pointerMove(openingGuard()!, { movementX: 0, movementY: 0 });
		expect(openingGuard()).not.toBeNull();
		await fireEvent.pointerMove(openingGuard()!, { movementX: 1, movementY: 0 });
		expect(openingGuard()).toBeNull();
		await fireEvent.click(getByRole('menuitem'));
		expect(action).toHaveBeenCalledOnce();
	});

	test('allows keyboard navigation and activation without moving the pointer', async () => {
		const { getByRole, openingGuard, action } = renderMenu();
		await nextTick();
		await fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
		expect(openingGuard()).toBeNull();
		expect(document.activeElement).toBe(getByRole('menuitem'));
		await fireEvent.click(getByRole('menuitem'), { detail: 0 });
		expect(action).toHaveBeenCalledOnce();
	});

	test.each([
		{ guardInitialPointer: false, asDrawer: false },
		{ guardInitialPointer: true, asDrawer: true },
	])('leaves safe placements and drawers immediately interactive (%j)', ({ guardInitialPointer, asDrawer }) => {
		const { openingGuard } = renderMenu({ guardInitialPointer, asDrawer });
		expect(openingGuard()).toBeNull();
	});

	test('does not block touch input', () => {
		inputDevice.touch = true;
		inputDevice.pointerType = 'touch';
		const { openingGuard } = renderMenu();
		expect(openingGuard()).toBeNull();
	});

	test('still protects a mouse after a hybrid device has been used with touch', () => {
		inputDevice.touch = true;
		const { openingGuard } = renderMenu();
		expect(openingGuard()).not.toBeNull();
	});

	test('forwards the first wheel movement to the menu and releases protection', async () => {
		const { menu, openingGuard } = renderMenu();
		const scroller = menu.querySelector<HTMLElement>('._popup')!;
		const scroll = vi.spyOn(scroller, 'scrollBy');
		await fireEvent.wheel(openingGuard()!, { deltaY: 120 });
		expect(scroll).toHaveBeenCalledWith({ left: 0, top: 120 });
		expect(openingGuard()).toBeNull();
	});
});

test('keeps the parent button as the anchor while loading children', async () => {
	vi.mocked(os.popupMenu).mockResolvedValueOnce(undefined);
	const children: MenuItem[] = [{ text: 'Child action', action: vi.fn() }];
	let resolveChildren!: (items: MenuItem[]) => void;
	const pendingChildren = new Promise<MenuItem[]>(resolve => { resolveChildren = resolve; });
	const { getByRole } = render(MkMenu, {
		props: {
			items: [{ type: 'parent', text: 'Children', children: () => pendingChildren }],
			asDrawer: true,
		},
		global: { directives: { hotkey: hotkeyDirective } },
	});
	const parent = getByRole('menuitem');
	await fireEvent.click(parent.querySelector('div')!);
	resolveChildren(children);
	await vi.waitFor(() => expect(os.popupMenu).toHaveBeenLastCalledWith(children, parent, { onAction: expect.any(Function) }));
});

describe('menu selection notification', () => {
	test.each([false, true])('runs an active button only when actionOnActive is %s', async actionOnActive => {
		const action = vi.fn();
		const view = render(MkMenu, {
			props: { items: [{ text: 'Edit current selection', active: computed(() => true), actionOnActive, action }] },
			global: { directives: { hotkey: hotkeyDirective } },
		});
		await fireEvent.click(view.getByRole('menuitem'));
		expect(action).toHaveBeenCalledTimes(actionOnActive ? 1 : 0);
		expect(view.emitted().actioned?.length ?? 0).toBe(actionOnActive ? 1 : 0);
		expect(view.emitted().close).toEqual([[actionOnActive]]);
	});

	test('notifies immediately while an asynchronous action continues', async () => {
		let finishAction!: () => void;
		const pending = new Promise<void>(resolve => { finishAction = resolve; });
		const finished = vi.fn();
		const view = renderMenu({ guardInitialPointer: false });
		view.action.mockImplementation(async () => {
			await pending;
			finished();
		});

		await fireEvent.click(view.getByRole('menuitem'));
		expect(view.action).toHaveBeenCalledOnce();
		expect(view.emitted().actioned).toHaveLength(1);
		expect(finished).not.toHaveBeenCalled();
		finishAction();
		await pending;
		expect(finished).toHaveBeenCalledOnce();
	});

	test('does not notify when Escape dismisses the menu', async () => {
		const view = renderMenu({ guardInitialPointer: false });
		await nextTick();
		await fireEvent.keyDown(view.menu.querySelector('._popup')!, { key: 'Escape' });
		expect(view.emitted().close).toEqual([[false]]);
		expect(view.emitted().actioned).toBeUndefined();
		expect(view.action).not.toHaveBeenCalled();
	});

	test('propagates a desktop submenu selection without notifying on expansion', async () => {
		vi.stubGlobal('ResizeObserver', class {
			observe() {}
			disconnect() {}
		});
		const action = vi.fn();
		const view = render(MkMenu, {
			props: { items: [{ type: 'parent', text: 'Children', children: [{ text: 'Child action', action }] }] },
			global: { directives: { hotkey: hotkeyDirective } },
		});
		await fireEvent.mouseEnter(view.getByRole('menuitem', { name: 'Children' }));
		const child = await view.findByRole('menuitem', { name: 'Child action' }, { timeout: 5000 });
		expect(view.emitted().actioned).toBeUndefined();
		await fireEvent.click(child);
		await nextTick();
		expect(action).toHaveBeenCalledOnce();
		expect(view.emitted().actioned).toHaveLength(1);
	});

	test.each([false, true])('propagates drawer submenu selection before its closing animation (selected: %s)', async selected => {
		let closeChild!: () => void;
		vi.mocked(os.popupMenu).mockReturnValue(new Promise<void>(resolve => { closeChild = resolve; }));
		const view = render(MkMenu, {
			props: { items: [{ type: 'parent', text: 'Children', children: [{ text: 'Child action', action: vi.fn() }] }], asDrawer: true },
			global: { directives: { hotkey: hotkeyDirective } },
		});
		await fireEvent.click(view.getByRole('menuitem', { name: 'Children' }));
		await vi.waitFor(() => expect(os.popupMenu).toHaveBeenCalledOnce());
		expect(view.emitted().actioned).toBeUndefined();
		if (selected) vi.mocked(os.popupMenu).mock.calls[0][2]?.onAction?.();
		expect(view.emitted().actioned?.length ?? 0).toBe(selected ? 1 : 0);
		expect(view.emitted().close).toBeUndefined();
		closeChild();
		await nextTick();
		await nextTick();
		expect(view.emitted().actioned?.length ?? 0).toBe(selected ? 1 : 0);
		expect(view.emitted().close).toEqual([[false]]);
	});
});

describe('menu option grid', () => {
	function renderGrid(asSubmenu = false, columns?: number) {
		if (asSubmenu) {
			vi.stubGlobal('ResizeObserver', class {
				observe() {}
				disconnect() {}
			});
		}
		const selected = ref('Online');
		const items: MenuGrid['items'] = ['Online', 'Away', 'Busy', 'Invisible'].map(text => ({
			text,
			color: 'var(--MI_THEME-success)',
			active: computed(() => selected.value === text),
			action: vi.fn(),
		}));
		const grid: MenuGrid = { type: 'grid', text: 'Status', items, columns };
		const view = render(MkMenu, {
			props: { items: asSubmenu ? [{ type: 'parent', text: 'Status', children: [grid] }] : [grid] },
			global: { directives: { hotkey: hotkeyDirective } },
		});
		return { ...view, items, selected };
	}

	test('exposes the selected option and updates it when the status changes', async () => {
		const view = renderGrid();
		expect(view.getByRole('group', { name: 'Status' })).toBeTruthy();
		expect(view.getAllByRole('menuitemradio')).toHaveLength(4);
		expect(view.getByRole('menuitemradio', { checked: true }).textContent).toBe('Online');
		view.selected.value = 'Away';
		await nextTick();
		expect(view.getByRole('menuitemradio', { checked: true }).textContent).toBe('Away');
		expect(view.getByRole('menuitemradio', { name: 'Online' }).getAttribute('aria-checked')).toBe('false');
	});

	test.each([
		{ name: 'Away', index: 1, actioned: true },
		{ name: 'Online', index: 0, actioned: false },
	])('selects $name and closes with actioned=$actioned', async ({ name, index, actioned }) => {
		const view = renderGrid();
		await fireEvent.click(view.getByRole('menuitemradio', { name }));
		expect(view.items[index].action).toHaveBeenCalledTimes(actioned ? 1 : 0);
		expect(view.emitted().actioned?.length ?? 0).toBe(actioned ? 1 : 0);
		expect(view.emitted().close).toEqual([[actioned]]);
	});

	test('allows a selected status to open its settings when requested', async () => {
		const view = renderGrid();
		view.items[0].actionOnActive = true;
		await fireEvent.click(view.getByRole('menuitemradio', { name: 'Online' }));
		expect(view.items[0].action).toHaveBeenCalledOnce();
		expect(view.emitted().actioned).toHaveLength(1);
		expect(view.emitted().close).toEqual([[true]]);
	});

	test('enters the grid from the menu with ArrowDown', async () => {
		const view = renderGrid();
		await nextTick();
		await fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
		expect(document.activeElement).toBe(view.getByRole('menuitemradio', { name: 'Online' }));
	});

	test('opens the submenu at the selected status and lets the keyboard choose another', async () => {
		const view = renderGrid(true);
		view.selected.value = 'Busy';
		await nextTick();
		const parent = view.getByRole('menuitem', { name: 'Status' });
		parent.focus();
		await fireEvent.keyDown(parent, { key: 'Enter' });
		const selected = await view.findByRole('menuitemradio', { name: 'Busy' });
		await vi.waitFor(() => expect(document.activeElement).toBe(selected));
		await fireEvent.keyDown(selected, { key: 'ArrowRight' });
		const invisible = view.getByRole('menuitemradio', { name: 'Invisible' });
		expect(document.activeElement).toBe(invisible);
		await fireEvent.click(invisible, { detail: 0 });
		await nextTick();
		expect(view.items[3].action).toHaveBeenCalledOnce();
		expect(view.emitted().actioned).toHaveLength(1);
	});

	test('restores parent focus when Escape dismisses the status submenu', async () => {
		const view = renderGrid(true);
		await nextTick();
		const parent = view.getByRole('menuitem', { name: 'Status' });
		parent.focus();
		await fireEvent.keyDown(parent, { key: 'Enter' });
		const selected = await view.findByRole('menuitemradio', { name: 'Online' });
		await vi.waitFor(() => expect(document.activeElement).toBe(selected));
		await fireEvent.keyDown(selected, { key: 'Escape' });
		await vi.waitFor(() => expect(view.queryByRole('menuitemradio')).toBeNull());
		expect(document.activeElement).toBe(parent);
		expect(view.emitted().actioned).toBeUndefined();
		expect(view.emitted().close).toBeUndefined();
	});

	test.each([
		{ from: 'Online', key: 'ArrowRight', to: 'Away' },
		{ from: 'Away', key: 'ArrowLeft', to: 'Online' },
		{ from: 'Online', key: 'ArrowDown', to: 'Busy' },
		{ from: 'Busy', key: 'ArrowUp', to: 'Online' },
		{ from: 'Busy', key: 'ArrowDown', to: 'Online' },
	])('moves from $from to $to with $key in two columns', async ({ from, key, to }) => {
		const view = renderGrid();
		await nextTick();
		const source = view.getByRole('menuitemradio', { name: from });
		source.focus();
		await fireEvent.keyDown(source, { key });
		expect(document.activeElement).toBe(view.getByRole('menuitemradio', { name: to }));
		expect(view.emitted().actioned).toBeUndefined();
	});

	test('dismisses with Escape without changing the selected status', async () => {
		const view = renderGrid();
		await nextTick();
		const option = view.getByRole('menuitemradio', { name: 'Away' });
		option.focus();
		await fireEvent.keyDown(option, { key: 'Escape' });
		expect(view.emitted().close).toEqual([[false]]);
		expect(view.emitted().actioned).toBeUndefined();
		for (const item of view.items) expect(item.action).not.toHaveBeenCalled();
	});

	test('uses the configured column count for vertical keyboard navigation', async () => {
		const view = renderGrid(false, 3);
		await nextTick();
		const online = view.getByRole('menuitemradio', { name: 'Online' });
		online.focus();
		await fireEvent.keyDown(online, { key: 'ArrowDown' });
		const invisible = view.getByRole('menuitemradio', { name: 'Invisible' });
		expect(document.activeElement).toBe(invisible);
		await fireEvent.keyDown(invisible, { key: 'ArrowUp' });
		expect(document.activeElement).toBe(online);
	});
});

describe('submenu hover behaviour', () => {
	function renderNestedMenu(children?: MenuParent['children']) {
		vi.stubGlobal('ResizeObserver', class {
			observe() {}
			disconnect() {}
		});
		const action = vi.fn();
		const view = render(MkMenu, {
			props: {
				items: [
					{ type: 'parent', text: 'Children', children: children ?? [{ text: 'Child action', action }] },
					{ type: 'parent', text: 'Others', children: [{ text: 'Other action', action: vi.fn() }] },
					{ text: 'Plain', action: vi.fn() },
				],
			},
			global: { directives: { hotkey: hotkeyDirective } },
		});
		return {
			...view,
			parent: view.getByRole('menuitem', { name: 'Children' }),
			otherParent: view.getByRole('menuitem', { name: 'Others' }),
			plain: view.getByRole('menuitem', { name: 'Plain' }),
			child: () => view.queryByRole('menuitem', { name: 'Child action' }),
		};
	}

	test('does not open a submenu when the pointer only passes through', async () => {
		vi.useFakeTimers();
		try {
			const view = renderNestedMenu();
			await fireEvent.mouseEnter(view.parent);
			// 停留时间短于展开延迟就离开
			await vi.advanceTimersByTimeAsync(40);
			await fireEvent.mouseLeave(view.parent);
			await vi.advanceTimersByTimeAsync(500);
			await nextTick();
			expect(view.child()).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	test('opens a submenu once the pointer dwells on the parent', async () => {
		vi.useFakeTimers();
		try {
			const view = renderNestedMenu();
			await fireEvent.mouseEnter(view.parent);
			await vi.advanceTimersByTimeAsync(300);
			await nextTick();
			expect(view.child()).not.toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	test('closes the submenu immediately after the pointer leaves the parent', async () => {
		vi.useFakeTimers();
		try {
			const view = renderNestedMenu();
			await fireEvent.mouseEnter(view.parent);
			await vi.advanceTimersByTimeAsync(300);
			await nextTick();
			expect(view.child()).not.toBeNull();

			await fireEvent.mouseLeave(view.parent);
			await nextTick();
			expect(view.child()).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	test('keeps the submenu open while the pointer rests inside it', async () => {
		vi.useFakeTimers();
		try {
			const view = renderNestedMenu();
			await fireEvent.mouseEnter(view.parent);
			await vi.advanceTimersByTimeAsync(300);
			await nextTick();

			const childRoot = view.child()!.closest('[role="menu"]')!.parentElement!;
			await fireEvent.mouseLeave(view.parent, { relatedTarget: childRoot });
			await fireEvent.mouseEnter(childRoot);
			await vi.advanceTimersByTimeAsync(500);
			await nextTick();
			expect(view.child()).not.toBeNull();

			await fireEvent.mouseLeave(childRoot, { relatedTarget: view.parent });
			await fireEvent.mouseEnter(view.parent);
			expect(view.child()).not.toBeNull();
			await fireEvent.mouseLeave(view.parent, { relatedTarget: document.body });
			expect(view.child()).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	test.each(['leave', 'switch', 'close', 'unmount'])('does not display stale async children after %s', async mode => {
		vi.useFakeTimers();
		try {
			let resolveChildren!: (items: MenuItem[]) => void;
			const loadChildren = vi.fn(() => new Promise<MenuItem[]>(resolve => { resolveChildren = resolve; }));
			const view = renderNestedMenu(loadChildren);
			await fireEvent.mouseEnter(view.parent);
			await vi.advanceTimersByTimeAsync(100);
			expect(loadChildren).toHaveBeenCalledOnce();

			if (mode === 'leave') await fireEvent.mouseLeave(view.parent);
			if (mode === 'switch') {
				await fireEvent.mouseEnter(view.otherParent);
				await vi.advanceTimersByTimeAsync(100);
				expect(view.queryByRole('menuitem', { name: 'Other action' })).not.toBeNull();
			}
			if (mode === 'close') await fireEvent.keyDown(view.parent, { key: 'Escape' });
			if (mode === 'unmount') view.unmount();
			resolveChildren([{ text: 'Child action', action: vi.fn() }]);
			await vi.advanceTimersByTimeAsync(100);
			await nextTick();
			expect(view.child()).toBeNull();
			if (mode === 'switch') expect(view.queryByRole('menuitem', { name: 'Other action' })).not.toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	test.each(['close', 'unmount'])('cancels a scheduled child load on %s', async mode => {
		vi.useFakeTimers();
		try {
			const loadChildren = vi.fn(() => [{ text: 'Child action', action: vi.fn() }]);
			const view = renderNestedMenu(loadChildren);
			await fireEvent.mouseEnter(view.parent);
			if (mode === 'close') await fireEvent.keyDown(view.parent, { key: 'Escape' });
			else view.unmount();
			await vi.advanceTimersByTimeAsync(500);
			expect(loadChildren).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	test('closes an open submenu as soon as another item is hovered', async () => {
		vi.useFakeTimers();
		try {
			const view = renderNestedMenu();
			await fireEvent.mouseEnter(view.parent);
			await vi.advanceTimersByTimeAsync(300);
			await nextTick();
			expect(view.child()).not.toBeNull();

			await fireEvent.mouseEnter(view.plain);
			await nextTick();
			expect(view.child()).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	test('replaces the submenu without leaving the previous one open', async () => {
		vi.useFakeTimers();
		try {
			const view = renderNestedMenu();
			await fireEvent.mouseEnter(view.parent);
			await vi.advanceTimersByTimeAsync(300);
			await nextTick();
			expect(view.child()).not.toBeNull();

			await fireEvent.mouseEnter(view.otherParent);
			await nextTick();
			expect(view.child()).toBeNull();

			await vi.advanceTimersByTimeAsync(300);
			await nextTick();
			expect(view.queryByRole('menuitem', { name: 'Other action' })).not.toBeNull();
			expect(view.child()).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	test('opens a submenu immediately on click for touch-first input', async () => {
		inputDevice.touch = true;
		vi.mocked(os.popupMenu).mockResolvedValue(undefined);
		const children: MenuItem[] = [{ text: 'Child action', action: vi.fn() }];
		const { getByRole } = render(MkMenu, {
			props: { items: [{ type: 'parent', text: 'Children', children }], asDrawer: true },
			global: { directives: { hotkey: hotkeyDirective } },
		});
		const parent = getByRole('menuitem', { name: 'Children' });
		await fireEvent.click(parent.querySelector('div')!);
		await vi.waitFor(() => expect(os.popupMenu).toHaveBeenCalledOnce());
	});
});
