/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, test, vi } from 'vitest';
import Connection from '@/server/api/stream/Connection.js';

async function createConnection() {
	const subscriber = new EventEmitter();
	const ws = Object.assign(new EventEmitter(), { send: vi.fn(), readyState: 1 });
	const connection = new Connection({} as never, {} as never, {} as never, {} as never, {} as never, { user: null, token: null });
	await connection.listen(subscriber, ws as never);
	return {
		connection,
		subscriber,
		ws,
		request: (type: string, id: string) => ws.emit('message', Buffer.from(JSON.stringify({ type, body: { id } }))),
		update: (id: string) => subscriber.emit(`noteStream:${id}`, {
			type: 'deleted',
			body: { id, userId: 'author', visibility: 'public', body: { deletedAt: '2026-09-25T00:00:00.000Z' } },
		}),
		messages: () => ws.send.mock.calls.map(([message]) => JSON.parse(message)),
	};
}

describe('note stream subscriptions', () => {
	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	test('shares one listener across aliases and releases it after the last unsubscribe', async () => {
		const fixture = await createConnection();
		for (const type of ['subNote', 's', 'sr']) fixture.request(type, 'note');
		expect(fixture.subscriber.listenerCount('noteStream:note')).toBe(1);
		fixture.request('unsubNote', 'note');
		fixture.request('un', 'note');
		fixture.update('note');
		expect(fixture.messages()).toHaveLength(1);
		expect(fixture.messages()[0]).toMatchObject({ type: 'noteUpdated', body: { id: 'note', type: 'deleted' } });
		fixture.request('unsubNote', 'note');
		fixture.request('unsubNote', 'note');
		fixture.update('note');
		expect(fixture.subscriber.listenerCount('noteStream:note')).toBe(0);
		expect(fixture.messages()).toHaveLength(1);
		fixture.connection.dispose();
	});

	test('keeps the 1536 most recently subscribed distinct notes and preserves duplicate references', async () => {
		const fixture = await createConnection();
		for (let i = 0; i < 1536; i++) fixture.request('subNote', `note-${i}`);
		fixture.request('subNote', 'note-0');
		fixture.request('subNote', 'note-1536');
		expect(fixture.subscriber.eventNames().filter(name => String(name).startsWith('noteStream:'))).toHaveLength(1536);
		expect(fixture.subscriber.listenerCount('noteStream:note-0')).toBe(1);
		expect(fixture.subscriber.listenerCount('noteStream:note-1')).toBe(0);
		expect(fixture.subscriber.listenerCount('noteStream:note-1536')).toBe(1);
		fixture.request('unsubNote', 'note-0');
		fixture.update('note-0');
		fixture.update('note-1');
		fixture.update('note-1536');
		expect(fixture.messages().map(message => message.body.id)).toEqual(['note-0', 'note-1536']);
		fixture.request('unsubNote', 'note-0');
		expect(fixture.subscriber.listenerCount('noteStream:note-0')).toBe(0);
		fixture.connection.dispose();
	});

	test('can subscribe again to an evicted note without retaining its old reference count', async () => {
		const fixture = await createConnection();
		fixture.request('subNote', 'evicted');
		fixture.request('subNote', 'evicted');
		for (let i = 0; i < 1536; i++) fixture.request('subNote', `note-${i}`);
		expect(fixture.subscriber.listenerCount('noteStream:evicted')).toBe(0);
		fixture.request('unsubNote', 'evicted');
		fixture.request('subNote', 'evicted');
		expect(fixture.subscriber.listenerCount('noteStream:evicted')).toBe(1);
		fixture.request('unsubNote', 'evicted');
		expect(fixture.subscriber.listenerCount('noteStream:evicted')).toBe(0);
		fixture.connection.dispose();
	});

	test('disposal releases note and user listeners and cancels a pending statistics batch', async () => {
		vi.useFakeTimers();
		const fixture = await createConnection();
		fixture.request('subNote', 'note');
		fixture.request('subNote', 'note');
		fixture.request('subUser', 'user');
		fixture.subscriber.emit('userStatsStream:user', { id: 'user' });
		fixture.connection.dispose();
		fixture.connection.dispose();
		expect(fixture.subscriber.listenerCount('noteStream:note')).toBe(0);
		expect(fixture.subscriber.listenerCount('userStatsStream:user')).toBe(0);
		expect(fixture.ws.listenerCount('message')).toBe(0);
		fixture.update('note');
		vi.advanceTimersByTime(250);
		expect(fixture.messages()).toEqual([]);
		expect(vi.getTimerCount()).toBe(0);
	});
});
