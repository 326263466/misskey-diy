/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import { expect, test, vi } from 'vitest';
import { ChatRoomChannel } from '@/server/api/stream/channels/chat-room.js';
import { ChatUserChannel } from '@/server/api/stream/channels/chat-user.js';

function setup() {
	const subscriber = new EventEmitter();
	const sendMessageToWs = vi.fn();
	const permission = vi.fn().mockResolvedValue(true);
	const recipients = vi.fn().mockResolvedValue(new Set(['owner', 'member']));
	const rooms = { findOneBy: vi.fn().mockResolvedValue({ id: 'room', ownerId: 'owner' }) };
	const read = vi.fn().mockResolvedValue(undefined);
	const unread = vi.fn().mockResolvedValue({ count: 3, firstMessageId: '004', firstMentionId: null, lastMessageId: '006' });
	const blocked = vi.fn().mockResolvedValue(new Set());
	const service = { hasPermissionToViewRoomTimeline: permission, getRoomRecipientIds: recipients, getRoomBlockedRecipientIds: blocked, readRoomChatMessage: read, getUnreadSnapshot: unread };
	const channel = new ChatRoomChannel({ id: 'channel', connection: { user: { id: 'member' }, subscriber, sendMessageToWs } } as never, rooms as never, service as never);
	const emit = (type: string) => subscriber.emit('chatRoomStream:room', { type, body: { id: 'message' } });
	return { channel, subscriber, sendMessageToWs, permission, recipients, blocked, rooms, emit, read, unread, service };
}

test('queued messages cannot pass a pending membership revocation', async () => {
	const state = setup();
	expect(await state.channel.init({ roomId: 'room' })).toBe(true);
	state.emit('message');
	await vi.waitFor(() => expect(state.sendMessageToWs).toHaveBeenCalledOnce());
	state.sendMessageToWs.mockClear();
	state.permission.mockResolvedValue(false);
	let resolvePermission!: (allowed: Set<string>) => void;
	state.recipients.mockImplementation(() => new Promise(resolve => { resolvePermission = resolve; }));
	state.emit('membersChanged');
	state.emit('message');
	await vi.waitFor(() => expect(resolvePermission).toBeTypeOf('function'));
	expect(state.sendMessageToWs).not.toHaveBeenCalled();
	resolvePermission(new Set(['owner']));
	await vi.waitFor(() => expect(state.subscriber.listenerCount('chatRoomStream:room')).toBe(0));
	state.emit('message');
	expect(state.sendMessageToWs.mock.calls.map(([, event]) => event)).toEqual([{ id: 'channel', type: 'accessRevoked', body: null }]);
});

test('a revocation during initialization is not lost', async () => {
	const state = setup();
	let resolveInitial!: (allowed: boolean) => void;
	state.permission.mockImplementationOnce(() => new Promise(resolve => { resolveInitial = resolve; })).mockResolvedValue(false);
	state.recipients.mockResolvedValue(new Set(['owner']));
	const initializing = state.channel.init({ roomId: 'room' });
	await vi.waitFor(() => expect(resolveInitial).toBeTypeOf('function'));
	state.emit('membersChanged');
	state.emit('message');
	expect(state.sendMessageToWs).not.toHaveBeenCalled();
	resolveInitial(true);
	await initializing;
	await vi.waitFor(() => expect(state.subscriber.listenerCount('chatRoomStream:room')).toBe(0));
	expect(state.sendMessageToWs.mock.calls.map(([, event]) => event)).toEqual([{ id: 'channel', type: 'accessRevoked', body: null }]);
});

test('failed initial authorization removes the subscription and discards queued messages', async () => {
	const state = setup();
	state.permission.mockRejectedValue(new Error('database unavailable'));
	const initializing = state.channel.init({ roomId: 'room' });
	state.emit('message');
	expect(await initializing).toBe(false);
	expect(state.subscriber.listenerCount('chatRoomStream:room')).toBe(0);
	expect(state.sendMessageToWs).not.toHaveBeenCalled();
});

test('remaining members receive events in order after revalidation', async () => {
	const state = setup();
	await state.channel.init({ roomId: 'room' });
	state.emit('membersChanged');
	state.emit('roomUpdated');
	state.emit('message');
	await vi.waitFor(() => expect(state.sendMessageToWs).toHaveBeenCalledTimes(3));
	expect(state.sendMessageToWs.mock.calls.map(([, event]) => event.type)).toEqual(['membersChanged', 'roomUpdated', 'message']);
	state.channel.dispose();
});

test('a message arriving before the membership event cannot reach a removed member', async () => {
	const state = setup();
	await state.channel.init({ roomId: 'room' });
	state.permission.mockResolvedValue(false);
	state.recipients.mockResolvedValue(new Set(['owner']));
	state.emit('message');
	await vi.waitFor(() => expect(state.subscriber.listenerCount('chatRoomStream:room')).toBe(0));
	expect(state.sendMessageToWs.mock.calls.map(([, event]) => event)).toEqual([{ id: 'channel', type: 'accessRevoked', body: null }]);
	state.emit('membersChanged');
	expect(state.recipients).toHaveBeenCalledOnce();
});

