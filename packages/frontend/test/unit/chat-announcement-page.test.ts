/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { EventEmitter } from 'eventemitter3';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import ChatAnnouncementPage from '@/pages/chat/room.announcement-page.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(), writeApi: vi.fn(), channel: vi.fn(), push: vi.fn(), toast: vi.fn(),
	me: { id: 'self', username: 'self', name: 'Self', host: null },
}));

vi.mock('@/i.js', () => ({ ensureSignin: () => mocks.me, $i: mocks.me }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/misskey-api-with-toast.js', () => ({ misskeyApiWithErrorToast: mocks.writeApi }));
vi.mock('@/stream.js', () => ({ useStream: () => ({ useChannel: mocks.channel }) }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/os.js', () => ({ toast: mocks.toast }));
vi.mock('@/components/MkModalWindow.vue', () => ({ default: { template: '<section role="dialog"><slot name="header"/><slot/></section>' } }));
vi.mock('@/components/MkTextarea.vue', () => ({
	default: {
		props: ['modelValue', 'disabled'], emits: ['update:modelValue'],
		template: '<label><slot name="label"/><textarea :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea></label>',
	},
}));
vi.mock('@/components/MkButton.vue', () => ({
	default: { props: ['disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot/></button>' },
}));

function createConnection() {
	const events = new EventEmitter();
	return Object.assign(events, { dispose: vi.fn(() => events.removeAllListeners()) });
}

let connection = createConnection();

function room(patch: Partial<Misskey.entities.ChatRoom> = {}): Misskey.entities.ChatRoom {
	return {
		id: 'room1', name: 'Room one', createdAt: '2026-10-28T00:00:00.000Z',
		ownerId: mocks.me.id, owner: mocks.me as Misskey.entities.UserLite, memberCount: 2,
		description: '', joinPolicy: 'public', joinQuestion: '', isMember: true, myRole: 'owner',
		announcement: 'Server announcement', ownerNickname: '', myNickname: '',
		myIsSilenced: false, mySilenceUntil: null, isSilenced: false, silenceUntil: null,
		joinRequestPending: false, mutedUntil: null, ...patch,
	};
}

function renderPage() {
	return render(ChatAnnouncementPage, {
		props: { roomId: 'room1' },
		global: {
			stubs: {
				MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
				Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
				MkLoading: { template: '<div role="status">Loading</div>' },
				MkError: { emits: ['retry'], setup: () => ({ retryLabel: i18n.ts.retry }), template: '<button @click="$emit(\'retry\')">{{ retryLabel }}</button>' },
			},
		},
	});
}

const flushPromises = () => new Promise<void>(resolve => window.setTimeout(resolve, 0));

beforeEach(() => {
	mocks.api.mockReset();
	mocks.writeApi.mockReset();
	mocks.push.mockReset();
	mocks.toast.mockReset();
	connection = createConnection();
	mocks.channel.mockReset().mockReturnValue(connection);
});

afterEach(cleanup);

describe('independent chat announcement page', () => {
	test('keeps an unsaved draft after a background refresh fails and a retry succeeds', async () => {
		mocks.api.mockResolvedValueOnce(room())
			.mockRejectedValueOnce(new TypeError('Offline'))
			.mockResolvedValueOnce(room({ name: 'Refreshed room', announcement: 'Updated server announcement' }));
		const view = renderPage();
		const editor = await view.findByRole('textbox', { name: i18n.ts._chat.announcement });
		await fireEvent.update(editor, 'Unsaved announcement draft');
		connection.emit('roomUpdated');
		const retry = await view.findByRole('button', { name: i18n.ts.retry });
		expect((view.getByRole('textbox', { name: i18n.ts._chat.announcement }) as HTMLTextAreaElement).value).toBe('Unsaved announcement draft');
		expect(mocks.push).not.toHaveBeenCalled();
		await fireEvent.click(retry);
		await view.findByText('Refreshed room');
		expect((view.getByRole('textbox', { name: i18n.ts._chat.announcement }) as HTMLTextAreaElement).value).toBe('Unsaved announcement draft');
		expect(view.queryByRole('button', { name: i18n.ts.retry })).toBeNull();
		expect(mocks.api).toHaveBeenCalledTimes(3);
		expect(mocks.writeApi).not.toHaveBeenCalled();
	});

	test('removes the editor after access is revoked and ignores a late room response', async () => {
		const refresh = Promise.withResolvers<Misskey.entities.ChatRoom>();
		mocks.api.mockResolvedValueOnce(room()).mockReturnValueOnce(refresh.promise);
		const view = renderPage();
		await view.findByRole('textbox', { name: i18n.ts._chat.announcement });
		connection.emit('roomUpdated');
		await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
		const signal = mocks.api.mock.calls.at(-1)![3] as AbortSignal;
		connection.emit('accessRevoked');
		await nextTick();
		expect(signal.aborted).toBe(true);
		expect(connection.dispose).toHaveBeenCalledOnce();
		expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/chat');
		expect(view.queryByRole('textbox')).toBeNull();
		expect(view.queryByRole('button', { name: i18n.ts.save })).toBeNull();
		refresh.resolve(room({ name: 'Late private room', announcement: 'Late private announcement' }));
		await flushPromises();
		expect(view.queryByRole('textbox')).toBeNull();
		expect(view.queryByText('Late private room')).toBeNull();
		expect(view.queryByText('Late private announcement')).toBeNull();
		expect(view.queryByRole('button', { name: i18n.ts.retry })).toBeNull();
		expect(mocks.api).toHaveBeenCalledTimes(2);
		expect(mocks.writeApi).not.toHaveBeenCalled();
	});
});
