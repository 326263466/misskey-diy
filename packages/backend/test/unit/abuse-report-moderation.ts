/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { AbuseReportService } from '@/core/AbuseReportService.js';
import { MiAbuseUserReport, MiUser } from '@/models/_.js';
import type { IFlag } from '@/core/activitypub/type.js';

function setup() {
	const state = {
		report: {
			id: 'report', targetUserId: 'target', targetUserHost: 'remote.test', reporterId: 'reporter', reporterHost: null,
			requestId: 'private-request-id', requestFingerprint: 'private-fingerprint',
			forwarded: false, resolved: false, resolvedAs: null, assigneeId: null,
			comment: 'Reporter explanation', reason: 'harassment', snapshot: null, moderationNote: '',
		} as MiAbuseUserReport,
		target: { id: 'target', host: 'remote.test', uri: 'https://remote.test/users/target', inbox: 'https://remote.test/inbox' } as MiUser | null,
		commitError: null as Error | null,
	};
	const moderator = { id: 'moderator' } as MiUser;
	const events: string[] = [];
	const lockedRead = vi.fn();
	let transactionTail = Promise.resolve();
	const db = {
		transaction: vi.fn(async (_isolation: string, callback: (manager: unknown) => Promise<unknown>) => {
			const previous = transactionTail;
			const release = Promise.withResolvers<void>();
			transactionTail = release.promise;
			await previous;
			const pending = structuredClone(state.report);
			try {
				const result = await callback({
					findOneOrFail: async (entity: unknown, options: unknown) => {
						lockedRead(entity, options);
						return structuredClone(pending);
					},
					findOneBy: async () => state.target,
					update: async (_entity: unknown, _id: string, changes: Partial<MiAbuseUserReport>) => {
						events.push('update');
						Object.assign(pending, changes);
					},
				});
				if (state.commitError != null) throw state.commitError;
				state.report = pending;
				events.push('commit');
				return result;
			} finally {
				release.resolve();
			}
		}),
	};
	const reports = {
		findBy: vi.fn(async () => [structuredClone(state.report)]),
		findOneBy: vi.fn(async () => structuredClone(state.report)),
		update: vi.fn(async (where: { id: string; resolved: boolean }, changes: Partial<MiAbuseUserReport>) => {
			if (state.report.id !== where.id || state.report.resolved !== where.resolved) return { affected: 0 };
			Object.assign(state.report, changes);
			return { affected: 1 };
		}),
	};
	const queue = { deliver: vi.fn(async (): Promise<{ id: string } | null> => { events.push('enqueue'); return { id: 'job' }; }) };
	const actor = { id: 'actor', host: null } as MiUser;
	const systemAccount = { fetch: vi.fn(async () => actor) };
	const renderer = {
		renderFlag: vi.fn((_actor: MiUser, object: string, content: string): IFlag => ({ type: 'Flag', actor: 'https://local.test/users/actor', object, content })),
		addContext: vi.fn((flag: IFlag) => flag),
	};
	const log = vi.fn(async () => { events.push('log'); });
	const notifications = { notifySystemWebhook: vi.fn(async () => {}) };
	const logger = { error: vi.fn() };
	const service = new AbuseReportService(
		db as never, reports as never, {} as never, {} as never, notifications as never, queue as never,
		systemAccount as never, renderer as never, { log } as never, {} as never, {} as never, { getLogger: () => logger } as never,
	);
	return { service, state, moderator, reports, queue, systemAccount, renderer, log, notifications, logger, events, lockedRead, actor };
}

