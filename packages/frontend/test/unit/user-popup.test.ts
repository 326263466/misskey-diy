/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import MkUserPopup from '@/components/MkUserPopup.vue';
import { i18n } from '@/i18n.js';
import { publishUserProfileUpdate } from '@/composables/use-user-profile.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	position: vi.fn(() => ({ top: 100, left: 200, transformOrigin: 'center top' })),
	disconnect: vi.fn(),
	popupMenu: vi.fn(),
	cleanupMenu: vi.fn(),
}));

vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/os.js', () => ({ claimZIndex: () => 1, popupMenu: mocks.popupMenu }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/popup-position.js', () => ({ calcPopupPosition: mocks.position }));
vi.mock('@/utility/get-user-menu.js', () => ({ getUserMenu: () => ({ menu: [], cleanup: mocks.cleanupMenu }) }));
vi.mock('@/utility/isFfVisibleForMe.js', () => ({ isFollowingVisibleForMe: () => true, isFollowersVisibleForMe: () => true }));
vi.mock('@/components/MkFollowButton.vue', () => ({ default: { template: '<button/>' } }));
vi.mock('@/composables/use-user-statistics.js', () => ({ useUserStatistics: vi.fn() }));

const user = {
	id: 'alice', username: 'alice', name: 'Alice', host: null,
	bannerUrl: null, description: 'A user', notesCount: 12, followingCount: 3, followersCount: 4,
} as Misskey.entities.UserDetailed;

let source: HTMLButtonElement;

async function renderPopup(interactive?: boolean, profile = user) {
	const close = vi.fn();
	const view = render(MkUserPopup, {
		props: { showing: true, source, q: profile, interactive, onClose: close },
		global: {
			directives: { tooltip: {} },
			stubs: {
				MkA: { template: '<a><slot/></a>' },
				MkAvatar: true,
				MkUserName: { props: ['user'], template: '<span>{{ user.name }}</span>' },
				MkAcct: true,
				MkError: true,
				MkLoading: true,
				Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
			},
		},
	});
	await nextTick();
	const root = view.container.querySelector('._popup') as HTMLElement;
	vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 100, 300, 400));
	return { ...view, close, root };
}

