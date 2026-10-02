/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import { expect, test, vi } from 'vitest';
import { ChatRoomChannel } from '@/server/api/stream/channels/chat-room.js';

function setup() {
	const subscriber = new EventEmitter();
	const sendMessageToWs = vi.fn();
	const permission = vi.fn().mockResolvedValue(true);
	const rooms = { findOneBy: vi.fn().mockResolvedValue({ id: 'room', ownerId: 'owner' }) };
	const channel = new ChatRoomChannel({ id: 'channel', connection: { user: { id: 'member' }, subscriber, sendMessageToWs } } as never, rooms as never, { hasPermissionToViewRoomTimeline: permission } as never);
	const emit = (type: string) => subscriber.emit('chatRoomStream:room', { type, body: { id: 'message' } });
	return { channel, subscriber, sendMessageToWs, permission, rooms, emit };
}

test('queued messages cannot pass a pending membership revocation', async () => {
	const state = setup();
	expect(await state.channel.init({ roomId: 'room' })).toBe(true);
	state.emit('message');
	await vi.waitFor(() => expect(state.sendMessageToWs).toHaveBeenCalledOnce());
	state.sendMessageToWs.mockClear();
	let resolvePermission!: (allowed: boolean) => void;
	state.permission.mockImplementation(() => new Promise(resolve => { resolvePermission = resolve; }));
	state.emit('membersChanged');
	state.emit('message');
	await vi.waitFor(() => expect(resolvePermission).toBeTypeOf('function'));
	expect(state.sendMessageToWs).not.toHaveBeenCalled();
	resolvePermission(false);
	await vi.waitFor(() => expect(state.subscriber.listenerCount('chatRoomStream:room')).toBe(0));
	state.emit('message');
	expect(state.sendMessageToWs).not.toHaveBeenCalled();
});

test('a revocation during initialization is not lost', async () => {
	const state = setup();
	let resolveInitial!: (allowed: boolean) => void;
	state.permission.mockImplementationOnce(() => new Promise(resolve => { resolveInitial = resolve; })).mockResolvedValue(false);
	const initializing = state.channel.init({ roomId: 'room' });
	await vi.waitFor(() => expect(resolveInitial).toBeTypeOf('function'));
	state.emit('membersChanged');
	state.emit('message');
	expect(state.sendMessageToWs).not.toHaveBeenCalled();
	resolveInitial(true);
	await initializing;
	await vi.waitFor(() => expect(state.subscriber.listenerCount('chatRoomStream:room')).toBe(0));
	expect(state.sendMessageToWs).not.toHaveBeenCalled();
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
	state.emit('message');
	await vi.waitFor(() => expect(state.sendMessageToWs).toHaveBeenCalledTimes(2));
	expect(state.sendMessageToWs.mock.calls.map(([, event]) => event.type)).toEqual(['membersChanged', 'message']);
	state.channel.dispose();
});
