/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, randomUUID } from 'node:crypto';
import { entities } from 'misskey-js';
import {
	beforeEach,
	beforeAll,
	afterAll,
	describe,
	expect,
	test,
} from 'vitest';
import {
	api,
	captureWebhook,
	post,
	randomString,
	relativeFetch,
	role,
	signup,
	startJobQueue,
	uploadFile,
	UserToken,
	WEBHOOK_HOST,
} from '../../utils.js';
import type { INestApplicationContext } from '@nestjs/common';

describe('[シナリオ] ユーザ通報', () => {
	let queue: INestApplicationContext;
	let admin: entities.SignupResponse;
	let alice: entities.SignupResponse;
	let bob: entities.SignupResponse;

	async function createSystemWebhook(args?: Partial<entities.AdminSystemWebhookCreateRequest>, credential?: UserToken): Promise<entities.AdminSystemWebhookCreateResponse> {
		const res = await api(
			'admin/system-webhook/create',
			{
				isActive: true,
				name: randomString(),
				on: ['abuseReport'],
				url: WEBHOOK_HOST,
				secret: randomString(),
				...args,
			},
			credential ?? admin,
		);
		return res.body;
	}

	async function createAbuseReportNotificationRecipient(args?: Partial<entities.AdminAbuseReportNotificationRecipientCreateRequest>, credential?: UserToken): Promise<entities.AdminAbuseReportNotificationRecipientCreateResponse> {
		const res = await api(
			'admin/abuse-report/notification-recipient/create',
			{
				isActive: true,
				name: randomString(),
				method: 'webhook',
				...args,
			},
			credential ?? admin,
		);
		return res.body;
	}

	async function createAbuseReport(args?: Partial<entities.UsersReportAbuseRequest>, credential?: UserToken): Promise<entities.EmptyResponse> {
		const res = await api(
			'users/report-abuse',
			{
				userId: alice.id,
				requestId: randomUUID(),
				comment: randomString(),
				reason: 'other',
				reportType: 'user',
				...args,
			},
			credential ?? admin,
		);
		return res.body;
	}

	async function resolveAbuseReport(args?: Partial<entities.AdminResolveAbuseUserReportRequest>, credential?: UserToken): Promise<entities.EmptyResponse> {
		const res = await api(
			'admin/resolve-abuse-user-report',
			{
				reportId: admin.id,
				...args,
			},
			credential ?? admin,
		);
		return res.body;
	}

	// -------------------------------------------------------------------------------------------

	beforeAll(async () => {
		queue = await startJobQueue();
		admin = await signup({ username: 'admin' });
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });

		await role(admin, { isAdministrator: true });
	}, 1000 * 60 * 2);

	afterAll(async () => {
		await queue.close();
	});

	// -------------------------------------------------------------------------------------------

	describe('snapshot', () => {
		test('rejects incomplete reports and preserves the winning moderation decision', async () => {
			const note = await post(alice, { text: 'Moderation evidence' });
			const request: entities.UsersReportAbuseRequest = {
				userId: alice.id, comment: '  ', reason: 'other', reportType: 'note', targetId: note.id, requestId: randomUUID(),
			};
			expect((await api('users/report-abuse', request, bob)).status).toBe(400);
			expect((await api('users/report-abuse', { ...request, reason: 'spam', userId: bob.id }, admin)).status).toBe(400);
			const comment = randomString();
			expect((await api('users/report-abuse', { ...request, comment }, bob)).status).toBe(204);
			const reports = await api('admin/abuse-user-reports', {}, admin);
			const saved = reports.body.find(report => report.comment === comment)!;
			const decisions = await Promise.all([
				api('admin/resolve-abuse-user-report', { reportId: saved.id, resolvedAs: 'accept' }, admin),
				api('admin/resolve-abuse-user-report', { reportId: saved.id, resolvedAs: 'reject' }, admin),
			]);
			expect(decisions.map(response => response.status).sort()).toEqual([204, 409]);
			const winningDecision = decisions[0].status === 204 ? 'accept' : 'reject';
			expect((await api('admin/resolve-abuse-user-report', { reportId: saved.id, resolvedAs: winningDecision }, admin)).status).toBe(204);
			const after = await api('admin/abuse-user-reports', {}, admin);
			expect(after.body.find(report => report.id === saved.id)).toMatchObject({ resolved: true, resolvedAs: winningDecision, snapshot: saved.snapshot });
		});

		test('keeps private archived attachment bytes after the original file is deleted', async () => {
			const original = 'Original report evidence bytes';
			const upload = await uploadFile(alice, { name: 'evidence.txt', blob: new Blob([original], { type: 'text/plain' }) });
			expect(upload.status).toBe(200);
			const file = upload.body!;
			const note = await post(alice, { text: 'Attachment report', fileIds: [file.id] });
			const comment = randomString();
			expect((await api('users/report-abuse', {
				userId: alice.id, comment, reason: 'spam', reportType: 'note', targetId: note.id, requestId: randomUUID(),
			}, bob)).status).toBe(204);
			const reports = await api('admin/abuse-user-reports', {}, admin);
			const saved = reports.body.find(report => report.comment === comment)!;
			expect(saved.snapshot?.files[0]).toMatchObject({ id: file.id, sha256: createHash('sha256').update(original).digest('hex') });
			expect(saved.snapshot?.files[0]).not.toHaveProperty('archive');
			expect(JSON.stringify(saved)).not.toContain('encryptionKey');
			expect((await api('notes/delete', { noteId: note.id }, alice)).status).toBe(204);
			expect((await api('drive/files/delete', { fileId: file.id }, alice)).status).toBe(204);
			const download = (token?: string) => relativeFetch('api/admin/abuse-report-evidence', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ reportId: saved.id, fileId: file.id, i: token }),
			});
			const response = await download(admin.token);
			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toBe('application/octet-stream');
			expect(response.headers.get('cache-control')).toContain('no-store');
			expect(response.headers.get('content-disposition')).toBe('attachment');
			expect(response.headers.get('x-content-type-options')).toBe('nosniff');
			expect(await response.text()).toBe(original);
			expect((await download(bob.token)).status).toBe(403);
			expect((await download()).status).toBe(401);
		});

		test('retains the reported note after its author edits and deletes it', async () => {
			const note = await post(alice, { text: 'Original reported text', cw: 'Original warning' });
			const comment = randomString();
			const request: entities.UsersReportAbuseRequest = {
				userId: alice.id, comment, reason: 'other', reportType: 'note', targetId: note.id,
				requestId: randomUUID(),
			};
			const reported = await Promise.all([api('users/report-abuse', request, bob), api('users/report-abuse', request, bob)]);
			expect(reported.map(response => response.status)).toEqual([204, 204]);
			const reports = await api('admin/abuse-user-reports', {}, admin);
			expect(reports.body.filter(report => report.comment === comment)).toHaveLength(1);
			const saved = reports.body.find(report => report.comment === comment)!;
			expect(saved.snapshot).toMatchObject({
				type: 'note', content: 'Original warning\n\nOriginal reported text',
				user: { id: alice.id, username: alice.username },
			});
			expect((await api('notes/update', { noteId: note.id, text: 'Edited text', cw: null }, alice)).status).toBe(200);
			expect((await api('notes/delete', { noteId: note.id }, alice)).status).toBe(204);
			expect((await api('users/report-abuse', request, bob)).status).toBe(204);
			expect((await api('users/report-abuse', { ...request, comment: 'Different report' }, bob)).status).toBe(400);
			const after = await api('admin/abuse-user-reports', {}, admin);
			expect(after.body.filter(report => report.comment === comment)).toHaveLength(1);
			expect(after.body.find(report => report.id === saved.id)?.snapshot).toEqual(saved.snapshot);
			expect((await api('admin/abuse-user-reports', {}, bob)).status).toBe(403);
		});

		test('retains a text Boost after it and its post are deleted', async () => {
			const note = await post(bob, { text: 'Boost target' });
			const reaction = 'text:Boost ABC 123 🧐';
			expect((await api('notes/reactions/create', { noteId: note.id, reaction }, alice)).status).toBe(204);
			const comment = randomString();
			expect((await api('users/report-abuse', {
				userId: alice.id, comment, reason: 'other', reportType: 'boost', targetId: note.id, reaction, requestId: randomUUID(),
			}, bob)).status).toBe(204);
			const reports = await api('admin/abuse-user-reports', {}, admin);
			const saved = reports.body.find(report => report.comment === comment)!;
			expect(saved.snapshot).toMatchObject({
				type: 'boost', content: 'Boost ABC 123 🧐', user: { id: alice.id },
			});
			expect((await api('notes/reactions/delete', { noteId: note.id }, alice)).status).toBe(204);
			expect((await api('notes/delete', { noteId: note.id }, bob)).status).toBe(204);
			const after = await api('admin/abuse-user-reports', {}, admin);
			expect(after.body.find(report => report.id === saved.id)?.snapshot).toEqual(saved.snapshot);
		});
	});

	describe('SystemWebhook', () => {
		beforeEach(async () => {
			const webhooks = await api('admin/system-webhook/list', {}, admin);
			for (const webhook of webhooks.body) {
				await api('admin/system-webhook/delete', { id: webhook.id }, admin);
			}
		});

		test('通報を受けた -> abuseReportが送出される', async () => {
			const webhook = await createSystemWebhook({
				on: ['abuseReport'],
				isActive: true,
			});
			await createAbuseReportNotificationRecipient({ systemWebhookId: webhook.id });

			// 通報(bob -> alice)
			const abuse = {
				userId: alice.id,
				comment: randomString(),
			};
			const webhookBody = await captureWebhook(async () => {
				await createAbuseReport(abuse, bob);
			});

			console.log(JSON.stringify(webhookBody, null, 2));

			expect(webhookBody.hookId).toBe(webhook.id);
			expect(webhookBody.type).toBe('abuseReport');
			expect(webhookBody.body.targetUserId).toBe(alice.id);
			expect(webhookBody.body.reporterId).toBe(bob.id);
			expect(webhookBody.body.comment).toBe(abuse.comment);
		});

		test('通報を受けた -> abuseReportが送出される -> 解決 -> abuseReportResolvedが送出される', async () => {
			const webhook = await createSystemWebhook({
				on: ['abuseReport', 'abuseReportResolved'],
				isActive: true,
			});
			await createAbuseReportNotificationRecipient({ systemWebhookId: webhook.id });

			// 通報(bob -> alice)
			const abuse = {
				userId: alice.id,
				comment: randomString(),
			};
			const webhookBody1 = await captureWebhook(async () => {
				await createAbuseReport(abuse, bob);
			});

			console.log(JSON.stringify(webhookBody1, null, 2));
			expect(webhookBody1.hookId).toBe(webhook.id);
			expect(webhookBody1.type).toBe('abuseReport');
			expect(webhookBody1.body.targetUserId).toBe(alice.id);
			expect(webhookBody1.body.reporterId).toBe(bob.id);
			expect(webhookBody1.body.assigneeId).toBeNull();
			expect(webhookBody1.body.resolved).toBe(false);
			expect(webhookBody1.body.comment).toBe(abuse.comment);

			// 解決
			const webhookBody2 = await captureWebhook(async () => {
				await resolveAbuseReport({
					reportId: webhookBody1.body.id,
				}, admin);
			});

			console.log(JSON.stringify(webhookBody2, null, 2));
			expect(webhookBody2.hookId).toBe(webhook.id);
			expect(webhookBody2.type).toBe('abuseReportResolved');
			expect(webhookBody2.body.targetUserId).toBe(alice.id);
			expect(webhookBody2.body.reporterId).toBe(bob.id);
			expect(webhookBody2.body.assigneeId).toBe(admin.id);
			expect(webhookBody2.body.resolved).toBe(true);
			expect(webhookBody2.body.comment).toBe(abuse.comment);
		});

		test('通報を受けた -> abuseReportが未許可の場合は送出されない', async () => {
			const webhook = await createSystemWebhook({
				on: [],
				isActive: true,
			});
			await createAbuseReportNotificationRecipient({ systemWebhookId: webhook.id });

			// 通報(bob -> alice)
			const abuse = {
				userId: alice.id,
				comment: randomString(),
			};
			const webhookBody = await captureWebhook(async () => {
				await createAbuseReport(abuse, bob);
			}).catch(e => e.message);

			expect(webhookBody).toBe('timeout');
		});

		test('通報を受けた -> abuseReportが未許可の場合は送出されない -> 解決 -> abuseReportResolvedが送出される', async () => {
			const webhook = await createSystemWebhook({
				on: ['abuseReportResolved'],
				isActive: true,
			});
			await createAbuseReportNotificationRecipient({ systemWebhookId: webhook.id });

			// 通報(bob -> alice)
			const abuse = {
				userId: alice.id,
				comment: randomString(),
			};
			const webhookBody1 = await captureWebhook(async () => {
				await createAbuseReport(abuse, bob);
			}).catch(e => e.message);

			expect(webhookBody1).toBe('timeout');

			const abuseReportId = (await api('admin/abuse-user-reports', {}, admin)).body[0].id;

			// 解決
			const webhookBody2 = await captureWebhook(async () => {
				await resolveAbuseReport({
					reportId: abuseReportId,
				}, admin);
			});

			console.log(JSON.stringify(webhookBody2, null, 2));
			expect(webhookBody2.hookId).toBe(webhook.id);
			expect(webhookBody2.type).toBe('abuseReportResolved');
			expect(webhookBody2.body.targetUserId).toBe(alice.id);
			expect(webhookBody2.body.reporterId).toBe(bob.id);
			expect(webhookBody2.body.assigneeId).toBe(admin.id);
			expect(webhookBody2.body.resolved).toBe(true);
			expect(webhookBody2.body.comment).toBe(abuse.comment);
		});

		test('通報を受けた -> abuseReportが送出される -> 解決 -> abuseReportResolvedが未許可の場合は送出されない', async () => {
			const webhook = await createSystemWebhook({
				on: ['abuseReport'],
				isActive: true,
			});
			await createAbuseReportNotificationRecipient({ systemWebhookId: webhook.id });

			// 通報(bob -> alice)
			const abuse = {
				userId: alice.id,
				comment: randomString(),
			};
			const webhookBody1 = await captureWebhook(async () => {
				await createAbuseReport(abuse, bob);
			});

			console.log(JSON.stringify(webhookBody1, null, 2));
			expect(webhookBody1.hookId).toBe(webhook.id);
			expect(webhookBody1.type).toBe('abuseReport');
			expect(webhookBody1.body.targetUserId).toBe(alice.id);
			expect(webhookBody1.body.reporterId).toBe(bob.id);
			expect(webhookBody1.body.assigneeId).toBeNull();
			expect(webhookBody1.body.resolved).toBe(false);
			expect(webhookBody1.body.comment).toBe(abuse.comment);

			// 解決
			const webhookBody2 = await captureWebhook(async () => {
				await resolveAbuseReport({
					reportId: webhookBody1.body.id,
				}, admin);
			}).catch(e => e.message);

			expect(webhookBody2).toBe('timeout');
		});

		test('通報を受けた -> abuseReportが未許可の場合は送出されない -> 解決 -> abuseReportResolvedが未許可の場合は送出されない', async () => {
			const webhook = await createSystemWebhook({
				on: [],
				isActive: true,
			});
			await createAbuseReportNotificationRecipient({ systemWebhookId: webhook.id });

			// 通報(bob -> alice)
			const abuse = {
				userId: alice.id,
				comment: randomString(),
			};
			const webhookBody1 = await captureWebhook(async () => {
				await createAbuseReport(abuse, bob);
			}).catch(e => e.message);

			expect(webhookBody1).toBe('timeout');

			const abuseReportId = (await api('admin/abuse-user-reports', {}, admin)).body[0].id;

			// 解決
			const webhookBody2 = await captureWebhook(async () => {
				await resolveAbuseReport({
					reportId: abuseReportId,
				}, admin);
			}).catch(e => e.message);

			expect(webhookBody2).toBe('timeout');
		});

		test('通報を受けた -> Webhookが無効の場合は送出されない', async () => {
			const webhook = await createSystemWebhook({
				on: ['abuseReport', 'abuseReportResolved'],
				isActive: false,
			});
			await createAbuseReportNotificationRecipient({ systemWebhookId: webhook.id });

			// 通報(bob -> alice)
			const abuse = {
				userId: alice.id,
				comment: randomString(),
			};
			const webhookBody1 = await captureWebhook(async () => {
				await createAbuseReport(abuse, bob);
			}).catch(e => e.message);

			expect(webhookBody1).toBe('timeout');

			const abuseReportId = (await api('admin/abuse-user-reports', {}, admin)).body[0].id;

			// 解決
			const webhookBody2 = await captureWebhook(async () => {
				await resolveAbuseReport({
					reportId: abuseReportId,
				}, admin);
			}).catch(e => e.message);

			expect(webhookBody2).toBe('timeout');
		});

		test('通報を受けた -> 通知設定が無効の場合は送出されない', async () => {
			const webhook = await createSystemWebhook({
				on: ['abuseReport', 'abuseReportResolved'],
				isActive: true,
			});
			await createAbuseReportNotificationRecipient({ systemWebhookId: webhook.id, isActive: false });

			// 通報(bob -> alice)
			const abuse = {
				userId: alice.id,
				comment: randomString(),
			};
			const webhookBody1 = await captureWebhook(async () => {
				await createAbuseReport(abuse, bob);
			}).catch(e => e.message);

			expect(webhookBody1).toBe('timeout');

			const abuseReportId = (await api('admin/abuse-user-reports', {}, admin)).body[0].id;

			// 解決
			const webhookBody2 = await captureWebhook(async () => {
				await resolveAbuseReport({
					reportId: abuseReportId,
				}, admin);
			}).catch(e => e.message);

			expect(webhookBody2).toBe('timeout');
		});
	});
});