test('connections share one recipient query for an event and recheck the next event', async () => {
	const state = setup();
	const otherSend = vi.fn();
	const other = new ChatRoomChannel({ id: 'other-channel', connection: { user: { id: 'other' }, subscriber: state.subscriber, sendMessageToWs: otherSend } } as never, state.rooms as never, state.service as never);
	state.recipients.mockResolvedValue(new Set(['owner', 'member', 'other']));
	await state.channel.init({ roomId: 'room' });
	await other.init({ roomId: 'room' });
	state.emit('message');
	await vi.waitFor(() => {
		expect(state.sendMessageToWs).toHaveBeenCalledOnce();
		expect(otherSend).toHaveBeenCalledOnce();
	});
	expect(state.recipients).toHaveBeenCalledOnce();
	state.recipients.mockResolvedValue(new Set(['owner']));
	state.permission.mockResolvedValue(false);
	state.emit('message');
	await vi.waitFor(() => expect(state.subscriber.listenerCount('chatRoomStream:room')).toBe(0));
	expect(state.recipients).toHaveBeenCalledTimes(2);
	expect(state.sendMessageToWs.mock.lastCall?.[1].type).toBe('accessRevoked');
	expect(otherSend.mock.lastCall?.[1].type).toBe('accessRevoked');
});

test('existing site moderation access is preserved without granting group roles that access', async () => {
	const state = setup();
	await state.channel.init({ roomId: 'room' });
	state.recipients.mockResolvedValue(new Set(['owner']));
	state.emit('message');
	await vi.waitFor(() => expect(state.sendMessageToWs).toHaveBeenCalledOnce());
	expect(state.sendMessageToWs.mock.lastCall?.[1].type).toBe('message');
	expect(state.permission).toHaveBeenLastCalledWith('member', { id: 'room', ownerId: 'owner' });
	state.channel.dispose();
});

test('scroll reads return the remaining count only after the cursor is acknowledged', async () => {
	const state = setup();
	await state.channel.init({ roomId: 'room' });
	let finish!: () => void;
	state.read.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
	state.channel.onMessage('read', { id: '003', count: true });
	expect(state.unread).not.toHaveBeenCalled();
	finish();
	await vi.waitFor(() => expect(state.unread).toHaveBeenCalledWith('member', 'room', 'room', false));
	expect(state.sendMessageToWs.mock.lastCall).toEqual(['channel', { id: 'channel', type: 'unreadCount', body: { count: 3, firstMessageId: '004', firstMentionId: null, lastMessageId: '006', throughId: '003' } }]);
	state.channel.dispose();
});

test('self chat subscribes to its own conversation once', async () => {
	const subscriber = new EventEmitter();
	const sendMessageToWs = vi.fn();
	const channel = new ChatUserChannel({ id: 'self-chat', connection: { user: { id: 'self' }, subscriber, sendMessageToWs } } as never, { getConversationNotificationMode: async () => 'all' } as never);
	expect(await channel.init({ otherId: 'self' })).toBe(true);
	subscriber.emit('chatUserStream:self-self', { type: 'message', body: { id: 'saved' } });
	await vi.waitFor(() => expect(sendMessageToWs).toHaveBeenCalledOnce());
	channel.dispose();
	expect(subscriber.listenerCount('chatUserStream:self-self')).toBe(0);
});

test('blocked room messages are suppressed without treating the member as removed', async () => {
	const state = setup();
	await state.channel.init({ roomId: 'room' });
	state.blocked.mockResolvedValue(new Set(['member']));
	state.emit('message');
	await vi.waitFor(() => expect(state.blocked).toHaveBeenCalledOnce());
	await Promise.resolve();
	expect(state.sendMessageToWs).not.toHaveBeenCalled();
	expect(state.subscriber.listenerCount('chatRoomStream:room')).toBe(1);
	state.blocked.mockResolvedValue(new Set());
	state.emit('message');
	await vi.waitFor(() => expect(state.sendMessageToWs).toHaveBeenCalledOnce());
	state.channel.dispose();
});

test('private conversation blocking suppresses live events and resumes after unblocking', async () => {
	const subscriber = new EventEmitter();
	const sendMessageToWs = vi.fn();
	const mode = vi.fn().mockResolvedValue('blocked');
	const channel = new ChatUserChannel({ id: 'private', connection: { user: { id: 'reader' }, subscriber, sendMessageToWs } } as never, { getConversationNotificationMode: mode } as never);
	await channel.init({ otherId: 'sender' });
	subscriber.emit('chatUserStream:reader-sender', { type: 'message', body: { id: 'hidden' } });
	await vi.waitFor(() => expect(mode).toHaveBeenCalledOnce());
	await Promise.resolve();
	expect(sendMessageToWs).not.toHaveBeenCalled();
	mode.mockResolvedValue('all');
	subscriber.emit('chatUserStream:reader-sender', { type: 'message', body: { id: 'visible' } });
	await vi.waitFor(() => expect(sendMessageToWs).toHaveBeenCalledOnce());
	expect(sendMessageToWs.mock.lastCall?.[1].body).toEqual({ id: 'visible' });
	channel.dispose();
});
