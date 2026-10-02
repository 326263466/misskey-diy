/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { initTestDb } from '../utils.js';
import { loadConfig } from '@/config.js';
import { RedPacketService, type RedPacketDraft } from '@/core/RedPacketService.js';
import { WalletService, WALLET_MAX_BALANCE } from '@/core/WalletService.js';
import { IdService } from '@/core/IdService.js';
import { MiNote } from '@/models/Note.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import { MiUser } from '@/models/User.js';
import { MiBlocking } from '@/models/Blocking.js';
import { MiRedPacket } from '@/models/RedPacket.js';
import { MiRedPacketClaim } from '@/models/RedPacketClaim.js';
import { MiWallet } from '@/models/Wallet.js';
import { MiWalletTransaction } from '@/models/WalletTransaction.js';
import CreateEndpoint from '@/server/api/endpoints/red-packets/create.js';
import ClaimEndpoint from '@/server/api/endpoints/red-packets/claim.js';
import ListEndpoint from '@/server/api/endpoints/red-packets/list.js';

describe('independent red packet transactions', () => {
	let db: DataSource;
	let service: RedPacketService;
	let wallet: WalletService;
	let sender: MiUser;
	let recipients: MiUser[];
	const ids = new IdService({ id: 'aidx' } as never);
	const logger = { error: vi.fn() };

	function makeService() {
		return new RedPacketService(db, ids, wallet, {
			packMany: async (users: MiUser[]) => users.map(user => ({ id: user.id, username: user.username })),
		} as never, { getLogger: () => logger } as never, { getPublicUrl: (file: { url: string }) => file.url } as never);
	}

	function draft(overrides: Partial<RedPacketDraft> = {}): RedPacketDraft {
		return { kind: 'group', audience: 'public', mode: 'equal', totalCoins: 20, count: 4, message: '  Good luck  ', expiresInHours: 1, requestId: randomUUID(), ...overrides };
	}

	test('cover images are owned raster files and remain part of an idempotent request', async () => {
		const file = { id: ids.gen(), userId: sender.id, name: 'cover.png', md5: '0'.repeat(32), type: 'image/png', size: 100, storedInternal: false, url: 'https://example.test/cover.png' };
		await db.getRepository(MiDriveFile).insert(file);
		const request = draft({ coverFileId: file.id });
		const result = await service.create(request, sender);
		expect(result).toMatchObject({ coverFileId: file.id, coverUrl: file.url });
		expect(await service.create(request, sender)).toEqual(result);
		await expect(service.create({ ...request, coverFileId: null }, sender)).rejects.toBeInstanceOf(RedPacketService.RequestIdConflictError);
		await db.getRepository(MiDriveFile).update(file.id, { userId: recipients[0].id });
		await expect(service.create(draft({ coverFileId: file.id }), sender)).rejects.toBeInstanceOf(RedPacketService.InvalidDraftError);
		await db.getRepository(MiDriveFile).update(file.id, { userId: sender.id, type: 'text/html' });
		await expect(service.create(draft({ coverFileId: file.id }), sender)).rejects.toBeInstanceOf(RedPacketService.InvalidDraftError);
	});

	async function balance(userId: string) {
		const row = await db.getRepository(MiWallet).findOneBy({ userId });
		return { balance: row?.balance ?? 0, reservedBalance: row?.reservedBalance ?? 0 };
	}

	beforeAll(async () => {
		if (!/(^|[_-])test([_-]|$)/i.test(loadConfig().db.db)) throw new Error('Red packet tests require an explicitly named test database.');
		db = await initTestDb();
		wallet = new WalletService(db, ids);
		const userIds = Array.from({ length: 25 }, () => ids.gen());
		await db.getRepository(MiUser).insert(userIds.map((id, index) => ({ id, username: `packetuser${index}`, usernameLower: `packetuser${index}` })));
		const users = await db.getRepository(MiUser).findBy({});
		sender = users.find(user => user.id === userIds[0])!;
		recipients = users.filter(user => user.id !== sender.id);
		service = makeService();
	});
	beforeEach(async () => {
		await db.getRepository(MiRedPacketClaim).createQueryBuilder().delete().execute();
		await db.getRepository(MiRedPacket).createQueryBuilder().delete().execute();
		await db.getRepository(MiNote).createQueryBuilder().delete().execute();
		await db.getRepository(MiBlocking).createQueryBuilder().delete().execute();
		await db.getRepository(MiWalletTransaction).createQueryBuilder().delete().execute();
		await db.getRepository(MiWallet).createQueryBuilder().delete().execute();
		await db.getRepository(MiUser).createQueryBuilder().update().set({ isSuspended: false, host: null }).execute();
		await db.getRepository(MiWallet).insert({ userId: sender.id, balance: 1000, reservedBalance: 0 });
		logger.error.mockClear();
	});
	afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

	test('validates amount, recipient scope and Unicode before debiting', async () => {
		for (const value of [{ count: 0 }, { count: 101 }, { totalCoins: 21 }, { expiresInHours: 12 }, { message: '\u{1f9e7}'.repeat(101) }, { requestId: 'invalid' }, { kind: 'direct' }, { recipientIds: [recipients[0].id] }, { audience: 'recipients' }]) {
			await expect(service.create(draft(value as Partial<RedPacketDraft>), sender)).rejects.toBeInstanceOf(RedPacketService.InvalidDraftError);
		}
		expect(await balance(sender.id)).toEqual({ balance: 1000, reservedBalance: 0 });
	});

	test('issues independently with default cover and greeting; retries debit once', async () => {
		const input = { kind: 'group', audience: 'public', mode: 'equal', totalCoins: 20, count: 4, expiresInHours: 1, requestId: randomUUID() };
		const result = await new CreateEndpoint(service).exec(input, sender as never, null);
		expect(result).toMatchObject({ senderId: sender.id, message: '', coverId: 'classic', status: 'active' });
		expect(await db.getRepository(MiNote).count()).toBe(0);
		const custom = draft({ message: '  Happy birthday \u{1f9e7}  ', coverId: 'sunset' });
		const retries = await Promise.all(Array.from({ length: 8 }, () => service.create(custom, sender)));
		expect(new Set(retries.map(packet => packet.id)).size).toBe(1);
		expect(retries[0]).toMatchObject({ message: 'Happy birthday \u{1f9e7}', coverId: 'sunset' });
		await expect(service.create({ ...custom, coverId: 'lucky' }, sender)).rejects.toBeInstanceOf(RedPacketService.RequestIdConflictError);
		expect(await db.getRepository(MiWalletTransaction).countBy({ type: 'redPacketSend' })).toBe(2);
		expect(await balance(sender.id)).toEqual({ balance: 960, reservedBalance: 40 });
	});

	test('fixed recipients discover and claim a packet after its message is deleted', async () => {
		const packet = await service.create(draft({ kind: 'direct', audience: 'recipients', recipientIds: [recipients[0].id], count: 1 }), sender);
		await service.assertCanReference(packet.id, sender.id);
		await expect(service.assertCanReference(packet.id, recipients[0].id)).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		const note = { id: ids.gen(), userId: sender.id, text: 'packet', visibility: 'public' as const, redPacketId: packet.id, hasRedPacket: true };
		await db.getRepository(MiNote).insert(note);
		await db.getRepository(MiNote).delete(note.id);
		const list = new ListEndpoint(service);
		expect((await list.exec({ scope: 'received' }, recipients[0] as never, null)).map((row: { id: string }) => row.id)).toContain(packet.id);
		expect(await list.exec({ scope: 'received' }, recipients[1] as never, null)).toEqual([]);
		await expect(service.claim(packet.id, recipients[1])).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
		expect(await service.claim(packet.id, recipients[0])).toMatchObject({ claimedCoins: 20, status: 'exhausted' });
		expect(await db.getRepository(MiWalletTransaction).countBy({ type: 'redPacketRefund' })).toBe(0);
	});

	test('sent and received lists paginate and contain public pending packets', async () => {
		const first = await service.create(draft(), sender);
		const second = await service.create(draft(), sender);
		expect((await service.list(sender, 1)).map(packet => packet.id)).toEqual([second.id]);
		expect((await service.list(sender, 10, second.id)).map(packet => packet.id)).toEqual([first.id]);
		expect((await service.list(recipients[0], 10, undefined, 'received')).map(packet => packet.id)).toEqual([second.id, first.id]);
	});

	test('claimable filters claimed, exhausted and expired packets without empty-page scanning', async () => {
		const available = await service.create(draft(), sender);
		const expired = await service.create(draft(), sender);
		const claimed = await service.create(draft(), sender);
		await db.getRepository(MiRedPacket).update(expired.id, { expiresAt: new Date(0) });
		await service.claim(claimed.id, recipients[0]);
		expect((await service.list(recipients[0], 10, undefined, 'claimable')).map(packet => packet.id)).toEqual([available.id]);
		expect((await service.list(recipients[0], 10, undefined, 'received')).map(packet => packet.id)).toEqual([claimed.id, available.id]);
	});

	test('concurrent claims never overdraw and retries never pay twice', async () => {
		const packet = await service.create(draft(), sender);
		const results = await Promise.allSettled(recipients.slice(0, 12).map(user => service.claim(packet.id, user)));
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(4);
		const claims = await db.getRepository(MiRedPacketClaim).find();
		expect(claims.map(claim => claim.coins)).toEqual([5, 5, 5, 5]);
		const winner = recipients.find(user => user.id === claims[0].userId)!;
		await Promise.all(Array.from({ length: 8 }, () => service.claim(packet.id, winner)));
		expect(await balance(winner.id)).toEqual({ balance: 5, reservedBalance: 0 });
		expect(await balance(sender.id)).toEqual({ balance: 980, reservedBalance: 0 });
		expect(await db.getRepository(MiWalletTransaction).countBy({ type: 'redPacketClaim' })).toBe(4);
	});

	test('random allocation preserves the exact integer total', async () => {
		const packet = await service.create(draft({ mode: 'random', totalCoins: 123, count: 20 }), sender);
		await Promise.all(recipients.slice(0, 20).map(user => service.claim(packet.id, user)));
		const claims = await db.getRepository(MiRedPacketClaim).find();
		expect(claims.every(claim => Number.isInteger(claim.coins) && claim.coins > 0)).toBe(true);
		expect(claims.reduce((sum, claim) => sum + claim.coins, 0)).toBe(123);
		expect(await balance(sender.id)).toEqual({ balance: 877, reservedBalance: 0 });
	});

	test('late claims refund the remainder once across sweep restarts', async () => {
		const packet = await service.create(draft(), sender);
		await service.claim(packet.id, recipients[0]);
		await db.getRepository(MiRedPacket).update(packet.id, { expiresAt: new Date(0) });
		await expect(new ClaimEndpoint(service).exec({ redPacketId: packet.id }, recipients[1] as never, null)).rejects.toMatchObject({ code: 'RED_PACKET_EXPIRED' });
		await Promise.all([service.sweepExpired(), makeService().sweepExpired()]);
		expect(await balance(sender.id)).toEqual({ balance: 995, reservedBalance: 0 });
		expect(await db.getRepository(MiWalletTransaction).countBy({ type: 'redPacketRefund' })).toBe(1);
		expect(await service.claim(packet.id, recipients[0])).toMatchObject({ claimedCoins: 5, status: 'expired' });
		expect(logger.error).not.toHaveBeenCalled();
	});

	test('tips credit immediately with exactly one financial effect across retries', async () => {
		const input = draft({ kind: 'tip', audience: 'recipients', recipientIds: [recipients[0].id], count: 1 });
		const results = await Promise.all(Array.from({ length: 5 }, () => service.create(input, sender)));
		expect(results.every(packet => packet.status === 'exhausted')).toBe(true);
		expect(await balance(sender.id)).toEqual({ balance: 980, reservedBalance: 0 });
		expect(await balance(recipients[0].id)).toEqual({ balance: 20, reservedBalance: 0 });
		await service.claim(results[0].id, recipients[0]);
		expect(await db.getRepository(MiRedPacketClaim).count()).toBe(1);
	});

	test('full recipient wallets roll back both tips and claims', async () => {
		await db.getRepository(MiWallet).insert({ userId: recipients[0].id, balance: WALLET_MAX_BALANCE, reservedBalance: 0 });
		await expect(service.create(draft({ kind: 'tip', audience: 'recipients', recipientIds: [recipients[0].id], count: 1 }), sender)).rejects.toBeInstanceOf(WalletService.BalanceLimitError);
		expect(await balance(sender.id)).toEqual({ balance: 1000, reservedBalance: 0 });
		const packet = await service.create(draft(), sender);
		await expect(service.claim(packet.id, recipients[0])).rejects.toBeInstanceOf(WalletService.BalanceLimitError);
		expect(await balance(sender.id)).toEqual({ balance: 980, reservedBalance: 20 });
		expect(await db.getRepository(MiRedPacketClaim).count()).toBe(0);
	});

	test('blocks own claims, suspended users and blocking in either direction', async () => {
		const packet = await service.create(draft(), sender);
		await expect(service.claim(packet.id, sender)).rejects.toBeInstanceOf(RedPacketService.CannotClaimOwnError);
		for (const [blockerId, blockeeId] of [[sender.id, recipients[0].id], [recipients[0].id, sender.id]]) {
			await db.getRepository(MiBlocking).insert({ id: ids.gen(), blockerId, blockeeId });
			await expect(service.claim(packet.id, recipients[0])).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
			expect(await service.list(recipients[0], 10, undefined, 'received')).toEqual([]);
			await db.getRepository(MiBlocking).createQueryBuilder().delete().execute();
		}
		await db.getRepository(MiUser).update(recipients[0].id, { isSuspended: true });
		await expect(service.claim(packet.id, recipients[0])).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
	});

	test('account deletion settles only packets created by that account', async () => {
		const packet = await service.create(draft(), sender);
		await service.refundForAccountDeletion(recipients[0].id);
		expect(await service.show(packet.id, sender)).toMatchObject({ status: 'active' });
		await service.refundForAccountDeletion(sender.id);
		expect(await balance(sender.id)).toEqual({ balance: 1000, reservedBalance: 0 });
		expect(await service.show(packet.id, sender)).toMatchObject({ status: 'cancelled' });
	});

	test('migration round trip matches entities and claim history survives recipient deletion', async () => {
		const module = await import(pathToFileURL(resolve('migration/1790821133771-red-packets.js')).href);
		const migration = new module.RedPackets1790821133771();
		const runner = db.createQueryRunner();
		try {
			await migration.down(runner);
			await migration.up(runner);
			expect((await db.driver.createSchemaBuilder().log()).upQueries).toEqual([]);
			const packet = await service.create(draft(), sender);
			await service.claim(packet.id, recipients[0]);
			await db.getRepository(MiUser).delete(recipients[0].id);
			expect((await service.show(packet.id, sender)).claims[0]).toMatchObject({ coins: 5, user: null });
		} finally {
			await runner.release();
		}
	});
});
