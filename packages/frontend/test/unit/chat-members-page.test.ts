/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { EventEmitter } from 'eventemitter3';
import { nextTick, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import ChatMembersPage from '@/pages/chat/room.members-page.vue';
import { DI } from '@/di.js';
import { globalEvents } from '@/events.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(), channel: vi.fn(), push: vi.fn(), back: vi.fn(),
	me: { id: 'self', username: 'self', name: 'Self', host: null },
}));

vi.mock('@/i.js', () => ({ ensureSignin: () => mocks.me, $i: mocks.me }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/misskey-api-with-toast.js', () => ({ misskeyApiWithErrorToast: mocks.api }));
vi.mock('@/stream.js', () => ({ useStream: () => ({ useChannel: mocks.channel }) }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ push: mocks.push, back: mocks.back, canGoBack: ref(false) }) }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/os.js', () => ({}));
vi.mock('@/pages/chat/member.activity.vue', () => ({ default: { template: '<span></span>' } }));
vi.mock('@/components/MkInput.vue', () => ({ default: { template: '<input>' } }));

function createConnection() {
	const events = new EventEmitter();
	return Object.assign(events, { dispose: vi.fn(() => events.removeAllListeners()) });
}

let connections: ReturnType<typeof createConnection>[] = [];
const global = {
	stubs: {
		MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
		Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
		MkUserName: { props: ['user'], template: '<span>{{ user.name || user.username }}</span>' },
		MkAvatar: true,
		MkLoading: { template: '<div role="status">Loading</div>' },
		MkError: { emits: ['retry'], setup: () => ({ retryLabel: i18n.ts.retry }), template: '<button @click="$emit(\'retry\')">{{ retryLabel }}</button>' },
	},
	directives: { appear: {} },
};

function user(id: string, name = id): Misskey.entities.UserLite {
	return { id, username: id, name, host: null } as Misskey.entities.UserLite;
}

function room(patch: Partial<Misskey.entities.ChatRoom> = {}): Misskey.entities.ChatRoom {
	return {
		id: 'room1', name: 'Room one', createdAt: '2026-10-28T00:00:00.000Z',
		ownerId: 'owner', owner: user('owner', 'Owner'), memberCount: 52,
		description: '', joinPolicy: 'public', joinQuestion: '', isMember: true, myRole: 'member',
		announcement: 'Group announcement', ownerNickname: '', myNickname: '',
		myIsSilenced: false, mySilenceUntil: null, isSilenced: false, silenceUntil: null,
		joinRequestPending: false, mutedUntil: null, ...patch,
	};
}

function membership(id: string, userId: string, name: string): Misskey.entities.ChatRoomMembership {
	return {
		id, userId, roomId: 'room1', user: user(userId, name), createdAt: '2026-10-28T00:00:00.000Z',
		role: 'member', nickname: '', isSilenced: false, silenceUntil: null,
	};
}

function firstPage() {
	return Array.from({ length: 50 }, (_, index) => membership(`m${100 - index}`, `user-${index}`, `Member ${index}`));
}

type MemberParams = { roomId: string; limit?: number; untilId?: string };
const memberRequests = () => mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'chat/rooms/members');
const flushPromises = () => new Promise<void>(resolve => window.setTimeout(resolve, 0));
const renderPage = (active = ref(true)) => render(ChatMembersPage, {
	props: { roomId: 'room1' },
	global: { ...global, provide: { [DI.pageActive as symbol]: active } },
});

beforeEach(() => {
	mocks.api.mockReset();
	mocks.push.mockReset();
	mocks.back.mockReset();
	mocks.channel.mockReset().mockImplementation(() => {
		const connection = createConnection();
		connections.push(connection);
		return connection;
	});
	connections = [];
	window.localStorage.clear();
});

afterEach(cleanup);

