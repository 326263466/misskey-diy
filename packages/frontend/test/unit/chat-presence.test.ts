/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick, ref } from 'vue';
import type { ComputedRef } from 'vue';
import type * as Misskey from 'misskey-js';
import ChatRoom from '@/pages/chat/room.vue';
import MkUserOnlineIndicator from '@/components/MkUserOnlineIndicator.vue';
import { initializeUserStatisticsSync } from '@/composables/use-user-statistics.js';
import { DI } from '@/di.js';
import { i18n } from '@/i18n.js';
import { useStream } from '@/stream.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	sound: vi.fn(),
	page: null as ComputedRef<{ avatar?: Misskey.entities.UserDetailed }> | null,
	account: { id: 'self', host: null, onlineStatusOverride: 'online', policies: { chatAvailability: 'available' } },
	connection: { on: vi.fn(), send: vi.fn(), dispose: vi.fn() },
}));

vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: mocks.account, ensureSignin: () => mocks.account }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/sound.js', () => ({ playMisskeySfx: mocks.sound }));
vi.mock('@/os.js', () => ({ alert: vi.fn() }));
vi.mock('@/router.js', () => ({ useRouter: () => ({}) }));
vi.mock('@/page.js', () => ({ definePage: (page: typeof mocks.page) => { mocks.page = page; } }));
vi.mock('@/composables/use-mutation-observer.js', () => ({ useMutationObserver: vi.fn() }));
vi.mock('@/store.js', async () => {
	const { ref: vueRef } = await import('vue');
	const realtimeMode = vueRef(true);
	return { store: { s: { get realtimeMode() { return realtimeMode.value; } }, r: { realtimeMode } } };
});
vi.mock('@/stream.js', async () => {
	const { EventEmitter } = await import('eventemitter3');
	const stream = Object.assign(new EventEmitter(), {
		state: 'connected', send: vi.fn(), useChannel: () => mocks.connection,
	});
	return { useStream: () => stream };
});
vi.mock('@/pages/chat/XMessage.vue', () => ({ default: { props: ['message'], template: '<p>{{ message.text }}</p>' } }));
vi.mock('@/pages/chat/room.form.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/pages/chat/room.search.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/pages/chat/room.members.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/pages/chat/room.info.vue', () => ({ default: { template: '<div/>' } }));

const stream = useStream();
const customStatus = { icon: 'music', text: '听歌中' } as const;
const sourceUser = Object.freeze({
	id: 'alice', username: 'alice', name: 'Alice', host: null,
	onlineStatus: 'online', customStatus, chatScope: 'everyone', canChat: true,
}) as unknown as Misskey.entities.UserDetailed;
let snapshot = { ...sourceUser };
let documentVisibility: DocumentVisibilityState = 'visible';

function setVisibility(visibility: DocumentVisibilityState): void {
	documentVisibility = visibility;
	window.document.dispatchEvent(new Event('visibilitychange'));
}

async function flush(): Promise<void> {
	await vi.advanceTimersByTimeAsync(50);
	await nextTick();
}

function renderChat(pageActive = ref(true)) {
	return render(ChatRoom, {
		props: { userId: sourceUser.id },
		global: {
			provide: { [DI.pageActive]: pageActive },
			directives: { tooltip: {}, appear: {} },
			stubs: {
				MkLoading: true,
				PageWithHeader: {
					components: { MkUserOnlineIndicator },
					setup: () => ({ metadata: mocks.page }),
					template: '<section><MkUserOnlineIndicator v-if="metadata.avatar" :user="metadata.avatar"/><slot/><slot name="footer"/></section>',
				},
			},
		},
	});
}

beforeEach(async () => {
	vi.useFakeTimers();
	vi.clearAllMocks();
	vi.spyOn(window.document, 'visibilityState', 'get').mockImplementation(() => documentVisibility);
	vi.spyOn(window.document, 'hidden', 'get').mockImplementation(() => documentVisibility !== 'visible');
	mocks.account.onlineStatusOverride = 'online';
	snapshot = { ...sourceUser };
	mocks.api.mockReset().mockImplementation(async endpoint => {
		if (endpoint === 'users/show') return sourceUser;
		if (endpoint === 'users/show-partial-bulk') return [snapshot];
		return [];
	});
	setVisibility('visible');
	initializeUserStatisticsSync();
	await flush();
	mocks.api.mockClear();
	vi.mocked(stream.send).mockClear();
});

afterEach(async () => {
	cleanup();
	setVisibility('hidden');
	await nextTick();
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('chat presence', () => {
	test('refreshes the header when the other user changes status or goes invisible', async () => {
		const view = renderChat();
		await flush();
		expect(view.getByRole('img', { name: customStatus.text })).toBeTruthy();
		expect(stream.send).toHaveBeenCalledWith('subUser', { id: sourceUser.id });

		snapshot = { ...sourceUser, onlineStatus: 'busy', customStatus: null };
		stream.emit('userStatsUpdated', { userIds: [sourceUser.id] });
		await flush();
		expect(view.getByRole('img', { name: i18n.ts._onlineStatus._display.busy })).toBeTruthy();
		expect(view.queryByRole('img', { name: customStatus.text })).toBeNull();

		snapshot = { ...sourceUser, onlineStatus: 'offline', customStatus: null };
		stream.emit('userStatsUpdated', { userIds: [sourceUser.id] });
		await flush();
		expect(view.getByRole('img', { name: i18n.ts._onlineStatus._display.offline })).toBeTruthy();
		expect(mocks.page?.value.avatar?.customStatus).toBeNull();
		expect(sourceUser.customStatus).toEqual(customStatus);
	});

	test('stops requesting hidden-page presence and refreshes when the chat becomes active again', async () => {
		const pageActive = ref(true);
		const view = renderChat(pageActive);
		await flush();
		pageActive.value = false;
		await flush();
		expect(stream.send).toHaveBeenCalledWith('unsubUser', { id: sourceUser.id });
		mocks.api.mockClear();

		snapshot = { ...sourceUser, onlineStatus: 'offline', customStatus: null };
		stream.emit('userStatsUpdated', { userIds: [sourceUser.id] });
		await flush();
		expect(mocks.api).not.toHaveBeenCalled();

		pageActive.value = true;
		await flush();
		expect(view.getByRole('img', { name: i18n.ts._onlineStatus._display.offline })).toBeTruthy();
	});

	test('keeps receiving and acknowledging messages while do not disturb suppresses the sound', async () => {
		const view = renderChat();
		await flush();
		const onMessage = mocks.connection.on.mock.calls.find(([event]) => event === 'message')?.[1];
		expect(onMessage).toBeTypeOf('function');
		const message = {
			id: 'first', fromUserId: sourceUser.id, toUserId: mocks.account.id,
			text: 'Normal incoming message', reactions: [], createdAt: new Date().toISOString(),
		};
		onMessage(message);
		await nextTick();
		expect(mocks.sound).toHaveBeenCalledExactlyOnceWith('chatMessage');

		mocks.sound.mockClear();
		mocks.connection.send.mockClear();
		mocks.account.onlineStatusOverride = 'doNotDisturb';
		onMessage({ ...message, id: 'second', text: 'Quiet incoming message' });
		await flush();
		expect(view.getByText('Quiet incoming message')).toBeTruthy();
		expect(mocks.sound).not.toHaveBeenCalled();
		expect(mocks.connection.send).toHaveBeenCalledExactlyOnceWith('read', { id: 'second' });
	});
});
