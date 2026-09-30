/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick, unref } from 'vue';
import type * as Misskey from 'misskey-js';
import type { MenuGrid, MenuItem, MenuParent } from '@/types/menu.js';
import MkUserOnlineIndicator from '@/components/MkUserOnlineIndicator.vue';
import MkUserStatus from '@/components/MkUserStatus.vue';
import MkMenu from '@/components/MkMenu.vue';
import { hotkeyDirective } from '@/directives/hotkey.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { getOnlineStatusMenu, saveCustomStatus, saveOnlineStatusWithAutoReply } from '@/utility/online-status.js';
import type { CustomStatus } from '@/utility/status-icons.js';
import { getUserStatusDisplay } from '@/utility/user-status.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), updateAccount: vi.fn(), popup: vi.fn(), dispose: vi.fn() }));
vi.mock('@/os.js', () => ({ apiWithDialog: mocks.api, popup: mocks.popup }));
vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: mocks.updateAccount }));
vi.mock('@/i.js', async () => {
	const { reactive } = await import('vue');
	return { $i: reactive({ id: 'self', host: null, hideOnlineStatus: false, onlineStatusOverride: 'invisible', onlineStatus: 'unknown', customStatus: null }) };
});

const customStatus: CustomStatus = { icon: 'coffee', text: '休息一下' };

afterEach(cleanup);