describe('Abuse report forwarding', () => {
	test('awaits queue acceptance before committing forwarding status and logging success', async () => {
		const { service, state, moderator, queue, events, log, actor } = setup();
		const entered = Promise.withResolvers<void>();
		const accepted = Promise.withResolvers<{ id: string }>();
		queue.deliver.mockImplementationOnce(async () => {
			entered.resolve();
			return accepted.promise;
		});
		const task = service.forward('report', moderator);
		await entered.promise;
		expect(state.report.forwarded).toBe(false);
		expect(log).not.toHaveBeenCalled();
		accepted.resolve({ id: 'job' });
		await task;
		expect(state.report.forwarded).toBe(true);
		expect(events).toEqual(['update', 'commit', 'log']);
		expect(queue.deliver).toHaveBeenCalledWith(actor, expect.objectContaining({
			id: 'https://local.test/users/actor#reports/report',
			object: 'https://remote.test/users/target',
			content: 'Reason: harassment\n\nReporter explanation',
		}), 'https://remote.test/inbox', false);
		expect(JSON.stringify(log.mock.calls)).not.toContain('private-request-id');
		expect(JSON.stringify(log.mock.calls)).not.toContain('private-fingerprint');
	});

	test('keeps failed enqueue retryable and forwards only once after a successful retry', async () => {
		const { service, state, moderator, queue, log } = setup();
		queue.deliver.mockRejectedValueOnce(new Error('Redis unavailable'));
		await expect(service.forward('report', moderator)).rejects.toThrow('Redis unavailable');
		expect(state.report.forwarded).toBe(false);
		expect(log).not.toHaveBeenCalled();
		await service.forward('report', moderator);
		await service.forward('report', moderator);
		expect(state.report.forwarded).toBe(true);
		expect(queue.deliver).toHaveBeenCalledTimes(2);
		expect(log).toHaveBeenCalledOnce();
	});

	test('serializes concurrent forwards with the report row lock', async () => {
		const { service, moderator, queue, log, lockedRead } = setup();
		await Promise.all([service.forward('report', moderator), service.forward('report', { id: 'second-moderator' } as MiUser)]);
		expect(lockedRead).toHaveBeenCalledWith(MiAbuseUserReport, { where: { id: 'report' }, lock: { mode: 'pessimistic_write' } });
		expect(queue.deliver).toHaveBeenCalledOnce();
		expect(log).toHaveBeenCalledOnce();
	});

	test.each(['missing', 'local', 'missing-uri', 'missing-inbox'] as const)('leaves unavailable remote targets unforwarded: %s', async kind => {
		const { service, state, moderator, queue, log } = setup();
		if (kind === 'missing') state.target = null;
		else if (state.target != null) {
			if (kind === 'local') state.target.host = null;
			if (kind === 'missing-uri') state.target.uri = null;
			if (kind === 'missing-inbox') state.target.inbox = null;
		}
		await expect(service.forward('report', moderator)).rejects.toThrow('REPORT_TARGET_UNAVAILABLE');
		expect(state.report.forwarded).toBe(false);
		expect(queue.deliver).not.toHaveBeenCalled();
		expect(log).not.toHaveBeenCalled();
	});

	test('rejects local reports without scheduling delivery', async () => {
		const { service, state, moderator, queue } = setup();
		state.report.targetUserHost = null;
		await expect(service.forward('report', moderator)).rejects.toThrow('CANNOT_FORWARD_LOCAL_REPORT');
		expect(queue.deliver).not.toHaveBeenCalled();
	});

	test('does not mark skipped delivery as forwarded', async () => {
		const { service, state, moderator, queue, log } = setup();
		queue.deliver.mockResolvedValueOnce(null);
		await expect(service.forward('report', moderator)).rejects.toThrow('REPORT_FORWARD_FAILED');
		expect(state.report.forwarded).toBe(false);
		expect(log).not.toHaveBeenCalled();
	});

	test('reuses the ActivityPub ID when an accepted delivery must be retried after a database failure', async () => {
		const { service, state, moderator, queue, log } = setup();
		state.commitError = new Error('Commit failed');
		await expect(service.forward('report', moderator)).rejects.toThrow('Commit failed');
		expect(state.report.forwarded).toBe(false);
		expect(log).not.toHaveBeenCalled();
		state.commitError = null;
		await service.forward('report', moderator);
		expect(queue.deliver.mock.calls).toHaveLength(2);
		expect(queue.deliver.mock.calls[0]).toEqual(queue.deliver.mock.calls[1]);
	});

	test('retains successful forwarding when the post-commit audit log fails', async () => {
		const { service, state, moderator, log, logger } = setup();
		log.mockRejectedValueOnce(new Error('Log write failed'));
		await expect(service.forward('report', moderator)).resolves.toBeUndefined();
		expect(state.report.forwarded).toBe(true);
		expect(logger.error).toHaveBeenCalledOnce();
	});
});

describe('Abuse report resolution', () => {
	test('preserves the first moderator decision under concurrent conflicting actions', async () => {
		const { service, state, moderator, log, notifications } = setup();
		const results = await Promise.allSettled([
			service.resolve([{ reportId: 'report', resolvedAs: 'accept' }], moderator),
			service.resolve([{ reportId: 'report', resolvedAs: 'reject' }], { id: 'second-moderator' } as MiUser),
		]);
		expect(results).toEqual([{ status: 'fulfilled', value: undefined }, { status: 'rejected', reason: new Error('REPORT_ALREADY_RESOLVED') }]);
		expect(state.report).toMatchObject({ resolved: true, resolvedAs: 'accept', assigneeId: 'moderator' });
		expect(log).toHaveBeenCalledOnce();
		expect(notifications.notifySystemWebhook).toHaveBeenCalledExactlyOnceWith([state.report], 'abuseReportResolved');
	});

	test('retries the same decision without replacing the moderator or sending duplicate notifications', async () => {
		const { service, state, moderator, log, notifications } = setup();
		await service.resolve([{ reportId: 'report', resolvedAs: null }], moderator);
		await service.resolve([{ reportId: 'report', resolvedAs: null }], { id: 'second-moderator' } as MiUser);
		expect(state.report).toMatchObject({ resolved: true, resolvedAs: null, assigneeId: 'moderator' });
		expect(log).toHaveBeenCalledOnce();
		expect(notifications.notifySystemWebhook).toHaveBeenCalledOnce();
	});

	test('retains the committed decision when audit logging and notification both fail', async () => {
		const { service, state, moderator, log, notifications, logger } = setup();
		log.mockRejectedValueOnce(new Error('Log write failed'));
		notifications.notifySystemWebhook.mockRejectedValueOnce(new Error('Webhook unavailable'));
		await expect(service.resolve([{ reportId: 'report', resolvedAs: 'accept' }], moderator)).resolves.toBeUndefined();
		expect(state.report).toMatchObject({ resolved: true, resolvedAs: 'accept', assigneeId: 'moderator' });
		expect(notifications.notifySystemWebhook).toHaveBeenCalledOnce();
		expect(logger.error).toHaveBeenCalledTimes(2);
	});
});
