/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { notificationTypes } from 'misskey-js';
import type * as Misskey from 'misskey-js';
import type { MenuButton, MenuItem, MenuParent } from '@/types/menu.js';
import MkNotification from '@/components/MkNotification.vue';
import Notifications from '@/pages/notifications.vue';
import { i18n, updateI18n } from '@/i18n.js';
import * as os from '@/os.js';
import { getNotificationTypeLabel, systemNotificationTypes } from '@/utility/notification-types.js';

const mocks = vi.hoisted(() => ({ reload: vi.fn() }));
vi.mock('@/i.js', () => ({ ensureSignin: () => ({ id: 'new-user' }) }));
vi.mock('@/instance.js', () => ({ instance: { name: 'Test Community' } }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/os.js', () => ({ popupMenu: vi.fn(), apiWithDialog: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn() }));
vi.mock('@/utility/paginator.js', () => ({ Paginator: class {
	kind: string;
	constructor(_endpoint: string, options: { params?: { visibility?: string } }) {
		this.kind = options.params?.visibility === 'specified' ? 'directNotes' : 'mentions';
	}
	reload() { mocks.reload(this.kind); }
} }));
vi.mock('@/components/MkReactionIcon.vue', () => ({ default: { template: '<span/>' } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/MkPaginationControl.vue', () => ({ default: {
	props: ['paginator'],
	template: '<div data-testid="pagination-control" :data-paginator="paginator.kind"><button @click="paginator.reload()">refresh</button></div>',
} }));
vi.mock('@/components/MkNotesTimeline.vue', () => ({ default: { template: '<div data-testid="notes"/>' } }));
vi.mock('@/components/MkStreamingNotificationsTimeline.vue', async () => {
	const { defineComponent } = await import('vue');
	return { default: defineComponent({
		props: ['excludeTypes'],
		setup(props, { expose }) {
			expose({ paginator: { get kind() { return props.excludeTypes ? 'system' : 'all'; }, reload() { mocks.reload(props.excludeTypes ? 'system' : 'all'); } } });
		},
		template: '<div data-testid="notifications" :data-exclude="JSON.stringify(excludeTypes)"></div>',
	}) };
});

const global = {
	stubs: {
		MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
		MkTime: { props: ['time'], template: '<time :datetime="time"/>' },
		MkAvatar: { template: '<span data-testid="avatar"/>' },
		PageWithHeader: {
			props: ['tab', 'tabs', 'actions'],
			emits: ['update:tab'],
			template: '<main><button v-for="item in tabs" :key="item.key" @click="$emit(\'update:tab\', item.key)">{{ item.title }}</button><button v-for="action in actions" :key="action.text" @click="action.handler($event)">{{ action.text }}</button><div data-testid="header-actions"><slot name="header-actions"/></div><slot/></main>',
		},
	},
	directives: { userPreview: {} },
};

const welcome: Misskey.entities.Notification = {
	id: 'welcome-notification', createdAt: '2026-09-28T00:00:00.000Z', type: 'system', message: 'welcome',
};

const originalLocale = i18n.locale;

afterEach(() => { cleanup(); vi.clearAllMocks(); updateI18n(originalLocale); });

function menuItem(items: MenuItem[], text: string): MenuButton {
	const item = items.find(item => 'text' in item && item.text === text);
	expect(item).toBeDefined();
	return item as MenuButton;
}

async function openFilter(view: ReturnType<typeof render>): Promise<MenuItem[]> {
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.filter }));
	return vi.mocked(os.popupMenu).mock.calls.at(-1)![0].filter((item): item is MenuItem => item != null);
}

