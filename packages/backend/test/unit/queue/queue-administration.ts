/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { QueueService } from '@/core/QueueService.js';
import RetryJobEndpoint from '@/server/api/endpoints/admin/queue/retry-job.js';
import RemoveJobEndpoint from '@/server/api/endpoints/admin/queue/remove-job.js';
import PromoteJobsEndpoint from '@/server/api/endpoints/admin/queue/promote-jobs.js';
import ClearQueueEndpoint from '@/server/api/endpoints/admin/queue/clear.js';

function queueService(job: { getState: () => Promise<string>; retry: (state: string) => Promise<void>; promote: () => Promise<void>; remove: () => Promise<void> } | null) {
	const queue = { getJob: vi.fn().mockResolvedValue(job) };
	const service = Object.create(QueueService.prototype) as QueueService;
	service.objectStorageQueue = queue as never;
	return { service, queue };
}

function queueJob(state: string) {
	return {
		getState: vi.fn().mockResolvedValue(state),
		retry: vi.fn().mockResolvedValue(undefined),
		promote: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
	};
}

describe('queue administration state checks', () => {
	test.each(['failed', 'completed'])('retries %s jobs using the actual BullMQ state', async state => {
		const job = queueJob(state);
		const { service, queue } = queueService(job);
		await service.queueRetryJob('objectStorage', 'job');
		expect(queue.getJob).toHaveBeenCalledExactlyOnceWith('job');
		expect(job.getState).toHaveBeenCalledOnce();
		expect(job.retry).toHaveBeenCalledExactlyOnceWith(state);
		expect(job.promote).not.toHaveBeenCalled();
	});

	test('promotes only delayed jobs', async () => {
		const job = queueJob('delayed');
		await queueService(job).service.queueRetryJob('objectStorage', 'job');
		expect(job.promote).toHaveBeenCalledOnce();
		expect(job.retry).not.toHaveBeenCalled();
	});

	test.each(['active', 'waiting', 'paused', 'prioritized', 'waiting-children', 'unknown'])('rejects %s without attempting an invalid operation', async state => {
		const job = queueJob(state);
		await expect(queueService(job).service.queueRetryJob('objectStorage', 'job')).rejects.toThrow(`cannot be retried from the ${state} state`);
		expect(job.retry).not.toHaveBeenCalled();
		expect(job.promote).not.toHaveBeenCalled();
	});

	test('missing retry targets fail while repeated removal remains idempotent', async () => {
		const { service } = queueService(null);
		await expect(service.queueRetryJob('objectStorage', 'missing')).rejects.toThrow('Job not found: missing');
		await expect(service.queueRemoveJob('objectStorage', 'missing')).resolves.toBeUndefined();
	});

	test.each(['retry', 'promote', 'remove'] as const)('preserves BullMQ %s failures', async action => {
		const job = queueJob(action === 'promote' ? 'delayed' : 'failed');
		const failure = new Error('The job changed state while the operation was pending.');
		job[action].mockRejectedValueOnce(failure);
		const { service } = queueService(job);
		await expect(action === 'remove' ? service.queueRemoveJob('objectStorage', 'job') : service.queueRetryJob('objectStorage', 'job')).rejects.toBe(failure);
	});
});

function endpoint(action: 'retry' | 'remove' | 'promote' | 'clear', operation: () => Promise<void>) {
	const moderation = { log: vi.fn().mockResolvedValue(undefined) };
	const service = {
		queueRetryJob: operation, queueRemoveJob: operation, queuePromoteJobs: operation, queueClear: operation,
	};
	const instance = action === 'retry' ? new RetryJobEndpoint(moderation as never, service as never)
		: action === 'remove' ? new RemoveJobEndpoint(moderation as never, service as never)
			: action === 'promote' ? new PromoteJobsEndpoint(moderation as never, service as never)
				: new ClearQueueEndpoint(moderation as never, service as never);
	const params = { queue: 'objectStorage', ...(action === 'clear' ? { state: '*' } : action === 'retry' || action === 'remove' ? { jobId: 'job' } : {}) };
	return { execute: () => instance.exec(params, { id: 'moderator' } as never, null), moderation };
}

describe('queue administration endpoints', () => {
	test.each(['retry', 'remove', 'promote', 'clear'] as const)('%s waits for the operation before reporting success', async action => {
		const pending = Promise.withResolvers<void>();
		const operation = vi.fn(() => pending.promise);
		const { execute, moderation } = endpoint(action, operation);
		let finished = false;
		const request = execute().then(() => { finished = true; });
		await Promise.resolve();
		expect(finished).toBe(false);
		expect(operation).toHaveBeenCalledOnce();
		expect(moderation.log).not.toHaveBeenCalled();
		pending.resolve();
		await request;
		expect(finished).toBe(true);
		if (action === 'promote' || action === 'clear') expect(moderation.log).toHaveBeenCalledOnce();
	});

	test.each(['retry', 'remove', 'promote', 'clear'] as const)('%s preserves rejection instead of returning false success', async action => {
		const pending = Promise.withResolvers<void>();
		const failure = new Error('Queue operation failed.');
		const { execute, moderation } = endpoint(action, () => pending.promise);
		const request = expect(execute()).rejects.toBe(failure);
		pending.reject(failure);
		await request;
		expect(moderation.log).not.toHaveBeenCalled();
	});
});
