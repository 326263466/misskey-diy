/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { DataSource } from 'typeorm';
import { initTestDb } from '../utils.js';
import { FeedbackService } from '@/core/FeedbackService.js';
import { IdService } from '@/core/IdService.js';
import { MiFeedback } from '@/models/Feedback.js';
import { MiUser } from '@/models/User.js';
import { miRepository } from '@/models/_.js';
import CreateEndpoint from '@/server/api/endpoints/feedback/create.js';
import ListEndpoint from '@/server/api/endpoints/feedback/list.js';
import ShowEndpoint from '@/server/api/endpoints/feedback/show.js';
import UpdateEndpoint from '@/server/api/endpoints/feedback/update.js';
import DeleteEndpoint from '@/server/api/endpoints/feedback/delete.js';

const options = { limit: 20, offset: 0, sort: 'latest' as const };

describe('feedback persistence and validation', () => {
	let db: DataSource;
	let service: FeedbackService;
	let alice: MiUser;
	let bob: MiUser;
	let moderator: MiUser;

	function makeService() {
		return new FeedbackService(
			db.getRepository(MiFeedback).extend(miRepository),
			new IdService({ id: 'aidx' } as never),
			{ packMany: async (ids: string[]) => ids.map(id => ({ id, username: id })) } as never,
			{ isModerator: async (user: MiUser) => user.id === moderator.id } as never,
		);
	}

	beforeAll(async () => {
		db = await initTestDb();
		const users = db.getRepository(MiUser);
		await users.insert(['feedbackalice', 'feedbackbob', 'feedbackmoderator'].map(id => ({ id, username: id, usernameLower: id })));
		alice = await users.findOneByOrFail({ id: 'feedbackalice' });
		bob = await users.findOneByOrFail({ id: 'feedbackbob' });
		moderator = await users.findOneByOrFail({ id: 'feedbackmoderator' });
		service = makeService();
	});
	beforeEach(async () => { await db.getRepository(MiFeedback).clear(); });
	afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

	test('persists trimmed content and survives a fresh service instance', async () => {
		const created = await new CreateEndpoint(service).exec({ title: '  Search fails  ', description: '  Steps to reproduce  ', category: 'bug' }, alice as never, null);
		expect(created).toMatchObject({ title: 'Search fails', description: 'Steps to reproduce', category: 'bug', status: 'open', response: null, userId: alice.id, user: { id: alice.id } });
		expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);
		expect(await new ShowEndpoint(makeService()).exec({ feedbackId: created.id }, null, null)).toEqual(created);
		expect(await db.getRepository(MiFeedback).findOneByOrFail({ id: created.id })).toMatchObject({ title: 'Search fails', status: 'open' });
	});

	test('rejects blank, oversized, invalid category and invalid pagination input', async () => {
		const create = new CreateEndpoint(service);
		const defaults = { title: 'Title', description: 'Description', category: 'bug' };
		for (const input of [{ title: '  \n ' }, { description: '\t ' }, { title: 'x'.repeat(121) }, { description: 'x'.repeat(10001) }, { category: 'invalid' }]) {
			await expect(create.exec({ ...defaults, ...input }, alice as never, null)).rejects.toMatchObject({ code: expect.stringMatching(/INVALID_(CONTENT|PARAM)/) });
		}
		const list = new ListEndpoint(service);
		for (const input of [{ limit: 101 }, { offset: -1 }, { status: 'invalid' }, { query: 'x'.repeat(101) }]) {
			await expect(list.exec(input, null, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
		expect(await db.getRepository(MiFeedback).count()).toBe(0);
	});

	test('filters category, literal search and owner, while counts exclude status and pagination', async () => {
		const matching = await service.create({ title: 'Find 100%_match', description: 'Search case', category: 'bug' }, alice);
		const resolved = await service.create({ title: 'Find 100%_match again', description: 'Search case', category: 'bug' }, alice);
		await service.update(resolved.id, { status: 'resolved' }, moderator);
		await service.create({ title: 'Find 100%_match', description: 'Search case', category: 'feature' }, alice);
		await service.create({ title: 'Find 100%_match', description: 'Search case', category: 'bug' }, bob);
		await service.create({ title: 'Find 100AAAAmatch', description: 'Search case', category: 'bug' }, alice);
		const result = await service.list({ ...options, query: '100%_MATCH', category: 'bug', mine: true, status: 'open', limit: 1 }, alice);
		expect(result.items.map(item => item.id)).toEqual([matching.id]);
		expect(result.total).toBe(1);
		expect(result.counts).toEqual({ all: 2, open: 1, inProgress: 0, resolved: 1, closed: 0 });
		expect((await service.list({ ...options, query: 'Search case', category: 'bug' }, null)).total).toBe(4);
		expect((await service.list({ ...options, query: 'no matches' }, null)).counts.all).toBe(0);
	});

	test('requires authentication for mine without leaking feedback', async () => {
		await service.create({ title: 'Private filter', description: 'Public content', category: 'other' }, alice);
		await expect(new ListEndpoint(service).exec({ mine: true }, null, null)).rejects.toMatchObject({ code: 'CREDENTIAL_REQUIRED', httpStatusCode: 401 });
		expect((await new ListEndpoint(service).exec({}, null, null)).total).toBe(1);
	});

	test('orders and paginates deterministically by latest or update time', async () => {
		const first = await service.create({ title: 'First', description: 'Description', category: 'other' }, alice);
		const second = await service.create({ title: 'Second', description: 'Description', category: 'other' }, alice);
		await db.getRepository(MiFeedback).update(first.id, { updatedAt: new Date('2030-01-01T00:00:00Z') });
		expect((await service.list({ ...options, limit: 1 }, null)).items[0].id).toBe(second.id);
		expect((await service.list({ ...options, limit: 1, offset: 1 }, null)).items[0].id).toBe(first.id);
		expect((await service.list({ ...options, limit: 1, sort: 'updated' }, null)).items[0].id).toBe(first.id);
		expect((await service.list({ ...options, offset: 10 }, null)).total).toBe(2);
	});

	test('only moderators can change status and response; partial updates preserve the other field', async () => {
		const feedback = await service.create({ title: 'Fix this', description: 'Description', category: 'bug' }, alice);
		const update = new UpdateEndpoint(service);
		for (const actor of [alice, bob]) {
			await expect(update.exec({ feedbackId: feedback.id, status: 'resolved' }, actor as never, null)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
		}
		const updated = await update.exec({ feedbackId: feedback.id, status: 'inProgress', response: '  Investigating  ' }, moderator as never, null);
		expect(updated).toMatchObject({ status: 'inProgress', response: 'Investigating', createdAt: feedback.createdAt });
		await update.exec({ feedbackId: feedback.id, status: 'resolved' }, moderator as never, null);
		expect(await service.show(feedback.id, null)).toMatchObject({ status: 'resolved', response: 'Investigating' });
		await update.exec({ feedbackId: feedback.id, response: null }, moderator as never, null);
		expect(await service.show(feedback.id, null)).toMatchObject({ status: 'resolved', response: null });
		await expect(update.exec({ feedbackId: feedback.id }, moderator as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		await expect(update.exec({ feedbackId: feedback.id, response: 'x'.repeat(10001) }, moderator as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
	});

	test('owners and moderators may delete but other users cannot', async () => {
		const feedback = await service.create({ title: 'Delete this', description: 'Description', category: 'other' }, alice);
		const endpoint = new DeleteEndpoint(service);
		await expect(endpoint.exec({ feedbackId: feedback.id }, bob as never, null)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
		await endpoint.exec({ feedbackId: feedback.id }, alice as never, null);
		await expect(new ShowEndpoint(service).exec({ feedbackId: feedback.id }, null, null)).rejects.toMatchObject({ code: 'NO_SUCH_FEEDBACK' });
		const next = await service.create({ title: 'Moderate this', description: 'Description', category: 'other' }, alice);
		await endpoint.exec({ feedbackId: next.id }, moderator as never, null);
		expect(await db.getRepository(MiFeedback).count()).toBe(0);
	});

	test('migration round trip produces a schema matching the model', async () => {
		const migrationModule = await import(pathToFileURL(resolve('migration/1790786597894-feedback.js')).href);
		const migration = new migrationModule.Feedback1790786597894();
		const runner = db.createQueryRunner();
		try {
			await migration.down(runner);
			expect(await runner.hasTable('feedback')).toBe(false);
			await migration.up(runner);
			const changes = await db.driver.createSchemaBuilder().log();
			expect(changes.upQueries).toEqual([]);
			expect(changes.downQueries).toEqual([]);
			const feedback = await service.create({ title: 'After migration', description: 'Persisted', category: 'other' }, bob);
			await db.getRepository(MiUser).delete(bob.id);
			expect(await db.getRepository(MiFeedback).findOneBy({ id: feedback.id })).toBeNull();
		} finally {
			await runner.release();
		}
	});
});
