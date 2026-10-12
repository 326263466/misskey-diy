/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { MiTransfer } from '@/models/Transfer.js';
import { api, castAsError, createAppToken, initTestDb, signup } from '../utils.js';
import type { DataSource } from 'typeorm';
import type * as Misskey from 'misskey-js';

describe('independent wallet transfers', () => {
	let db: DataSource;
	let sender: Misskey.entities.SignupResponse;
	let recipient: Misskey.entities.SignupResponse;
	let stranger: Misskey.entities.SignupResponse;

	beforeAll(async () => {
		if (!/test/i.test(loadConfig().db.db)) throw new Error('An isolated test database is required.');
		db = await initTestDb(true);
		const admin = await signup({ username: 'transferadmin' });
		sender = await signup({ username: 'transfersender' });
		recipient = await signup({ username: 'transferrecipient' });
		stranger = await signup({ username: 'transferstranger' });
		expect((await api('admin/wallet/adjust', { userId: sender.id, amount: 100, requestId: randomUUID() }, admin)).status).toBe(200);
	}, 120000);
	afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

	test('requires first-party authentication and validates decimal amounts', async () => {
		const draft = { recipientId: recipient.id, amount: 1, requestId: randomUUID() };
		const anonymous = await api('transfers/create', draft);
		expect(anonymous.status).toBe(400);
		expect(castAsError(anonymous.body).error.code).toBe('ACCESS_DENIED');
		const token = await createAppToken(sender, ['write:account', 'read:account']);
		const thirdParty = await api('transfers/create', draft, { token });
		expect(thirdParty.status).toBe(400);
		expect(castAsError(thirdParty.body).error.code).toBe('ACCESS_DENIED');
		for (const amount of [0, -1, 0.001, 2000000001]) {
			expect((await api('transfers/create', { ...draft, amount }, sender)).status).toBe(400);
		}
	});

	test('creates once, keeps credentials private, and settles concurrent acceptance once', async () => {
		const draft = { recipientId: recipient.id, amount: 1.25, requestId: randomUUID(), message: '午餐' };
		const before = (await api('i/wallet', {}, sender)).body;
		const results = await Promise.all([api('transfers/create', draft, sender), api('transfers/create', draft, sender)]);
		expect(results.map(row => row.status)).toEqual([200, 200]);
		expect(results[0].body).toEqual(results[1].body);
		const transfer = results[0].body;
		expect(Date.parse(transfer.expiresAt) - Date.parse(transfer.createdAt)).toBe(86400000);
		expect((await api('i/wallet', {}, sender)).body).toMatchObject({ balance: before.balance - 1.25, reservedBalance: before.reservedBalance + 1.25 });
		const forbidden = await api('transfers/show', { transferId: transfer.id }, stranger);
		expect(castAsError(forbidden.body).error.code).toBe('TRANSFER_ACCESS_DENIED');
		expect((await api('transfers/accept', { transferId: transfer.id }, sender)).status).toBe(400);
		const accepts = await Promise.all([api('transfers/accept', { transferId: transfer.id }, recipient), api('transfers/accept', { transferId: transfer.id }, recipient)]);
		expect(accepts.every(row => row.status === 200 && row.body.status === 'accepted')).toBe(true);
		expect((await api('i/wallet', {}, recipient)).body.balance).toBe(1.25);
		expect((await api('transfers/list', { direction: 'received' }, recipient)).body).toContainEqual(accepts[0].body);
		expect((await api('transfers/list', {}, stranger)).body).toEqual([]);
	});

	test('recipient can explicitly refund but the sender cannot take pending funds back', async () => {
		const before = (await api('i/wallet', {}, sender)).body;
		const created = await api('transfers/create', { recipientId: recipient.id, amount: 2.03, requestId: randomUUID() }, sender);
		expect(created.status).toBe(200);
		const params = { transferId: created.body.id };
		expect((await api('transfers/refund', params, sender)).status).toBe(400);
		expect((await api('transfers/refund', params, recipient)).body.status).toBe('refunded');
		expect((await api('transfers/refund', params, recipient)).body.status).toBe('refunded');
		expect((await api('i/wallet', {}, sender)).body).toEqual(before);
		expect((await api('transfers/accept', params, recipient)).status).toBe(400);
	});

	test('a late receive request expires the credential and commits the automatic refund', async () => {
		const before = (await api('i/wallet', {}, sender)).body;
		const created = await api('transfers/create', { recipientId: recipient.id, amount: 3.07, requestId: randomUUID() }, sender);
		expect(created.status).toBe(200);
		await db.getRepository(MiTransfer).update({ id: created.body.id }, { expiresAt: new Date(Date.now() - 1) });
		expect((await api('transfers/accept', { transferId: created.body.id }, recipient)).body.status).toBe('expired');
		expect((await api('transfers/show', { transferId: created.body.id }, sender)).body.status).toBe('expired');
		expect((await api('i/wallet', {}, sender)).body).toEqual(before);
	});
});
