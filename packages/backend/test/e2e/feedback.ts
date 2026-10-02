/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { beforeAll, describe, expect, test } from 'vitest';
import { api, castAsError, createAppToken, role, signup } from '../utils.js';
import type * as Misskey from 'misskey-js';

// This separate suite exercises feedback authentication, validation and the full public lifecycle.
describe('Feedback API', () => {
	let admin: Misskey.entities.SignupResponse;
	let alice: Misskey.entities.SignupResponse;
	let bob: Misskey.entities.SignupResponse;
	let moderator: Misskey.entities.SignupResponse;
	let created: Misskey.entities.Feedback;

	beforeAll(async () => {
		admin = await signup({ username: 'feedbackadmin' });
		alice = await signup({ username: 'feedbackalice' });
		bob = await signup({ username: 'feedbackbob' });
		moderator = await signup({ username: 'feedbackmod' });
		const moderatorRole = await role(admin, { isModerator: true });
		await api('admin/roles/assign', { roleId: moderatorRole.id, userId: moderator.id }, admin);
	}, 120000);

	test('requires credentials and write-account scope to publish', async () => {
		const input = { title: 'Cannot search', description: 'Search returns no results', category: 'bug' as const };
		expect((await api('feedback/create', input)).status).toBe(401);
		const token = await createAppToken(alice, ['read:account']);
		const denied = await api('feedback/create', input, { token });
		expect(denied.status).toBe(403);
		expect(castAsError(denied.body).error.code).toBe('PERMISSION_DENIED');
	});

	test('publishes and reads persisted feedback anonymously', async () => {
		const result = await api('feedback/create', { title: '  Search broken  ', description: '  Steps to reproduce  ', category: 'bug' }, alice);
		expect(result.status).toBe(200);
		created = result.body;
		expect(created).toMatchObject({ title: 'Search broken', description: 'Steps to reproduce', category: 'bug', status: 'open', response: null, userId: alice.id, user: { id: alice.id } });
		const shown = await api('feedback/show', { feedbackId: created.id });
		expect(shown.status).toBe(200);
		expect(shown.body).toMatchObject({ id: created.id, title: created.title, createdAt: created.createdAt });
		const listed = await api('feedback/list', {});
		expect(listed.status).toBe(200);
		expect(listed.body).toMatchObject({ total: 1, counts: { all: 1, open: 1, inProgress: 0, resolved: 0, closed: 0 } });
		expect(listed.body.items[0].id).toBe(created.id);
	});

	test('rejects whitespace-only input without inserting rows', async () => {
		for (const patch of [{ title: '  ' }, { description: '\n\t' }]) {
			const result = await api('feedback/create', { title: 'Valid title', description: 'Valid description', category: 'other', ...patch }, alice);
			expect(result.status).toBe(400);
			expect(castAsError(result.body).error.code).toBe('INVALID_CONTENT');
		}
		expect((await api('feedback/list', {})).body.total).toBe(1);
	});

	test('validates length, category and status values', async () => {
		for (const patch of [{ title: 'x'.repeat(121) }, { description: 'x'.repeat(10001) }]) {
			const result = await api('feedback/create', { title: 'Valid', description: 'Description', category: 'bug', ...patch }, alice);
			expect(result.status).toBe(400);
			expect(castAsError(result.body).error.code).toBe('INVALID_PARAM');
		}
		const invalidCategory = await api('feedback/create', {
			title: 'Invalid', description: 'Description',
			// @ts-expect-error deliberately invalid category
			category: 'invalid',
		}, alice);
		expect(invalidCategory.status).toBe(400);
		const invalidStatus = await api('feedback/update', {
			feedbackId: created.id,
			// @ts-expect-error deliberately invalid status
			status: 'invalid',
		}, moderator);
		expect(invalidStatus.status).toBe(400);
	});

	test('mine requires authentication and respects the current author', async () => {
		expect((await api('feedback/list', { mine: true })).status).toBe(401);
		expect((await api('feedback/list', { mine: true }, alice)).body.total).toBe(1);
		expect((await api('feedback/list', { mine: true }, bob)).body).toMatchObject({ items: [], total: 0, counts: { all: 0 } });
	});

	test('ordinary authors cannot change status or the official response', async () => {
		for (const actor of [alice, bob]) {
			const result = await api('feedback/update', { feedbackId: created.id, status: 'resolved', response: 'Official response' }, actor);
			expect(result.status).toBe(403);
			expect(castAsError(result.body).error.code).toBe('ROLE_PERMISSION_DENIED');
		}
		expect((await api('feedback/show', { feedbackId: created.id })).body).toMatchObject({ status: 'open', response: null });
	});

	test('moderators can publish a response and move feedback through its lifecycle', async () => {
		const progress = await api('feedback/update', { feedbackId: created.id, status: 'inProgress', response: '  Investigating  ' }, moderator);
		expect(progress.status).toBe(200);
		expect(progress.body).toMatchObject({ status: 'inProgress', response: 'Investigating', createdAt: created.createdAt });
		const resolved = await api('feedback/update', { feedbackId: created.id, status: 'resolved' }, moderator);
		expect(resolved.body).toMatchObject({ status: 'resolved', response: 'Investigating' });
		expect(Date.parse(resolved.body.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt));
		expect((await api('feedback/list', { status: 'resolved' })).body.items.map(item => item.id)).toEqual([created.id]);
	});

	test('administrators can reopen feedback and clear the response', async () => {
		const reopened = await api('feedback/update', { feedbackId: created.id, status: 'open', response: null }, admin);
		expect(reopened.status).toBe(200);
		expect(reopened.body).toMatchObject({ status: 'open', response: null });
	});

	test('requires write scope even when the caller is a moderator', async () => {
		const token = await createAppToken(moderator, ['read:account']);
		const denied = await api('feedback/update', { feedbackId: created.id, status: 'closed' }, { token });
		expect(denied.status).toBe(403);
		expect(castAsError(denied.body).error.code).toBe('PERMISSION_DENIED');
	});

	test('category and search filters apply to counts before status filtering', async () => {
		const second = await api('feedback/create', { title: 'Search request', description: 'Description', category: 'bug' }, alice);
		await api('feedback/update', { feedbackId: second.body.id, status: 'closed' }, moderator);
		await api('feedback/create', { title: 'Search improvement', description: 'Description', category: 'feature' }, alice);
		await api('feedback/create', { title: 'Search from another author', description: 'Description', category: 'bug' }, bob);
		const result = await api('feedback/list', { query: 'SEARCH', category: 'bug', mine: true, status: 'open', limit: 1 }, alice);
		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({ total: 1, counts: { all: 2, open: 1, inProgress: 0, resolved: 0, closed: 1 } });
		expect(result.body.items.map(item => item.id)).toEqual([created.id]);
	});

	test('literal percent and underscore characters cannot broaden search', async () => {
		const feedback = await api('feedback/create', { title: '100%_literal', description: 'Description', category: 'other' }, bob);
		const result = await api('feedback/list', { query: '%_' });
		expect(result.body.total).toBe(1);
		expect(result.body.items[0].id).toBe(feedback.body.id);
	});

	test('paginates without altering totals and returns empty out-of-range pages', async () => {
		const first = await api('feedback/list', { limit: 1, offset: 0 });
		const second = await api('feedback/list', { limit: 1, offset: 1 });
		expect(first.body.items).toHaveLength(1);
		expect(second.body.items).toHaveLength(1);
		expect(first.body.items[0].id).not.toBe(second.body.items[0].id);
		expect(first.body.total).toBe(second.body.total);
		const empty = await api('feedback/list', { limit: 1, offset: 100 });
		expect(empty.body.items).toEqual([]);
		expect(empty.body.total).toBe(first.body.total);
	});

	test('validates update content and refuses an empty update', async () => {
		const empty = await api('feedback/update', { feedbackId: created.id }, moderator);
		expect(empty.status).toBe(400);
		const oversized = await api('feedback/update', { feedbackId: created.id, response: 'x'.repeat(10001) }, moderator);
		expect(oversized.status).toBe(400);
		expect((await api('feedback/show', { feedbackId: created.id })).body.response).toBeNull();
	});

	test('does not allow another user to delete a report', async () => {
		const result = await api('feedback/delete', { feedbackId: created.id }, bob);
		expect(result.status).toBe(403);
		expect(castAsError(result.body).error.code).toBe('ACCESS_DENIED');
		expect((await api('feedback/show', { feedbackId: created.id })).status).toBe(200);
	});

	test('owners can delete their feedback', async () => {
		expect((await api('feedback/delete', { feedbackId: created.id }, alice)).status).toBe(204);
		const shown = await api('feedback/show', { feedbackId: created.id });
		expect(shown.status).toBe(400);
		expect(castAsError(shown.body).error.code).toBe('NO_SUCH_FEEDBACK');
	});

	test('moderators can delete reports from other users', async () => {
		const report = await api('feedback/create', { title: 'Spam', description: 'Description', category: 'other' }, bob);
		expect((await api('feedback/delete', { feedbackId: report.body.id }, moderator)).status).toBe(204);
		expect((await api('feedback/show', { feedbackId: report.body.id })).status).toBe(400);
	});

	test('missing feedback produces explicit errors on update and delete', async () => {
		for (const endpoint of ['feedback/update', 'feedback/delete'] as const) {
			const result = await api(endpoint, { feedbackId: created.id, status: 'closed' }, moderator);
			expect(result.status).toBe(400);
			expect(castAsError(result.body).error.code).toBe('NO_SUCH_FEEDBACK');
		}
	});
});
