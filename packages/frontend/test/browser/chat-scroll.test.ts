/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, defineComponent, h, KeepAlive, nextTick, ref } from 'vue';
import type { App } from 'vue';
import type * as Misskey from 'misskey-js';
import type { MenuItem } from '@/types/menu.js';
import '@/style.scss';
import ChatRoom from '@/pages/chat/room.vue';
import PageWithHeader from '@/components/global/PageWithHeader.vue';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import { DI } from '@/di.js';
import { animateChatMessageDisintegration } from '@/utility/chat-message-disintegrate.js';
import { cacheChatConversationTitle } from '@/utility/chat-conversations.js';
import { i18n } from '@/i18n.js';
import { appearDirective } from '@/directives/appear.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	animation: false,
	routeListeners: new Map<string, () => void>(),
	globalListeners: new Map<string, (...args: any[]) => void>(),
	appearCallbacks: new Map<HTMLElement, () => Promise<void>>(),
	account: { id: 'self', username: 'self', host: null, onlineStatusOverride: 'online', policies: { chatAvailability: 'available' } },
	connection: { on: vi.fn(), send: vi.fn(), dispose: vi.fn() },
	toast: vi.fn(), push: vi.fn(),
	deleteSound: vi.fn(),
	popup: vi.fn(),
	popupMenu: vi.fn(),
	selectUser: vi.fn(),
}));

vi.mock('misskey-js', () => ({}));
vi.mock('@/accounts.js', () => ({ getAccountMenu: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: mocks.account, ensureSignin: () => mocks.account }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/sound.js', () => ({ playMisskeySfx: vi.fn(), playChatMessageDeleteSfx: mocks.deleteSound }));
vi.mock('@/os.js', () => ({ alert: vi.fn(), toast: mocks.toast, popup: mocks.popup, selectUser: mocks.selectUser, popupMenu: mocks.popupMenu, apiWithDialog: (endpoint: string, params: unknown) => mocks.api(endpoint, params) }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ push: mocks.push, useListener: (event: string, callback: () => void) => mocks.routeListeners.set(event, callback) }) }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/events.js', () => ({ globalEvents: { emit: (event: string, ...args: any[]) => mocks.globalListeners.get(event)?.(...args) }, useGlobalEvent: (event: string, callback: (...args: any[]) => void) => mocks.globalListeners.set(event, callback) }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/composables/use-user-statistics.js', () => ({ useUserStatistics: vi.fn() }));
vi.mock('@/composables/use-user-statistics-visibility.js', () => ({ useUserStatisticsVisibility: vi.fn() }));
vi.mock('@/stream.js', () => ({ useStream: () => ({ useChannel: () => mocks.connection }) }));
vi.mock('@/preferences.js', () => ({ prefer: {
	s: { get animation() { return mocks.animation; }, enableHorizontalSwipe: true, showPageTabBarBottom: false },
	r: { animation: { value: false }, enableHorizontalSwipe: { value: true } },
} }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	chat: '聊天', more: '更多', goBack: '返回', search: '搜索', info: '信息', loading: '加载中', permissionDeniedErrorDescription: '当前账户无权执行此操作。',
	_chat: { searchMessages: '搜索聊天记录', invitationMutualOnly: '对方只允许互相关注的人发起聊天', invitationDisabled: '群聊已禁止加入，无法邀请用户。', inviteUser: '邀请用户', roomFull: '群聊已满', members: '成员', modify: '修改', noMessagesYet: '暂无消息', newMessage: '新消息', latestMessages: '最新消息', lastReadPosition: '上次阅读位置', notMemberOfRoom: '你不是该群聊的成员。', join: '加入', unreadMentions: '有人 @ 我' },
}, tsx: { _chat: {
	unreadMessages: ({ count }: { count: number }) => `${count} 条未读消息`,
} } } }));
vi.mock('@/pages/chat/XMessage.vue', async () => {
	const { defineComponent, h: createNode } = await import('vue');
	return { default: defineComponent({
		props: { message: { type: Object, required: true } },
		emits: ['showReply'],
		setup: (props, { emit }) => () => createNode('article', {
			'data-chat-message-id': props.message.id,
			tabindex: -1,
			style: 'height:72px;box-sizing:border-box;padding:12px;background:#fff;',
		}, createNode('button', { type: 'button', onClick: () => {
			if (props.message.reply) emit('showReply', props.message.reply.id);
		} }, props.message.text)),
	}) };
});
vi.mock('@/pages/chat/room.form.vue', async () => {
	const { h: createNode } = await import('vue');
	return { default: { render: () => createNode('textarea', {
		'aria-label': '消息输入框',
		style: 'display:block;width:100%;height:80px;box-sizing:border-box;resize:none;',
	}) } };
});
vi.mock('@/pages/chat/room.search.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/room.members.vue', async () => {
	const { h: createNode } = await import('vue');
	return { default: { render: () => createNode('div', '房间成员') } };
});
vi.mock('@/pages/chat/room.info.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/room.sidebar.vue', () => ({ default: { render: () => null } }));

const fixtures: { app: App; host: HTMLElement }[] = [];
const peer = { id: 'peer', username: 'peer', name: '聊天用户', host: null, avatarUrl: '', avatarBlurhash: null, avatarDecorations: [], emojis: {}, onlineStatus: 'unknown' as const };

function makeMessage(id: string, own = false): Misskey.entities.ChatMessageLite {
	return {
		id, text: `消息 ${id}`, fromUserId: own ? mocks.account.id : peer.id,
		fromUser: own ? mocks.account : peer, reactions: [], createdAt: '2026-10-03T00:00:00Z', editedAt: null, isAutoReply: false,
	} as unknown as Misskey.entities.ChatMessageLite;
}

async function nextFrame() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
}

async function mountChat(count = 24, options: { userId?: string; startAtLatest?: boolean; expectedCount?: number; roomReady?: Promise<void>; timeline?: (params: Record<string, any>) => Misskey.entities.ChatMessageLite[]; timelineReady?: Promise<void>; historyReady?: Promise<void>; initialMessages?: Misskey.entities.ChatMessageLite[]; history?: Misskey.entities.ChatMessageLite[]; keepAlive?: boolean; observeHistory?: boolean; roomInfo?: Partial<Misskey.entities.ChatRoom>; unread?: { count: number; firstMessageId: string; firstMentionId: string | null; lastMessageId: string } } = {}) {
	if (options.history && !options.unread) localStorage.setItem('chat-scroll:self:room:room', JSON.stringify({ anchorId: '1', beforeId: 'previous', sinceDate: 1, offset: 0 }));
	mocks.api.mockImplementation(async (endpoint, params) => {
		if (endpoint === 'users/show') return { ...peer, canChat: true };
		if (endpoint === 'chat/unread') return options.unread ?? { count: 0, firstMessageId: null, firstMentionId: null, lastMessageId: null };
		if (endpoint === 'chat/rooms/show') {
			await options.roomReady;
			return { id: 'room', name: '聊天室', ownerId: mocks.account.id, owner: mocks.account, memberCount: 2, ...options.roomInfo };
		}
		if (endpoint === 'chat/messages/room-timeline' || endpoint === 'chat/messages/user-timeline') {
			if (options.timeline) return options.timeline(params);
			if (params.untilId) {
				await options.historyReady;
				return options.history ?? [];
			}
			await options.timelineReady;
			const batch = options.initialMessages ?? Array.from({ length: count }, (_, index) => makeMessage(String(count - index)));
			return params.sinceId || params.sinceDate ? batch.toReversed() : batch;
		}
		return [];
	});
	const host = document.createElement('div');
	host.dataset.testid = 'chat-scroll-fixture';
	host.className = '_pageContent';
	host.style.cssText = 'width:calc(100% - 32px);max-width:880px;height:600px;margin:16px;--MI-pageHeaderBorder:none;--MI_THEME-panel:#fff;--MI_THEME-panelHighlight:#f3f4f6;--MI_THEME-fg:#333;--MI_THEME-accent:#86b300;--MI_THEME-pageHeaderBg:#fff;--MI_THEME-pageHeaderFg:#333;--MI_THEME-divider:#ddd;--MI_THEME-scrollbarHandle:#789;--MI_THEME-scrollbarHandleHover:#456;';
	document.body.append(host);
	const active = ref(true);
	const conversationProps = options.userId ? { userId: options.userId } : { roomId: 'room' };
	const app = createApp({ render: () => options.keepAlive
		? h(KeepAlive, {}, () => active.value ? h(ChatRoom, conversationProps) : null)
		: h(ChatRoom, conversationProps),
	});
	app.provide(DI.pageMetadata, ref({ title: '聊天室' }));
	app.component('PageWithHeader', PageWithHeader);
	app.component('MkPageHeader', MkPageHeader);
	app.component('MkStickyContainer', MkStickyContainer);
	// eslint-disable-next-line vue/multi-word-component-names
	app.component('Mfm', defineComponent({
		props: { text: { type: String, default: '' } },
		setup: props => () => h('span', props.text),
	}));
	for (const name of ['MkLoading', 'MkAvatar', 'MkUserName', 'MkError']) app.component(name, { render: () => null });
	app.directive('tooltip', () => {});
	app.directive('appear', options.observeHistory ? appearDirective : {
		mounted: (element, binding) => {
			const callback = binding.value;
			if (callback) mocks.appearCallbacks.set(element, async () => { await callback(); });
		},
		unmounted: element => { mocks.appearCallbacks.delete(element); },
	});
	app.mount(host);
	fixtures.push({ app, host });
	await expect.poll(() => host.querySelectorAll('[data-chat-message-id]').length).toBe(options.expectedCount ?? count);
	if (options.roomInfo?.isMember === false) {
		await expect.element(page.elementLocator(host).getByText('你不是该群聊的成员。', { exact: true })).toBeVisible();
	} else {
		await expect.element(page.elementLocator(host).getByRole('textbox', { name: '消息输入框' })).toBeVisible();
	}
	await nextFrame();
	await nextFrame();
	const root = host.firstElementChild as HTMLElement;
	const header = host.querySelector<HTMLElement>('[data-page-header]')!;
	const composer = host.querySelector<HTMLTextAreaElement>('textarea')!;
	const conversation = findConversation(host);
	expect(conversation).toBeDefined();
	if (options.startAtLatest !== false) {
		conversation.scrollTop = conversation.scrollHeight;
		await nextFrame();
		await nextFrame();
	}
	return { host, root, header, composer, conversation, active, async setActive(value: boolean) {
		active.value = value;
		await nextFrame();
		await nextFrame();
		if (value) await expect.poll(() => getComputedStyle(findConversation(host).firstElementChild!).visibility).toBe('visible');
	} };
}

