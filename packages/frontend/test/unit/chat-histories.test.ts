/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { EventEmitter } from 'eventemitter3';
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import MkChatHistories from '@/components/MkChatHistories.vue';
import { globalEvents } from '@/events.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), me: { id: 'self', username: 'self', name: 'Self', host: null } }));
const mainConnection = Object.assign(new EventEmitter(), { dispose: () => mainConnection.removeAllListeners() });
const stream = Object.assign(new EventEmitter(), { useChannel: () => mainConnection });

vi.mock('@/i.js', () => ({ ensureSignin: () => mocks.me, $i: mocks.me }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/misskey-api-with-toast.js', () => ({ misskeyApiWithErrorToast: mocks.api }));
vi.mock('@/stream.js', () => ({ useStream: () => stream }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ pushByPath: vi.fn(), push: vi.fn() }) }));
vi.mock('@/os.js', () => ({}));
vi.mock('@@/js/use-interval.js', () => ({ useInterval: vi.fn() }));

const global = {
	stubs: {
		MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
		Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
		MkUserName: { props: ['user'], template: '<span>{{ user.name || user.username }}</span>' },
		MkAvatar: true, MkTime: true, MkAcct: true,
		MkLoading: { template: '<div role="status">Loading</div>' },
		MkError: { emits: ['retry'], setup: () => ({ retryLabel: i18n.ts.retry }), template: '<button @click="$emit(\'retry\')">{{ retryLabel }}</button>' },
		MkResult: { props: ['text'], template: '<span>{{ text }}</span>' },
	},
};

function user(id: string, name = id): Misskey.entities.UserLite {
	return { id, username: id, name, host: null } as Misskey.entities.UserLite;
}

function message(id: string, other: Misskey.entities.UserLite, text = id): Misskey.entities.ChatMessage {
	return {
		id, fromUserId: other.id, fromUser: other, toUserId: mocks.me.id, toUser: user(mocks.me.id),
		createdAt: '2026-10-28T00:00:00.000Z', editedAt: null, isAutoReply: false, isRead: true, text, reactions: [],
	};
}

function membership(id: string, name = id): Misskey.entities.ChatRoomMembership {
	const owner = user('owner');
	const room: Misskey.entities.ChatRoom = {
		id: `room-${id}`, name, createdAt: '2026-10-28T00:00:00.000Z', ownerId: owner.id, owner,
		memberCount: 2, description: '', joinPolicy: 'public', joinQuestion: '', isMember: true, myRole: 'member',
		announcement: '', ownerNickname: '', myNickname: '', myIsSilenced: false, mySilenceUntil: null,
		isSilenced: false, silenceUntil: null, joinRequestPending: false,
	};
	return {
		id, roomId: room.id, room, userId: mocks.me.id, createdAt: room.createdAt,
		role: 'member', nickname: '', isSilenced: false, silenceUntil: null,
	};
}

type HistoryParams = { room?: boolean; offset?: number; userId?: string; untilId?: string };
const historyRequests = () => mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'chat/history');
const flushPromises = () => new Promise<void>(resolve => window.setTimeout(resolve, 0));
const renderHistory = () => render(MkChatHistories, { props: { all: true, compact: true, hideLoading: true }, global });
let accountSequence = 0;

beforeEach(() => {
	mocks.me.id = `self-${++accountSequence}`;
	mocks.api.mockReset().mockResolvedValue([]);
	window.localStorage.clear();
	mainConnection.removeAllListeners();
	stream.removeAllListeners();
});

afterEach(cleanup);

