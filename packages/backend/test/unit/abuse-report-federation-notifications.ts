/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { In, IsNull } from 'typeorm';
import { ApInboxService } from '@/core/activitypub/ApInboxService.js';
import { AbuseReportNotificationService } from '@/core/AbuseReportNotificationService.js';
import type { IFlag } from '@/core/activitypub/type.js';
import type { MiRemoteUser } from '@/models/User.js';
import type { MiAbuseUserReport } from '@/models/AbuseUserReport.js';

function inbox() {
	const actor = { id: 'reporter', host: 'remote.example' } as MiRemoteUser;
	const user = { id: 'author', host: null };
	const note = { id: 'note', userId: user.id, userHost: null };
	const notesRepository = { findBy: vi.fn(async (where: { id: { value: string[] } }) => where.id.value.includes(note.id) ? [note] : []) };
	const usersRepository = { findBy: vi.fn(async (where: { id: { value: string[] } }) => where.id.value.includes(user.id) ? [user] : []) };
	const reports = { report: vi.fn().mockResolvedValue(undefined) };
	const resolver = { createResolver: vi.fn(() => { throw new Error('Foreign fetching is forbidden'); }) };
	const dbResolver = { getUserFromApId: vi.fn(() => { throw new Error('Foreign lookup is forbidden'); }), getNoteFromApId: vi.fn(() => { throw new Error('Foreign lookup is forbidden'); }) };
	const service = Object.create(ApInboxService.prototype) as ApInboxService;
	Object.assign(service, { config: { url: 'https://local.example' }, notesRepository, usersRepository, abuseReportService: reports, apResolverService: resolver, apDbResolverService: dbResolver });
	const flag = (object: IFlag['object'] | IFlag['object'][], content = 'Remote report text') => service['flag'](actor, { type: 'Flag', actor: 'https://remote.example/users/reporter', object, content } as IFlag);
	return { flag, actor, user, note, notesRepository, usersRepository, reports, resolver, dbResolver };
}

describe('Federated abuse report targets', () => {
	test('keeps a complete forwarded description longer than the local form limit', async () => {
		const { flag, reports } = inbox();
		const content = `Reason: harassment\n${'Original evidence '.repeat(200)}\nEvidence ending`;
		await flag('https://local.example/notes/note', content);
		expect(reports.report).toHaveBeenCalledWith([expect.objectContaining({ comment: content })]);
	});
	test('creates an explicit note snapshot target for a note-only Flag', async () => {
		const { flag, actor, user, note, reports, notesRepository, usersRepository } = inbox();
		await expect(flag('https://local.example/notes/note')).resolves.toBe('ok');
		expect(notesRepository.findBy).toHaveBeenCalledExactlyOnceWith({ id: In([note.id]), userHost: IsNull() });
		expect(usersRepository.findBy).toHaveBeenCalledWith({ id: In([user.id]), host: IsNull() });
		expect(reports.report).toHaveBeenCalledExactlyOnceWith([{
			targetUserId: user.id, reporterId: actor.id, requestId: null,
			comment: 'Remote report text', reason: null, target: { type: 'note', id: note.id },
		}]);
	});

	test('chooses the note instead of creating a duplicate profile report when a Flag names both', async () => {
		const { flag, reports } = inbox();
		await flag(['https://local.example/users/author', 'https://local.example/notes/note']);
		expect(reports.report).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ target: { type: 'note', id: 'note' } })]);
	});

	test('uses an explicit profile target without interpreting report text as a local object reference', async () => {
		const { flag, reports, notesRepository } = inbox();
		const content = 'Note: https://local.example/notes/note\n-----\n<script>evidence</script>';
		await flag('https://local.example/users/author', content);
		expect(notesRepository.findBy).toHaveBeenCalledWith({ id: In([]), userHost: IsNull() });
		expect(reports.report).toHaveBeenCalledWith([expect.objectContaining({ comment: content, target: { type: 'user' } })]);
	});

	test.each([
		'https://foreign.example/notes/note',
		'https://local.example.evil.example/notes/note',
		'https://local.example/notes/unknown',
		'https://local.example/notes/note?modified=true',
		'https://local.example/unknown/note',
	])('skips unknown object %s without fetching it', async uri => {
		const { flag, reports, resolver, dbResolver } = inbox();
		await expect(flag(uri)).resolves.toBe('skip');
		expect(reports.report).not.toHaveBeenCalled();
		expect(resolver.createResolver).not.toHaveBeenCalled();
		for (const resolve of Object.values(dbResolver)) expect(resolve).not.toHaveBeenCalled();
	});
});

describe('Abuse report email evidence', () => {
	test('escapes literal evidence in HTML while preserving it unchanged in the plain-text message', async () => {
		const emailService = { sendEmail: vi.fn().mockResolvedValue(undefined) };
		const recipients = vi.fn().mockResolvedValue([{ isActive: true, userProfile: { emailVerified: true, email: 'moderator@example.com' } }]);
		const service = Object.create(AbuseReportNotificationService.prototype) as AbuseReportNotificationService;
		Object.assign(service, { meta: { email: null }, emailService });
		Object.defineProperty(service, 'fetchEMailRecipients', { value: recipients });
		const content = '<script>alert("evidence")</script>\n<img src=x onerror="alert(1)"> & original';
		const report = {
			id: 'report', reason: 'harassment', comment: '<b>Reporter explanation</b>',
			snapshot: {
				version: 1, capturedAt: '2026-09-25T00:00:00.000Z', type: 'note', sourceUrl: 'https://local.example/notes/note',
				user: { id: 'author', username: 'author', host: null, name: 'Author' }, content, files: [],
			},
		} as unknown as MiAbuseUserReport;
		await service.notifyMail([report]);
		expect(emailService.sendEmail).toHaveBeenCalledOnce();
		const [recipient, subject, html, text] = emailService.sendEmail.mock.calls[0];
		expect(recipient).toBe('moderator@example.com');
		expect(subject).toBe('New Abuse Report');
		expect(text).toContain('Reason: harassment');
		expect(text).toContain('<b>Reporter explanation</b>');
		expect(text).toContain(content);
		expect(html).toContain('Reason: harassment');
		expect(html).toContain('&lt;b&gt;Reporter explanation&lt;/b&gt;');
		expect(html).toContain('&lt;script&gt;alert(&quot;evidence&quot;)&lt;/script&gt;');
		expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; original');
		expect(html).not.toContain('<script>');
		expect(html).not.toContain('<img');
	});
});
