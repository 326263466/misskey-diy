/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/vue';
import { nextTick, reactive } from 'vue';
import type * as Misskey from 'misskey-js';
import XMessage from '@/pages/chat/XMessage.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	alert: vi.fn(),
	toast: vi.fn(),
	picker: vi.fn(),
	contextMenu: vi.fn(),
	me: { id: 'me', username: 'me', name: 'Me', host: null, policies: { chatAvailability: 'available' } },
}));

vi.mock('@/i.js', () => ({ $i: mocks.me, ensureSignin: () => mocks.me }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/reaction-picker.js', () => ({ reactionPicker: { show: mocks.picker } }));
vi.mock('@/utility/sound.js', () => ({ playMisskeySfx: vi.fn(), playChatMessageDeleteSfx: vi.fn() }));
vi.mock('@/os.js', () => ({ alert: mocks.alert, toast: mocks.toast, contextMenu: mocks.contextMenu, popup: vi.fn(() => ({ dispose: vi.fn() })) }));
vi.mock('@/composables/use-tooltip.js', () => ({ useTooltip: vi.fn() }));
vi.mock('@/components/MkUrlPreview.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkMediaList.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkRedPacket.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkReactionIcon.vue', () => ({
	default: { props: ['reaction'], template: '<span>{{ reaction }}</span>' },
}));

function user(id: string): Misskey.entities.UserLite {
	return { id, username: id, name: id, host: null } as Misskey.entities.UserLite;
}

const alice = user('alice');
const bob = user('bob');
const me = mocks.me as unknown as Misskey.entities.UserLite;

function reactionLabel(reaction: string, count: number): string {
	return i18n.tsx._chat.reactionLabel({ reaction, count });
}

function renderMessage(reactions: Misskey.entities.ChatMessage['reactions']) {
	const message = reactive({
		id: 'message', fromUserId: alice.id, fromUser: alice, toUserId: me.id,
		text: 'Message', createdAt: '2026-10-04T00:00:00.000Z', reactions,
	} as Misskey.entities.ChatMessage);
	const view = render(XMessage, {
		props: { message },
		global: {
			directives: { tooltip: {} },
			stubs: {
				MkAvatar: true, MkUserName: true, MkTime: true, MkA: true, Mfm: true,
				MkFukidashi: { template: '<div><slot/></div>' },
			},
		},
	});
	return { ...view, message };
}

describe('chat message reactions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.api.mockReset().mockResolvedValue(undefined);
		mocks.alert.mockReset().mockResolvedValue(undefined);
		mocks.picker.mockReset();
	});

	afterEach(cleanup);

	test('自己的菜单不显示提及，头像戳一戳传递对应用户并可撤回', async () => {
		const view = renderMessage([]);
		await view.rerender({ canCompose: true });
		await fireEvent.contextMenu(view.container.querySelector('mk-avatar-stub')!);
		const poke = mocks.contextMenu.mock.lastCall![0].find((item: { text?: string }) => item.text === i18n.ts._chat.poke);
		poke.action();
		expect(view.emitted('poke')).toEqual([[alice.id]]);
		view.message.fromUserId = me.id;
		view.message.fromUser = me;
		await nextTick();
		await fireEvent.contextMenu(view.container.querySelector('[data-chat-bubble]')!);
		expect(mocks.contextMenu.mock.lastCall![0].some((item: { text?: string }) => item.text === i18n.ts._chat.mentionSender)).toBe(false);
		view.message.isPoke = true;
		view.message.pokeUserId = alice.id;
		view.message.pokeUser = alice;
		await nextTick();
		expect(view.container.querySelector('[data-chat-bubble]')).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._chat.withdrawPoke }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('chat/messages/delete', { messageId: 'message' }));
	});

	test('groups equivalent Unicode and local emoji while counting each participant once', () => {
		const view = renderMessage([
			{ reaction: '❤', user: alice },
			{ reaction: '❤️', user: alice },
			{ reaction: '❤️', user: bob },
			{ reaction: ':cat:', user: alice },
			{ reaction: ':cat@.:', user: me },
			{ reaction: ':cat:', user: me },
		]);

		const heart = view.getByRole('button', { name: reactionLabel('heart', 2) });
		const cat = view.getByRole('button', { name: reactionLabel(':cat:', 2) });
		expect(within(heart).getByText('2')).toBeTruthy();
		expect(within(cat).getByText('2')).toBeTruthy();
		expect(heart.getAttribute('aria-pressed')).toBe('false');
		expect(cat.getAttribute('aria-pressed')).toBe('true');
		expect(view.container.querySelectorAll('button[aria-pressed]')).toHaveLength(2);
		expect(mocks.api).not.toHaveBeenCalled();
	});

	test('adds and removes the clicked reaction without removing my other emoji', async () => {
		const reactions = [{ reaction: '😀', user: alice }, { reaction: ':cat:', user: me }];
		const view = renderMessage([...reactions]);
		await fireEvent.click(view.getByRole('button', { name: reactionLabel('grinning', 1) }));
		const joined = await view.findByRole('button', { name: reactionLabel('grinning', 2) });
		expect(mocks.api).toHaveBeenLastCalledWith('chat/messages/react', { messageId: 'message', reaction: '😀' });
		expect(joined.getAttribute('aria-pressed')).toBe('true');
		expect(within(joined).getByText('2')).toBeTruthy();

		await waitFor(() => expect((joined as HTMLButtonElement).disabled).toBe(false));
		await fireEvent.click(joined);
		const removed = await view.findByRole('button', { name: reactionLabel('grinning', 1) });
		expect(mocks.api).toHaveBeenLastCalledWith('chat/messages/unreact', { messageId: 'message', reaction: '😀' });
		expect(removed.getAttribute('aria-pressed')).toBe('false');
		expect(view.getByRole('button', { name: reactionLabel(':cat:', 1) }).getAttribute('aria-pressed')).toBe('true');
		expect(view.message.reactions).toEqual(reactions);
	});

	test('allows joining an existing emoji at 100 types and rejects a new picker selection', async () => {
		const reactions = Array.from({ length: 100 }, (_, index) => [
			{ reaction: `:emoji${index}:`, user: alice },
			{ reaction: `:emoji${index}:`, user: index < 99 ? me : bob },
		]).flat();
		const view = renderMessage(reactions);
		await fireEvent.click(view.getByRole('button', { name: reactionLabel(':emoji99:', 2) }));
		const joined = await view.findByRole('button', { name: reactionLabel(':emoji99:', 3) });
		expect(joined.getAttribute('aria-pressed')).toBe('true');
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('chat/messages/react', { messageId: 'message', reaction: ':emoji99:' });
		expect(view.message.reactions).toHaveLength(201);
		const addButton = view.getByRole('button', { name: i18n.ts._chat.addReaction });
		await waitFor(() => expect((addButton as HTMLButtonElement).disabled).toBe(false));
		await fireEvent.click(addButton);
		expect(mocks.picker.mock.lastCall![0]).toBe(addButton);
		mocks.picker.mockClear();

		const bubble = view.container.querySelector('[data-chat-bubble]')!;
		await fireEvent.contextMenu(bubble);
		const addReaction = mocks.contextMenu.mock.calls[0][0].find((item: { text?: string }) => item.text === i18n.ts._chat.addReaction);
		addReaction.action({ target: document.createElement('button'), currentTarget: null });
		expect(mocks.picker).toHaveBeenCalledOnce();
		expect(mocks.picker.mock.lastCall![0]).toBe(bubble);
		mocks.picker.mock.calls[0][2](':overflow:');
		await nextTick();
		expect(mocks.api).toHaveBeenCalledTimes(1);
		expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts._chat.reactionLimit, 'warning');
		expect(view.message.reactions).toHaveLength(201);
		expect(view.queryByRole('button', { name: reactionLabel(':overflow:', 1) })).toBeNull();
	});

	test('keeps counts and my selected state when adding or removing fails', async () => {
		mocks.api.mockRejectedValue(new Error('Request failed'));
		const reactions = [
			{ reaction: '😀', user: alice },
			{ reaction: ':cat:', user: alice },
			{ reaction: ':cat:', user: me },
		];
		const view = renderMessage([...reactions]);
		await fireEvent.click(view.getByRole('button', { name: reactionLabel('grinning', 1) }));
		await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
		expect(view.getByRole('button', { name: reactionLabel('grinning', 1) }).getAttribute('aria-pressed')).toBe('false');
		expect(view.message.reactions).toEqual(reactions);

		await fireEvent.click(view.getByRole('button', { name: reactionLabel(':cat:', 2) }));
		await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(2));
		expect(mocks.api).toHaveBeenLastCalledWith('chat/messages/unreact', { messageId: 'message', reaction: ':cat:' });
		expect(mocks.toast).toHaveBeenLastCalledWith(i18n.ts.somethingHappened, 'error');
		expect(view.getByRole('button', { name: reactionLabel(':cat:', 2) }).getAttribute('aria-pressed')).toBe('true');
		expect(view.message.reactions).toEqual(reactions);
	});
});