describe('account online status menu', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Object.assign($i!, { hideOnlineStatus: false, onlineStatusOverride: 'invisible', onlineStatus: 'unknown', customStatus, onlineStatusAutoReplies: {} });
		mocks.updateAccount.mockImplementation(patch => Object.assign($i!, patch));
		mocks.popup.mockReturnValue({ dispose: mocks.dispose });
	});

	test('shows the selected invisible status in the account menu', () => {
		const menu = getOnlineStatusMenu() as MenuParent;
		expect(unref(menu.caption)).toBe(i18n.ts._onlineStatus.invisible);
		const grid = (menu.children as MenuGrid[])[0];
		expect(grid.type).toBe('grid');
		expect(menu.children).toHaveLength(1);
		expect(grid.columns).toBe(3);
		expect(unref(grid.text)).toBe(i18n.ts.onlineStatus);
		expect(grid.items.map(button => unref(button.text))).toEqual([i18n.ts.online, i18n.ts._onlineStatus.away, i18n.ts._onlineStatus.busy, i18n.ts._onlineStatus.doNotDisturb, i18n.ts._onlineStatus.invisible, i18n.ts.custom]);
		expect(grid.items.map(button => unref(button.active))).toEqual([false, false, false, false, true, false]);
		expect(grid.items.at(-1)?.status).toBe('custom');
		expect(grid.items.at(-1)?.icon).toBeUndefined();
		expect(grid.items.every(button => button.customIcon === undefined)).toBe(true);
	});

	test.each(['online', 'invisible'])('saves %s with the appropriate custom status and waits for the account API', async status => {
		const user = { onlineStatus: status === 'invisible' ? 'unknown' : status, onlineStatusOverride: status, hideOnlineStatus: false, customStatus: status === 'invisible' ? customStatus : null, onlineStatusAutoReplies: {} };
		let resolve!: (value: typeof user) => void;
		mocks.api.mockReturnValue(new Promise<typeof user>(done => { resolve = done; }));
		const menu = getOnlineStatusMenu() as MenuParent;
		const buttons = (menu.children as MenuGrid[])[0].items;
		const action = buttons.find(button => button.status === status)!.action({} as PointerEvent);
		expect(mocks.api).toHaveBeenCalledWith('i/update', status === 'invisible' ? { onlineStatusOverride: status } : { onlineStatusOverride: status, customStatus: null });
		expect(mocks.updateAccount).not.toHaveBeenCalled();
		resolve(user);
		await action;
		expect(mocks.updateAccount).toHaveBeenCalledWith(user);
		expect($i!.customStatus).toEqual(user.customStatus);
	});

	test.each(['away', 'busy', 'doNotDisturb'] as const)('configures %s before saving status and reply together', async status => {
		$i!.onlineStatusAutoReplies = { [status]: '稍后回复' };
		const menu = getOnlineStatusMenu() as MenuParent;
		const grid = (menu.children as MenuGrid[])[0];
		expect(grid.items.find(button => button.status === status)?.actionOnActive).toBe(true);
		grid.items.find(button => button.status === status)!.action({} as PointerEvent);
		expect(mocks.api).not.toHaveBeenCalled();
		expect(mocks.updateAccount).not.toHaveBeenCalled();
		const [, props, events] = mocks.popup.mock.calls[0];
		expect(props).toMatchObject({ status, initialReply: '稍后回复' });
		const user = { hideOnlineStatus: false, onlineStatusOverride: status, onlineStatus: status, customStatus: null, onlineStatusAutoReplies: { [status]: '会议结束后回复' } };
		mocks.api.mockResolvedValueOnce(user);
		await props.save('会议结束后回复');
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('i/update', {
			onlineStatusOverride: status, customStatus: null, onlineStatusAutoReplies: { [status]: '会议结束后回复' },
		});
		expect(mocks.updateAccount).toHaveBeenCalledExactlyOnceWith(user);
		events.closed();
		expect(mocks.dispose).toHaveBeenCalledOnce();
	});

	test('remembers explicitly disabled replies and changes only the selected state settings', async () => {
		$i!.onlineStatusAutoReplies = { away: null, busy: '工作中' };
		const menu = getOnlineStatusMenu() as MenuParent;
		(menu.children as MenuGrid[])[0].items.find(button => button.status === 'away')!.action({} as PointerEvent);
		expect(mocks.popup.mock.calls[0][1].initialReply).toBeNull();
		const user = { hideOnlineStatus: false, onlineStatusOverride: 'away', onlineStatus: 'away', customStatus: null, onlineStatusAutoReplies: { away: null, busy: '工作中' } };
		mocks.api.mockResolvedValueOnce(user);
		await saveOnlineStatusWithAutoReply('away', null);
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('i/update', { onlineStatusOverride: 'away', customStatus: null, onlineStatusAutoReplies: { away: null } });
		expect($i!.onlineStatusAutoReplies).toEqual({ away: null, busy: '工作中' });
	});

	test('shows saved custom text in the online caption while retaining builtin captions for other states', () => {
		const menu = getOnlineStatusMenu() as MenuParent;
		Object.assign($i!, { hideOnlineStatus: false, onlineStatusOverride: 'online' });
		expect(unref(menu.caption)).toBe(customStatus.text);
		$i!.onlineStatusOverride = 'away';
		expect(unref(menu.caption)).toBe(i18n.ts._onlineStatus.away);
		$i!.onlineStatusOverride = 'busy';
		expect(unref(menu.caption)).toBe(i18n.ts._onlineStatus.busy);
		$i!.onlineStatusOverride = 'doNotDisturb';
		expect(unref(menu.caption)).toBe(i18n.ts._onlineStatus.doNotDisturb);
		$i!.onlineStatusOverride = 'invisible';
		expect(unref(menu.caption)).toBe(i18n.ts._onlineStatus.invisible);
		$i!.hideOnlineStatus = true;
		expect(unref(menu.caption)).toBe(i18n.ts._onlineStatus.invisible);
	});

	test('opens the custom editor with the saved text even while invisible', () => {
		const menu = getOnlineStatusMenu() as MenuParent;
		const edit = (menu.children as MenuGrid[])[0].items.at(-1)!;
		expect(unref(edit.text)).toBe(i18n.ts.custom);
		expect(edit.status).toBe('custom');
		expect(edit.icon).toBeUndefined();
		edit.action({} as PointerEvent);
		expect(mocks.popup).toHaveBeenCalledWith(expect.anything(), { initialStatus: customStatus, save: saveCustomStatus }, { closed: expect.any(Function) });
		mocks.popup.mock.calls[0][2].closed();
		expect(mocks.dispose).toHaveBeenCalledOnce();
		expect(mocks.api).not.toHaveBeenCalled();
	});

	test.each([customStatus, null])('applies or removes custom status %j while preserving saved reply settings', async value => {
		const user = { hideOnlineStatus: value === null, onlineStatusOverride: value ? 'online' : 'busy', onlineStatus: value ? 'online' : 'unknown', customStatus: value, onlineStatusAutoReplies: { busy: '会议结束后回复' } };
		const saved = Promise.withResolvers<typeof user>();
		mocks.api.mockReturnValueOnce(saved.promise);
		const saving = saveCustomStatus(value);
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('i/update', value ? { onlineStatusOverride: 'online', customStatus: value } : { customStatus: null });
		expect(mocks.updateAccount).not.toHaveBeenCalled();
		saved.resolve(user);
		await saving;
		expect(mocks.updateAccount).toHaveBeenCalledExactlyOnceWith(user);
		expect($i).toMatchObject(user);
	});

	test('reopens the editor from the active custom status menu item', async () => {
		Object.assign($i!, { hideOnlineStatus: false, onlineStatusOverride: 'online', onlineStatus: 'online', customStatus });
		const menu = getOnlineStatusMenu() as MenuParent;
		const view = render(MkMenu, {
			props: { items: menu.children as MenuItem[] },
			global: { directives: { hotkey: hotkeyDirective } },
		});
		expect(view.getByRole('menuitemradio', { name: i18n.ts.online }).getAttribute('aria-checked')).toBe('false');
		expect(view.getByRole('menuitemradio', { name: i18n.ts.custom }).getAttribute('aria-checked')).toBe('true');
		const customIcon = view.getByRole('menuitemradio', { name: i18n.ts.custom }).querySelector('[data-custom-status-icon="add"]');
		expect(customIcon).not.toBeNull();
		expect(customIcon?.querySelector('i, svg, img')).toBeNull();
		await fireEvent.click(view.getByRole('menuitemradio', { name: i18n.ts.custom }));
		expect(mocks.popup).toHaveBeenCalledExactlyOnceWith(expect.anything(), { initialStatus: customStatus, save: saveCustomStatus }, { closed: expect.any(Function) });
		expect(view.emitted().actioned).toHaveLength(1);
	});

	test('keeps the displayed status unchanged if saving fails', async () => {
		mocks.api.mockRejectedValue(new Error('Connection failed'));
		const menu = getOnlineStatusMenu() as MenuParent;
		const button = (menu.children as MenuGrid[])[0].items.find(button => button.status === 'online')!;
		await expect(button.action({} as PointerEvent)).rejects.toThrow('Connection failed');
		expect(mocks.updateAccount).not.toHaveBeenCalled();
	});

	test('keeps the saved custom status when an edit fails', async () => {
		mocks.api.mockRejectedValueOnce(new Error('Connection failed'));
		await expect(saveCustomStatus({ icon: 'music', text: 'Listening' })).rejects.toThrow('Connection failed');
		expect(mocks.updateAccount).not.toHaveBeenCalled();
		expect($i).toMatchObject({ hideOnlineStatus: false, onlineStatusOverride: 'invisible', customStatus });
	});

	test.each(['online', 'invisible', 'away', 'custom'] as const)('keeps the privacy setting enabled when selecting %s', async status => {
		Object.assign($i!, { hideOnlineStatus: true, onlineStatus: null });
		mocks.api.mockImplementation(async (_endpoint, params) => ({ ...$i, ...params }));
		if (status === 'custom') {
			await saveCustomStatus(customStatus);
		} else if (status === 'away') {
			await saveOnlineStatusWithAutoReply('away', '稍后回复');
		} else {
			const menu = getOnlineStatusMenu() as MenuParent;
			await (menu.children as MenuGrid[])[0].items.find(button => button.status === status)!.action({} as PointerEvent);
		}
		expect(mocks.api.mock.calls[0][1]).not.toHaveProperty('hideOnlineStatus');
		expect($i!.hideOnlineStatus).toBe(true);
		expect(getUserStatusDisplay($i!)).toBeNull();
	});
});