async function openHeaderMenu(header: HTMLElement): Promise<MenuItem[]> {
	await page.elementLocator(header).getByRole('button', { name: i18n.ts.more, exact: true }).click();
	return mocks.popupMenu.mock.lastCall![0];
}

async function chooseHeaderMenu(header: HTMLElement, text: string) {
	const items = await openHeaderMenu(header);
	const item = items.find(item => 'text' in item && item.text === text && 'action' in item);
	if (!item || !('action' in item)) throw new Error('Missing menu action: ' + text);
	item.action(new PointerEvent('click'));
	await nextTick();
}

function findConversation(host: HTMLElement) {
	return Array.from(host.querySelectorAll<HTMLElement>('[data-page-body] div')).find(element => getComputedStyle(element).overflowY === 'auto')!;
}

function bottomDistance(scroller: HTMLElement) {
	return Math.abs(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop);
}

function thumbColor(element: HTMLElement) {
	return getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor;
}

function expectVisibleThumb(element: HTMLElement) {
	expect(['rgb(119, 136, 153)', 'rgb(68, 85, 102)']).toContain(thumbColor(element));
}

function pauseNextAnimation(element: HTMLElement): Promise<Animation> {
	const animate = element.animate.bind(element);
	return new Promise(resolve => {
		vi.spyOn(element, 'animate').mockImplementation((keyframes, options) => {
			const animation = animate(keyframes, options);
			animation.pause();
			resolve(animation);
			return animation;
		});
	});
}

beforeEach(async () => {
	localStorage.clear();
	vi.clearAllMocks();
	vi.spyOn(window.document, 'hasFocus').mockReturnValue(true);
	mocks.popup.mockReturnValue({ dispose: vi.fn() });
	mocks.selectUser.mockReset().mockResolvedValue(null);
	mocks.animation = false;
	mocks.routeListeners.clear();
	mocks.globalListeners.clear();
	mocks.appearCallbacks.clear();
	await page.viewport(1000, 900);
	window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
});

afterEach(async () => {
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
	await nextFrame();
	vi.mocked(window.document.hasFocus).mockRestore();
});