describe('user popup interaction mode', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.position.mockReset().mockReturnValue({ top: 100, left: 200, transformOrigin: 'center top' });
		vi.stubGlobal('ResizeObserver', class {
			observe() {}
			disconnect = mocks.disconnect;
		});
		source = window.document.createElement('button');
		source.textContent = 'Avatar';
		vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 40, 40, 40));
		window.document.body.appendChild(source);
		source.focus();
	});

	afterEach(() => {
		cleanup();
		source.remove();
		vi.unstubAllGlobals();
	});

	test.each([
		{ company: 'Example Company', jobTitle: 'Engineer' },
		{ company: 'Example Company', jobTitle: null },
		{ company: null, jobTitle: 'Engineer' },
		{ company: null, jobTitle: null },
	])('shows professional fields in the user panel when present: %j', async work => {
		const view = await renderPopup(true, { ...user, ...work });
		for (const [key, value] of Object.entries(work)) {
			const label = i18n.ts._profile[key as 'company' | 'jobTitle'];
			if (value) expect(view.getByTitle(`${label}: ${value}`).textContent).toBe(key === 'company' ? `@${value}` : value);
			else expect(view.queryByTitle(new RegExp(`^${label}:`))).toBeNull();
		}
		expect(mocks.api).not.toHaveBeenCalled();
	});

	test('updates an open user panel from confirmed profile changes without fetching again', async () => {
		const snapshot = { ...user, id: 'saved-profile-popup', description: 'Old bio' };
		const view = await renderPopup(true, snapshot);
		publishUserProfileUpdate(snapshot.id, { name: 'New name', company: 'New Company', jobTitle: 'Designer', description: 'New bio', bannerUrl: 'https://example.test/new-banner.png' });
		await nextTick();
		expect(view.getByRole('dialog', { name: 'New name' })).toBeTruthy();
		expect(view.getByText('New bio')).toBeTruthy();
		expect(view.getByText('@New Company')).toBeTruthy();
		expect(view.getByText('Designer')).toBeTruthy();
		expect(view.root.innerHTML).toContain('https://example.test/new-banner.png');
		expect(view.queryByText('Old bio')).toBeNull();
		expect(mocks.api).not.toHaveBeenCalled();
		expect(snapshot.description).toBe('Old bio');
	});

	test('preserves hover events, Escape and focus by default, but closes on outside clicks', async () => {
		const view = await renderPopup();
		const parentKeydown = vi.fn();
		view.container.addEventListener('keydown', parentKeydown);

		expect(view.queryByRole('dialog')).toBeNull();
		expect(view.root.hasAttribute('tabindex')).toBe(false);
		expect(window.document.activeElement).toBe(source);
		await fireEvent.mouseOver(view.root);
		await fireEvent.mouseLeave(view.root);
		await fireEvent.keyDown(view.root, { key: 'Escape' });

		expect(view.emitted().mouseover).toHaveLength(1);
		expect(view.emitted().mouseleave).toHaveLength(1);
		expect(parentKeydown).toHaveBeenCalledTimes(1);
		expect(view.close).not.toHaveBeenCalled();

		await fireEvent.pointerDown(window.document.body);
		expect(view.close).toHaveBeenCalledOnce();
	});

	test('focuses a named dialog and keeps it open while interacting inside or leaving the card', async () => {
		const view = await renderPopup(true);
		expect(view.getByRole('dialog', { name: 'Alice' })).toBe(view.root);
		expect(view.root.tabIndex).toBe(-1);
		expect(window.document.activeElement).toBe(view.root);
		expect(mocks.api).not.toHaveBeenCalled();

		await fireEvent.pointerDown(view.root);
		await fireEvent.click(view.root);
		await fireEvent.mouseOver(view.root);
		await fireEvent.mouseLeave(view.root);
		expect(view.close).not.toHaveBeenCalled();
		expect(view.emitted().mouseover).toBeUndefined();
		expect(view.emitted().mouseleave).toBeUndefined();
	});

	test('leaves source clicks to the caller and closes only after an outside pointer press', async () => {
		const view = await renderPopup(true);
		await fireEvent.pointerDown(source);
		await fireEvent.click(source);
		expect(view.close).not.toHaveBeenCalled();

		await fireEvent.pointerDown(window.document.body);
		expect(view.close).toHaveBeenCalledTimes(1);
	});

	test('closes on Escape, stops parent handling and returns keyboard focus to the source', async () => {
		const view = await renderPopup(true);
		const parentKeydown = vi.fn();
		view.container.addEventListener('keydown', parentKeydown);
		const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		view.root.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		expect(parentKeydown).not.toHaveBeenCalled();
		expect(view.close).toHaveBeenCalledTimes(1);
		expect(window.document.activeElement).toBe(source);
	});

	test('lets a nested user menu handle Escape until it closes', async () => {
		let closeMenu!: () => void;
		mocks.popupMenu.mockReturnValue(new Promise<void>(resolve => { closeMenu = resolve; }));
		const view = await renderPopup(true);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.more }));
		expect(mocks.popupMenu).toHaveBeenCalledTimes(1);

		const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		view.root.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		expect(view.close).not.toHaveBeenCalled();

		closeMenu();
		await nextTick();
		expect(mocks.cleanupMenu).toHaveBeenCalledTimes(1);
		await fireEvent.pointerDown(window.document.body);
		expect(view.close).toHaveBeenCalledTimes(1);
	});

	test.each([
		{ interactive: false, location: 'card', clientX: 250, clientY: 150 },
		{ interactive: true, location: 'card', clientX: 250, clientY: 150 },
		{ interactive: false, location: 'source', clientX: 60, clientY: 60 },
		{ interactive: true, location: 'source', clientX: 60, clientY: 60 },
	])('keeps the card open after dismissing the menu through its backdrop over the $location (interactive: $interactive)', async ({ interactive, clientX, clientY }) => {
		let closeMenu!: () => void;
		mocks.popupMenu.mockReturnValue(new Promise<void>(resolve => { closeMenu = resolve; }));
		const view = await renderPopup(interactive);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.more }));
		const backdrop = window.document.createElement('div');
		backdrop.classList.add('_modalBg');
		view.container.appendChild(backdrop);

		await fireEvent.pointerDown(backdrop, { clientX, clientY });
		expect(view.close).not.toHaveBeenCalled();
		closeMenu();
		await nextTick();
		expect(mocks.cleanupMenu).toHaveBeenCalledOnce();
		expect(view.close).not.toHaveBeenCalled();
		expect(view.emitted().mouseleave).toBeUndefined();
	});

	test.each([false, true])('closes the card when the menu backdrop is pressed outside both card and source (interactive: %s)', async interactive => {
		mocks.popupMenu.mockReturnValue(new Promise<void>(() => {}));
		const view = await renderPopup(interactive);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.more }));
		const backdrop = window.document.createElement('div');
		backdrop.classList.add('_modalBg');
		view.container.appendChild(backdrop);

		await fireEvent.pointerDown(backdrop, { clientX: 199, clientY: 150 });
		expect(view.close).toHaveBeenCalledOnce();
	});

	test.each([false, true])('leaves presses inside nested menu items to the menu (interactive: %s)', async interactive => {
		mocks.popupMenu.mockReturnValue(new Promise<void>(() => {}));
		const view = await renderPopup(interactive);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.more }));
		const menu = window.document.createElement('div');
		menu.setAttribute('role', 'menu');
		const item = window.document.createElement('button');
		item.setAttribute('role', 'menuitem');
		menu.appendChild(item);
		view.container.appendChild(menu);

		await fireEvent.pointerDown(item, { clientX: 550, clientY: 150 });
		expect(view.close).not.toHaveBeenCalled();
		expect(mocks.cleanupMenu).not.toHaveBeenCalled();
	});

	test('cancels pending hover dismissal when a nested menu opens', async () => {
		mocks.popupMenu.mockReturnValue(new Promise<void>(() => {}));
		const view = await renderPopup();
		await fireEvent.mouseLeave(view.root);
		expect(view.emitted().mouseleave).toHaveLength(1);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.more }));
		expect(view.emitted().mouseover).toHaveLength(1);
	});

	test.each([false, true])('closes immediately on selection while the nested menu is still open (interactive: %s)', async interactive => {
		let closeMenu!: () => void;
		mocks.popupMenu.mockReturnValue(new Promise<void>(resolve => { closeMenu = resolve; }));
		const view = await renderPopup(interactive);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.more }));
		const options = mocks.popupMenu.mock.calls[0][2];
		options.onAction();
		expect(view.close).toHaveBeenCalledOnce();
		expect(mocks.cleanupMenu).not.toHaveBeenCalled();
		expect(view.emitted().mouseleave).toBeUndefined();

		options.onAction();
		expect(view.close).toHaveBeenCalledOnce();
		closeMenu();
		await nextTick();
		expect(mocks.cleanupMenu).toHaveBeenCalledOnce();
		expect(view.emitted().mouseleave).toBeUndefined();
	});

	test('does not dismiss the hover card when the pointer enters its nested menu', async () => {
		mocks.popupMenu.mockReturnValue(new Promise<void>(() => {}));
		const view = await renderPopup();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.more }));
		await fireEvent.mouseLeave(view.root);
		expect(view.emitted().mouseleave).toBeUndefined();
	});

	test('resumes hover dismissal when the menu closes away from the card and source', async () => {
		let closeMenu!: () => void;
		mocks.popupMenu.mockReturnValue(new Promise<void>(resolve => { closeMenu = resolve; }));
		const view = await renderPopup();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.more }));
		expect(view.root.matches(':hover')).toBe(false);
		expect(source.matches(':hover')).toBe(false);
		closeMenu();
		await nextTick();
		expect(view.emitted().mouseleave).toHaveLength(1);
	});

	test('does not emit a late hover dismissal after the card has been hidden', async () => {
		let closeMenu!: () => void;
		mocks.popupMenu.mockReturnValue(new Promise<void>(resolve => { closeMenu = resolve; }));
		const view = await renderPopup();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.more }));
		await view.rerender({ showing: false });
		closeMenu();
		await nextTick();
		expect(mocks.cleanupMenu).toHaveBeenCalledTimes(1);
		expect(view.emitted().mouseleave).toBeUndefined();
	});

	test.each([false, true])('follows the source on resize and ancestor scrolling (interactive: %s)', async interactive => {
		const view = await renderPopup(interactive);
		mocks.position.mockClear();
		mocks.position.mockReturnValueOnce({ top: 120, left: 240, transformOrigin: 'center top' });
		await fireEvent.resize(window);
		expect(view.root.style.top).toBe('120px');
		expect(view.root.style.left).toBe('240px');
		mocks.position.mockReturnValueOnce({ top: 80, left: 220, transformOrigin: 'center top' });
		await fireEvent.scroll(source);
		expect(view.root.style.top).toBe('80px');
		expect(view.root.style.left).toBe('220px');
		expect(mocks.position).toHaveBeenCalledTimes(2);
		expect(mocks.position).toHaveBeenLastCalledWith(view.root, expect.objectContaining({ anchorElement: source, innerMargin: 8 }));
	});

	test('removes document interaction listeners and disconnects observation on unmount', async () => {
		const view = await renderPopup(true);
		view.unmount();
		await fireEvent.pointerDown(window.document.body);
		const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		window.document.body.dispatchEvent(event);

		expect(view.close).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
		expect(mocks.disconnect).toHaveBeenCalledTimes(1);
	});
});