describe('chat history first-page loading', () => {
	test('KeepAlive first mount fetches once and a real restoration refreshes the list', async () => {
		const visible = ref(true);
		let preview = 'Initial preview';
		mocks.api.mockImplementation(async (endpoint: string, params: HistoryParams = {}) =>
			endpoint === 'chat/history' && !params.room ? [message('first', user('alice'), preview)] : []);
		const view = render(defineComponent({
			setup: () => () => h(KeepAlive, null, { default: () => visible.value ? h(MkChatHistories, { all: true, compact: true, hideLoading: true }) : null }),
		}), { global });
		await view.findByText('Initial preview');
		await flushPromises();
		expect(historyRequests()).toHaveLength(2);
		expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'chat/conversations')).toHaveLength(1);
		visible.value = false;
		await nextTick();
		preview = 'Restored preview';
		visible.value = true;
		await nextTick();
		await view.findByText('Restored preview');
		expect(historyRequests()).toHaveLength(4);
		expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'chat/conversations')).toHaveLength(2);
	});

	test('waits for settings, shows the first page before the tail, and does not announce a false empty list', async () => {
		const settings = Promise.withResolvers<Misskey.entities.ChatConversationsResponse>();
		const tail = Promise.withResolvers<Misskey.entities.ChatMessage[]>();
		const firstPage = Array.from({ length: 100 }, (_, index) => message(`page-${index}`, user(`hidden-${index}`)));
		firstPage[0] = message('visible', user('visible'), 'Visible preview');
		const pinsKey = `chat-pinned:${mocks.me.id}` as const;
		miLocalStorage.setItem(pinsKey, JSON.stringify(['user:later']));
		mocks.api.mockImplementation(async (endpoint: string, params: HistoryParams = {}) => {
			if (endpoint === 'chat/conversations') return settings.promise;
			if (endpoint === 'chat/history' && !params.room) return params.offset === 100 ? tail.promise : firstPage;
			return [];
		});
		const view = renderHistory();
		await flushPromises();
		expect(view.queryAllByRole('link')).toHaveLength(0);
		expect(historyRequests()).toHaveLength(2);
		settings.resolve(firstPage.slice(1).map(item => ({
			userId: item.fromUserId, roomId: null, notificationMode: 'all', mutedUntil: null,
			hidden: true, hiddenThroughId: 'zzzz', markedUnread: false,
		})));
		await view.findByText('Visible preview');
		expect(view.getAllByRole('link')).toHaveLength(1);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('chat/history', { room: false, limit: 100, offset: 100 }));
		expect(JSON.parse(miLocalStorage.getItem(pinsKey)!)).toEqual(['user:later']);
		await view.rerender({ query: 'Later' });
		expect(view.queryAllByRole('link')).toHaveLength(0);
		expect(view.queryByText(i18n.ts._chat.noHistory)).toBeNull();
		tail.resolve([message('later', user('later'), 'Later preview')]);
		await view.findByRole('link', { name: /Later preview/ });
		await view.rerender({ query: '' });
		expect(view.getAllByRole('link')).toHaveLength(2);
		expect(view.getByText('Visible preview')).toBeTruthy();
		expect(JSON.parse(miLocalStorage.getItem(pinsKey)!)).toEqual(['user:later']);
	});

	test('late pages add conversations without replacing a live preview or resurrecting a departed room', async () => {
		const tail = Promise.withResolvers<Misskey.entities.ChatRoomMembership[]>();
		const memberships = Array.from({ length: 100 }, (_, index) => membership(`joined-${index}`, index === 0 ? 'Departed room' : `Joined room ${index}`));
		const alice = user('alice');
		const oldMessage = message('old', alice, 'Old preview');
		const liveMessage = { ...message('new', alice, 'Live preview'), createdAt: '2026-10-28T01:00:00.000Z' };
		mocks.api.mockImplementation(async (endpoint: string, params: HistoryParams = {}) => {
			if (endpoint === 'chat/rooms/joining') return params.untilId ? tail.promise : memberships;
			if (endpoint === 'chat/history' && params.userId === alice.id) return [liveMessage];
			if (endpoint === 'chat/history' && !params.room) return [oldMessage];
			return [];
		});
		const view = renderHistory();
		await view.findByRole('link', { name: 'Departed room' });
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('chat/rooms/joining', { limit: 100, untilId: memberships.at(-1)!.id }));
		mainConnection.emit('chatHistoryUpdated', { messageId: liveMessage.id, userId: alice.id });
		await view.findByText('Live preview');
		globalEvents.emit('chatRoomLeft', memberships[0].roomId);
		await nextTick();
		expect(view.queryByRole('link', { name: 'Departed room' })).toBeNull();
		tail.resolve([membership('later', 'Later room')]);
		await view.findByRole('link', { name: 'Later room' });
		expect(view.getByText('Live preview')).toBeTruthy();
		expect(view.queryByText('Old preview')).toBeNull();
		expect(view.queryByRole('link', { name: 'Departed room' })).toBeNull();
	});

	test('settings and tail failures allow retry without losing the visible first page', async () => {
		const tail = Promise.withResolvers<Misskey.entities.ChatMessage[]>();
		const firstPage = Array.from({ length: 100 }, (_, index) => message(`page-${index}`, user(`person-${index}`), index === 0 ? 'First preview' : `Preview ${index}`));
		let failSettings = true;
		let recoveredTail = false;
		mocks.api.mockImplementation(async (endpoint: string, params: HistoryParams = {}) => {
			if (endpoint === 'chat/conversations' && failSettings) throw new Error('Settings unavailable');
			if (endpoint === 'chat/history' && !params.room) {
				if (params.offset === 100) return recoveredTail ? [message('later', user('later'), 'Recovered tail')] : tail.promise;
				return firstPage;
			}
			return [];
		});
		const view = renderHistory();
		const firstRetry = await view.findByRole('button', { name: i18n.ts.retry });
		expect(view.queryAllByRole('link')).toHaveLength(0);
		failSettings = false;
		await fireEvent.click(firstRetry);
		await view.findByText('First preview');
		tail.reject(new Error('Tail unavailable'));
		const tailRetry = await view.findByRole('button', { name: i18n.ts.retry });
		expect(view.getAllByRole('link')).toHaveLength(100);
		recoveredTail = true;
		await fireEvent.click(tailRetry);
		await view.findByText('Recovered tail');
		expect(view.getByText('First preview')).toBeTruthy();
		expect(view.getAllByRole('link')).toHaveLength(101);
		expect(view.queryByRole('button', { name: i18n.ts.retry })).toBeNull();
	});
});