describe('chat conversation scrolling', () => {
	test.each(['owner', 'administrator', 'member', 'closed'] as const)('顶部和菜单按 %s 权限显示唯一入口', async role => {
		const roomInfo: Partial<Misskey.entities.ChatRoom> = role === 'closed' ? { joinPolicy: 'closed' } : role === 'owner' ? {} : { ownerId: 'other', myRole: role };
		const { header } = await mountChat(0, { roomInfo });
		const items = await openHeaderMenu(header);
		const labels = items.flatMap(item => 'text' in item ? [item.text] : []);
		expect(labels.includes(i18n.ts._chat.modify)).toBe(role !== 'member');
		expect(labels.includes(i18n.ts._chat.inviteUser)).toBe(role === 'owner' || role === 'administrator');
		for (const duplicate of [i18n.ts._chat.members, i18n.ts._chat.searchMessages, i18n.ts.chat]) expect(labels).not.toContain(duplicate);
		expect(Array.from(header.querySelectorAll('button')).map(button => button.getAttribute('aria-label'))).toEqual(['聊天室', i18n.ts.search, i18n.ts._chat.members, i18n.ts.more]);
	});

	test('私聊单选一位新成员，失败只提示原因，再次选择成功后进入新群', async () => {
		const { header } = await mountChat(0, { userId: peer.id });
		const added = { ...peer, id: 'added', name: '新成员' };
		mocks.selectUser.mockResolvedValue(added);
		const originalApi = mocks.api.getMockImplementation()!;
		let creations = 0;
		mocks.api.mockImplementation(async (endpoint, params) => {
			if (endpoint === 'chat/rooms/create') {
				if (++creations === 1) throw Object.assign(new Error('privacy'), { code: 'INVALID_INVITEES', info: { reason: 'privacy', userId: added.id, chatScope: 'mutual' } });
				return { id: 'created' };
			}
			return originalApi(endpoint, params);
		});
		await chooseHeaderMenu(header, i18n.ts._chat.inviteUser);
		await expect.poll(() => creations).toBe(1);
		expect(mocks.popup).not.toHaveBeenCalled();
		expect(mocks.selectUser.mock.lastCall![0]).toMatchObject({ title: i18n.ts._chat.inviteUser, excludeUserIds: ['self', 'peer'] });
		expect(mocks.selectUser.mock.lastCall![0].multiple).toBeUndefined();
		expect(mocks.push).not.toHaveBeenCalled();
		await expect.poll(() => mocks.toast.mock.calls).toEqual([[i18n.ts._chat.invitationMutualOnly, 'error']]);
		await chooseHeaderMenu(header, i18n.ts._chat.inviteUser);
		await expect.poll(() => mocks.push.mock.lastCall).toEqual(['/chat/room/:roomId', { params: { roomId: 'created' } }]);
		expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'chat/rooms/create').map(([, params]) => params)).toEqual([
			{ initialUserIds: ['peer', 'added'] }, { initialUserIds: ['peer', 'added'] },
		]);
	});

	test('私聊邀请取消时不创建群，再次点击仍可打开单选面板', async () => {
		const { header } = await mountChat(0, { userId: peer.id });
		await chooseHeaderMenu(header, i18n.ts._chat.inviteUser);
		await nextFrame();
		expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'chat/rooms/create')).toBe(false);
		await chooseHeaderMenu(header, i18n.ts._chat.inviteUser);
		await expect.poll(() => mocks.selectUser.mock.calls.length).toBe(2);
		expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'chat/rooms/create')).toBe(false);
	});

	test('切换离开私聊会取消正在选择的邀请，不在旧会话创建群', async () => {
		const { header, setActive } = await mountChat(0, { userId: peer.id, keepAlive: true });
		let finish!: (user: unknown) => void;
		mocks.selectUser.mockReturnValue(new Promise(resolve => { finish = resolve; }));
		await chooseHeaderMenu(header, i18n.ts._chat.inviteUser);
		const signal = mocks.selectUser.mock.lastCall![0].signal as AbortSignal;
		await setActive(false);
		expect(signal.aborted).toBe(true);
		finish({ ...peer, id: 'added' });
		await nextFrame();
		expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'chat/rooms/create')).toBe(false);
	});

	test('群聊一次只邀请一人，失败只显示原因，选择期间不重复打开面板', async () => {
		const { header } = await mountChat(0, { roomInfo: { memberCount: 48 } });
		const baseApi = mocks.api.getMockImplementation()!;
		const sent = new Set<string>();
		let firstAttempt = true;
		mocks.api.mockImplementation(async (endpoint, params) => {
			if (endpoint === 'chat/rooms/members') return [{ userId: 'existing' }];
			if (endpoint === 'chat/rooms/invitations/outbox') return [...sent].map(userId => ({ id: `invitation-${userId}`, userId }));
			if (endpoint === 'chat/rooms/invitations/create') {
				if (params.userId === 'beta' && firstAttempt) { firstAttempt = false; throw Object.assign(new Error('privacy'), { code: 'INVALID_INVITEE', info: { reason: 'privacy', userId: 'beta', chatScope: 'mutual' } }); }
				sent.add(params.userId);
				return { id: `invitation-${params.userId}`, userId: params.userId };
			}
			return baseApi(endpoint, params);
		});
		const beta = { id: 'beta', username: 'beta', name: 'Beta', host: null };
		let finishSelection!: (user: unknown) => void;
		mocks.selectUser.mockReturnValueOnce(new Promise(resolve => { finishSelection = resolve; })).mockResolvedValueOnce(beta);
		await chooseHeaderMenu(header, i18n.ts._chat.inviteUser);
		await expect.poll(() => mocks.selectUser.mock.calls.length).toBe(1);
		expect(mocks.selectUser).toHaveBeenLastCalledWith({ title: i18n.ts._chat.inviteUser, includeSelf: false, localOnly: true, signal: expect.any(AbortSignal) });
		await chooseHeaderMenu(header, i18n.ts._chat.inviteUser);
		expect(mocks.selectUser).toHaveBeenCalledOnce();
		expect(mocks.toast).toHaveBeenCalledWith(i18n.ts.loading);
		finishSelection(beta);
		await expect.poll(() => mocks.toast.mock.calls.filter(([text]) => text !== i18n.ts.loading)).toEqual([[i18n.ts._chat.invitationMutualOnly, 'error']]);
		await chooseHeaderMenu(header, i18n.ts._chat.inviteUser);
		await expect.poll(() => sent.has('beta')).toBe(true);
		expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'chat/rooms/invitations/create').map(([, params]) => params.userId)).toEqual(['beta', 'beta']);
	});

	test('公开群非成员直链仅显示群信息，加入成功后才加载消息与订阅', async () => {
		const roomInfo = { id: 'room', name: '聊天室', ownerId: 'other', memberCount: 2, joinPolicy: 'public', isMember: false } as const;
		const { host, header } = await mountChat(0, { roomInfo });
		expect(host.querySelector('textarea')).toBeNull();
		expect(mocks.api.mock.calls.map(([endpoint]) => endpoint)).toEqual(['chat/conversations', 'chat/rooms/show']);
		expect(mocks.connection.on).not.toHaveBeenCalled();
		for (const name of [i18n.ts._chat.members, i18n.ts._chat.searchMessages, i18n.ts._chat.modify, i18n.ts.more]) {
			await expect.element(page.elementLocator(header).getByRole('button', { name, exact: true })).not.toBeInTheDocument();
		}
		mocks.api.mockImplementation(async endpoint => endpoint === 'chat/rooms/show' ? { ...roomInfo, isMember: true } : []);
		await page.elementLocator(host).getByRole('button', { name: '加入', exact: true }).click();
		await expect.element(page.elementLocator(host).getByRole('textbox', { name: '消息输入框' })).toBeVisible();
		expect(mocks.api).toHaveBeenCalledWith('chat/rooms/join', { roomId: 'room' });
		expect(mocks.api).toHaveBeenCalledWith('chat/messages/room-timeline', { roomId: 'room', limit: 30, markAsRead: false });
		expect(mocks.connection.on.mock.calls.some(([event]) => event === 'message')).toBe(true);
	});

	test('删除最后一条消息先消散，再收拢占位，最后移除消息', async () => {
		mocks.animation = true;
		const { host } = await mountChat(1);
		const message = host.querySelector<HTMLElement>('[data-chat-message-id="1"]')!;
		const row = message.parentElement!;
		const originalHeight = row.getBoundingClientRect().height;
		// 收拢只有140ms，创建时暂停原生动画，避免轮询错过整个阶段。
		const collapseCreated = pauseNextAnimation(row);
		const onDeleted = mocks.connection.on.mock.calls.find(([event]) => event === 'deleted')![1];
		const deleting = onDeleted('1');
		const overlay = document.querySelector<HTMLElement>('[data-chat-message-disintegrate-overlay]')!;
		expect(overlay).not.toBeNull();
		expect(overlay.getAttribute('aria-hidden')).toBe('true');
		expect(overlay.hasAttribute('inert')).toBe(true);
		expect(message.isConnected).toBe(true);
		const fragments = Array.from(overlay.querySelectorAll<HTMLElement>('[data-chat-message-disintegrate-fragment]'));
		expect(fragments.length).toBeGreaterThan(1);
		for (const fragment of fragments) {
			const animation = fragment.getAnimations()[0];
			expect(animation).toBeDefined();
			animation.pause();
			animation.currentTime = 200;
			expect(getComputedStyle(fragment).transform).not.toBe('none');
			animation.finish();
		}
		const collapse = await collapseCreated;
		expect(row.getAnimations()).toHaveLength(1);
		expect(message.isConnected).toBe(true);
		expect(document.querySelector('[data-chat-message-disintegrate-overlay]')).toBeNull();
		collapse.currentTime = 70;
		expect(row.getBoundingClientRect().height).toBeLessThan(originalHeight);
		expect(row.getBoundingClientRect().height).toBeGreaterThan(0);
		collapse.finish();
		await deleting;
		await nextFrame();
		expect(message.isConnected).toBe(false);
		expect(document.querySelector('[data-chat-message-disintegrate-overlay]')).toBeNull();
		await expect.element(page.elementLocator(host).getByText('暂无消息', { exact: true })).toBeVisible();
	});

	test('删除某天唯一消息时同步收拢消失的日期行，保留仍存在的边界且移除后不跳位', async () => {
		mocks.animation = true;
		const initialMessages = [
			{ ...makeMessage('newest'), createdAt: '2026-10-04T12:00:00Z' },
			{ ...makeMessage('single-day'), createdAt: '2026-10-03T12:00:00Z' },
			{ ...makeMessage('oldest'), createdAt: '2026-10-02T12:00:00Z' },
		];
		const { host } = await mountChat(3, { initialMessages });
		const message = host.querySelector<HTMLElement>('[data-chat-message-id="single-day"]')!;
		const row = message.parentElement!;
		const retainedDivider = row.previousElementSibling as HTMLElement;
		const removedDivider = row.nextElementSibling as HTMLElement;
		const newest = host.querySelector<HTMLElement>('[data-chat-message-id="newest"]')!;
		expect(host.querySelectorAll('[data-chat-date-divider]')).toHaveLength(2);
		const dividerHeight = removedDivider.getBoundingClientRect().height;
		const rowCollapseCreated = pauseNextAnimation(row);
		const dividerCollapseCreated = pauseNextAnimation(removedDivider);
		const onDeleted = mocks.connection.on.mock.calls.find(([event]) => event === 'deleted')![1];
		const deleting = onDeleted('single-day');
		for (const fragment of document.querySelectorAll<HTMLElement>('[data-chat-message-disintegrate-fragment]')) fragment.getAnimations()[0].finish();
		const collapses = await Promise.all([rowCollapseCreated, dividerCollapseCreated]);
		expect(message.isConnected).toBe(true);
		expect(removedDivider.isConnected).toBe(true);
		expect(retainedDivider.getAnimations()).toHaveLength(0);
		for (const animation of collapses) animation.currentTime = 70;
		expect(removedDivider.getBoundingClientRect().height).toBeLessThan(dividerHeight);
		expect(removedDivider.getBoundingClientRect().height).toBeGreaterThan(0);
		for (const animation of collapses) animation.currentTime = 140;
		const newestTop = newest.getBoundingClientRect().top;
		for (const animation of collapses) animation.finish();
		await deleting;
		await nextFrame();
		expect(message.isConnected).toBe(false);
		expect(removedDivider.isConnected).toBe(false);
		expect(retainedDivider.isConnected).toBe(true);
		expect(host.querySelectorAll('[data-chat-date-divider]')).toHaveLength(1);
		expect(newest.getBoundingClientRect().top).toBeCloseTo(newestTop, 1);
	});

	test('只给实时新消息播放入场动画，初始消息和正在阅读的位置保持不动', async () => {
		mocks.animation = true;
		const { conversation } = await mountChat();
		const existing = Array.from(conversation.querySelectorAll<HTMLElement>('[data-chat-message-row]'));
		for (const row of existing) expect(row.getAnimations()).toHaveLength(0);
		conversation.scrollTop = 400;
		await nextFrame();
		const anchor = conversation.querySelector<HTMLElement>('[data-chat-message-id="20"]')!;
		const anchorTop = anchor.getBoundingClientRect().top;
		const onMessage = mocks.connection.on.mock.calls.find(([event]) => event === 'message')![1];
		onMessage(makeMessage('new-message'));
		await nextTick();
		const incoming = conversation.querySelector<HTMLElement>('[data-chat-message-row="new-message"]')!;
		expect(incoming.getAnimations({ subtree: true })).toHaveLength(1);
		for (const row of existing) expect(row.getAnimations()).toHaveLength(0);
		expect(anchor.getBoundingClientRect().top).toBeCloseTo(anchorTop, 1);
		expect(conversation.scrollTop).toBe(400);
		incoming.getAnimations({ subtree: true })[0].finish();
	});

	test('末尾删除让上方消息向下补位并淡入，移除占位后不再跳动', async () => {
		mocks.animation = true;
		const { conversation } = await mountChat();
		const deletedRow = conversation.querySelector<HTMLElement>('[data-chat-message-row="24"]')!;
		const aboveRow = conversation.querySelector<HTMLElement>('[data-chat-message-row="23"]')!;
		const originalTop = aboveRow.getBoundingClientRect().top;
		const collapseCreated = pauseNextAnimation(deletedRow);
		const fadeCreated = pauseNextAnimation(aboveRow);
		const onDeleted = mocks.connection.on.mock.calls.find(([event]) => event === 'deleted')![1];
		const deleting = onDeleted('24');
		for (const fragment of document.querySelectorAll<HTMLElement>('[data-chat-message-disintegrate-fragment]')) fragment.getAnimations()[0].finish();
		const collapse = await collapseCreated;
		collapse.currentTime = 70;
		const fade = await fadeCreated;
		fade.currentTime = 70;
		expect(aboveRow.getBoundingClientRect().top).toBeGreaterThan(originalTop);
		expect(Number(getComputedStyle(aboveRow).opacity)).toBeLessThan(1);
		collapse.currentTime = 140;
		await nextFrame();
		const settledTop = aboveRow.getBoundingClientRect().top;
		collapse.finish();
		await deleting;
		await nextFrame();
		expect(deletedRow.isConnected).toBe(false);
		expect(aboveRow.getBoundingClientRect().top).toBeCloseTo(settledTop, 1);
		fade.finish();
		await nextFrame();
		expect(getComputedStyle(aboveRow).opacity).toBe('1');
	});

	test('连续新消息不会叠加旧行淡入，离开缓存对话后恢复完整可见状态', async () => {
		mocks.animation = true;
		const { conversation, setActive } = await mountChat(24, { keepAlive: true });
		const oldRow = conversation.querySelector<HTMLElement>('[data-chat-message-row="24"]')!;
		const fadeCreated = pauseNextAnimation(oldRow);
		const onMessage = mocks.connection.on.mock.calls.find(([event]) => event === 'message')![1];
		onMessage(makeMessage('25'));
		const fade = await fadeCreated;
		fade.currentTime = 70;
		expect(Number(getComputedStyle(oldRow).opacity)).toBeLessThan(1);
		onMessage(makeMessage('26'));
		await nextFrame();
		expect(oldRow.getAnimations()).toEqual([fade]);
		await setActive(false);
		expect(fade.playState).toBe('idle');
		await setActive(true);
		expect(oldRow.getAnimations()).toHaveLength(0);
		expect(getComputedStyle(oldRow).opacity).toBe('1');
	});

	test.each([false, true])('末尾入场全程不改变滚动高度，旧消息和输入框不抖动，自己=%s', async own => {
		mocks.animation = true;
		const { conversation, composer } = await mountChat();
		const onMessage = mocks.connection.on.mock.calls.find(([event]) => event === 'message')![1];
		onMessage(makeMessage('new-message', own));
		await nextTick();
		const incoming = conversation.querySelector<HTMLElement>('[data-chat-message-row="new-message"]')!;
		const animation = incoming.getAnimations({ subtree: true })[0];
		animation.pause();
		await nextFrame();
		const old = conversation.querySelector<HTMLElement>('[data-chat-message-id="24"]')!;
		const top = old.getBoundingClientRect().top;
		let previousTop = top;
		const composerTop = composer.getBoundingClientRect().top;
		const height = conversation.scrollHeight;
		for (let frame = 0; frame < 16; frame++) {
			animation.currentTime = Math.min(180, frame * 16);
			await nextFrame();
			expect(conversation.scrollHeight).toBe(height);
			const currentTop = old.getBoundingClientRect().top;
			expect(currentTop).toBeLessThanOrEqual(previousTop + .1);
			previousTop = currentTop;
			expect(composer.getBoundingClientRect().top).toBeCloseTo(composerTop, 1);
		}
		expect(previousTop).toBeLessThan(top);
		animation.finish();
		await nextFrame();
		expect(bottomDistance(conversation)).toBeLessThan(1);
	});

	test('返回会话稳定恢复离开位置，向下阅读逐步减少未读，箭头跳转最新', async () => {
		localStorage.setItem('chat-scroll:self:room:room', JSON.stringify({ anchorId: '015', beforeId: '014', sinceDate: 1, offset: 0 }));
		const all = Array.from({ length: 60 }, (_, index) => makeMessage(String(index + 1).padStart(3, '0')));
		const { host, conversation } = await mountChat(30, {
			startAtLatest: false,
			unread: { count: 36, firstMessageId: '025', firstMentionId: null, lastMessageId: '060' },
			timeline: params => params.sinceId ? all.filter(message => message.id > params.sinceId).slice(0, params.limit)
				: all.filter(message => !params.untilId || message.id < params.untilId).toReversed().slice(0, params.limit),
		});
		const anchor = host.querySelector<HTMLElement>('[data-chat-message-row="015"]')!;
		expect(anchor.getBoundingClientRect().top - conversation.getBoundingClientRect().top).toBeCloseTo(0, 0);
		const down = page.elementLocator(host).getByRole('button', { name: '最新消息，36 条未读消息' });
		await expect.element(down).toBeVisible();
		const onDeleted = mocks.connection.on.mock.calls.find(([event]) => event === 'deleted')![1];
		await onDeleted('040');
		await expect.element(page.elementLocator(host).getByRole('button', { name: '最新消息，35 条未读消息' })).toBeVisible();
		const marker = host.querySelector<HTMLElement>('[data-chat-reading-marker]')!;
		conversation.scrollTop += marker.getBoundingClientRect().top - conversation.getBoundingClientRect().top;
		await nextFrame();
		const button = host.querySelector<HTMLButtonElement>('button[aria-label^="最新消息，"]')!;
		await expect.poll(() => Number(button.textContent)).toBeLessThan(35);
		expect(Number(button.textContent)).toBeGreaterThan(0);
		button.click();
		await expect.poll(() => bottomDistance(conversation)).toBeLessThan(1);
		await expect.poll(() => host.querySelector('button[aria-label^="最新消息，"]')).toBeNull();
		expect(host.querySelector('[data-chat-message-id="060"]')).not.toBeNull();
		expect(host.querySelector('[data-chat-message-id="040"]')).toBeNull();
	});

	test('初始最新消息加载期间收到的新消息仍保留且显示在末尾', async () => {
		let releaseTimeline!: () => void;
		const timelineReady = new Promise<void>(resolve => { releaseTimeline = resolve; });
		const mounting = mountChat(20, { startAtLatest: false, expectedCount: 21, timelineReady });
		try {
			await expect.poll(() => mocks.api.mock.calls.some(([endpoint]) => endpoint === 'chat/messages/room-timeline')).toBe(true);
			const onMessage = mocks.connection.on.mock.calls.find(([event]) => event === 'message')![1];
			onMessage(makeMessage('21'));
		} finally { releaseTimeline(); }
		const { host, conversation } = await mounting;
		expect(host.querySelector('[data-chat-message-id="21"]')).not.toBeNull();
		expect(bottomDistance(conversation)).toBeLessThan(1);
	});

	test.each(['015', '061'])('保存的锚点 %s 已删除时回退到可用消息并保存新位置', async anchorId => {
		const previousId = String(Number(anchorId) - 1).padStart(3, '0');
		localStorage.setItem('chat-scroll:self:room:room', JSON.stringify({ anchorId, beforeId: previousId, sinceDate: 1, offset: 0 }));
		const all = Array.from({ length: 60 }, (_, index) => makeMessage(String(index + 1).padStart(3, '0'))).filter(message => message.id !== anchorId);
		const { host, conversation } = await mountChat(30, {
			startAtLatest: false,
			timeline: params => params.sinceId ? all.filter(message => message.id > params.sinceId).slice(0, params.limit)
				: all.filter(message => !params.untilId || message.id < params.untilId).toReversed().slice(0, params.limit),
		});
		const fallbackId = anchorId === '015' ? '016' : '060';
		await expect.element(page.elementLocator(host).getByRole('button', { name: `消息 ${fallbackId}`, exact: true })).toBeVisible();
		if (anchorId === '015') {
			const fallback = host.querySelector<HTMLElement>('[data-chat-message-row="016"]')!;
			expect(fallback.getBoundingClientRect().top - conversation.getBoundingClientRect().top).toBeCloseTo(0, 0);
		} else {
			expect(mocks.api).toHaveBeenCalledWith('chat/messages/room-timeline', expect.objectContaining({ untilId: '061', markAsRead: false }));
		}
		window.dispatchEvent(new Event('pagehide'));
		const saved = JSON.parse(localStorage.getItem('chat-scroll:self:room:room')!);
		expect(saved.anchorId).not.toBe(anchorId);
		expect(host.querySelector(`[data-chat-message-id="${saved.anchorId}"]`)).not.toBeNull();
	});

	test('不足一屏的初始未读消息无需滚动即可确认已读', async () => {
		const { host } = await mountChat(2, {
			startAtLatest: false,
			initialMessages: [makeMessage('002'), makeMessage('001')],
			unread: { count: 2, firstMessageId: '001', firstMentionId: null, lastMessageId: '002' },
		});
		expect(mocks.connection.send).toHaveBeenCalledWith('read', { id: '002' });
		expect(host.querySelector('button[aria-label^="最新消息，"]')).toBeNull();
	});

	test.each([false, true])('刷新后媒体高度变化保留阅读方式，原先贴底=%s', async atBottom => {
		const first = await mountChat();
		if (!atBottom) first.conversation.scrollTop = 400;
		await nextFrame();
		window.dispatchEvent(new Event('pagehide'));
		expect(JSON.parse(localStorage.getItem('chat-scroll:self:room:room')!).atLatest).toBe(atBottom);
		const [oldFixture] = fixtures.splice(fixtures.findIndex(fixture => fixture.host === first.host), 1);
		oldFixture.app.unmount();
		oldFixture.host.remove();
		const { host, conversation } = await mountChat(24, { startAtLatest: false });
		const anchor = Array.from(conversation.querySelectorAll<HTMLElement>('[data-chat-message-row]')).find(row => row.getBoundingClientRect().bottom > conversation.getBoundingClientRect().top)!;
		const anchorTop = anchor.getBoundingClientRect().top;
		const latest = host.querySelector<HTMLElement>('[data-chat-message-id="24"]')!;
		latest.style.height = 'auto';
		const video = document.createElement('video');
		video.preload = 'none';
		video.style.cssText = 'display:block;width:100%;height:100px;';
		latest.append(video);
		await nextFrame();
		video.style.height = '360px';
		video.dispatchEvent(new Event('loadedmetadata'));
		await nextFrame();
		await nextFrame();
		if (atBottom) await expect.poll(() => bottomDistance(conversation)).toBeLessThan(1);
		else expect(anchor.getBoundingClientRect().top).toBeCloseTo(anchorTop, 1);
	});

	test.each(['resolve', 'reject'])('跳转最新请求在离开缓存会话后 %s，不替换原阅读窗口或提示旧错误', async result => {
		localStorage.setItem('chat-scroll:self:room:room', JSON.stringify({ anchorId: '015', beforeId: '014', sinceDate: 1, offset: 0 }));
		const all = Array.from({ length: 60 }, (_, index) => makeMessage(String(index + 1).padStart(3, '0')));
		const { host, conversation, setActive } = await mountChat(30, {
			keepAlive: true,
			startAtLatest: false,
			unread: { count: 36, firstMessageId: '025', firstMentionId: null, lastMessageId: '060' },
			timeline: params => params.sinceId ? all.filter(message => message.id > params.sinceId).slice(0, params.limit)
				: all.filter(message => !params.untilId || message.id < params.untilId).toReversed().slice(0, params.limit),
		});
		const originalTop = conversation.scrollTop;
		const originalApi = mocks.api.getMockImplementation()!;
		let finish!: () => void;
		mocks.api.mockImplementation((endpoint, params) => endpoint === 'chat/messages/room-timeline' && !params.sinceId && !params.untilId
			? new Promise((resolve, reject) => { finish = () => result === 'resolve' ? resolve(all.slice(-30).toReversed()) : reject(new Error('offline')); }) : originalApi(endpoint, params));
		host.querySelector<HTMLButtonElement>('button[aria-label^="最新消息，"]')!.click();
		await expect.poll(() => finish).toBeTypeOf('function');
		await setActive(false);
		finish();
		await nextFrame();
		expect(mocks.toast).not.toHaveBeenCalled();
		await setActive(true);
		expect(host.querySelector('[data-chat-message-id="015"]')).not.toBeNull();
		expect(host.querySelector('[data-chat-message-id="060"]')).toBeNull();
		expect(conversation.scrollTop).toBeCloseTo(originalTop, 0);
		mocks.api.mockImplementation(originalApi);
		host.querySelector<HTMLButtonElement>('button[aria-label^="最新消息，"]')!.click();
		await expect.poll(() => host.querySelector('[data-chat-message-id="060"]')).not.toBeNull();
	});

	test('退群后迟到的初始消息不能写回，重新加入可恢复消息和位置保存', async () => {
		let releaseTimeline!: () => void;
		const timelineReady = new Promise<void>(resolve => { releaseTimeline = resolve; });
		const { host, setActive } = await mountChat(20, { expectedCount: 0, startAtLatest: false, keepAlive: true, timelineReady });
		await expect.poll(() => mocks.api.mock.calls.some(([endpoint]) => endpoint === 'chat/messages/room-timeline')).toBe(true);
		mocks.globalListeners.get('chatRoomLeft')!('room');
		releaseTimeline();
		await nextFrame();
		expect(host.querySelector('[data-chat-message-id]')).toBeNull();
		await setActive(false);
		await setActive(true);
		await expect.poll(() => host.querySelectorAll('[data-chat-message-id]').length).toBe(20);
		await nextFrame();
		findConversation(host).scrollTop = 400;
		await nextFrame();
		window.dispatchEvent(new Event('pagehide'));
		expect(JSON.parse(localStorage.getItem('chat-scroll:self:room:room')!).anchorId).toBeTypeOf('string');
	});

	test('阅读历史时收到提及保持未读，返回末尾后同步清除提及提示', async () => {
		const { host, header, conversation } = await mountChat();
		conversation.scrollTop = 400;
		await nextFrame();
		mocks.connection.send.mockClear();
		const onMessage = mocks.connection.on.mock.calls.find(([event]) => event === 'message')![1];
		onMessage({ ...makeMessage('25'), text: '@self 请看这条消息' });
		await nextFrame();
		expect(await openHeaderMenu(header)).toEqual(expect.arrayContaining([expect.objectContaining({ text: i18n.ts._chat.unreadMentions })]));
		expect(mocks.connection.send).not.toHaveBeenCalled();
		await page.elementLocator(header).getByText('聊天室', { exact: true }).click();
		await expect.poll(() => bottomDistance(conversation)).toBeLessThan(1);
		await expect.poll(() => mocks.connection.send.mock.calls.some(([event, body]) => event === 'read' && body.id === '25')).toBe(true);
		expect(await openHeaderMenu(header)).not.toEqual(expect.arrayContaining([expect.objectContaining({ text: i18n.ts._chat.unreadMentions })]));
	});

	test('离开缓存的对话时清理碎片，返回后不保留已删除的消息', async () => {
		mocks.animation = true;
		const { host, setActive } = await mountChat(2, { keepAlive: true });
		const source = host.querySelector<HTMLElement>('[data-chat-message-id="1"]')!;
		await expect.poll(() => getComputedStyle(source).opacity).toBe('1');
		const onDeleted = mocks.connection.on.mock.calls.find(([event]) => event === 'deleted')![1];
		const deleting = onDeleted('1');
		expect(document.querySelector('[data-chat-message-disintegrate-overlay]')).not.toBeNull();
		await setActive(false);
		await deleting;
		expect(document.querySelector('[data-chat-message-disintegrate-overlay]')).toBeNull();
		await setActive(true);
		await expect.poll(() => host.querySelector('[data-chat-message-id="1"]')).toBeNull();
		expect(host.querySelector('[data-chat-message-id="2"]')).not.toBeNull();
	});

	test('碎片快照保留 canvas 像素，媒体副本不会播放或加载 iframe', async () => {
		mocks.animation = true;
		const { host } = await mountChat(1);
		const message = host.querySelector<HTMLElement>('[data-chat-message-id="1"]')!;
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 2;
		canvas.getContext('2d')!.fillStyle = 'red';
		canvas.getContext('2d')!.fillRect(0, 0, 2, 2);
		message.append(canvas);
		for (const tag of ['video', 'audio', 'iframe']) {
			const media = document.createElement(tag);
			media.style.cssText = 'width:2px;height:2px;display:inline-block;';
			media.setAttribute('autoplay', '');
			media.setAttribute('preload', 'none');
			message.append(media);
		}
		await nextFrame();
		const deleting = animateChatMessageDisintegration(message);
		const overlay = document.querySelector<HTMLElement>('[data-chat-message-disintegrate-overlay]')!;
		if (!overlay) await deleting;
		const snapshot = overlay.querySelector<HTMLElement>('[data-chat-message-disintegrate-snapshot]')!;
		expect(snapshot.querySelector('video, audio, iframe')).toBeNull();
		const copiedCanvas = snapshot.querySelector('canvas')!;
		expect(Array.from(copiedCanvas.getContext('2d')!.getImageData(0, 0, 1, 1).data)).toEqual([255, 0, 0, 255]);
		for (const fragment of overlay.querySelectorAll<HTMLElement>('[data-chat-message-disintegrate-fragment]')) fragment.getAnimations()[0].finish();
		await deleting;
		await nextFrame();
		expect(document.querySelector('[data-chat-message-disintegrate-overlay]')).toBeNull();
	});

	test('starts at the newest message after the initial timeline resolves asynchronously', async () => {
		let releaseRoom: () => void = () => {};
		const roomReady = new Promise<void>(resolve => { releaseRoom = resolve; });
		let releaseTimeline: () => void = () => {};
		const timelineReady = new Promise<void>(resolve => { releaseTimeline = resolve; });
		const mounted = mountChat(24, { roomReady, timelineReady });
		await expect.element(page.getByRole('button', { name: i18n.ts.search })).toBeVisible();
		const search = document.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.ts.search}"]`)!;
		const menu = document.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.ts.more}"]`)!;
		expect(search.disabled).toBe(true);
		expect(menu.disabled).toBe(true);
		const searchLeft = search.getBoundingClientRect().left;
		const menuLeft = menu.getBoundingClientRect().left;
		const headerBox = search.closest('[data-page-header]')!.getBoundingClientRect();
		releaseRoom();
		await expect.element(page.getByText('聊天室', { exact: true })).toBeVisible();
		expect(document.querySelector('[data-chat-message-id]')).toBeNull();
		await expect.element(page.getByRole('textbox', { name: '消息输入框' })).toBeVisible();
		await nextFrame();
		const composerTop = document.querySelector('textarea')!.getBoundingClientRect().top;
		releaseTimeline();
		const { conversation, composer } = await mounted;
		expect(search.isConnected && menu.isConnected).toBe(true);
		expect(search.disabled || menu.disabled).toBe(false);
		expect(search.getBoundingClientRect().left).toBeCloseTo(searchLeft, 1);
		expect(menu.getBoundingClientRect().left).toBeCloseTo(menuLeft, 1);
		expect(search.closest('[data-page-header]')!.getBoundingClientRect().top).toBeCloseTo(headerBox.top, 1);
		expect(search.closest('[data-page-header]')!.getBoundingClientRect().height).toBeCloseTo(headerBox.height, 1);
		expect(composer.getBoundingClientRect().top).toBeCloseTo(composerTop, 1);
		expect(conversation.scrollTop).toBeGreaterThan(0);
		expect(bottomDistance(conversation)).toBeLessThan(1);
	});

	test('进入会话时等待内容区整体位置稳定后再显示消息', async () => {
		let releaseTimeline!: () => void;
		const timelineReady = new Promise<void>(resolve => { releaseTimeline = resolve; });
		const mounted = mountChat(2, { timelineReady, startAtLatest: false });
		await expect.element(page.getByRole('textbox', { name: '消息输入框' })).toBeVisible();
		const host = document.querySelector<HTMLElement>('[data-testid="chat-scroll-fixture"]')!;
		const motion = host.animate([{ transform: 'translateY(18px)' }, { transform: 'translateY(-8px)' }, { transform: 'none' }], { duration: 240, easing: 'linear' });
		const positions: number[] = [];
		let frame: number;
		const sample = () => {
			const row = host.querySelector<HTMLElement>('[data-chat-message-id]');
			if (row && getComputedStyle(row).visibility === 'visible') positions.push(row.getBoundingClientRect().top);
			frame = requestAnimationFrame(sample);
		};
		frame = requestAnimationFrame(sample);
		try {
			releaseTimeline();
			await mounted;
			await motion.finished;
			await expect.poll(() => getComputedStyle(host.querySelector('[data-chat-message-id]')!).visibility).toBe('visible');
			await nextFrame();
			await nextFrame();
			expect(positions.length).toBeGreaterThan(0);
			expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(0.5);
		} finally {
			cancelAnimationFrame(frame);
			motion.cancel();
		}
	});

	test('初始定位前不触发历史加载，可见首帧保持末尾，上滚后正常加载', async () => {
		const messages = Array.from({ length: 30 }, (_, index) => makeMessage(String(30 - index)));
		const visibleDistances: number[] = [];
		let frame: number;
		const sample = () => {
			const host = document.querySelector<HTMLElement>('[data-testid="chat-scroll-fixture"]');
			const scroller = host && findConversation(host);
			const message = scroller?.querySelector<HTMLElement>('[data-chat-message-id]');
			if (message && getComputedStyle(message).visibility === 'visible') visibleDistances.push(bottomDistance(scroller!));
			frame = requestAnimationFrame(sample);
		};
		frame = requestAnimationFrame(sample);
		try {
			const { host, conversation } = await mountChat(30, {
				startAtLatest: false,
				observeHistory: true,
				timeline: params => params.untilId ? [makeMessage('older')] : messages,
			});
			await nextFrame();
			await nextFrame();
			expect(visibleDistances.length).toBeGreaterThan(0);
			expect(visibleDistances.every(distance => distance < 1)).toBe(true);
			expect(mocks.api.mock.calls.some(([endpoint, params]) => endpoint === 'chat/messages/room-timeline' && params.untilId)).toBe(false);

			cancelAnimationFrame(frame);
			conversation.scrollTop = 0;
			await expect.poll(() => host.querySelector('[data-chat-message-id="older"]')).not.toBeNull();
			expect(mocks.api).toHaveBeenCalledWith('chat/messages/room-timeline', expect.objectContaining({ untilId: '1' }));
		} finally {
			cancelAnimationFrame(frame);
		}
	});

	test('恢复短会话时，没有更早消息的响应不会使已显示内容上跳', async () => {
		localStorage.setItem('chat-scroll:self:room:room', JSON.stringify({ anchorId: '1', beforeId: null, sinceDate: Date.parse('2026-10-03T00:00:00Z') - 1, offset: 0, atLatest: true }));
		let releaseHistory!: () => void;
		const historyReady = new Promise<void>(resolve => { releaseHistory = resolve; });
		const { host, conversation, header, composer } = await mountChat(2, { startAtLatest: false, observeHistory: true, historyReady });
		await expect.poll(() => mocks.api.mock.calls.some(([endpoint, params]) => endpoint === 'chat/messages/room-timeline' && params.untilId === '1')).toBe(true);
		const rows = Array.from(host.querySelectorAll<HTMLElement>('[data-chat-message-row]'));
		await expect.poll(() => getComputedStyle(rows[0]).visibility).toBe('visible');
		const elements = [conversation, header, composer, ...rows];
		const positions = elements.map(element => element.getBoundingClientRect().top);
		expect(conversation.scrollHeight).toBe(conversation.clientHeight);
		releaseHistory();
		await nextFrame();
		await nextFrame();
		for (const [index, element] of elements.entries()) {
			expect(element.getBoundingClientRect().top).toBeCloseTo(positions[index], 1);
		}
	});

	test('缓存会话在恢复阅读位置前保持隐藏，尺寸改变后首帧不闪旧位置', async () => {
		const { host, conversation, active, setActive } = await mountChat(24, { keepAlive: true });
		conversation.scrollTop = 400;
		await nextFrame();
		const anchor = Array.from(conversation.querySelectorAll<HTMLElement>('[data-chat-message-row]')).find(row => row.getBoundingClientRect().bottom > conversation.getBoundingClientRect().top)!;
		const offset = anchor.getBoundingClientRect().top - conversation.getBoundingClientRect().top;
		await setActive(false);
		host.style.height = '420px';
		active.value = true;
		await nextTick();
		expect(getComputedStyle(anchor).visibility).toBe('hidden');
		await expect.poll(() => getComputedStyle(anchor).visibility).toBe('visible');
		expect(anchor.getBoundingClientRect().top - conversation.getBoundingClientRect().top).toBeCloseTo(offset, 1);
		await nextFrame();
		expect(anchor.getBoundingClientRect().top - conversation.getBoundingClientRect().top).toBeCloseTo(offset, 1);
	});

	test.each([320, 1000])('keeps a stable scrollbar with the global theme thumb at %i px', async width => {
		await page.viewport(width, 900);
		const { host, root, header, composer, conversation } = await mountChat();
		host.style.position = 'relative';
		const members = document.createElement('div');
		members.className = '_scrollbarOnHover';
		members.style.cssText = 'position:absolute;left:0;top:calc(100% + 24px);width:180px;height:160px;overflow-y:auto;background:#fff;';
		const memberContent = document.createElement('div');
		memberContent.style.height = '400px';
		memberContent.textContent = '成员列表';
		members.append(memberContent);
		host.append(members);
		const newest = conversation.querySelector<HTMLElement>('[data-chat-message-id="24"]')!;
		const initialWidth = newest.getBoundingClientRect().width;
		const initialClientWidth = conversation.clientWidth;
		expect(conversation.scrollHeight).toBeGreaterThan(conversation.clientHeight);
		expect(members.scrollHeight).toBeGreaterThan(members.clientHeight);
		expect(getComputedStyle(conversation).scrollbarWidth).not.toBe('none');
		expect(getComputedStyle(conversation, '::-webkit-scrollbar').display).not.toBe('none');
		await page.elementLocator(header).hover();
		expect(thumbColor(conversation)).toBe('rgba(0, 0, 0, 0)');
		expect(thumbColor(members)).toBe('rgba(0, 0, 0, 0)');
		await page.elementLocator(composer).click();
		expect(thumbColor(conversation)).toBe('rgba(0, 0, 0, 0)');
		await page.elementLocator(newest).hover();
		expectVisibleThumb(conversation);
		expect(thumbColor(members)).toBe('rgba(0, 0, 0, 0)');
		await page.elementLocator(newest).getByRole('button').click();
		expectVisibleThumb(conversation);
		await page.elementLocator(conversation).hover({ position: { x: 8, y: 80 } });
		expectVisibleThumb(conversation);
		await page.elementLocator(conversation).click({ position: { x: 8, y: 80 } });
		expectVisibleThumb(conversation);
		await page.elementLocator(members).hover();
		expectVisibleThumb(members);
		expect(thumbColor(conversation)).toBe('rgba(0, 0, 0, 0)');
		await page.elementLocator(conversation).hover({ position: { x: 8, y: 80 } });
		expectVisibleThumb(conversation);
		expect(thumbColor(members)).toBe('rgba(0, 0, 0, 0)');
		await page.elementLocator(header).hover();
		expect(thumbColor(conversation)).toBe('rgba(0, 0, 0, 0)');
		expect(thumbColor(members)).toBe('rgba(0, 0, 0, 0)');
		expect(newest.getBoundingClientRect().width).toBe(initialWidth);
		expect(conversation.clientWidth).toBe(initialClientWidth);
		expect(root.scrollTop).toBe(0);
	});

	test.each([
		{ width: 320, count: 0 }, { width: 1000, count: 0 },
		{ width: 320, count: 2 }, { width: 1000, count: 2 },
		{ width: 320, count: 24 }, { width: 1000, count: 24 },
	])('keeps the header and composer outside the scroll area with $count messages at $width px', async ({ width, count }) => {
		await page.viewport(width, 900);
		const { host, root, header, composer, conversation } = await mountChat(count);
		const headerBox = header.getBoundingClientRect();
		const composerBox = composer.getBoundingClientRect();
		const conversationBox = conversation.getBoundingClientRect();
		expect(conversationBox.top).toBeCloseTo(headerBox.bottom, 1);
		expect(conversationBox.bottom).toBeCloseTo(composerBox.top, 1);
		expect(headerBox.top).toBeCloseTo(host.getBoundingClientRect().top, 1);
		expect(composerBox.bottom).toBeCloseTo(host.getBoundingClientRect().bottom, 1);
		expect(root.scrollHeight).toBe(root.clientHeight);
		expect(host.scrollWidth).toBe(host.clientWidth);
		conversation.scrollTop = 200;
		await nextFrame();
		expect(conversation.scrollTop > 0).toBe(count === 24);
		root.scrollTop = 200;
		expect(root.scrollTop).toBe(0);
		expect(header.getBoundingClientRect().top).toBe(headerBox.top);
		expect(composer.getBoundingClientRect().top).toBe(composerBox.top);
		expect(window.scrollY).toBe(0);
	});

	test('末尾跟随新消息，上滚后同一入口累计未读且保持位置，返回末尾清除未读', async () => {
		const { conversation, root } = await mountChat();
		const onMessage = mocks.connection.on.mock.calls.find(([event]) => event === 'message')![1];
		onMessage(makeMessage('incoming-at-bottom'));
		await nextFrame();
		expect(bottomDistance(conversation)).toBeLessThan(1);
		const bottomMessage = conversation.querySelector<HTMLElement>('[data-chat-message-id="incoming-at-bottom"]')!;
		expect(bottomMessage.getBoundingClientRect().bottom).toBeLessThanOrEqual(conversation.getBoundingClientRect().bottom);
		conversation.scrollTop = 400;
		await nextFrame();
		const latestButton = root.querySelector<HTMLButtonElement>('button[aria-label="最新消息"]')!;
		expect(latestButton).not.toBeNull();
		expect(latestButton.textContent).toBe('');
		const anchor = conversation.querySelector<HTMLElement>('[data-chat-message-id="20"]')!;
		const anchorTop = anchor.getBoundingClientRect().top;
		mocks.connection.send.mockClear();
		onMessage(makeMessage('incoming-in-history'));
		await nextFrame();
		expect(mocks.connection.send).not.toHaveBeenCalled();
		expect(conversation.scrollTop).toBe(400);
		expect(anchor.getBoundingClientRect().top).toBeCloseTo(anchorTop, 1);
		expect(root.querySelector('button[aria-label="最新消息，1 条未读消息"]')).toBe(latestButton);
		expect(latestButton.textContent).toBe('1');
		onMessage(makeMessage('incoming-in-history-2'));
		await nextFrame();
		expect(root.querySelector('button[aria-label="最新消息，2 条未读消息"]')).toBe(latestButton);
		expect(latestButton.textContent).toBe('2');
		expect(conversation.scrollTop).toBe(400);
		expect(anchor.getBoundingClientRect().top).toBeCloseTo(anchorTop, 1);
		expect(mocks.connection.send).not.toHaveBeenCalled();
		latestButton.click();
		await expect.poll(() => bottomDistance(conversation)).toBeLessThan(1);
		await expect.poll(() => root.querySelector('button[aria-label^="最新消息"]')).toBeNull();
		expect(mocks.connection.send).toHaveBeenCalledWith('read', { id: 'incoming-in-history-2' });
		conversation.scrollTop = 400;
		await nextFrame();
		onMessage(makeMessage('own-send', true));
		await nextFrame();
		expect(bottomDistance(conversation)).toBeLessThan(1);
		expect(root.scrollTop).toBe(0);
	});

	test.each(['title', 'same route', 'latest button'])('returns to the newest message using the %s shortcut', async shortcut => {
		mocks.animation = shortcut === 'latest button';
		const { conversation, root, header } = await mountChat();
		expect(root.querySelector(`button[aria-label="${i18n.ts._chat.latestMessages}"]`)).toBeNull();
		conversation.scrollTop = 400;
		await nextFrame();
		expect(conversation.scrollTop).toBe(400);
		if (shortcut === 'title') {
			await page.elementLocator(header).getByText('聊天室', { exact: true }).click();
		} else if (shortcut === 'latest button') {
			const button = page.elementLocator(root).getByRole('button', { name: i18n.ts._chat.latestMessages, exact: true });
			await expect.element(button).toBeVisible();
			expect(root.querySelector(`button[aria-label="${i18n.ts._chat.latestMessages}"]`)!.textContent).toBe('');
			await button.click();
		} else {
			expect(mocks.routeListeners.has('same')).toBe(true);
			mocks.routeListeners.get('same')!();
		}
		await expect.poll(() => bottomDistance(conversation)).toBeLessThan(1);
		await expect.poll(() => root.querySelector(`button[aria-label="${i18n.ts._chat.latestMessages}"]`)).toBeNull();
		expect(root.scrollTop).toBe(0);
	});

	test.each([0, 80])('preserves the visible message while prepending history at scrollTop %i', async top => {
		const { conversation } = await mountChat(30, { history: Array.from({ length: 10 }, (_, index) => makeMessage(`older-${10 - index}`)) });
		conversation.scrollTop = top;
		await nextFrame();
		const anchor = conversation.querySelector<HTMLElement>(top === 0 ? '[data-chat-message-id="1"]' : '[data-chat-message-id="2"]')!;
		const anchorTop = anchor.getBoundingClientRect().top;
		const loadMore = mocks.appearCallbacks.values().next().value!;
		expect(loadMore).toBeTypeOf('function');
		await loadMore();
		await nextFrame();
		expect(conversation.querySelectorAll('[data-chat-message-id]')).toHaveLength(40);
		expect(anchor.getBoundingClientRect().top).toBeCloseTo(anchorTop, 1);
		expect(conversation.scrollTop).toBeGreaterThan(top);
	});

	test.each([false, true])('历史请求失败可重试，离开缓存会话后不提示旧错误，已离开=%s', async leave => {
		const { conversation, setActive } = await mountChat(30, { keepAlive: true });
		conversation.scrollTop = 80;
		await nextFrame();
		const originalTop = conversation.scrollTop;
		const originalApi = mocks.api.getMockImplementation()!;
		let fail!: () => void;
		mocks.api.mockImplementation((endpoint, params) => endpoint === 'chat/messages/room-timeline' && params.untilId
			? new Promise((_resolve, reject) => { fail = () => reject(new Error('offline')); }) : originalApi(endpoint, params));
		const loadMore = mocks.appearCallbacks.values().next().value!;
		const loading = loadMore();
		await expect.poll(() => fail).toBeTypeOf('function');
		if (leave) await setActive(false);
		fail();
		await loading;
		expect(mocks.toast).toHaveBeenCalledTimes(leave ? 0 : 1);
		if (leave) await setActive(true);
		expect(conversation.scrollTop).toBeCloseTo(originalTop, 0);
		const anchor = conversation.querySelector<HTMLElement>('[data-chat-message-id="2"]')!;
		const anchorTop = anchor.getBoundingClientRect().top;
		mocks.api.mockImplementation(originalApi);
		await loadMore();
		expect(mocks.api.mock.calls.filter(([endpoint, params]) => endpoint === 'chat/messages/room-timeline' && params.untilId)).toHaveLength(2);
		// 历史读完后顶部加载入口会移除，阅读位置应以消息锚点判断。
		expect(anchor.getBoundingClientRect().top).toBeCloseTo(anchorTop, 1);
	});

	test('搜索和修改弹窗不会重建消息区域或改变阅读位置', async () => {
		await page.viewport(850, 900);
		const { host, header, conversation } = await mountChat();
		conversation.scrollTop = 400;
		await nextFrame();
		await page.elementLocator(header).getByRole('button', { name: i18n.ts.search }).click();
		expect(mocks.popup.mock.lastCall![1]).toMatchObject({ panel: 'search' });
		mocks.popup.mock.lastCall![2].closed();
		await chooseHeaderMenu(header, i18n.ts._chat.modify);
		expect(mocks.popup.mock.lastCall![1]).toMatchObject({ panel: 'info' });
		expect(findConversation(host)).toBe(conversation);
		expect(conversation.scrollTop).toBe(400);
	});

	test.each(['search', 'quote', 'reply'])('%s 跳转在聊天室内定位，到达后高亮两秒', async source => {
		const initialMessages = Array.from({ length: 24 }, (_, index) => makeMessage(String(24 - index)));
		initialMessages[0] = { ...initialMessages[0], replyType: source === 'quote' ? 'quote' : 'reply', reply: { id: '8' } } as Misskey.entities.ChatMessageLite;
		const { host, header, conversation, root } = await mountChat(24, { initialMessages });
		mocks.animation = true;
		const target = host.querySelector<HTMLElement>('[data-chat-message-id="8"]')!;
		const targetHeight = target.offsetHeight;
		const highlighted = pauseNextAnimation(target);
		if (source === 'search') {
			await page.elementLocator(header).getByRole('button', { name: i18n.ts.search }).click();
			mocks.popup.mock.lastCall![2].select('8');
			mocks.popup.mock.lastCall![2].closed();
		} else {
			await page.elementLocator(host).getByRole('button', { name: '消息 24', exact: true }).click();
		}
		const animation = await highlighted;
		expect(Math.abs(target.getBoundingClientRect().top + target.offsetHeight / 2 - conversation.getBoundingClientRect().top - conversation.clientHeight / 2)).toBeLessThan(2);
		expect(document.activeElement).toBe(target);
		expect(root.scrollTop).toBe(0);
		expect(target.offsetHeight).toBe(targetHeight);
		expect(animation.effect?.getTiming().duration).toBe(2000);
		animation.currentTime = 0;
		const initialShadow = getComputedStyle(target).boxShadow;
		animation.currentTime = 500;
		expect(getComputedStyle(target).boxShadow).not.toBe(initialShadow);
		expect(getComputedStyle(target).borderRadius).toBe('0px');
		animation.currentTime = 1900;
		expect(getComputedStyle(target).boxShadow).not.toBe('none');
		animation.finish();
		await nextFrame();
		expect(getComputedStyle(target).boxShadow).toBe('none');
		expect(getComputedStyle(target).backgroundColor).toBe('rgb(255, 255, 255)');
	});

	test('搜索较早记录会加载消息窗口，切换会话会取消未完成的定位', async () => {
		const { host, header, conversation, setActive } = await mountChat(24, { keepAlive: true });
		const originalApi = mocks.api.getMockImplementation()!;
		let releaseHistory!: (value: Misskey.entities.ChatMessageLite[]) => void;
		mocks.api.mockImplementation((endpoint, params) => {
			if (endpoint === 'chat/messages/room-timeline' && params.untilId === 'older-target') {
				return new Promise<Misskey.entities.ChatMessageLite[]>(resolve => { releaseHistory = resolve; });
			}
			if (endpoint === 'chat/messages/room-timeline' && params.sinceId === 'older-before') return Promise.resolve([makeMessage('older-target')]);
			return originalApi(endpoint, params);
		});
		conversation.scrollTop = 400;
		await nextFrame();
		await page.elementLocator(header).getByRole('button', { name: i18n.ts.search }).click();
		mocks.popup.mock.lastCall![2].select('older-target');
		await setActive(false);
		releaseHistory([makeMessage('older-before')]);
		await nextFrame();
		await setActive(true);
		expect(host.querySelector('[data-chat-message-id="older-target"]')).toBeNull();
		expect(conversation.scrollTop).toBe(400);
		await page.elementLocator(header).getByRole('button', { name: i18n.ts.search }).click();
		mocks.popup.mock.lastCall![2].select('older-target');
		releaseHistory([makeMessage('older-before')]);
		await expect.poll(() => host.querySelector('[data-chat-message-id="older-target"]')).not.toBeNull();
		await expect.element(page.elementLocator(host).getByRole('button', { name: '消息 older-target' })).toBeVisible();
		expect(host.querySelector('[data-chat-message-id="24"]')).toBeNull();
	});

	test.each([false, true])('返回缓存会话保留原位置，新消息只增加右下未读，原先在末尾=%s', async atBottom => {
		const { host, conversation, setActive } = await mountChat(24, { keepAlive: true });
		if (!atBottom) conversation.scrollTop = 400;
		await nextFrame();
		const originalTop = conversation.scrollTop;
		await setActive(false);
		const onMessage = mocks.connection.on.mock.calls.find(([event]) => event === 'message')![1];
		onMessage(makeMessage('background-message'));
		await nextFrame();
		await setActive(true);
		await expect.poll(() => {
			const current = findConversation(host);
			return Math.abs(current.scrollTop - originalTop);
		}).toBeLessThan(1);
		expect(host.querySelector('[data-chat-message-id="background-message"]')).not.toBeNull();
		await expect.element(page.elementLocator(host).getByRole('button', { name: '最新消息，1 条未读消息' })).toBeVisible();
	});

	test.each([
		{ count: 2, atBottom: true },
		{ count: 24, atBottom: true },
		{ count: 24, atBottom: false },
	])('窗口失焦和回焦保留锚点与未读，消息数=$count，原先在末尾=$atBottom', async ({ count, atBottom }) => {
		const { host, conversation } = await mountChat(count);
		if (!atBottom) conversation.scrollTop = 400;
		await nextFrame();
		const originalTop = conversation.scrollTop;
		const anchor = Array.from(conversation.querySelectorAll<HTMLElement>('[data-chat-message-row]')).find(row => row.getBoundingClientRect().bottom > conversation.getBoundingClientRect().top)!;
		const originalAnchorTop = anchor.getBoundingClientRect().top;
		const unreadChanged = vi.fn();
		mocks.globalListeners.set('chatUnreadChanged', unreadChanged);
		mocks.connection.send.mockClear();
		const onMessage = mocks.connection.on.mock.calls.find(([event]) => event === 'message')![1];

		vi.mocked(window.document.hasFocus).mockReturnValue(false);
		window.dispatchEvent(new FocusEvent('blur'));
		onMessage(makeMessage('new-1'));
		await nextFrame();
		conversation.dispatchEvent(new Event('scroll'));
		window.document.dispatchEvent(new Event('visibilitychange'));
		await nextFrame();
		expect(conversation.scrollTop).toBeCloseTo(originalTop, 1);
		expect(anchor.getBoundingClientRect().top).toBeCloseTo(originalAnchorTop, 1);
		expect(mocks.connection.send).not.toHaveBeenCalled();
		expect(unreadChanged).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'room:room', count: 1 }));

		vi.mocked(window.document.hasFocus).mockReturnValue(true);
		window.dispatchEvent(new FocusEvent('focus'));
		await nextFrame();
		onMessage(makeMessage('new-2'));
		await nextFrame();
		await nextFrame();
		expect(conversation.scrollTop).toBeCloseTo(originalTop, 1);
		expect(anchor.getBoundingClientRect().top).toBeCloseTo(originalAnchorTop, 1);
		expect(mocks.connection.send).not.toHaveBeenCalled();
		expect(unreadChanged).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'room:room', count: 2 }));
		await page.elementLocator(host).getByRole('button', { name: '最新消息，2 条未读消息' }).click();
		await expect.poll(() => host.querySelector('button[aria-label^="最新消息，"]')).toBeNull();
		expect(mocks.connection.send).toHaveBeenCalledWith('read', { id: 'new-2' });
		expect(unreadChanged).toHaveBeenLastCalledWith({ id: 'room:room', count: 0, throughId: 'new-2' });
	});

	test('输入框移焦到普通聊天控件仍跟随并确认新消息', async () => {
		const { host, conversation, composer } = await mountChat();
		composer.focus();
		conversation.querySelector<HTMLButtonElement>('button')!.focus({ preventScroll: true });
		mocks.connection.send.mockClear();
		const onMessage = mocks.connection.on.mock.calls.find(([event]) => event === 'message')![1];
		onMessage(makeMessage('new-message'));
		await expect.poll(() => bottomDistance(conversation)).toBeLessThan(1);
		expect(mocks.connection.send).toHaveBeenCalledWith('read', { id: 'new-message' });
		expect(host.querySelector('button[aria-label^="最新消息，"]')).toBeNull();
	});

	test('末尾跟随动画被窗口失焦中断时仍保留未读，回焦后手动继续阅读', async () => {
		mocks.animation = true;
		const { host, conversation } = await mountChat();
		const originalTop = conversation.scrollTop;
		const unreadChanged = vi.fn();
		mocks.globalListeners.set('chatUnreadChanged', unreadChanged);
		mocks.connection.send.mockClear();
		const onMessage = mocks.connection.on.mock.calls.find(([event]) => event === 'message')![1];
		onMessage(makeMessage('new-message'));
		await expect.poll(() => conversation.scrollTop > originalTop && bottomDistance(conversation) > 2, { interval: 10 }).toBe(true);
		vi.mocked(window.document.hasFocus).mockReturnValue(false);
		window.dispatchEvent(new FocusEvent('blur'));
		const pausedTop = conversation.scrollTop;
		await nextFrame();
		await nextFrame();
		expect(conversation.scrollTop).toBeCloseTo(pausedTop, 1);
		expect(mocks.connection.send).not.toHaveBeenCalled();
		expect(unreadChanged).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'room:room', count: 1 }));
		vi.mocked(window.document.hasFocus).mockReturnValue(true);
		window.dispatchEvent(new FocusEvent('focus'));
		await nextFrame();
		expect(conversation.scrollTop).toBeCloseTo(pausedTop, 1);
		expect(mocks.connection.send).not.toHaveBeenCalled();
		await page.elementLocator(host).getByRole('button', { name: '最新消息，1 条未读消息' }).click();
		await expect.poll(() => mocks.connection.send.mock.calls.some(([event, body]) => event === 'read' && body.id === 'new-message')).toBe(true);
		await expect.poll(() => host.querySelector('button[aria-label^="最新消息，"]')).toBeNull();
	});

	test('回焦后视口增高夹紧滚动位置，不将未读消息自动标读', async () => {
		const { host, conversation } = await mountChat();
		vi.mocked(window.document.hasFocus).mockReturnValue(false);
		window.dispatchEvent(new FocusEvent('blur'));
		const onMessage = mocks.connection.on.mock.calls.find(([event]) => event === 'message')![1];
		onMessage(makeMessage('new-message'));
		await nextFrame();
		vi.mocked(window.document.hasFocus).mockReturnValue(true);
		window.dispatchEvent(new FocusEvent('focus'));
		await nextFrame();
		mocks.connection.send.mockClear();
		const previousTop = conversation.scrollTop;
		host.style.height = '1000px';
		await nextFrame();
		await nextFrame();
		expect(conversation.scrollTop).toBeLessThan(previousTop);
		expect(bottomDistance(conversation)).toBeLessThan(1);
		expect(mocks.connection.send).not.toHaveBeenCalled();
		expect(host.querySelector('button[aria-label="最新消息，1 条未读消息"]')).not.toBeNull();
	});

	test('手机滑动保持聊天，不切换到成员页', async () => {
		await page.viewport(320, 900);
		const { conversation, host } = await mountChat();
		const message = conversation.querySelector<HTMLElement>('[data-chat-message-id="24"]')!;
		const dispatchTouch = (type: 'touchstart' | 'touchmove' | 'touchend', screenX: number) => {
			const touch = new Touch({ identifier: 1, target: message, screenX, screenY: 250 });
			message.dispatchEvent(new TouchEvent(type, {
				bubbles: true,
				touches: type === 'touchend' ? [] : [touch],
				changedTouches: [touch],
			}));
		};
		dispatchTouch('touchstart', 220);
		dispatchTouch('touchmove', 120);
		await nextFrame();
		dispatchTouch('touchend', 120);
		expect(host.querySelector('[data-chat-message-id]')).not.toBeNull();
		expect(host.textContent).not.toContain('房间成员');
	});
});
