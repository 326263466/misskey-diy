/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { EventEmitter } from 'eventemitter3';
import { initializeAccountReconnectSync } from '@/utility/account-reconnect-sync.js';

function setup(refresh = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined)) {
	const stream = new EventEmitter();
	const dispose = initializeAccountReconnectSync(stream, refresh);
	const reconnect = () => {
		stream.emit('_disconnected_');
		stream.emit('_connected_');
	};
	return { stream, refresh, dispose, reconnect };
}

describe('account synchronization after reconnect', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	test('skips initial connect and refreshes once after a disconnection', async () => {
		const { stream, refresh, reconnect } = setup();
		stream.emit('_connected_');
		expect(refresh).not.toHaveBeenCalled();
		reconnect();
		stream.emit('_connected_');
		await Promise.resolve();
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	test('coalesces reconnects during a request into one pending refresh', async () => {
		let complete!: () => void;
		const refresh = vi.fn<() => Promise<unknown>>().mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; })).mockResolvedValue(undefined);
		const { reconnect } = setup(refresh);
		reconnect();
		reconnect();
		reconnect();
		expect(refresh).toHaveBeenCalledTimes(1);
		complete();
		await Promise.resolve();
		expect(refresh).toHaveBeenCalledTimes(2);
	});

	test('defers a pending refresh until the connection returns', async () => {
		let complete!: () => void;
		const refresh = vi.fn<() => Promise<unknown>>().mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; })).mockResolvedValue(undefined);
		const { stream, reconnect } = setup(refresh);
		reconnect();
		stream.emit('_disconnected_');
		complete();
		await Promise.resolve();
		expect(refresh).toHaveBeenCalledTimes(1);
		stream.emit('_connected_');
		expect(refresh).toHaveBeenCalledTimes(2);
	});

	test('does not loop on errors and retries on the next reconnect', async () => {
		const refresh = vi.fn<() => Promise<unknown>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
		const { reconnect } = setup(refresh);
		reconnect();
		await Promise.resolve();
		expect(refresh).toHaveBeenCalledTimes(1);
		reconnect();
		expect(refresh).toHaveBeenCalledTimes(2);
	});

	test('recovers from a transient failure without another connection event', async () => {
		const refresh = vi.fn<() => Promise<unknown>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
		const { stream, reconnect } = setup(refresh);
		reconnect();
		await Promise.resolve();
		stream.emit('_connected_');
		await vi.advanceTimersByTimeAsync(999);
		expect(refresh).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(refresh).toHaveBeenCalledTimes(2);
		expect(vi.getTimerCount()).toBe(0);
	});

	test('limits failures to three delayed retries and resets the budget on reconnect', async () => {
		const refresh = vi.fn<() => Promise<unknown>>().mockRejectedValue(new Error('offline'));
		const { stream, reconnect, dispose } = setup(refresh);
		reconnect();
		await vi.advanceTimersByTimeAsync(14000);
		expect(refresh).toHaveBeenCalledTimes(4);
		expect(vi.getTimerCount()).toBe(0);
		stream.emit('_connected_');
		await vi.advanceTimersByTimeAsync(60000);
		expect(refresh).toHaveBeenCalledTimes(4);
		reconnect();
		await vi.advanceTimersByTimeAsync(1000);
		expect(refresh).toHaveBeenCalledTimes(6);
		dispose();
	});

	test.each(['disconnect', 'dispose'])('cancels a scheduled retry on %s', async (action) => {
		const refresh = vi.fn<() => Promise<unknown>>().mockRejectedValue(new Error('offline'));
		const { stream, reconnect, dispose } = setup(refresh);
		reconnect();
		await Promise.resolve();
		expect(vi.getTimerCount()).toBe(1);
		if (action === 'disconnect') stream.emit('_disconnected_');
		else dispose();
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(60000);
		expect(refresh).toHaveBeenCalledTimes(1);
		dispose();
	});

	test('coalesces reconnects while a retry is in flight, even if it fails', async () => {
		let fail!: (error: Error) => void;
		const refresh = vi.fn<() => Promise<unknown>>()
			.mockRejectedValueOnce(new Error('offline'))
			.mockImplementationOnce(() => new Promise<void>((resolve, reject) => { fail = reject; }))
			.mockResolvedValue(undefined);
		const { reconnect } = setup(refresh);
		reconnect();
		await vi.advanceTimersByTimeAsync(1000);
		reconnect();
		reconnect();
		expect(refresh).toHaveBeenCalledTimes(2);
		fail(new Error('offline'));
		await Promise.resolve();
		expect(refresh).toHaveBeenCalledTimes(3);
		await Promise.resolve();
		expect(vi.getTimerCount()).toBe(0);
	});

	test.each(['disconnect', 'dispose'])('does not schedule retries when a request fails after %s', async (action) => {
		let fail!: (error: Error) => void;
		const refresh = vi.fn<() => Promise<unknown>>()
			.mockImplementationOnce(() => new Promise<void>((resolve, reject) => { fail = reject; }));
		const { stream, reconnect, dispose } = setup(refresh);
		reconnect();
		if (action === 'disconnect') stream.emit('_disconnected_');
		else dispose();
		fail(new Error('offline'));
		await Promise.resolve();
		expect(vi.getTimerCount()).toBe(0);
		expect(refresh).toHaveBeenCalledTimes(1);
		dispose();
	});

	test('removes listeners and discards pending refreshes when disposed', async () => {
		let complete!: () => void;
		const refresh = vi.fn<() => Promise<unknown>>().mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
		const { stream, reconnect, dispose } = setup(refresh);
		reconnect();
		reconnect();
		dispose();
		complete();
		await Promise.resolve();
		reconnect();
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(stream.listenerCount('_connected_')).toBe(0);
		expect(stream.listenerCount('_disconnected_')).toBe(0);
	});
});