describe('independent chat members page', () => {
	test.each([false, undefined])('does not request private members without explicit membership: %s', async isMember => {
		mocks.api.mockResolvedValue(room({ isMember }));
		const view = renderPage();
		await waitFor(() => expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/chat'));
		expect(memberRequests()).toHaveLength(0);
		expect(mocks.channel).not.toHaveBeenCalled();
		expect(view.queryAllByRole('group')).toHaveLength(0);
		expect(view.queryByText('Group announcement')).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.goBack }));
		expect(mocks.push).toHaveBeenLastCalledWith('/chat/room/:roomId', { params: { roomId: 'room1' } });
	});

	test('preserves the first page after a tail failure and retries the same cursor without duplicates', async () => {
		const initial = firstPage();
		let tailAttempts = 0;
		mocks.api.mockImplementation(async (endpoint: string, params: MemberParams) => {
			if (endpoint === 'chat/rooms/show') return room();
			if (!params.untilId) return initial;
			if (++tailAttempts === 1) throw new TypeError('Offline');
			return [initial[0], membership('m050', 'later', 'Later member')];
		});
		const view = renderPage();
		await view.findByRole('group', { name: 'Member 0' });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.loadMore }));
		const retry = await view.findByRole('button', { name: i18n.ts.retry });
		expect(view.getByRole('group', { name: 'Member 0' })).toBeTruthy();
		expect(view.queryByText('Group announcement')).toBeNull();
		expect(view.getAllByRole('group')).toHaveLength(51);
		expect(mocks.push).not.toHaveBeenCalled();
		await fireEvent.click(retry);
		await view.findByRole('group', { name: 'Later member' });
		expect(view.getAllByRole('group', { name: 'Member 0' })).toHaveLength(1);
		expect(view.getAllByRole('group')).toHaveLength(52);
		expect(view.queryByRole('button', { name: i18n.ts.retry })).toBeNull();
		expect(view.queryByRole('button', { name: i18n.ts.loadMore })).toBeNull();
		expect(memberRequests().slice(1).map(([, params]) => params)).toEqual([
			{ roomId: 'room1', limit: 50, untilId: initial.at(-1)!.id },
			{ roomId: 'room1', limit: 50, untilId: initial.at(-1)!.id },
		]);
	});

	test.each(['accessRevoked', 'chatRoomLeft', 'inactive'] as const)('clears private members and ignores a late page after %s', async source => {
		const active = ref(true);
		const tail = Promise.withResolvers<Misskey.entities.ChatRoomMembership[]>();
		let restored = false;
		mocks.api.mockImplementation(async (endpoint: string, params: MemberParams) => {
			if (endpoint === 'chat/rooms/show') return room();
			if (params.untilId) return tail.promise;
			return restored ? [membership('m040', 'restored', 'Restored member')] : firstPage();
		});
		const view = renderPage(active);
		await view.findByRole('group', { name: 'Member 0' });
		expect(mocks.channel).toHaveBeenCalledExactlyOnceWith('chatRoom', { roomId: 'room1' });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.loadMore }));
		await waitFor(() => expect(memberRequests()).toHaveLength(2));
		const signal = memberRequests().at(-1)![3] as AbortSignal;
		if (source === 'accessRevoked') connections[0].emit('accessRevoked');
		else if (source === 'chatRoomLeft') globalEvents.emit('chatRoomLeft', 'room1');
		else active.value = false;
		await nextTick();
		expect(signal.aborted).toBe(true);
		expect(connections[0].dispose).toHaveBeenCalledOnce();
		expect(view.queryAllByRole('group')).toHaveLength(0);
		expect(view.queryByText('Group announcement')).toBeNull();
		tail.resolve([membership('m050', 'late', 'Late private member')]);
		await flushPromises();
		expect(view.queryByRole('group', { name: 'Late private member' })).toBeNull();
		expect(view.queryByRole('button', { name: i18n.ts.retry })).toBeNull();
		if (source === 'inactive') {
			expect(mocks.push).not.toHaveBeenCalled();
			restored = true;
			active.value = true;
			await view.findByRole('group', { name: 'Restored member' });
			expect(view.queryByRole('group', { name: 'Member 0' })).toBeNull();
			expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'chat/rooms/show')).toHaveLength(2);
			expect(mocks.channel).toHaveBeenCalledTimes(2);
		} else {
			expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/chat');
			expect(memberRequests()).toHaveLength(2);
		}
	});
});