test('hides the entire indicator for null or hidden presence, and keeps invisible separate from offline', async () => {
	const view = render(MkUserOnlineIndicator, {
		props: { user: { id: 'alice', onlineStatus: null } as Misskey.entities.User },
		global: { directives: { tooltip: () => {} } },
	});
	expect(view.queryByRole('img')).toBeNull();
	expect(view.container.children).toHaveLength(0);
	await view.rerender({ user: { id: 'alice', onlineStatus: 'online', hideOnlineStatus: true, customStatus } as Misskey.entities.User });
	expect(view.queryByRole('img')).toBeNull();
	await view.rerender({ user: { id: 'alice', onlineStatus: 'unknown' } as Misskey.entities.User });
	expect(view.getByRole('img', { name: i18n.ts._onlineStatus._display.unknown })).toBeTruthy();
	await view.rerender({ user: { id: 'alice', onlineStatus: 'offline' } as Misskey.entities.User });
	expect(view.getByRole('img', { name: i18n.ts._onlineStatus._display.offline })).toBeTruthy();
	Object.assign($i!, { hideOnlineStatus: false, onlineStatus: 'unknown', onlineStatusOverride: 'invisible' });
	await view.rerender({ user: { id: 'self', host: null, onlineStatus: 'unknown' } as Misskey.entities.User });
	expect(view.getByRole('img', { name: i18n.ts._onlineStatus._display.invisible })).toBeTruthy();
	$i!.hideOnlineStatus = true;
	await nextTick();
	expect(view.queryByRole('img')).toBeNull();
});

