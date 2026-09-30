/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { QueryFailedError } from 'typeorm';
import { AbuseReportService } from '@/core/AbuseReportService.js';
import { MiAbuseUserReport, MiUser } from '@/models/_.js';
import type { AbuseReportSnapshot } from '@/models/AbuseUserReport.js';
import { formatAbuseReport, serializeAbuseReportSnapshot } from '@/misc/abuse-report.js';

function snapshot(noteId = 'note'): AbuseReportSnapshot {
	return {
		version: 1,
		capturedAt: '2026-09-25T00:00:00.000Z',
		type: 'note',
		sourceUrl: `https://example.com/notes/${noteId}`,
		user: { id: 'author', username: 'author', host: 'remote.example', name: 'Original author' },
		content: 'Original warning\n\nOriginal post\nwith newlines',
		files: [{
			id: `file-${noteId}`,
			name: 'Original image.png',
			type: 'image/png',
			size: 123,
			url: 'https://example.com/original.png',
			comment: 'Original description',
			archive: {
				storage: 'local', key: `private-${noteId}`, sha256: 'a'.repeat(64), size: 123,
				encryptionKey: 'private-encryption-key', iv: 'private-iv', authTag: 'private-auth-tag',
			},
		}],
	};
}

function setup() {
	const user = { id: 'author', username: 'author', host: 'remote.example' } as MiUser;
	const reporter = { id: 'reporter', username: 'reporter', host: null } as MiUser;
	const committed: Partial<MiAbuseUserReport>[] = [];
	const pending: Partial<MiAbuseUserReport>[] = [];
	const events: string[] = [];
	const state = { commitError: null as Error | null, beforeCommit: async () => {} };
	const manager = {
		findOneBy: vi.fn(async (_entity: unknown, where: { reporterId: string; requestId: string }) => committed.find(report => report.reporterId === where.reporterId && report.requestId === where.requestId) ?? null),
		findOneByOrFail: vi.fn(async (entity: unknown, where: { id: string }) => {
			if (entity === MiUser) return where.id === user.id ? user : reporter;
			if (entity === MiAbuseUserReport) return pending.find(report => report.id === where.id);
			throw new Error('Unexpected entity');
		}),
		insert: vi.fn(async (_entity: unknown, report: Partial<MiAbuseUserReport>) => {
			events.push('insert');
			pending.push(report);
		}),
	};
	const db = {
		transaction: vi.fn(async (_isolation: string, callback: (manager: unknown) => Promise<unknown>) => {
			pending.length = 0;
			events.push('begin');
			try {
				const result = await callback(manager);
				await state.beforeCommit();
				if (state.commitError != null) throw state.commitError;
				committed.push(...structuredClone(pending));
				events.push('commit');
				return result;
			} catch (error) {
				pending.length = 0;
				events.push('rollback');
				throw error;
			}
		}),
	};
	const capture = vi.fn(async (_user: MiUser, _reporter: MiUser, target: { id?: string }, _manager: unknown) => {
		events.push('capture');
		return snapshot(target.id);
	});
	const evidence = { delete: vi.fn(async () => { events.push('delete'); }) };
	const notifications = {
		notifyAdminStream: vi.fn(async () => { events.push('admin-notify'); }),
		notifySystemWebhook: vi.fn(async () => { events.push('webhook-notify'); }),
		notifyMail: vi.fn(async () => { events.push('mail-notify'); }),
	};
	const users = { findOneByOrFail: vi.fn(() => { throw new Error('Read escaped the transaction'); }) };
	const reports = {
		insert: vi.fn(() => { throw new Error('Write escaped the transaction'); }),
		findOneBy: vi.fn(async (where: { reporterId: string; requestId: string }) => committed.find(report => report.reporterId === where.reporterId && report.requestId === where.requestId) ?? null),
	};
	const logger = { error: vi.fn() };
	let nextId = 0;
	const service = new AbuseReportService(
		db as never, reports as never, users as never, { gen: () => `report${++nextId}` } as never,
		notifications as never, {} as never, {} as never, {} as never, {} as never, { capture } as never, evidence as never, { getLogger: () => logger } as never,
	);
	const request = (noteId = 'note'): Parameters<AbuseReportService['report']>[0][number] => ({
		targetUserId: user.id, reporterId: reporter.id, requestId: null,
		comment: 'Reporter explanation', reason: 'harassment', target: { type: 'note', id: noteId },
	});
	return { service, request, manager, db, capture, evidence, notifications, committed, pending, state, events, user, reporter, users, reports, logger };
}

