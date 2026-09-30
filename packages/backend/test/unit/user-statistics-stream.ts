/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import Connection from '@/server/api/stream/Connection.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';

async function createConnection() {
	const subscriber = new EventEmitter();
	const ws = Object.assign(new EventEmitter(), { send: vi.fn(), readyState: 1 });
	const connection = new Connection({} as never, {} as never, {} as never, {} as never, {} as never, { user: null, token: null });
	await connection.listen(subscriber, ws as never);
	return {
		connection,
		subscriber,
		ws,
		request: (type: string, body: unknown) => ws.emit('message', Buffer.from(JSON.stringify({ type, body }))),
		invalidate: (id: string) => subscriber.emit(`userStatsStream:${id}`, { id }),
		messages: () => ws.send.mock.calls.map(([message]) => JSON.parse(message)),
	};
}

describe('user statistics subscriptions', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	test('reference counts subscriptions and removes queued updates only after the last unsubscribe', async () => {
		const fixture = await createConnection();
		fixture.request('subUser', { id: 'user' });
		fixture.request('subUser', { id: 'user' });
		expect(fixture.subscriber.listenerCount('userStatsStream:user')).toBe(1);
		fixture.request('unsubUser', { id: 'user' });
		fixture.invalidate('user');
		vi.advanceTimersByTime(250);
		expect(fixture.messages()).toEqual([{ type: 'userStatsUpdated', body: { userIds: ['user'] } }]);
		fixture.ws.send.mockClear();
		fixture.invalidate('user');
		fixture.request('unsubUser', { id: 'user' });
		fixture.request('unsubUser', { id: 'user' });
		vi.advanceTimersByTime(250);
		expect(fixture.subscriber.listenerCount('userStatsStream:user')).toBe(0);
		expect(fixture.messages()).toEqual([]);
		fixture.connection.dispose();
	});

	test('coalesces repeated updates into one batch containing only subscribed users', async () => {
		const fixture = await createConnection();
		fixture.request('subUser', { id: 'a' });
		fixture.request('subUser', { id: 'b' });
		for (let i = 0; i < 20; i++) fixture.invalidate('a');
		fixture.invalidate('b');
		fixture.invalidate('not-subscribed');
		vi.advanceTimersByTime(249);
		expect(fixture.messages()).toEqual([]);
		vi.advanceTimersByTime(1);
		expect(fixture.messages()).toEqual([{ type: 'userStatsUpdated', body: { userIds: ['a', 'b'] } }]);
		fixture.invalidate('b');
		vi.advanceTimersByTime(250);
		expect(fixture.messages()[1]).toEqual({ type: 'userStatsUpdated', body: { userIds: ['b'] } });
		fixture.connection.dispose();
	});

	test('caps unique subscriptions at 100 while allowing references and reuse of released slots', async () => {
		const fixture = await createConnection();
		for (let i = 0; i <= 100; i++) fixture.request('subUser', { id: `user-${i}` });
		fixture.request('subUser', { id: 'user-0' });
		fixture.request('unsubUser', { id: 'user-0' });
		for (let i = 0; i <= 100; i++) fixture.invalidate(`user-${i}`);
		vi.advanceTimersByTime(250);
		expect(fixture.messages()[0].body.userIds).toHaveLength(100);
		expect(fixture.subscriber.listenerCount('userStatsStream:user-100')).toBe(0);
		fixture.request('unsubUser', { id: 'user-0' });
		fixture.request('subUser', { id: 'user-100' });
		fixture.invalidate('user-100');
		vi.advanceTimersByTime(250);
		expect(fixture.messages()[1].body.userIds).toEqual(['user-100']);
		fixture.connection.dispose();
	});

	test('disposal releases listeners and cancels pending updates', async () => {
		const fixture = await createConnection();
		fixture.request('subUser', { id: 'user' });
		fixture.invalidate('user');
		fixture.connection.dispose();
		expect(fixture.subscriber.listenerCount('userStatsStream:user')).toBe(0);
		expect(fixture.ws.listenerCount('message')).toBe(0);
		fixture.invalidate('user');
		vi.advanceTimersByTime(250);
		expect(fixture.messages()).toEqual([]);
		expect(vi.getTimerCount()).toBe(0);
	});

	test('ignores malformed subscription bodies', async () => {
		const fixture = await createConnection();
		for (const body of [null, [], {}, { id: 1 }, { id: '' }, { id: 'a'.repeat(33) }]) {
			fixture.request('subUser', body);
		}
		expect(fixture.subscriber.eventNames()).toEqual(['broadcast']);
		fixture.connection.dispose();
	});
});

test('user statistics publication contains only the invalidated user id', () => {
	const publish = vi.fn();
	const service = new GlobalEventService({ host: 'instance.test' } as never, { publish } as never);
	service.publishUserStats('user');
	const [host, serialized] = publish.mock.calls[0];
	expect(host).toBe('instance.test');
	expect(JSON.parse(serialized)).toEqual({ channel: 'userStatsStream:user', message: { id: 'user' } });
});
