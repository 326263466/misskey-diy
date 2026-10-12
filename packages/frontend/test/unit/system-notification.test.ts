/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { notificationTypes } from 'misskey-js';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import type { MenuButton, MenuItem, MenuParent } from '@/types/menu.js';
import type { RouteDef } from '@/lib/nirax.js';
import MkNotification from '@/components/MkNotification.vue';
import NestedRouterView from '@/components/global/NestedRouterView.vue';
import Notifications from '@/pages/notifications.vue';
import NotificationsLayout from '@/pages/notifications/index.vue';
import { Nirax } from '@/lib/nirax.js';
import { DI } from '@/di.js';
import { i18n, updateI18n } from '@/i18n.js';
import * as os from '@/os.js';
import { getNotificationTypeLabel, systemNotificationTypes } from '@/utility/notification-types.js';

const mocks = vi.hoisted(() => ({ reload: vi.fn(), router: null as Nirax<RouteDef[]> | null, account: { id: 'new-user', hasPendingReceivedFollowRequest: false, hasUnreadAnnouncement: false } }));
vi.mock('@/router.js', () => ({ useRouter: () => mocks.router }));
vi.mock('@/i.js', () => ({ $i: mocks.account, ensureSignin: () => mocks.account }));
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
			expose({ paginator: { get kind() { return props.excludeTypes ? 'filtered' : 'all'; }, reload() { mocks.reload(props.excludeTypes ? 'filtered' : 'all'); } } });
		},
		template: '<div data-testid="notifications" :data-exclude="JSON.stringify(excludeTypes)"></div>',
	}) };
});