describe('AbuseReportService transactions', () => {
	test('reads and inserts through one repeatable-read transaction and publishes only after the entire batch commits', async () => {
		const { service, request, manager, db, capture, evidence, notifications, committed, pending, state, events, user, reporter, users, reports } = setup();
		const commitEntered = Promise.withResolvers<void>();
		const allowCommit = Promise.withResolvers<void>();
		state.beforeCommit = async () => {
			commitEntered.resolve();
			await allowCommit.promise;
		};
		const task = service.report([request('first'), request('second')]);
		await commitEntered.promise;
		expect(committed).toEqual([]);
		expect(pending).toHaveLength(2);
		for (const notify of Object.values(notifications)) expect(notify).not.toHaveBeenCalled();
		allowCommit.resolve();
		await task;
		expect(db.transaction).toHaveBeenCalledWith('REPEATABLE READ', expect.any(Function));
		expect(capture).toHaveBeenNthCalledWith(1, user, reporter, { type: 'note', id: 'first' }, manager);
		expect(capture).toHaveBeenNthCalledWith(2, user, reporter, { type: 'note', id: 'second' }, manager);
		expect(manager.findOneByOrFail).toHaveBeenCalledWith(MiUser, { id: user.id });
		expect(manager.findOneByOrFail).toHaveBeenCalledWith(MiUser, { id: reporter.id });
		expect(committed).toEqual(['first', 'second'].map((id, index) => ({
			id: `report${index + 1}`, targetUserId: user.id, targetUserHost: user.host, reporterId: reporter.id, reporterHost: reporter.host,
			comment: 'Reporter explanation', reason: 'harassment', requestId: null, requestFingerprint: null, snapshot: snapshot(id),
		})));
		expect(events).toEqual(['begin', 'capture', 'insert', 'capture', 'insert', 'commit', 'admin-notify', 'webhook-notify', 'mail-notify']);
		expect(users.findOneByOrFail).not.toHaveBeenCalled();
		expect(reports.insert).not.toHaveBeenCalled();
		expect(evidence.delete).not.toHaveBeenCalled();
	});

	test('removes captured evidence and emits no notifications when insertion fails', async () => {
		const { service, request, manager, evidence, notifications, committed } = setup();
		const error = new Error('Insert failed');
		manager.insert.mockRejectedValueOnce(error);
		await expect(service.report([request()])).rejects.toBe(error);
		expect(evidence.delete).toHaveBeenCalledExactlyOnceWith(snapshot().files[0].archive);
		expect(committed).toEqual([]);
		for (const notify of Object.values(notifications)) expect(notify).not.toHaveBeenCalled();
	});

	test('cleans all successfully captured archives when commit fails, even when one cleanup rejects', async () => {
		const { service, request, evidence, notifications, committed, state, events, logger } = setup();
		const error = new Error('Commit failed');
		state.commitError = error;
		evidence.delete.mockRejectedValueOnce(new Error('Storage unavailable'));
		await expect(service.report([request('first'), request('second')])).rejects.toBe(error);
		expect(evidence.delete).toHaveBeenCalledTimes(2);
		expect(evidence.delete).toHaveBeenNthCalledWith(1, snapshot('first').files[0].archive);
		expect(evidence.delete).toHaveBeenNthCalledWith(2, snapshot('second').files[0].archive);
		expect(committed).toEqual([]);
		expect(events).not.toContain('commit');
		expect(logger.error).toHaveBeenCalledWith('Failed to clean uncommitted report evidence', { error: 'Error: Storage unavailable' });
		for (const notify of Object.values(notifications)) expect(notify).not.toHaveBeenCalled();
	});

	test('rolls back earlier reports and archives when capture of a later report fails', async () => {
		const { service, request, capture, evidence, notifications, committed, pending } = setup();
		const error = new Error('REPORT_EVIDENCE_UNAVAILABLE');
		capture.mockResolvedValueOnce(snapshot('first')).mockRejectedValueOnce(error);
		await expect(service.report([request('first'), request('second')])).rejects.toBe(error);
		expect(evidence.delete).toHaveBeenCalledExactlyOnceWith(snapshot('first').files[0].archive);
		expect(committed).toEqual([]);
		expect(pending).toEqual([]);
		for (const notify of Object.values(notifications)) expect(notify).not.toHaveBeenCalled();
	});

	test('preserves committed evidence when a notification fails after commit', async () => {
		const { service, request, evidence, notifications, committed, events, logger } = setup();
		const error = new Error('Mail delivery failed');
		notifications.notifyMail.mockRejectedValueOnce(error);
		await expect(service.report([request()])).resolves.toBeUndefined();
		expect(committed).toHaveLength(1);
		expect(committed[0].snapshot).toEqual(snapshot());
		expect(events).toContain('commit');
		expect(evidence.delete).not.toHaveBeenCalled();
		expect(notifications.notifyAdminStream).toHaveBeenCalledOnce();
		expect(notifications.notifySystemWebhook).toHaveBeenCalledOnce();
		expect(logger.error).toHaveBeenCalledWith('Failed to notify moderators of a saved report', { reportIds: ['report1'], error: 'Error: Mail delivery failed' });
	});

	test('accepts the same request again without recapturing deleted content or notifying twice', async () => {
		const { service, request, capture, evidence, notifications, committed, manager } = setup();
		const payload = { ...request(), requestId: 'ce05d4d0-71df-494c-8b28-880fa1c0d1c2' };
		await expect(service.hasSubmittedReport(payload)).resolves.toBe(false);
		await service.report([payload]);
		await expect(service.hasSubmittedReport(payload)).resolves.toBe(true);
		capture.mockClear().mockRejectedValue(new Error('Original note was deleted'));
		manager.findOneByOrFail.mockClear();
		for (const notify of Object.values(notifications)) notify.mockClear();
		await expect(service.report([payload])).resolves.toBeUndefined();
		expect(committed).toHaveLength(1);
		expect(committed[0].requestId).toBe(payload.requestId);
		expect(committed[0].requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
		expect(capture).not.toHaveBeenCalled();
		expect(manager.findOneByOrFail).not.toHaveBeenCalled();
		expect(evidence.delete).not.toHaveBeenCalled();
		for (const notify of Object.values(notifications)) expect(notify).not.toHaveBeenCalled();
	});

	test.each(['comment', 'reason', 'target', 'targetUserId'] as const)('rejects reuse of a request ID with a changed %s', async field => {
		const { service, request, capture, evidence, committed } = setup();
		const payload = { ...request(), requestId: 'ce05d4d0-71df-494c-8b28-880fa1c0d1c2' };
		await service.report([payload]);
		const changed = { ...payload };
		if (field === 'comment') changed.comment = 'Different explanation';
		if (field === 'reason') changed.reason = 'spam';
		if (field === 'target') changed.target = { type: 'boost', id: 'note', reaction: 'text:Different target' };
		if (field === 'targetUserId') changed.targetUserId = 'someoneelse';
		capture.mockClear();
		await expect(service.hasSubmittedReport(changed)).rejects.toThrow('REPORT_REQUEST_CONFLICT');
		await expect(service.report([changed])).rejects.toThrow('REPORT_REQUEST_CONFLICT');
		expect(committed).toHaveLength(1);
		expect(capture).not.toHaveBeenCalled();
		expect(evidence.delete).not.toHaveBeenCalled();
	});

	test.each([false, true])('cleans the losing concurrent snapshot and checks the committed fingerprint outside the failed transaction (conflict=%s)', async conflict => {
		const { service, request, capture, evidence, notifications, committed, manager, reports } = setup();
		const payload = { ...request(), requestId: 'ce05d4d0-71df-494c-8b28-880fa1c0d1c2' };
		await service.report([payload]);
		const preserved = structuredClone(committed[0]);
		const losingSnapshot = snapshot();
		losingSnapshot.files[0].archive.key = 'losing-request-archive';
		capture.mockClear().mockResolvedValueOnce(losingSnapshot);
		manager.findOneBy.mockResolvedValueOnce(null);
		manager.insert.mockRejectedValueOnce(new QueryFailedError('INSERT', [], Object.assign(new Error('duplicate'), {
			code: '23505', constraint: 'IDX_abuse_user_report_reporter_request',
		})));
		for (const notify of Object.values(notifications)) notify.mockClear();
		const attempt = service.report([{ ...payload, ...(conflict ? { comment: 'Changed concurrent request' } : {}) }]);
		if (conflict) {
			await expect(attempt).rejects.toThrow('REPORT_REQUEST_CONFLICT');
		} else {
			await expect(attempt).resolves.toBeUndefined();
		}
		expect(reports.findOneBy).toHaveBeenCalledWith({ reporterId: payload.reporterId, requestId: payload.requestId });
		expect(committed).toEqual([preserved]);
		expect(evidence.delete).toHaveBeenCalledExactlyOnceWith(losingSnapshot.files[0].archive);
		for (const notify of Object.values(notifications)) expect(notify).not.toHaveBeenCalled();
	});
});

describe('Abuse report presentation', () => {
	test('serializes public evidence metadata without encryption keys, IVs, authentication tags or storage keys', () => {
		const original = snapshot();
		const serialized = serializeAbuseReportSnapshot(original);
		expect(serialized).toEqual({
			...original,
			files: [{ id: 'file-note', name: 'Original image.png', type: 'image/png', size: 123, url: 'https://example.com/original.png', comment: 'Original description', sha256: 'a'.repeat(64) }],
		});
		const json = JSON.stringify(serialized);
		for (const secret of ['private-encryption-key', 'private-iv', 'private-auth-tag', 'private-note', '"archive"', '"storage"']) expect(json).not.toContain(secret);
		expect(original.files[0].archive.encryptionKey).toBe('private-encryption-key');
		expect(serializeAbuseReportSnapshot(null)).toBeNull();
	});

	test('formats immutable content, reason and attachment digest without including private storage credentials', () => {
		const original = snapshot();
		const output = formatAbuseReport({ reason: 'harassment', comment: 'Reporter explanation', snapshot: original });
		expect(output).toBe([
			'Reason: harassment',
			'Reporter explanation',
			[
				'Snapshot: 2026-09-25T00:00:00.000Z', '@author@remote.example', original.content,
				'https://example.com/notes/note', `Original image.png (image/png, 123 bytes, SHA-256: ${'a'.repeat(64)})`,
			].join('\n'),
		].join('\n\n'));
		for (const secret of Object.values(original.files[0].archive).filter(value => typeof value === 'string' && value.startsWith('private-'))) expect(output).not.toContain(secret);
	});
});