describe('user status display', () => {
	test('shows custom text and icon only for an online visible user', () => {
		expect(getUserStatusDisplay({ onlineStatus: 'online', customStatus })).toEqual({ status: 'custom', icon: 'coffee', text: customStatus.text });
		expect(getUserStatusDisplay({ onlineStatus: 'online', customStatus: null })).toEqual({ status: 'online', text: i18n.ts._onlineStatus._display.online });
	});

	test.each(['active', 'away', 'busy', 'doNotDisturb', 'offline', 'unknown'] as const)('does not reveal a retained custom status while %s', status => {
		expect(getUserStatusDisplay({ onlineStatus: status, customStatus })).toEqual({ status, text: i18n.ts._onlineStatus._display[status] });
	});

	test('distinguishes private invisible selection, public unknown, offline and completely hidden presence', () => {
		expect(getUserStatusDisplay({ onlineStatus: 'unknown', onlineStatusOverride: 'invisible', customStatus })).toEqual({ status: 'invisible', text: i18n.ts._onlineStatus._display.invisible });
		expect(getUserStatusDisplay({ onlineStatus: 'unknown', customStatus: null })).toEqual({ status: 'unknown', text: i18n.ts._onlineStatus._display.unknown });
		expect(getUserStatusDisplay({ onlineStatus: 'offline', customStatus: null })).toEqual({ status: 'offline', text: i18n.ts._onlineStatus._display.offline });
		expect(getUserStatusDisplay({ onlineStatus: null, customStatus })).toBeNull();
		expect(getUserStatusDisplay({ onlineStatus: 'online', hideOnlineStatus: true, customStatus })).toBeNull();
		expect(getUserStatusDisplay({ onlineStatus: 'unknown', hideOnlineStatus: true, onlineStatusOverride: 'invisible' })).toBeNull();
	});
});

describe('custom status text beside avatars', () => {
	test.each(['online', 'active', 'away', 'busy', 'doNotDisturb', 'offline', 'unknown'] as const)('does not repeat the builtin %s status as profile text', onlineStatus => {
		const view = render(MkUserStatus, { props: { user: { id: 'alice', host: null, onlineStatus, customStatus: null } as Misskey.entities.User } });
		expect(view.container.textContent).toBe('');
		expect(view.container.children).toHaveLength(0);
	});

	test('renders only custom text without a second status icon', () => {
		const view = render(MkUserStatus, { props: { user: { id: 'alice', host: null, onlineStatus: 'online', customStatus } as Misskey.entities.User } });
		expect(view.getAllByText(customStatus.text)).toHaveLength(1);
		expect(view.container.firstElementChild?.childElementCount).toBe(0);
		expect(view.queryByRole('img')).toBeNull();
		expect(view.container.querySelector('i, svg')).toBeNull();
	});

	test('reacts to the owner becoming invisible, busy and online without replacing the saved custom text', async () => {
		Object.assign($i!, { hideOnlineStatus: true, onlineStatusOverride: 'online', onlineStatus: 'online', customStatus });
		const view = render(MkUserStatus, { props: { user: { id: 'self', host: null, onlineStatus: 'offline', customStatus: null } as Misskey.entities.User } });
		expect(view.container.textContent).toBe('');
		$i!.hideOnlineStatus = false;
		await nextTick();
		expect(view.getAllByText(customStatus.text)).toHaveLength(1);
		$i!.onlineStatus = 'busy';
		await nextTick();
		expect(view.container.textContent).toBe('');
		$i!.onlineStatus = 'online';
		await nextTick();
		expect(view.getAllByText(customStatus.text)).toHaveLength(1);
		$i!.hideOnlineStatus = true;
		await nextTick();
		expect(view.container.textContent).toBe('');
		expect($i!.customStatus).toEqual(customStatus);
	});
});