describe('system welcome letter', () => {
	test('renders the complete letter inline with three useful links and no personal sender or reply action', () => {
		const view = render(MkNotification, { props: { notification: welcome, full: true, withTime: true }, global });
		expect(view.getAllByText(i18n.ts.system)).toHaveLength(2);
		expect(view.getByText(i18n.ts._welcome.title)).toBeTruthy();
		expect(view.getByText(i18n.tsx._welcome.greeting({ name: 'Test Community' }))).toBeTruthy();
		expect(view.getByText(i18n.ts._welcome.introduction)).toBeTruthy();
		expect(view.getByText(i18n.ts._welcome.systemNote)).toBeTruthy();
		expect(view.getAllByRole('link')).toHaveLength(3);
		expect(view.getByRole('link', { name: i18n.ts.serverRules }).getAttribute('href')).toBe('/about');
		expect(view.getByRole('link', { name: i18n.ts._welcome.userGuide }).getAttribute('href')).toBe('https://misskey-hub.net/docs/for-users/');
		expect(view.getByRole('link', { name: i18n.ts.help }).getAttribute('href')).toBe('/contact');
		expect(view.container.querySelector('a[href="/welcome"]')).toBeNull();
		expect(view.container.querySelector('time')?.getAttribute('datetime')).toBe(welcome.createdAt);
		expect(view.queryByTestId('avatar')).toBeNull();
		expect(view.queryByRole('button')).toBeNull();
	});

	test('keeps toast text concise and links to the system inbox', () => {
		const view = render(MkNotification, { props: { notification: welcome, full: false }, global });
		expect(view.getByText(i18n.ts._welcome.notificationBody)).toBeTruthy();
		expect(view.getByRole('link', { name: i18n.ts._welcome.readGuide }).getAttribute('href')).toBe('/my/notifications#system');
		expect(view.queryByText(i18n.ts._welcome.introduction)).toBeNull();
	});

	test('opens the system tab with welcome, security and service events but without social activity', () => {
		const view = render(Notifications, { props: { initialTab: 'system' }, global });
		const excluded = JSON.parse(view.getByTestId('notifications').getAttribute('data-exclude')!);
		for (const type of ['system', 'login', 'createToken', 'exportCompleted', 'roleAssigned', 'achievementEarned', 'scheduledNotePosted', 'scheduledNotePostFailed', 'test']) {
			expect(excluded).not.toContain(type);
		}
		for (const type of ['follow', 'mention', 'pollEnded', 'app', 'chatRoomInvitationReceived']) {
			expect(excluded).toContain(type);
		}
	});

	test('uses the existing localized system name in every notification type selector', () => {
		updateI18n({ ...originalLocale, system: 'Localized system' });
		expect(getNotificationTypeLabel('system')).toBe('Localized system');
		expect(getNotificationTypeLabel('mention')).toBe(i18n.ts._notification._types.mention);
	});

	test('keeps all types accessible and the aggregate system filter identical to the system tab', async () => {
		const view = render(Notifications, { global });
		const items = await openFilter(view);
		const systemMenu = items.find(item => 'type' in item && item.type === 'parent') as MenuParent;
		expect(systemMenu.text).toBe(i18n.ts.system);
		const children = systemMenu.children as MenuItem[];
		const labels = [...items, ...children].flatMap(item => 'text' in item ? [item.text] : []);
		for (const type of notificationTypes) {
			expect(labels).toContain(getNotificationTypeLabel(type));
		}
		menuItem(children, i18n.ts.all).action(new PointerEvent('click'));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.filter }));
		const excluded = JSON.parse(view.getByTestId('notifications').getAttribute('data-exclude')!);
		expect(notificationTypes.filter(type => !excluded.includes(type))).toEqual(expect.arrayContaining([...systemNotificationTypes]));
		expect(excluded).toHaveLength(notificationTypes.length - systemNotificationTypes.length);
	});

	test('filters system subtypes and clears to all system events without losing each tab filter', async () => {
		const view = render(Notifications, { global });
		menuItem(await openFilter(view), getNotificationTypeLabel('mention')).action(new PointerEvent('click'));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.system }));
		const systemItems = await openFilter(view);
		expect(systemItems.some(item => 'text' in item && item.text === getNotificationTypeLabel('mention'))).toBe(false);
		menuItem(systemItems, getNotificationTypeLabel('login')).action(new PointerEvent('click'));
		await openFilter(view);
		expect(JSON.parse(view.getByTestId('notifications').getAttribute('data-exclude')!)).toEqual(notificationTypes.filter(type => type !== 'login'));
		menuItem(await openFilter(view), i18n.ts.all).action(new PointerEvent('click'));
		await openFilter(view);
		expect(JSON.parse(view.getByTestId('notifications').getAttribute('data-exclude')!)).not.toContain('system');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.all }));
		expect(JSON.parse(view.getByTestId('notifications').getAttribute('data-exclude')!)).toEqual(notificationTypes.filter(type => type !== 'mention'));
		menuItem(await openFilter(view), i18n.ts.all).action(new PointerEvent('click'));
		await openFilter(view);
		expect(view.getByTestId('notifications').getAttribute('data-exclude')).toBe('null');
	});

	test('keeps header controls connected to the current paginator on every tab', async () => {
		const view = render(Notifications, { global });
		for (const [kind, title] of [['all', i18n.ts.all], ['system', i18n.ts.system], ['mentions', i18n.ts.mentions], ['directNotes', i18n.ts.directNotes], ['all', i18n.ts.all]]) {
			await fireEvent.click(view.getByRole('button', { name: title }));
			const control = view.getByTestId('pagination-control');
			expect(view.getByTestId('header-actions').contains(control)).toBe(true);
			expect(control.getAttribute('data-paginator')).toBe(kind);
			await fireEvent.click(view.getByRole('button', { name: 'refresh' }));
			expect(mocks.reload).toHaveBeenLastCalledWith(kind);
		}
		expect(view.getByTestId('notifications').getAttribute('data-exclude')).toBe('null');
	});
});
