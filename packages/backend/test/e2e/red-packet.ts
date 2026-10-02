/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { MiRedPacket } from '@/models/RedPacket.js';
import { MiUserProfile } from '@/models/UserProfile.js';
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

	test('ordinary posts are free and issued packets remain accessible through independent records', async () => {
		const before = await balance(alice);
		expect((await api('notes/create', { text: 'Ordinary post' }, alice)).status).toBe(200);
		expect(await balance(alice)).toEqual(before);
		const packet = await create();
		expect(packet.coverId).toBe('classic');
		expect((await balance(alice)).balance).toBe(before.balance - 20);
		const note = await deliver(packet.id);
		expect((await api('notes/delete', { noteId: note.id }, alice)).status).toBe(204);
		expect((await api('red-packets/show', { redPacketId: packet.id }, bob)).status).toBe(200);
		expect((await api('red-packets/list', { scope: 'received' }, bob)).body.some(item => item.id === packet.id)).toBe(true);
		expect((await balance(alice)).balance).toBe(before.balance - 20);
	});
	test('exchanges points once, requires admin authorization and respects wallet read scopes', async () => {
		await db.getRepository(MiUserProfile).update({ userId: bob.id }, { checkinPoints: 50 });
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
		expect((await api('red-packets/create', draft({ totalCoins: 21 }), alice)).status).toBe(400);
		// @ts-expect-error deliberately unsupported cover
		expect((await api('red-packets/create', draft({ coverId: 'invalid' }), alice)).status).toBe(400);
		expect(await balance(alice)).toEqual(before);
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
		expect(castAsError((await api('red-packets/claim', { redPacketId: packet.id }, alice)).body).error.code).toBe('CANNOT_CLAIM_OWN_RED_PACKET');
		const beforeClaim = await balance(bob);
		const claims = await Promise.all(Array.from({ length: 4 }, () => api('red-packets/claim', { redPacketId: packet.id }, bob)));
		for (const claim of claims) expect(claim.body).toMatchObject({ claimedCoins: 10, remainingCount: 1, claims: [{ coins: 10, user: { id: bob.id } }] });
		expect((await balance(bob)).balance).toBe(beforeClaim.balance + 10);
		expect((await api('red-packets/claim', { redPacketId: packet.id }, carol)).body.status).toBe('exhausted');
	});
	test('deleting the display note does not cancel the packet or remove its claim entry', async () => {
		const before = await balance(alice);
		const packet = await create({ totalCoins: 30, count: 3 });
		const note = await deliver(packet.id);
		expect((await api('notes/update', { noteId: note.id, text: null }, alice)).status).toBe(200);
		expect((await api('red-packets/claim', { redPacketId: packet.id }, bob)).status).toBe(200);
		expect((await api('notes/delete', { noteId: note.id }, alice)).status).toBe(204);
		expect((await balance(alice)).balance).toBe(before.balance - 30);
		expect((await api('red-packets/claim', { redPacketId: packet.id }, carol)).status).toBe(200);
		expect((await api('notes/create', { redPacketId: packet.id }, alice)).status).toBe(200);
		expect((await balance(alice)).balance).toBe(before.balance - 30);
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
	test('a tip credits the chosen recipient immediately without any host message', async () => {
		const before = await balance(alice);
		const recipientBefore = await balance(bob);
		const packet = await create({ kind: 'tip', audience: 'recipients', recipientIds: [bob.id], count: 1, totalCoins: 7, message: '国庆快乐' });
		expect(packet).toMatchObject({ status: 'exhausted', message: '国庆快乐' });
		expect((await balance(alice)).balance).toBe(before.balance - 7);
		expect((await balance(bob)).balance).toBe(recipientBefore.balance + 7);
	});
	test('deleting a reply tree leaves independent packets intact and keeps quotes classified as content', async () => {
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
		expect(rows.filter(row => row.type === 'redPacketRefund')).toHaveLength(1);
		expect((await api('i/wallet/transactions', { limit: 1, untilId: rows[0].id }, alice)).body[0].id).toBe(rows[1].id);
	});
});
