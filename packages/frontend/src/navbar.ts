/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, reactive } from 'vue';
import { ui } from '@@/js/config.js';
import { clearCache } from './utility/clear-cache.js';
import type { ComputedRef } from 'vue';
import { $i } from '@/i.js';
import { miLocalStorage } from '@/local-storage.js';
import { openInstanceMenu, openToolsMenu } from '@/ui/_common_/common.js';
import { lookup } from '@/utility/lookup.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { unisonReload } from '@/utility/unison-reload.js';
import { navigationIcons } from '@/navigation-icons.js';

// 顶部只放内容板块；公告属于站方消息，登录后归入通知中心。
export const primaryNavItems: readonly string[] = ['explore', 'channels', 'play', 'shop'];

// 已在个人中心、通知中心、头像菜单、关于菜单或设置页提供，“更多”中不再重复。
// 刷新属于浏览器操作，不作为功能入口。
export const launchPadExcludedItems: readonly string[] = [
	'drive', 'favorites', 'clips', 'lists', 'antennas', 'checkin', 'benefits', 'achievements',
	'followRequests', 'qr', 'tools', 'cacheClear', 'reload',
];

export const navbarItemDef = reactive<{
	[key: string]: {
		title: string;
		icon: string;
		show?: ComputedRef<boolean>;
		indicated?: ComputedRef<boolean>;
		indicateValue?: ComputedRef<string>;
		to?: string;
		action?: (ev: PointerEvent) => void;
	};
}>({
	notifications: {
		title: i18n.ts.notifications,
		icon: navigationIcons.notifications,
		show: computed(() => $i != null),
		indicated: computed(() => $i != null && $i.hasUnreadNotification),
		indicateValue: computed(() => {
			if (!$i || $i.unreadNotificationsCount === 0) return '';

			if ($i.unreadNotificationsCount > 99) {
				return '99+';
			} else {
				return $i.unreadNotificationsCount.toString();
			}
		}),
		to: '/my/notifications',
	},
	drive: {
		title: i18n.ts.drive,
		icon: 'ti ti-cloud',
		show: computed(() => $i != null),
		to: '/my/drive',
	},
	followRequests: {
		title: i18n.ts.followRequests,
		icon: 'ti ti-user-plus',
		show: computed(() => $i != null),
		indicated: computed(() => $i != null && $i.hasPendingReceivedFollowRequest),
		to: '/my/notifications/follow-requests',
	},
	explore: {
		title: i18n.ts.explore,
		icon: 'ti ti-hash',
		to: '/explore',
	},
	announcements: {
		title: i18n.ts.announcements,
		icon: navigationIcons.announcements,
		indicated: computed(() => $i != null && $i.hasUnreadAnnouncement),
		to: $i != null ? '/my/notifications/announcements' : '/announcements',
	},
	search: {
		title: i18n.ts.search,
		icon: navigationIcons.search,
		to: '/search',
	},
	lookup: {
		title: i18n.ts.lookup,
		icon: 'ti ti-world-search',
		action: (ev) => {
			lookup();
		},
	},
	qr: {
		title: i18n.ts.qr,
		icon: 'ti ti-qrcode',
		show: computed(() => $i != null),
		to: '/qr',
	},
	lists: {
		title: i18n.ts.lists,
		icon: 'ti ti-users-group',
		show: computed(() => $i != null),
		to: '/my/lists',
	},
	antennas: {
		title: i18n.ts.antennas,
		icon: 'ti ti-rss',
		show: computed(() => $i != null),
		to: '/my/antennas',
	},
	favorites: {
		title: i18n.ts.favorites,
		icon: 'ti ti-star',
		show: computed(() => $i != null),
		to: '/my/favorites',
	},
	pages: {
		title: i18n.ts.pages,
		icon: 'ti ti-file-description',
		to: '/pages',
	},
	play: {
		title: i18n.ts.play,
		icon: 'ti ti-apps',
		to: '/play',
	},
	gallery: {
		title: i18n.ts.gallery,
		icon: 'ti ti-library-photo',
		to: '/gallery',
	},
	clips: {
		title: i18n.ts.clip,
		icon: 'ti ti-bookmarks',
		show: computed(() => $i != null),
		to: '/my/clips',
	},
	channels: {
		title: i18n.ts.channel,
		icon: 'ti ti-broadcast',
		to: '/channels',
	},
	chat: {
		title: i18n.ts.chat,
		icon: navigationIcons.chat,
		to: '/chat',
		show: computed(() => $i != null && $i.policies.chatAvailability !== 'unavailable'),
		indicated: computed(() => $i != null && $i.hasUnreadChatMessages),
	},
	checkin: {
		title: i18n.ts._checkin.dailyCheckin,
		icon: 'ti ti-calendar-check',
		show: computed(() => $i != null),
		to: '/my/checkin',
	},
	communityRanking: {
		title: i18n.ts.communityRanking,
		icon: navigationIcons.communityRanking,
		to: '/community-ranking',
	},
	benefits: {
		// 保留旧菜单键，避免已保存的导航偏好失效。
		title: i18n.ts._wallet.title,
		icon: 'ti ti-wallet',
		show: computed(() => $i != null),
		to: '/my/wallet',
	},
	shop: {
		title: i18n.ts._marketplace.title,
		icon: 'ti ti-shopping-cart',
		show: computed(() => $i != null),
		to: '/shop',
	},
	achievements: {
		title: i18n.ts.achievements,
		icon: 'ti ti-medal',
		show: computed(() => $i != null),
		to: '/my/achievements',
	},
	games: {
		title: i18n.ts.games,
		icon: 'ti ti-device-gamepad',
		to: '/games',
	},
	ui: {
		title: i18n.ts.switchUi,
		icon: 'ti ti-devices',
		action: (ev) => {
			os.popupMenu([{
				text: i18n.ts.default,
				active: ui === 'default' || ui === null,
				action: () => {
					miLocalStorage.setItem('ui', 'default');
					unisonReload();
				},
			}, {
				text: i18n.ts.deck,
				active: ui === 'deck',
				action: () => {
					miLocalStorage.setItem('ui', 'deck');
					unisonReload();
				},
			}], ev.currentTarget ?? ev.target);
		},
	},
	about: {
		title: i18n.ts.about,
		icon: 'ti ti-info-circle',
		action: (ev) => {
			openInstanceMenu(ev);
		},
	},
	tools: {
		title: i18n.ts.tools,
		icon: 'ti ti-tool',
		action: (ev) => {
			openToolsMenu(ev);
		},
	},
	reload: {
		title: i18n.ts.reload,
		icon: 'ti ti-refresh',
		action: (ev) => {
			window.location.reload();
		},
	},
	cacheClear: {
		title: i18n.ts.clearCache,
		icon: 'ti ti-trash',
		action: (ev) => {
			clearCache();
		},
	},
});
