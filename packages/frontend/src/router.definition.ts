/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent } from 'vue';
import type { AsyncComponentLoader } from 'vue';
import type { RouteDef } from '@/lib/nirax.js';
import { $i, iAmAdmin, iAmModerator } from '@/i.js';
import MkError from '@/pages/_error_.vue';
import PageTimeline from '@/pages/timeline.vue';

export const page = (loader: AsyncComponentLoader) => defineAsyncComponent({
	loader: loader,
	errorComponent: MkError,
});

function chatPage(...args: Parameters<typeof page>) {
	return $i?.policies.chatAvailability !== 'unavailable' ? page(...args) : page(() => import('@/pages/not-found.vue'));
}

const chatRoomPage = chatPage(() => import('@/pages/chat/room.vue'));

export const ROUTE_DEF = [{
	// 个人中心：外层保留左侧菜单，只切换右侧页面。
	name: 'my',
	path: '/my',
	component: page(() => import('@/pages/my/index.vue')),
	loginRequired: true,
	reuseOnPropsChange: [],
	children: [{
		path: '/wallet/transactions', name: 'transactions', component: page(() => import('@/pages/user/wallet.transactions.vue')),
	}, {
		path: '/wallet/red-packets', name: 'red-packets', component: page(() => import('@/pages/user/wallet.red-packets.vue')),
	}, {
		path: '/wallet/transfers', name: 'transfers', component: page(() => import('@/pages/user/wallet.transfers.vue')),
	}, {
		path: '/wallet', name: 'wallet', component: page(() => import('@/pages/user/wallet.overview.vue')),
	}, {
		path: '/products/new', name: 'products-new', component: page(() => import('@/pages/product-edit.vue')),
	}, {
		path: '/products/:productId/edit', name: 'products', component: page(() => import('@/pages/product-edit.vue')),
	}, {
		path: '/products', name: 'products', component: page(() => import('@/pages/products-manage.vue')),
	}, {
		path: '/orders/:orderId', name: 'orders', component: page(() => import('@/pages/order-detail.vue')),
	}, {
		path: '/orders', name: 'orders', component: page(() => import('@/pages/orders.vue')),
	}, {
		path: '/sales/:orderId', name: 'sales', component: page(() => import('@/pages/order-detail.vue')),
	}, {
		path: '/sales', name: 'sales', component: page(() => import('@/pages/my/sales.vue')),
	}, {
		path: '/drive/folder/:folder', name: 'drive', component: page(() => import('@/pages/drive.vue')),
	}, {
		path: '/drive/file/:fileId', name: 'drive', component: page(() => import('@/pages/drive.file.vue')),
		query: { tab: 'initialTab' },
		reuseOnPropsChange: ['initialTab'],
	}, {
		path: '/drive', name: 'drive', component: page(() => import('@/pages/drive.vue')),
	}, {
		path: '/favorites', name: 'favorites', component: page(() => import('@/pages/favorites.vue')),
	}, {
		path: '/clips', name: 'clips', component: page(() => import('@/pages/my-clips/index.vue')),
	}, {
		path: '/lists/:listId', name: 'lists', component: page(() => import('@/pages/my-lists/list.vue')),
	}, {
		path: '/lists', name: 'lists', component: page(() => import('@/pages/my-lists/index.vue')),
	}, {
		path: '/antennas/create', name: 'antennas', component: page(() => import('@/pages/my-antennas/create.vue')),
	}, {
		path: '/antennas/:antennaId', name: 'antennas', component: page(() => import('@/pages/my-antennas/edit.vue')),
	}, {
		path: '/antennas', name: 'antennas', component: page(() => import('@/pages/my-antennas/index.vue')),
	}, {
		path: '/checkin', name: 'checkin', component: page(() => import('@/pages/checkin.vue')),
	}, {
		path: '/benefits', name: 'benefits', component: page(() => import('@/pages/benefits.vue')),
	}, {
		path: '/achievements', name: 'achievements', component: page(() => import('@/pages/achievements.vue')),
	}, {
		path: '/', component: page(() => import('@/pages/_empty_.vue')),
	}],
}, {
	// 以下旧地址已并入个人中心，保留跳转以兼容收藏和已分享的链接。
	path: '/checkin',
	redirect: '/my/checkin',
	loginRequired: true,
}, {
	path: '/orders/:orderId',
	redirect: props => `/my/orders/${encodeURIComponent(String(props.get('orderId')))}`,
	loginRequired: true,
}, {
	path: '/orders',
	query: { mode: 'mode' },
	redirect: props => props.get('mode') === 'sales' ? '/my/sales' : '/my/orders',
	loginRequired: true,
}, {
	path: '/products/:productId/edit',
	redirect: props => `/my/products/${encodeURIComponent(String(props.get('productId')))}/edit`,
	loginRequired: true,
}, {
	path: '/products/new',
	redirect: '/my/products/new',
	loginRequired: true,
}, {
	path: '/products/manage',
	redirect: '/my/products',
	loginRequired: true,
}, {
	path: '/wallet/overview',
	redirect: '/my/wallet',
	loginRequired: true,
}, {
	path: '/wallet/transactions',
	redirect: '/my/wallet/transactions',
	loginRequired: true,
}, {
	path: '/wallet/red-packets',
	redirect: '/my/wallet/red-packets',
	loginRequired: true,
}, {
	path: '/wallet/transfers',
	redirect: '/my/wallet/transfers',
	loginRequired: true,
}, {
	path: '/wallet/benefits',
	redirect: '/my/benefits',
	loginRequired: true,
}, {
	path: '/wallet',
	redirect: '/my/wallet',
	loginRequired: true,
}, {
	path: '/products/:productId',
	name: 'shop',
	component: page(() => import('@/pages/shop.vue')),
	loginRequired: true,
	reuseOnPropsChange: ['productId'],
}, {
	path: '/shop',
	name: 'shop',
	component: page(() => import('@/pages/shop.vue')),
	loginRequired: true,
}, {
	path: '/community-ranking',
	name: 'community-ranking',
	component: page(() => import('@/pages/community-ranking.vue')),
	query: { type: 'type' },
	reuseOnPropsChange: ['type'],
}, {
	name: 'index',
	path: '/',
	component: $i ? page(() => import('@/pages/articles/index.vue')) : page(() => import('@/pages/welcome.vue')),
	children: [{
		path: '/',
		component: page(() => import('@/pages/articles/list.vue')),
		query: { tab: 'tab' },
		reuseOnPropsChange: ['tab'],
	}, {
		path: '/articles/category/:categoryId',
		component: page(() => import('@/pages/articles/list.vue')),
		query: { tab: 'tab' },
		reuseOnPropsChange: ['tab'],
	}, {
		path: '/articles/tag/:tag',
		component: page(() => import('@/pages/articles/list.vue')),
		query: { tab: 'tab' },
		reuseOnPropsChange: ['tab'],
	}],
}, {
	path: '/articles/new',
	component: page(() => import('@/pages/articles/editor.vue')),
	query: { draftKey: 'draft', cloudDraftId: 'cloudDraft' },
	loginRequired: true,
}, {
	path: '/articles/edit/:articleId',
	component: page(() => import('@/pages/articles/editor.vue')),
	query: { draftKey: 'draft', cloudDraftId: 'cloudDraft' },
	loginRequired: true,
}, {
	name: 'article',
	path: '/articles/:articleId',
	component: page(() => import('@/pages/articles/article.vue')),
}, {
	path: '/timeline',
	component: page(() => import('@/pages/timeline/index.vue')),
	reuseOnPropsChange: [],
	children: [{
		path: '/:initialTab?',
		component: PageTimeline,
		reuseOnPropsChange: ['initialTab'],
	}],
}, {
	path: '/@:acct/wallet',
	redirect: '/my/wallet',
	loginRequired: true,
}, {
	// 资料页的“管理”已并入个人中心；访问他人的旧地址时回到其主页。
	path: '/@:acct/management',
	redirect: props => props.get('acct') === $i?.username ? '/my' : `/@${String(props.get('acct'))}`,
}, {
	path: '/@:username/pages/:pageName(*)',
	component: page(() => import('@/pages/page.vue')),
}, {
	path: '/@:acct/following',
	component: page(() => import('@/pages/user/following.vue')),
}, {
	path: '/@:acct/followers',
	component: page(() => import('@/pages/user/followers.vue')),
}, {
	name: 'user',
	path: '/@:acct',
	component: page(() => import('@/pages/user/index.vue')),
	children: [{
		path: '/:page?',
		component: page(() => import('@/pages/user/content.vue')),
		reuseOnPropsChange: ['page'],
	}],
}, {
	// 帖子不再有单独页面；分享、通知和外部链接仍使用该地址，打开后转到作者主页。
	path: '/notes/:noteId',
	component: page(() => import('@/pages/note-redirect.vue')),
}, {
	name: 'list',
	path: '/list/:listId',
	component: page(() => import('@/pages/list.vue')),
}, {
	path: '/clips/:clipId',
	component: page(() => import('@/pages/clip.vue')),
}, {
	name: 'chat',
	path: '/chat',
	component: chatPage(() => import('@/pages/chat/index.vue')),
	loginRequired: true,
	children: [{
		path: '/',
		name: 'chat-home',
		component: chatPage(() => import('@/pages/chat/home.vue')),
	}, {
		path: '/groups',
		name: 'chat-groups',
		component: chatPage(() => import('@/pages/chat/home.vue')),
	}, {
		path: '/search',
		name: 'chat-search',
		component: chatPage(() => import('@/pages/chat/home.vue')),
	}, {
		path: '/invitations',
		name: 'chat-invitations',
		component: chatPage(() => import('@/pages/chat/home.vue')),
	}, {
		path: '/joining-rooms',
		name: 'chat-joining-rooms',
		component: chatPage(() => import('@/pages/chat/home.vue')),
	}, {
		path: '/owned-rooms',
		name: 'chat-owned-rooms',
		component: chatPage(() => import('@/pages/chat/home.vue')),
	}, {
		path: '/user/:userId',
		name: 'chat-user',
		component: chatRoomPage,
	}, {
		path: '/room/:roomId',
		name: 'chat-room',
		component: chatRoomPage,
	}, {
		path: '/messages/:messageId',
		name: 'chat-message',
		component: chatPage(() => import('@/pages/chat/message.vue')),
	}],
}, {
	path: '/instance-info/:host',
	component: page(() => import('@/pages/instance-info.vue')),
}, {
	name: 'settings',
	path: '/settings',
	component: page(() => import('@/pages/settings/index.vue')),
	loginRequired: true,
	children: [{
		path: '/profile',
		name: 'profile',
		component: page(() => import('@/pages/settings/profile.vue')),
	}, {
		path: '/avatar-decoration',
		name: 'avatarDecoration',
		component: page(() => import('@/pages/settings/avatar-decoration.vue')),
	}, {
		path: '/privacy',
		name: 'privacy',
		component: page(() => import('@/pages/settings/privacy.vue')),
	}, {
		path: '/emoji-palette',
		name: 'emoji-palette',
		component: page(() => import('@/pages/settings/emoji-palette.vue')),
	}, {
		path: '/drive',
		name: 'drive',
		component: page(() => import('@/pages/settings/drive.vue')),
	}, {
		path: '/drive/cleaner',
		name: 'drive',
		component: page(() => import('@/pages/settings/drive-cleaner.vue')),
	}, {
		path: '/notifications',
		name: 'notifications',
		component: page(() => import('@/pages/settings/notifications.vue')),
	}, {
		path: '/email',
		name: 'email',
		component: page(() => import('@/pages/settings/email.vue')),
	}, {
		path: '/security',
		name: 'security',
		component: page(() => import('@/pages/settings/security.vue')),
	}, {
		path: '/preferences',
		name: 'preferences',
		component: page(() => import('@/pages/settings/preferences.vue')),
	}, {
		path: '/theme/install',
		name: 'theme',
		component: page(() => import('@/pages/settings/theme.install.vue')),
	}, {
		path: '/theme/manage',
		name: 'theme',
		component: page(() => import('@/pages/settings/theme.manage.vue')),
	}, {
		path: '/theme',
		name: 'theme',
		component: page(() => import('@/pages/settings/theme.vue')),
	}, {
		path: '/navbar',
		name: 'navbar',
		component: page(() => import('@/pages/settings/navbar.vue')),
	}, {
		path: '/statusbar',
		name: 'statusbar',
		component: page(() => import('@/pages/settings/statusbar.vue')),
	}, {
		path: '/sounds',
		name: 'sounds',
		component: page(() => import('@/pages/settings/sounds.vue')),
	}, {
		path: '/plugin/install',
		name: 'plugin',
		component: page(() => import('@/pages/settings/plugin.install.vue')),
	}, {
		path: '/plugin',
		name: 'plugin',
		component: page(() => import('@/pages/settings/plugin.vue')),
	}, {
		path: '/account-data',
		name: 'account-data',
		component: page(() => import('@/pages/settings/account-data.vue')),
	}, {
		path: '/mute-block',
		name: 'mute-block',
		component: page(() => import('@/pages/settings/mute-block.vue')),
	}, {
		path: '/connect',
		name: 'connect',
		component: page(() => import('@/pages/settings/connect.vue')),
	}, {
		path: '/apps',
		name: 'apps',
		component: page(() => import('@/pages/settings/apps.vue')),
	}, {
		path: '/webhook/edit/:webhookId',
		name: 'connect',
		component: page(() => import('@/pages/settings/webhook.edit.vue')),
	}, {
		path: '/webhook/new',
		name: 'connect',
		component: page(() => import('@/pages/settings/webhook.new.vue')),
	}, {
		path: '/deck',
		name: 'deck',
		component: page(() => import('@/pages/settings/deck.vue')),
	}, {
		path: '/custom-css',
		name: 'custom-css',
		component: page(() => import('@/pages/settings/custom-css.vue')),
	}, {
		path: '/profiles',
		name: 'profiles',
		component: page(() => import('@/pages/settings/profiles.vue')),
	}, {
		path: '/accounts',
		name: 'accounts',
		component: page(() => import('@/pages/settings/accounts.vue')),
	}, {
		path: '/other',
		name: 'other',
		component: page(() => import('@/pages/settings/other.vue')),
	}, {
		path: '/',
		component: page(() => import('@/pages/_empty_.vue')),
	}],
}, {
	path: '/reset-password/:token?',
	component: page(() => import('@/pages/reset-password.vue')),
}, {
	path: '/signup-complete/:code',
	component: page(() => import('@/pages/signup-complete.vue')),
}, {
	path: '/verify-email/:code',
	component: page(() => import('@/pages/verify-email.vue')),
}, {
	path: '/announcements',
	component: page(() => import('@/pages/announcements.vue')),
}, {
	path: '/announcements/:announcementId',
	component: page(() => import('@/pages/announcement.vue')),
}, {
	path: '/about',
	component: page(() => import('@/pages/about.vue')),
	hash: 'initialTab',
	reuseOnPropsChange: ['initialTab'],
}, {
	path: '/contact',
	component: page(() => import('@/pages/contact.vue')),
}, {
	path: '/feedback',
	component: page(() => import('@/pages/feedback.vue')),
}, {
	path: '/about-misskey',
	component: page(() => import('@/pages/about-misskey.vue')),
}, {
	path: '/invite',
	name: 'invite',
	component: page(() => import('@/pages/invite.vue')),
}, {
	path: '/ads',
	component: page(() => import('@/pages/ads.vue')),
}, {
	path: '/theme-editor',
	component: page(() => import('@/pages/theme-editor.vue')),
	loginRequired: true,
}, {
	path: '/roles/:roleId',
	component: page(() => import('@/pages/role.vue')),
}, {
	path: '/user-tags/:tag',
	component: page(() => import('@/pages/user-tag.vue')),
}, {
	path: '/explore',
	component: page(() => import('@/pages/explore/index.vue')),
	reuseOnPropsChange: [],
	children: [{
		path: '/:initialTab?',
		component: page(() => import('@/pages/explore.vue')),
		reuseOnPropsChange: ['initialTab'],
	}],
}, {
	path: '/search',
	component: page(() => import('@/pages/search.vue')),
	reuseOnPropsChange: ['query', 'type'],
	query: {
		q: 'query',
		userId: 'userId',
		username: 'username',
		host: 'host',
		channel: 'channel',
		type: 'type',
		origin: 'origin',
	},
}, {
	// Legacy Compatibility
	path: '/authorize-follow',
	redirect: '/lookup',
	loginRequired: true,
}, {
	// Mastodon Compatibility
	path: '/authorize_interaction',
	redirect: '/lookup',
	loginRequired: true,
}, {
	path: '/lookup',
	component: page(() => import('@/pages/lookup.vue')),
	loginRequired: true,
}, {
	path: '/share',
	component: page(() => import('@/pages/share.vue')),
	loginRequired: true,
}, {
	path: '/api-console',
	component: page(() => import('@/pages/api-console.vue')),
	loginRequired: true,
}, {
	path: '/scratchpad',
	component: page(() => import('@/pages/scratchpad.vue')),
}, {
	path: '/preview',
	component: page(() => import('@/pages/preview.vue')),
}, {
	path: '/auth/:token',
	component: page(() => import('@/pages/auth.vue')),
}, {
	path: '/miauth/:session',
	component: page(() => import('@/pages/miauth.vue')),
	query: {
		callback: 'callback',
		name: 'name',
		icon: 'icon',
		permission: 'permission',
	},
}, {
	path: '/oauth/authorize',
	component: page(() => import('@/pages/oauth.vue')),
}, {
	path: '/tags/:tag',
	component: page(() => import('@/pages/tag.vue')),
}, {
	path: '/pages/new',
	component: page(() => import('@/pages/page-editor/page-editor.vue')),
	loginRequired: true,
}, {
	path: '/pages/edit/:initPageId',
	component: page(() => import('@/pages/page-editor/page-editor.vue')),
	loginRequired: true,
}, {
	path: '/pages',
	component: page(() => import('@/pages/pages.vue')),
}, {
	path: '/play/:id/edit',
	component: page(() => import('@/pages/flash/flash-edit.vue')),
	loginRequired: true,
}, {
	path: '/play/new',
	component: page(() => import('@/pages/flash/flash-edit.vue')),
	loginRequired: true,
}, {
	path: '/play/:id',
	component: page(() => import('@/pages/flash/flash.vue')),
}, {
	path: '/play',
	component: page(() => import('@/pages/flash/flash-index.vue')),
}, {
	path: '/gallery/:postId/edit',
	component: page(() => import('@/pages/gallery/edit.vue')),
	loginRequired: true,
}, {
	path: '/gallery/new',
	component: page(() => import('@/pages/gallery/edit.vue')),
	loginRequired: true,
}, {
	path: '/gallery/:postId',
	component: page(() => import('@/pages/gallery/post.vue')),
}, {
	path: '/gallery',
	component: page(() => import('@/pages/gallery/index.vue')),
}, {
	path: '/channels/:channelId/edit',
	component: page(() => import('@/pages/channel-editor.vue')),
	loginRequired: true,
}, {
	path: '/channels/:channelId/members',
	component: page(() => import('@/pages/channel-members.vue')),
}, {
	path: '/channels/new',
	component: page(() => import('@/pages/channel-editor.vue')),
	loginRequired: true,
}, {
	// 子路径写死，避免与 /channels/:channelId 冲突；结构同设置页，外框不随子页面重建
	path: '/channels',
	component: page(() => import('@/pages/channels/index.vue')),
	reuseOnPropsChange: [],
	children: [{
		path: '/search',
		name: 'search',
		component: page(() => import('@/pages/channels/search.vue')),
	}, {
		path: '/favorites',
		name: 'favorites',
		component: page(() => import('@/pages/channels/favorites.vue')),
	}, {
		path: '/following',
		name: 'following',
		component: page(() => import('@/pages/channels/following.vue')),
	}, {
		path: '/owned',
		name: 'owned',
		component: page(() => import('@/pages/channels/owned.vue')),
	}, {
		path: '/',
		name: 'featured',
		component: page(() => import('@/pages/channels/featured.vue')),
	}],
}, {
	path: '/channels/:channelId',
	component: page(() => import('@/pages/channel.vue')),
}, {
	path: '/custom-emojis-manager',
	component: page(() => import('@/pages/custom-emojis-manager.vue')),
}, {
	path: '/avatar-decorations',
	name: 'avatarDecorations',
	component: page(() => import('@/pages/avatar-decorations.vue')),
}, {
	path: '/registry/keys/:domain/:path(*)?',
	component: page(() => import('@/pages/registry.keys.vue')),
}, {
	path: '/registry/value/:domain/:path(*)?',
	component: page(() => import('@/pages/registry.value.vue')),
}, {
	path: '/registry',
	component: page(() => import('@/pages/registry.vue')),
}, {
	path: '/install-extentions',
	redirect: '/install-extensions',
	loginRequired: true,
}, {
	path: '/install-extensions',
	component: page(() => import('@/pages/install-extensions.vue')),
	loginRequired: true,
}, {
	path: '/admin/user/:userId',
	component: iAmModerator ? page(() => import('@/pages/admin-user.vue')) : page(() => import('@/pages/not-found.vue')),
}, {
	path: '/admin/file/:fileId',
	component: iAmModerator ? page(() => import('@/pages/admin-file.vue')) : page(() => import('@/pages/not-found.vue')),
}, {
	path: '/admin',
	component: iAmModerator ? page(() => import('@/pages/admin/index.vue')) : page(() => import('@/pages/not-found.vue')),
	children: [{
		path: '/overview',
		name: 'overview',
		component: page(() => import('@/pages/admin/overview.vue')),
	}, {
		path: '/users',
		name: 'users',
		component: page(() => import('@/pages/admin/users.vue')),
	}, {
		path: '/checkin',
		redirect: '/admin/benefits',
	}, {
		path: '/wallet',
		name: 'wallet',
		component: iAmAdmin ? page(() => import('@/pages/admin/wallet.vue')) : page(() => import('@/pages/not-found.vue')),
	}, {
		path: '/benefits',
		name: 'benefits',
		component: iAmAdmin ? page(() => import('@/pages/admin/benefits.vue')) : page(() => import('@/pages/not-found.vue')),
	}, {
		path: '/emojis',
		name: 'emojis',
		component: page(() => import('@/pages/custom-emojis-manager.vue')),
	}, {
		path: '/emojis2',
		name: 'emojis2',
		component: page(() => import('@/pages/admin/custom-emojis-manager2.vue')),
	}, {
		path: '/avatar-decorations',
		name: 'avatarDecorations',
		component: page(() => import('@/pages/avatar-decorations.vue')),
	}, {
		path: '/federation-job-queue',
		name: 'federationJobQueue',
		component: page(() => import('@/pages/admin/federation-job-queue.vue')),
	}, {
		path: '/job-queue',
		name: 'jobQueue',
		component: page(() => import('@/pages/admin/job-queue.vue')),
	}, {
		path: '/files',
		name: 'files',
		component: page(() => import('@/pages/admin/files.vue')),
	}, {
		path: '/federation',
		name: 'federation',
		component: page(() => import('@/pages/admin/federation.vue')),
	}, {
		path: '/announcements',
		name: 'announcements',
		component: page(() => import('@/pages/admin/announcements.vue')),
	}, {
		path: '/ads',
		name: 'ads',
		component: page(() => import('@/pages/admin/ads.vue')),
	}, {
		path: '/roles/:id/edit',
		name: 'roles',
		component: page(() => import('@/pages/admin/roles.edit.vue')),
	}, {
		path: '/roles/new',
		name: 'roles',
		component: page(() => import('@/pages/admin/roles.edit.vue')),
	}, {
		path: '/roles/:id',
		name: 'roles',
		component: page(() => import('@/pages/admin/roles.role.vue')),
	}, {
		path: '/roles',
		name: 'roles',
		component: page(() => import('@/pages/admin/roles.vue')),
	}, {
		path: '/database',
		name: 'database',
		component: page(() => import('@/pages/admin/database.vue')),
	}, {
		path: '/abuses',
		name: 'abuses',
		component: page(() => import('@/pages/admin/abuses.vue')),
	}, {
		path: '/modlog',
		name: 'modlog',
		component: page(() => import('@/pages/admin/modlog.vue')),
	}, {
		path: '/settings',
		name: 'settings',
		component: page(() => import('@/pages/admin/settings.vue')),
	}, {
		path: '/article-categories',
		name: 'article-categories',
		component: page(() => import('@/pages/admin/article-categories.vue')),
	}, {
		path: '/payments',
		name: 'payments',
		component: page(() => import('@/pages/admin/payments.vue')),
	}, {
		path: '/branding',
		name: 'branding',
		component: page(() => import('@/pages/admin/branding.vue')),
	}, {
		path: '/moderation',
		name: 'moderation',
		component: page(() => import('@/pages/admin/moderation.vue')),
	}, {
		path: '/email-settings',
		name: 'email-settings',
		component: page(() => import('@/pages/admin/email-settings.vue')),
	}, {
		path: '/object-storage',
		name: 'object-storage',
		component: page(() => import('@/pages/admin/object-storage.vue')),
	}, {
		path: '/security',
		name: 'security',
		component: page(() => import('@/pages/admin/security.vue')),
	}, {
		path: '/relays',
		name: 'relays',
		component: page(() => import('@/pages/admin/relays.vue')),
	}, {
		path: '/external-services',
		name: 'external-services',
		component: page(() => import('@/pages/admin/external-services.vue')),
	}, {
		path: '/performance',
		name: 'performance',
		component: page(() => import('@/pages/admin/performance.vue')),
	}, {
		path: '/invites',
		name: 'invites',
		component: page(() => import('@/pages/admin/invites.vue')),
	}, {
		path: '/abuse-report-notification-recipient',
		name: 'abuse-report-notification-recipient',
		component: page(() => import('@/pages/admin/abuse-report/notification-recipient.vue')),
	}, {
		path: '/system-webhook',
		name: 'system-webhook',
		component: page(() => import('@/pages/admin/system-webhook.vue')),
	}, {
		path: '/',
		component: page(() => import('@/pages/_empty_.vue')),
	}],
}, {
	path: '/my/notifications',
	name: 'notifications',
	component: page(() => import('@/pages/notifications/index.vue')),
	loginRequired: true,
	reuseOnPropsChange: [],
	// 具体路径必须排在 /:initialTab? 前面，否则会被当作通知分类。
	children: [{
		path: '/follow-requests',
		component: page(() => import('@/pages/follow-requests.vue')),
	}, {
		path: '/announcements',
		component: page(() => import('@/pages/announcements.vue')),
	}, {
		path: '/:initialTab?',
		component: page(() => import('@/pages/notifications.vue')),
		reuseOnPropsChange: ['initialTab'],
	}],
}, {
	path: '/my/follow-requests',
	redirect: '/my/notifications/follow-requests',
	loginRequired: true,
}, {
	path: '/timeline/list/:listId',
	component: page(() => import('@/pages/user-list-timeline.vue')),
	loginRequired: true,
}, {
	path: '/timeline/antenna/:antennaId',
	component: page(() => import('@/pages/antenna-timeline.vue')),
	loginRequired: true,
}, {
	path: '/clicker',
	component: page(() => import('@/pages/clicker.vue')),
	loginRequired: true,
}, {
	path: '/games',
	component: page(() => import('@/pages/games.vue')),
	loginRequired: false,
}, {
	path: '/bubble-game',
	component: page(() => import('@/pages/drop-and-fusion.vue')),
	loginRequired: true,
}, {
	path: '/reversi',
	component: page(() => import('@/pages/reversi/index.vue')),
	loginRequired: false,
}, {
	path: '/reversi/g/:gameId',
	component: page(() => import('@/pages/reversi/game.vue')),
	loginRequired: false,
}, {
	path: '/qr',
	component: page(() => import('@/pages/qr.vue')),
	loginRequired: true,
}, {
	path: '/debug',
	component: page(() => import('@/pages/debug.vue')),
	loginRequired: false,
}, {
	// テスト用リダイレクト設定。ログイン中ユーザのプロフィールにリダイレクトする
	path: '/redirect-test',
	redirect: $i ? `@${$i.username}` : '/',
	loginRequired: true,
}, {
	path: '/:(*)',
	component: page(() => import('@/pages/not-found.vue')),
}] as const satisfies RouteDef[];