const global = {
	stubs: {
		MkA: {
			props: ['to'],
			setup: () => ({ navigate: (to: string) => mocks.router?.pushByPath(to) }),
			template: '<a :href="to" @click.prevent="navigate(to)"><slot/></a>',
		},
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

afterEach(() => { cleanup(); vi.clearAllMocks(); updateI18n(originalLocale); mocks.router = null; mocks.account.hasPendingReceivedFollowRequest = false; mocks.account.hasUnreadAnnouncement = false; });

async function renderNotifications(initialTab = 'all') {
	mocks.router = new Nirax([{
		path: '/my/notifications',
		component: NotificationsLayout,
		reuseOnPropsChange: [],
		children: [
			{ path: '/follow-requests', component: { template: '<div data-testid="follow-requests"/>' } },
			{ path: '/announcements', component: { template: '<div data-testid="announcements"/>' } },
			{ path: '/:initialTab?', component: Notifications, reuseOnPropsChange: ['initialTab'] },
		],
	}], initialTab === 'all' ? '/my/notifications' : `/my/notifications/${initialTab}`, true, NotificationsLayout);
	const view = render(NotificationsLayout, {
		global: {
			...global,
			components: { NestedRouterView },
			provide: { [DI.router]: mocks.router, [DI.routerCurrentDepth]: 1 },
		},
	});
	await nextTick();
	return view;
}

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
		expect(view.getByRole('link', { name: i18n.ts._welcome.readGuide }).getAttribute('href')).toBe('/my/notifications/system');
		expect(view.queryByText(i18n.ts._welcome.introduction)).toBeNull();
	});

	test('opens the system tab with welcome, security and service events but without social activity', async () => {
		const view = await renderNotifications('system');
		expect(view.getByRole('link', { name: i18n.ts.system }).getAttribute('aria-current')).toBe('page');
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
		const view = await renderNotifications();
		const items = await openFilter(view);
		const parents = items.filter((item): item is MenuParent => 'type' in item && item.type === 'parent');
		expect(parents.map(parent => parent.text)).toEqual([i18n.ts._notificationCategories.mentions, i18n.ts._notificationCategories.reactions, i18n.ts._notificationCategories.follows, i18n.ts.system]);
		const children = parents.flatMap(parent => parent.children as MenuItem[]);
		const labels = [...items, ...children].flatMap(item => 'text' in item ? [item.text] : []);
		for (const type of notificationTypes) {
			expect(labels).toContain(getNotificationTypeLabel(type));
		}
		menuItem(parents.at(-1)!.children as MenuItem[], i18n.ts.all).action(new PointerEvent('click'));
		await nextTick();
		expect(view.getByRole('link', { name: i18n.ts.system }).getAttribute('aria-current')).toBe('page');
		const excluded = JSON.parse(view.getByTestId('notifications').getAttribute('data-exclude')!);
		expect(notificationTypes.filter(type => !excluded.includes(type))).toEqual(expect.arrayContaining([...systemNotificationTypes]));
		expect(excluded).toHaveLength(notificationTypes.length - systemNotificationTypes.length);
	});

	test('filters only within the current category and keeps each tab filter', async () => {
		const view = await renderNotifications();
		menuItem(await openFilter(view), getNotificationTypeLabel('pollEnded')).action(new PointerEvent('click'));
		await fireEvent.click(view.getByRole('link', { name: i18n.ts.system }));
		const systemItems = await openFilter(view);
		expect(systemItems.some(item => 'text' in item && item.text === getNotificationTypeLabel('mention'))).toBe(false);
		menuItem(systemItems, getNotificationTypeLabel('login')).action(new PointerEvent('click'));
		await openFilter(view);
		expect(JSON.parse(view.getByTestId('notifications').getAttribute('data-exclude')!)).toEqual(notificationTypes.filter(type => type !== 'login'));
		menuItem(await openFilter(view), i18n.ts.all).action(new PointerEvent('click'));
		await openFilter(view);
		expect(JSON.parse(view.getByTestId('notifications').getAttribute('data-exclude')!)).not.toContain('system');
		await fireEvent.click(view.getByRole('link', { name: i18n.ts.all }));
		expect(JSON.parse(view.getByTestId('notifications').getAttribute('data-exclude')!)).toEqual(notificationTypes.filter(type => type !== 'pollEnded'));
		menuItem(await openFilter(view), i18n.ts.all).action(new PointerEvent('click'));
		await openFilter(view);
		expect(view.getByTestId('notifications').getAttribute('data-exclude')).toBe('null');
	});

	test('picking a categorized type from the all tab opens that category with the filter applied', async () => {
		const view = await renderNotifications();
		const items = await openFilter(view);
		const reactions = items.find((item): item is MenuParent => 'type' in item && item.type === 'parent' && item.text === i18n.ts._notificationCategories.reactions)!;
		menuItem(reactions.children as MenuItem[], getNotificationTypeLabel('renote')).action(new PointerEvent('click'));
		await nextTick();
		expect(view.getByRole('link', { name: i18n.ts._notificationCategories.reactions }).getAttribute('aria-current')).toBe('page');
		expect(JSON.parse(view.getByTestId('notifications').getAttribute('data-exclude')!)).toEqual(notificationTypes.filter(type => type !== 'renote'));
	});

	test('keeps header controls connected to the current paginator and shows only each category', async () => {
		const view = await renderNotifications();
		const navigation = view.getByRole('navigation', { name: i18n.ts.notifications });
		const tabs: [string, string, readonly string[] | null][] = [
			['all', i18n.ts.all, null],
			['filtered', i18n.ts._notificationCategories.mentions, ['reply', 'mention', 'quote']],
			['filtered', i18n.ts._notificationCategories.reactions, ['reaction', 'renote']],
			['filtered', i18n.ts._notificationCategories.follows, ['follow', 'receiveFollowRequest', 'followRequestAccepted']],
			['directNotes', i18n.ts.directNotes, null],
			['filtered', i18n.ts.system, systemNotificationTypes],
			['all', i18n.ts.all, null],
		];
		for (const [kind, title, included] of tabs) {
			const link = view.getByRole('link', { name: title });
			expect(navigation.contains(link)).toBe(true);
			await fireEvent.click(link);
			expect(link.getAttribute('aria-current')).toBe('page');
			expect(mocks.router!.getCurrentFullPath()).toBe(link.getAttribute('href'));
			expect(view.getByRole('navigation', { name: i18n.ts.notifications })).toBe(navigation);
			const control = view.getByTestId('pagination-control');
			expect(view.getByTestId('header-actions').contains(control)).toBe(true);
			expect(control.getAttribute('data-paginator')).toBe(kind);
			await fireEvent.click(view.getByRole('button', { name: 'refresh' }));
			expect(mocks.reload).toHaveBeenLastCalledWith(kind);
			if (included != null) {
				const excluded: string[] = JSON.parse(view.getByTestId('notifications').getAttribute('data-exclude')!);
				expect(notificationTypes.filter(type => !excluded.includes(type))).toEqual(notificationTypes.filter(type => included.includes(type)));
			}
		}
		expect(view.getByTestId('notifications').getAttribute('data-exclude')).toBe('null');
		mocks.router!.replaceByPath('/my/notifications/system');
		await nextTick();
		expect(view.getByRole('link', { name: i18n.ts.system }).getAttribute('aria-current')).toBe('page');
		expect(view.getByTestId('pagination-control').getAttribute('data-paginator')).toBe('filtered');
	});

	test.each([
		['follow-requests', 'hasPendingReceivedFollowRequest', () => i18n.ts.followRequests],
		['announcements', 'hasUnreadAnnouncement', () => i18n.ts.announcements],
	] as const)('shows %s inside the notification layout and marks pending items', async (testId, flag, title) => {
		mocks.account[flag] = true;
		const view = await renderNotifications();
		const navigation = view.getByRole('navigation', { name: i18n.ts.notifications });
		const link = view.getByRole('link', { name: title() });
		expect(link.querySelector('._indicatorCircle')).not.toBeNull();
		await fireEvent.click(link);
		expect(link.getAttribute('aria-current')).toBe('page');
		expect(view.getByTestId(testId)).toBeTruthy();
		expect(view.getByRole('navigation', { name: i18n.ts.notifications })).toBe(navigation);
		expect(view.getByRole('link', { name: i18n.ts.all }).getAttribute('aria-current')).toBeNull();
	});
});
