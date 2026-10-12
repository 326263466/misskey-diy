/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { MiRedPacket } from '@/models/RedPacket.js';
import { MiWallet } from '@/models/Wallet.js';
import { api, castAsError, createAppToken, initTestDb, signup } from '../utils.js';
import type { DataSource } from 'typeorm';
import type * as Misskey from 'misskey-js';

describe('independent red packets and note delivery', () => {
	let db: DataSource;
	let admin: Misskey.entities.SignupResponse;
	let alice: Misskey.entities.SignupResponse;
	let bob: Misskey.entities.SignupResponse;
	let carol: Misskey.entities.SignupResponse;

	function draft(overrides: Partial<Misskey.entities.RedPacketsCreateRequest> = {}) {
		return { kind: 'group' as const, audience: 'public' as const, mode: 'equal' as const, totalCoins: 20, count: 2, message: 'Enjoy!', expiresInHours: 24, requestId: randomUUID(), ...overrides };
	}

	async function balance(user: Misskey.entities.SignupResponse) {
		const result = await api('i/wallet', {}, user);
		expect(result.status).toBe(200);
		return result.body;
	}

	async function create(overrides: Partial<Misskey.entities.RedPacketsCreateRequest> = {}) {
		const result = await api('red-packets/create', draft(overrides), alice);
		expect(result.status).toBe(200);
		return result.body;
	}

	async function deliver(redPacketId: string, options: Partial<Misskey.entities.NotesCreateRequest> = {}) {
		const result = await api('notes/create', { ...options, redPacketId }, alice);
		expect(result.status).toBe(200);
		return result.body.createdNote;
	}

	beforeAll(async () => {
		if (!/test/i.test(loadConfig().db.db)) throw new Error('An isolated test database is required.');
		db = await initTestDb(true);
		admin = await signup({ username: 'packetadmin' });
		alice = await signup({ username: 'packetalice' });
		bob = await signup({ username: 'packetbob' });
		carol = await signup({ username: 'packetcarol' });
		expect((await api('admin/wallet/adjust', { userId: alice.id, amount: 1000, reason: 'Test funds', requestId: randomUUID() }, admin)).status).toBe(200);
	}, 120000);
	afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

	test('普通帖子免费，删除红包帖子不改变红包有效期', async () => {
		const before = await balance(alice);
		expect((await api('notes/create', { text: 'Ordinary post' }, alice)).status).toBe(200);
		expect(await balance(alice)).toEqual(before);
		const packet = await create();
		expect(packet.coverId).toBe('classic');
		expect((await balance(alice)).balance).toBe(before.balance - 20);
		const note = await deliver(packet.id);
		expect((await api('notes/delete', { noteId: note.id }, alice)).status).toBe(204);
		expect((await api('red-packets/show', { redPacketId: packet.id }, bob)).status).toBe(200);
		expect((await api('red-packets/list', { scope: 'claimable' }, bob)).body.some(item => item.id === packet.id)).toBe(true);
		expect((await api('red-packets/show', { redPacketId: packet.id }, alice)).body).toMatchObject({ status: 'active', remainingCoins: 20, expiresAt: packet.expiresAt });
		expect((await balance(alice)).balance).toBe(before.balance - 20);
	});
	test('exchanges points once, requires admin authorization and respects wallet read scopes', async () => {
		await db.getRepository(MiWallet).update({ userId: bob.id }, { balance: 50 });
		const input = { points: 10, requestId: randomUUID() };
		const results = await Promise.all([api('i/wallet/exchange', input, bob), api('i/wallet/exchange', input, bob)]);
		expect(results.map(result => result.status)).toEqual([200, 200]);
		expect(results.filter(result => result.body.exchanged)).toHaveLength(1);
		expect(await balance(bob)).toMatchObject({ balance: 10, points: 40 });
		expect((await api('admin/wallet/update-settings', { exchangeEnabled: true, exchangeRate: 3 }, bob)).status).toBe(403);
		expect((await api('admin/wallet/adjust', { userId: bob.id, amount: 100, reason: 'Unauthorized', requestId: randomUUID() }, bob)).status).toBe(403);
		const token = await createAppToken(bob, ['write:notes']);
		expect((await api('i/wallet', {}, { token })).status).toBe(403);
	});
	test('rejects insufficient balance, invalid equal amounts and unsupported covers without spending', async () => {
		const before = await balance(alice);
		expect((await api('red-packets/create', draft(), carol)).status).toBe(400);
		expect((await api('red-packets/create', draft({ totalCoins: 20.01 }), alice)).status).toBe(400);
		// @ts-expect-error deliberately unsupported cover
		expect((await api('red-packets/create', draft({ coverId: 'invalid' }), alice)).status).toBe(400);
		expect(await balance(alice)).toEqual(before);
	});
	test('新红包祝福语按Unicode字符限制18字，超限不扣款', async () => {
		const before = await balance(alice);
		for (const character of ['祝', '\u{1f9e7}']) {
			expect(await create({ message: character.repeat(18) })).toMatchObject({ message: character.repeat(18) });
			const result = await api('red-packets/create', draft({ message: character.repeat(19) }), alice);
			expect(result.status).toBe(400);
			expect(castAsError(result.body).error.code).toBe('INVALID_PARAM');
		}
		expect((await balance(alice)).balance).toBe(before.balance - 40);
	});
	test('accepts decimal amounts up to 1000 and refunds an explicitly cancelled packet', async () => {
		const user = await signup({ username: 'packetlarge' });
		const totalCoins = 999.99;
		expect((await api('admin/wallet/adjust', { userId: user.id, amount: totalCoins, requestId: randomUUID() }, admin)).status).toBe(200);
		const packet = await api('red-packets/create', draft({ mode: 'random', totalCoins }), user);
		expect(packet.status).toBe(200);
		expect(await balance(user)).toMatchObject({ balance: 0, reservedBalance: totalCoins });
		expect((await api('red-packets/cancel', { redPacketId: packet.body.id }, user)).body).toMatchObject({ status: 'cancelled', remainingCoins: 0 });
		expect(await balance(user)).toMatchObject({ balance: totalCoins, reservedBalance: 0 });
		for (const invalidTotal of [0.99, 1000.01, 1.001]) {
			expect((await api('red-packets/create', draft({ mode: 'random', totalCoins: invalidTotal }), user)).status).toBe(400);
		}
	});
	test('deduplicates creation and note delivery independently and charges only creation', async () => {
		const before = await balance(alice);
		const input = draft({ coverId: 'lucky' });
		const results = await Promise.all(Array.from({ length: 4 }, () => api('red-packets/create', input, alice)));
		for (const result of results) expect(result.status).toBe(200);
		const packet = results[0].body;
		expect(new Set(results.map(result => result.body.id)).size).toBe(1);
		expect((await balance(alice)).balance).toBe(before.balance - 20);
		expect((await api('red-packets/create', { ...input, totalCoins: 40 }, alice)).status).toBe(400);
		const notes = await Promise.all(Array.from({ length: 4 }, () => deliver(packet.id, { localOnly: false })));
		expect(new Set(notes.map(note => note.id)).size).toBe(1);
		expect(notes[0]).toMatchObject({ localOnly: true, hasRedPacket: true, redPacket: { id: packet.id, coverId: 'lucky' } });
		expect((await balance(alice)).balance).toBe(before.balance - 20);
		const beforeClaim = await balance(bob);
		const claims = await Promise.all(Array.from({ length: 4 }, () => api('red-packets/claim', { redPacketId: packet.id }, bob)));
		for (const claim of claims) expect(claim.body).toMatchObject({ claimedCoins: 10, remainingCount: 1, claims: [{ coins: 10, user: { id: bob.id } }] });
		expect((await balance(bob)).balance).toBe(beforeClaim.balance + 10);
		expect((await api('red-packets/claim', { redPacketId: packet.id }, alice)).body).toMatchObject({ claimedCoins: 10, status: 'exhausted' });
		expect((await balance(alice)).balance).toBe(before.balance - 10);
	});
	test('删除展示帖子后已领记录保留，剩余份额仍可领取', async () => {
		const before = await balance(alice);
		const packet = await create({ totalCoins: 30, count: 3 });
		const note = await deliver(packet.id);
		expect((await api('notes/update', { noteId: note.id, text: null }, alice)).status).toBe(200);
		expect((await api('red-packets/claim', { redPacketId: packet.id }, bob)).status).toBe(200);
		expect((await api('notes/delete', { noteId: note.id }, alice)).status).toBe(204);
		expect((await balance(alice)).balance).toBe(before.balance - 30);
		expect((await api('red-packets/claim', { redPacketId: packet.id }, carol)).body).toMatchObject({ claimedCoins: 10 });
		expect((await api('red-packets/show', { redPacketId: packet.id }, bob)).body).toMatchObject({ status: 'active', claimedCoins: 10, remainingCoins: 10, expiresAt: packet.expiresAt });
	});
	test('commits expiry refunds even when a late claim returns an error', async () => {
		const before = await balance(alice);
		const packet = await create();
		await deliver(packet.id);
		await db.getRepository(MiRedPacket).update({ id: packet.id }, { expiresAt: new Date(Date.now() - 1000) });
		expect(castAsError((await api('red-packets/claim', { redPacketId: packet.id }, bob)).body).error.code).toBe('RED_PACKET_EXPIRED');
		expect((await balance(alice)).balance).toBe(before.balance);
		expect((await api('red-packets/show', { redPacketId: packet.id }, alice)).body).toMatchObject({ status: 'expired', remainingCoins: 0 });
	});
	test('uses intrinsic recipients independently of a display note and requires first-party spending credentials', async () => {
		const packet = await create({ kind: 'direct', audience: 'recipients', recipientIds: [bob.id], count: 1 });
		expect((await api('notes/create', { redPacketId: packet.id }, bob)).status).toBe(400);
		await deliver(packet.id, { visibility: 'specified', visibleUserIds: [bob.id] });
		expect((await api('red-packets/show', { redPacketId: packet.id }, carol)).status).toBe(400);
		expect((await api('red-packets/claim', { redPacketId: packet.id }, carol)).status).toBe(400);
		const anonymous = await api('red-packets/show', { redPacketId: packet.id });
		expect(anonymous.status).toBe(400);
		expect(castAsError(anonymous.body).error.code).toBe('ACCESS_DENIED');
		const token = await createAppToken(alice, ['write:notes', 'write:account']);
		const thirdParty = await api('red-packets/create', draft(), { token });
		expect(thirdParty.status).toBe(400);
		expect(castAsError(thirdParty.body).error.code).toBe('ACCESS_DENIED');
		expect((await api('red-packets/claim', { redPacketId: packet.id }, bob)).status).toBe(200);
	});
	test('打赏通过独立接口直接到账并关联内容，第三方凭证不能代付', async () => {
		const before = await balance(alice);
		const recipientBefore = await balance(bob);
		const note = await api('notes/create', { text: '支持这篇内容' }, bob);
		expect(note.status).toBe(200);
		const target = { targetType: 'note' as const, targetId: note.body.createdNote.id };
		const input = { userId: bob.id, amount: 7, message: '支持创作', requestId: randomUUID(), ...target };
		const token = await createAppToken(alice, ['write:account']);
		const denied = await api('i/wallet/tip', input, { token });
		expect(denied.status).toBe(400);
		expect(castAsError(denied.body).error.code).toBe('ACCESS_DENIED');
		const result = await api('i/wallet/tip', input, alice);
		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({ balance: before.balance - 7, amount: 7, sent: true });
		expect((await balance(alice)).balance).toBe(before.balance - 7);
		expect((await balance(bob)).balance).toBe(recipientBefore.balance + 7);
		const records = await api('tips/list', target, alice);
		expect(records.status).toBe(200);
		expect(records.body).toMatchObject({ totalCount: 1, totalAmount: 7, items: [{ user: { id: alice.id }, amount: 7 }] });
	});
	test('删除回复树保留独立红包，引用仍属于有效内容', async () => {
		const root = (await api('notes/create', { text: 'Root' }, alice)).body.createdNote;
		const before = await balance(alice);
		await deliver((await create()).id, { replyId: root.id });
		const quote = await deliver((await create()).id, { renoteId: root.id });
		expect((await api('notes/create', { renoteId: quote.id, text: 'Quote a packet' }, bob)).status).toBe(200);
		expect((await api('notes/delete', { noteId: root.id }, alice)).status).toBe(204);
		expect((await balance(alice)).balance).toBe(before.balance - 40);
		expect((await api('notes/delete', { noteId: quote.id }, alice)).status).toBe(204);
		expect((await balance(alice)).balance).toBe(before.balance - 40);
		const rows = (await api('i/wallet/transactions', { limit: 100 }, alice)).body;
		expect(rows[0].type).toBe('redPacketSend');
		expect((await api('i/wallet/transactions', { limit: 1, untilId: rows[0].id }, alice)).body[0].id).toBe(rows[1].id);
	});
	test('only the sender can cancel and retries refund once with first-party credentials', async () => {
		const before = await balance(alice);
		const packet = await create();
		expect((await api('red-packets/cancel', { redPacketId: packet.id }, bob)).status).toBe(400);
		expect((await api('red-packets/cancel', { redPacketId: packet.id })).status).toBe(400);
		const token = await createAppToken(alice, ['write:account']);
		expect((await api('red-packets/cancel', { redPacketId: packet.id }, { token })).status).toBe(400);
		const cancelled = await Promise.all(Array.from({ length: 4 }, () => api('red-packets/cancel', { redPacketId: packet.id }, alice)));
		for (const result of cancelled) expect(result.body).toMatchObject({ status: 'cancelled', remainingCoins: 0 });
		expect((await balance(alice)).balance).toBe(before.balance);
	});
});
