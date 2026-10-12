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
import { MiChatMessage } from '@/models/ChatMessage.js';
import { MiRedPacket } from '@/models/RedPacket.js';
import { MiRedPacketClaim } from '@/models/RedPacketClaim.js';
import { MiWallet } from '@/models/Wallet.js';
import { MiWalletTransaction } from '@/models/WalletTransaction.js';
import { isCoinAmount, toCoinUnits } from '@/misc/coins.js';
import CreateEndpoint from '@/server/api/endpoints/red-packets/create.js';
import ClaimEndpoint from '@/server/api/endpoints/red-packets/claim.js';
import ListEndpoint from '@/server/api/endpoints/red-packets/list.js';
import CancelEndpoint from '@/server/api/endpoints/red-packets/cancel.js';

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
		return { kind: 'group', audience: 'public', mode: 'equal', totalCoins: 20, count: 4, message: '  Good luck  ', expiresInHours: 24, requestId: randomUUID(), ...overrides };
	}

	test('cover images are owned raster files and remain part of an idempotent request', async () => {
		const file = { id: ids.gen(), userId: sender.id, name: 'cover.png', md5: '0'.repeat(32), type: 'image/png', size: 100, storedInternal: false, url: 'https://example.test/cover.png' };
		await db.getRepository(MiDriveFile).insert(file);
		const request = draft({ coverFileId: file.id });
		const result = await service.create(request, sender);
		expect(result).toMatchObject({ coverFileId: file.id, coverUrl: file.url });
		expect(await service.create(request, sender)).toMatchObject({ ...result, serverTime: expect.any(String) });
		await expect(service.create({ ...request, coverFileId: null }, sender)).rejects.toBeInstanceOf(RedPacketService.RequestIdConflictError);
		await db.getRepository(MiDriveFile).update(file.id, { userId: recipients[0].id });
		await expect(service.create(draft({ coverFileId: file.id }), sender)).rejects.toBeInstanceOf(RedPacketService.InvalidDraftError);
		await db.getRepository(MiDriveFile).update(file.id, { userId: sender.id, type: 'text/html' });
		await expect(service.create(draft({ coverFileId: file.id }), sender)).rejects.toBeInstanceOf(RedPacketService.InvalidDraftError);
	});

	test('new passwords allow 18 Unicode characters while historical requests remain idempotent', async () => {
		const request = draft({ kind: 'direct', audience: 'recipients', recipientIds: [recipients[0].id], mode: 'random', count: 1, password: '🎁'.repeat(18) });
		const packet = await service.create(request, sender);
		const afterSend = await balance(sender.id);
		await expect(service.create({ ...request, requestId: randomUUID(), password: '🎁'.repeat(19) }, sender)).rejects.toBeInstanceOf(RedPacketService.InvalidDraftError);
		expect(await balance(sender.id)).toEqual(afterSend);
		const oldPassword = '福'.repeat(32);
		await db.getRepository(MiRedPacket).update(packet.id, { password: oldPassword });
		expect(await service.create({ ...request, password: oldPassword }, sender)).toMatchObject({ id: packet.id, password: oldPassword });
		expect(await balance(sender.id)).toEqual(afterSend);
		expect(await service.claim(packet.id, recipients[0], oldPassword)).toMatchObject({ password: oldPassword, claimedCoins: expect.any(Number) });
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
		for (const value of [{ count: 0 }, { count: 101 }, { totalCoins: 20.01 }, { totalCoins: 0.99 }, { totalCoins: 1000.01 }, { totalCoins: 1.001 }, { expiresInHours: 12 }, { message: '\u{1f9e7}'.repeat(19) }, { requestId: 'invalid' }, { kind: 'direct' }, { recipientIds: [recipients[0].id] }, { audience: 'recipients' }]) {
			await expect(service.create(draft(value as Partial<RedPacketDraft>), sender)).rejects.toBeInstanceOf(RedPacketService.InvalidDraftError);
		}
		await expect(new CreateEndpoint(service).exec({ ...draft(), kind: 'tip' }, sender as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(await balance(sender.id)).toEqual({ balance: 1000, reservedBalance: 0 });
	});

	test('口令红包校验受众与随机分配，重试变更口令不会再次扣款', async () => {
		for (const overrides of [
			{ password: '' }, { password: '   ' }, { password: '口令\n下一行' }, { password: '口'.repeat(33) },
			{ audience: 'public' }, { mode: 'equal' }, { recipientIds: recipients.slice(0, 2).map(user => user.id) },
		]) {
			await expect(service.create(draft({ kind: 'direct', audience: 'recipients', recipientIds: [recipients[0].id], mode: 'random', count: 1, password: '芝麻开门', ...overrides } as Partial<RedPacketDraft>), sender)).rejects.toBeInstanceOf(RedPacketService.InvalidDraftError);
		}
		const input = draft({ kind: 'direct', audience: 'recipients', recipientIds: [recipients[0].id], mode: 'random', count: 1, password: ' 芝麻开门 ' });
		const packet = await service.create(input, sender);
		expect(packet).toMatchObject({ password: '芝麻开门', mode: 'random' });
		expect(await service.create({ ...input, password: '芝麻开门' }, sender)).toMatchObject({ id: packet.id });
		await expect(service.create({ ...input, password: '另一条口令' }, sender)).rejects.toBeInstanceOf(RedPacketService.RequestIdConflictError);
		expect(await balance(sender.id)).toEqual({ balance: 980, reservedBalance: 20 });
		expect(await service.show(packet.id, recipients[0])).toMatchObject({ password: '芝麻开门', claimedCoins: null });
	});

	test('口令接口直接领取无需聊天，缺少或错误口令不入账且仍核对指定收件人', async () => {
		const packet = await service.create(draft({ kind: 'direct', audience: 'recipients', recipientIds: [recipients[0].id], mode: 'random', count: 1, password: '芝麻开门' }), sender);
		const endpoint = new ClaimEndpoint(service);
		for (const input of [{ redPacketId: packet.id }, { redPacketId: packet.id, password: '错误口令' }]) {
			await expect(endpoint.exec(input, recipients[0] as never, null)).rejects.toMatchObject({ code: 'RED_PACKET_PASSWORD_REQUIRED' });
		}
		for (const password of ['', '口'.repeat(33), null]) {
			await expect(endpoint.exec({ redPacketId: packet.id, password }, recipients[0] as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
		for (const actor of [sender, recipients[1]]) {
			await expect(endpoint.exec({ redPacketId: packet.id, password: '芝麻开门' }, actor as never, null)).rejects.toMatchObject({ code: 'RED_PACKET_ACCESS_DENIED' });
		}
		expect(await balance(sender.id)).toEqual({ balance: 980, reservedBalance: 20 });
		expect(await balance(recipients[0].id)).toEqual({ balance: 0, reservedBalance: 0 });
		expect(await db.getRepository(MiChatMessage).countBy({ redPacketId: packet.id })).toBe(0);
		const results = await Promise.all(Array.from({ length: 8 }, () => endpoint.exec({ redPacketId: packet.id, password: ' 芝麻开门 ' }, recipients[0] as never, null)));
		expect(results.every(result => result.claimedCoins === 20 && result.status === 'exhausted')).toBe(true);
		expect(await balance(sender.id)).toEqual({ balance: 980, reservedBalance: 0 });
		expect(await balance(recipients[0].id)).toEqual({ balance: 20, reservedBalance: 0 });
		expect(await db.getRepository(MiRedPacketClaim).countBy({ redPacketId: packet.id })).toBe(1);
		expect(await db.getRepository(MiWalletTransaction).countBy({ relatedId: packet.id, type: 'redPacketClaim' })).toBe(1);
	});

	test('新祝福语最多18个Unicode字符，历史长文仍可读取', async () => {
		const endpoint = new CreateEndpoint(service);
		for (const character of ['祝', '\u{1f9e7}']) {
			const message = character.repeat(18);
			expect(await endpoint.exec(draft({ message }), sender as never, null)).toMatchObject({ message });
			await expect(endpoint.exec(draft({ message: character.repeat(19) }), sender as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
			await expect(service.create(draft({ message: character.repeat(19) }), sender)).rejects.toBeInstanceOf(RedPacketService.InvalidDraftError);
		}
		expect(await balance(sender.id)).toEqual({ balance: 960, reservedBalance: 40 });
		expect(await db.getRepository(MiWalletTransaction).countBy({ type: 'redPacketSend' })).toBe(2);
		const packet = (await service.list(sender, 1))[0];
		const legacyMessage = '祝'.repeat(100);
		await db.getRepository(MiRedPacket).update(packet.id, { message: legacyMessage });
		expect(await service.show(packet.id, sender)).toMatchObject({ message: legacyMessage });
	});

	test('普通红包立即生效且固定 24 小时，定向红包保留自己领取', async () => {
		const before = Date.now();
		const packet = await service.create(draft({ kind: 'direct', audience: 'recipients', recipientIds: [recipients[0].id], count: 1 }), sender);
		expect(packet.status).toBe('active');
		expect(Date.parse(packet.expiresAt)).toBeGreaterThanOrEqual(before + 86_400_000);
		expect(Date.parse(packet.expiresAt)).toBeLessThanOrEqual(Date.now() + 86_400_000);
		expect(await service.claim(packet.id, sender)).toMatchObject({ claimedCoins: 20, status: 'exhausted' });
		expect(await balance(sender.id)).toEqual({ balance: 1000, reservedBalance: 0 });
	});

	test('新建预约在扣款前被拒绝，包括移除参数后的旧客户端请求', async () => {
		const endpoint = new CreateEndpoint(service);
		for (const expiresInHours of [2, 24]) {
			const request = draft({ startsAt: new Date(Date.now() + 3_600_000).toISOString(), expiresInHours });
			await expect(service.create(request, sender)).rejects.toBeInstanceOf(RedPacketService.InvalidDraftError);
			await expect(endpoint.exec(request, sender as never, null)).rejects.toMatchObject({ code: 'INVALID_RED_PACKET' });
		}
		for (const startsAt of [42, ['2099-01-01T00:00:00Z'], { toString: null, valueOf: null }]) {
			await expect(endpoint.exec({ ...draft(), startsAt }, sender as never, null)).rejects.toMatchObject({ code: 'INVALID_RED_PACKET' });
		}
		expect(await balance(sender.id)).toEqual({ balance: 1000, reservedBalance: 0 });
		expect(await db.getRepository(MiRedPacket).count()).toBe(0);
		expect(await db.getRepository(MiWalletTransaction).count()).toBe(0);
	});

	test('历史预约可幂等恢复，开始前不能领，开始时可领，到期退款', async () => {
		const startsAt = new Date(Date.now() + 3_600_000).toISOString();
		const original = draft();
		const created = await service.create(original, sender);
		await db.getRepository(MiRedPacket).update(created.id, { startsAt: new Date(startsAt), expiresInHours: 2, expiresAt: new Date(Date.parse(startsAt) + 7_200_000) });
		const request = { ...original, startsAt, expiresInHours: 2 };
		const packet = await new CreateEndpoint(service).exec(request, sender as never, null);
		expect(packet).toMatchObject({ status: 'scheduled', startsAt });
		expect(Date.parse(packet.expiresAt) - Date.parse(startsAt)).toBe(7_200_000);
		expect(await balance(sender.id)).toEqual({ balance: 980, reservedBalance: 20 });
		await expect(service.claim(packet.id, recipients[0])).rejects.toBeInstanceOf(RedPacketService.NotStartedError);
		await expect(service.claim(packet.id, sender)).rejects.toBeInstanceOf(RedPacketService.NotStartedError);
		const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(startsAt));
		try {
			expect(await service.create(request, sender)).toMatchObject({ id: packet.id });
			expect(await db.getRepository(MiWalletTransaction).countBy({ type: 'redPacketSend' })).toBe(1);
			await expect(service.create({ ...request, expiresInHours: 3 }, sender)).rejects.toBeInstanceOf(RedPacketService.RequestIdConflictError);
			expect(await service.claim(packet.id, recipients[0])).toMatchObject({ claimedCoins: 5, status: 'active' });
			now.mockReturnValue(Date.parse(packet.expiresAt));
			await expect(service.claim(packet.id, recipients[1])).rejects.toBeInstanceOf(RedPacketService.ExpiredError);
			expect(await service.cancel(packet.id, sender)).toMatchObject({ status: 'expired' });
			expect(await service.claim(packet.id, recipients[0])).toMatchObject({ claimedCoins: 5, status: 'expired' });
			expect(await balance(sender.id)).toEqual({ balance: 995, reservedBalance: 0 });
			expect(await db.getRepository(MiWalletTransaction).countBy({ type: 'redPacketRefund' })).toBe(1);
		} finally { now.mockRestore(); }
	});

	test('issues independently with default cover and greeting; retries debit once', async () => {
		const input = { kind: 'group', audience: 'public', mode: 'equal', totalCoins: 20, count: 4, expiresInHours: 24, requestId: randomUUID() };
		const result = await new CreateEndpoint(service).exec(input, sender as never, null);
		expect(result).toMatchObject({ senderId: sender.id, message: '', coverId: 'classic', status: 'active' });
		expect(await db.getRepository(MiNote).count()).toBe(0);
		const custom = draft({ message: ' Happy birthday \u{1f9e7} ', coverId: 'sunset' });
		const retries = await Promise.all(Array.from({ length: 8 }, () => service.create(custom, sender)));
		expect(new Set(retries.map(packet => packet.id)).size).toBe(1);
		expect(retries[0]).toMatchObject({ message: 'Happy birthday \u{1f9e7}', coverId: 'sunset' });
		await expect(service.create({ ...custom, coverId: 'lucky' }, sender)).rejects.toBeInstanceOf(RedPacketService.RequestIdConflictError);
		expect(await db.getRepository(MiWalletTransaction).countBy({ type: 'redPacketSend' })).toBe(2);
		expect(await balance(sender.id)).toEqual({ balance: 960, reservedBalance: 40 });
	});

	test.each(['equal', 'random'] as const)('accepts a 1000 coin %s packet and settles it exactly', async mode => {
		const packet = await new CreateEndpoint(service).exec(draft({ mode, totalCoins: 1000, count: 2 }), sender as never, null);
		expect(await balance(sender.id)).toEqual({ balance: 0, reservedBalance: 1000 });
		const received = await service.claim(packet.id, recipients[0]);
		await service.cancel(packet.id, sender);
		expect(await balance(sender.id)).toEqual({ balance: (100000 - toCoinUnits(received.claimedCoins!)) / 100, reservedBalance: 0 });
		expect(await balance(recipients[0].id)).toEqual({ balance: received.claimedCoins, reservedBalance: 0 });
		await expect(service.claim(packet.id, recipients[1])).rejects.toBeInstanceOf(RedPacketService.CancelledError);
	});

	test('API rejects totals outside 1 to 1000 and fractions smaller than a cent before debiting', async () => {
		for (const totalCoins of [0.99, 1000.01, 2 ** 31]) {
			await expect(new CreateEndpoint(service).exec(draft({ totalCoins, count: 1 }), sender as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		}
		await expect(new CreateEndpoint(service).exec(draft({ totalCoins: 1.001, count: 1 }), sender as never, null)).rejects.toMatchObject({ code: 'INVALID_RED_PACKET' });
		expect(await db.getRepository(MiRedPacket).count()).toBe(0);
		expect(await balance(sender.id)).toEqual({ balance: 1000, reservedBalance: 0 });
	});

	test('fractional fixed shares support self-claim, retries and refund without losing cents', async () => {
		const packet = await new CreateEndpoint(service).exec(draft({ totalCoins: 1.16, count: 4 }), sender as never, null);
		const ownClaims = await Promise.all(Array.from({ length: 8 }, () => service.claim(packet.id, sender)));
		expect(ownClaims.every(result => result.claimedCoins === 0.29)).toBe(true);
		expect(await service.claim(packet.id, recipients[0])).toMatchObject({ claimedCoins: 0.29, remainingCoins: 0.58 });
		await Promise.all([service.cancel(packet.id, sender), service.cancel(packet.id, sender)]);
		expect(await balance(sender.id)).toEqual({ balance: 999.71, reservedBalance: 0 });
		expect(await balance(recipients[0].id)).toEqual({ balance: 0.29, reservedBalance: 0 });
		expect(await db.getRepository(MiWalletTransaction).findBy({ type: 'redPacketRefund' })).toMatchObject([{ amount: 0.58 }]);
	});

	test('one coin can fund 100 shares of one cent and expiration refunds the exact remainder', async () => {
		const packet = await service.create(draft({ totalCoins: 1, count: 100, mode: 'random' }), sender);
		expect(await service.claim(packet.id, recipients[0])).toMatchObject({ claimedCoins: 0.01, remainingCoins: 0.99 });
		await db.getRepository(MiRedPacket).update(packet.id, { expiresAt: new Date(0) });
		await service.sweepExpired();
		expect(await balance(sender.id)).toEqual({ balance: 999.99, reservedBalance: 0 });
		expect(await balance(recipients[0].id)).toEqual({ balance: 0.01, reservedBalance: 0 });
	});

	test('direct packets transfer decimal amounts without rounding', async () => {
		const packet = await service.create(draft({ kind: 'direct', audience: 'recipients', recipientIds: [recipients[0].id], totalCoins: 1.01, count: 1 }), sender);
		expect(await service.claim(packet.id, recipients[0])).toMatchObject({ claimedCoins: 1.01, status: 'exhausted', remainingCoins: 0 });
		expect(await balance(sender.id)).toEqual({ balance: 998.99, reservedBalance: 0 });
		expect(await balance(recipients[0].id)).toEqual({ balance: 1.01, reservedBalance: 0 });
	});

	test('fixed recipients discover an unattached packet while strangers cannot claim', async () => {
		const packet = await service.create(draft({ kind: 'direct', audience: 'recipients', recipientIds: [recipients[0].id], count: 1 }), sender);
		await service.assertCanReference(packet.id, sender.id);
		await expect(service.assertCanReference(packet.id, recipients[0].id)).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
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

	test('random allocation preserves the exact cent total', async () => {
		const packet = await service.create(draft({ mode: 'random', totalCoins: 1.23, count: 20 }), sender);
		await Promise.all(recipients.slice(0, 20).map(user => service.claim(packet.id, user)));
		const claims = await db.getRepository(MiRedPacketClaim).find();
		expect(claims.every(claim => isCoinAmount(claim.coins) && claim.coins >= 0.01)).toBe(true);
		expect(claims.reduce((sum, claim) => sum + toCoinUnits(claim.coins), 0)).toBe(123);
		expect(await balance(sender.id)).toEqual({ balance: 998.77, reservedBalance: 0 });
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

	test('full recipient wallets roll back claims', async () => {
		await db.getRepository(MiWallet).insert({ userId: recipients[0].id, balance: WALLET_MAX_BALANCE, reservedBalance: 0 });
		const packet = await service.create(draft(), sender);
		await expect(service.claim(packet.id, recipients[0])).rejects.toBeInstanceOf(WalletService.BalanceLimitError);
		expect(await balance(sender.id)).toEqual({ balance: 980, reservedBalance: 20 });
		expect(await db.getRepository(MiRedPacketClaim).count()).toBe(0);
	});

	test('blocks suspended users and blocking in either direction', async () => {
		const packet = await service.create(draft(), sender);
		for (const [blockerId, blockeeId] of [[sender.id, recipients[0].id], [recipients[0].id, sender.id]]) {
			await db.getRepository(MiBlocking).insert({ id: ids.gen(), blockerId, blockeeId });
			await expect(service.claim(packet.id, recipients[0])).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
			expect(await service.list(recipients[0], 10, undefined, 'received')).toEqual([]);
			await db.getRepository(MiBlocking).createQueryBuilder().delete().execute();
		}
		await db.getRepository(MiUser).update(recipients[0].id, { isSuspended: true });
		await expect(service.claim(packet.id, recipients[0])).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
	});

	test.each(['public', 'recipients'] as const)('sender can claim once from a %s packet without creating coins', async audience => {
		const packet = await service.create(draft({ audience, ...(audience === 'recipients' ? { kind: 'direct', count: 1, recipientIds: [recipients[0].id] } : {}) }), sender);
		expect((await service.list(sender, 10, undefined, 'claimable')).map(row => row.id)).toContain(packet.id);
		const results = await Promise.all(Array.from({ length: 8 }, () => service.claim(packet.id, sender)));
		const coins = audience === 'public' ? 5 : 20;
		expect(results.every(result => result.claimedCoins === coins)).toBe(true);
		expect(await balance(sender.id)).toEqual({ balance: 980 + coins, reservedBalance: 20 - coins });
		expect(await db.getRepository(MiRedPacketClaim).countBy({ redPacketId: packet.id })).toBe(1);
		expect((await service.list(sender, 10, undefined, 'claimable')).map(row => row.id)).not.toContain(packet.id);
		expect((await service.list(sender, 10, undefined, 'received')).map(row => row.id)).toContain(packet.id);
	});

	test('cancellation refunds only the remainder once and preserves claims and request deduplication', async () => {
		const input = draft();
		const packet = await service.create(input, sender);
		await service.claim(packet.id, recipients[0]);
		const endpoint = new CancelEndpoint(service);
		await expect(endpoint.exec({ redPacketId: packet.id }, recipients[0] as never, null)).rejects.toMatchObject({ code: 'RED_PACKET_ACCESS_DENIED' });
		await Promise.all(Array.from({ length: 8 }, () => endpoint.exec({ redPacketId: packet.id }, sender as never, null)));
		expect(await balance(sender.id)).toEqual({ balance: 995, reservedBalance: 0 });
		expect(await balance(recipients[0].id)).toEqual({ balance: 5, reservedBalance: 0 });
		expect(await service.show(packet.id, sender)).toMatchObject({ status: 'cancelled', remainingCoins: 0, claims: [{ coins: 5 }] });
		await expect(service.claim(packet.id, recipients[1])).rejects.toBeInstanceOf(RedPacketService.CancelledError);
		await expect(service.assertCanReference(packet.id, sender.id)).rejects.toBeInstanceOf(RedPacketService.CancelledError);
		expect(await service.create(input, sender)).toMatchObject({ id: packet.id, status: 'cancelled' });
		expect(await db.getRepository(MiWalletTransaction).countBy({ type: 'redPacketRefund' })).toBe(1);
	});

	test('concurrent cancellation, claims and expiration settle the exact original total', async () => {
		const packet = await service.create(draft({ mode: 'random', totalCoins: 123, count: 20 }), sender);
		await service.claim(packet.id, recipients[0]);
		await Promise.allSettled([
			...recipients.slice(1, 15).map(user => service.claim(packet.id, user)),
			service.claim(packet.id, sender), service.cancel(packet.id, sender), service.cancel(packet.id, sender), service.sweepExpired(),
		]);
		const claims = await db.getRepository(MiRedPacketClaim).findBy({ redPacketId: packet.id });
		const refunds = await db.getRepository(MiWalletTransaction).findBy({ type: 'redPacketRefund', relatedId: packet.id });
		expect(refunds).toHaveLength(1);
		expect(claims.reduce((sum, claim) => sum + toCoinUnits(claim.coins), toCoinUnits(refunds[0].amount))).toBe(12300);
		expect((await balance(sender.id)).reservedBalance).toBe(0);
		expect(await service.show(packet.id, sender)).toMatchObject({ status: 'cancelled', remainingCoins: 0 });
	});

	test('failed host deletion rolls back the refund and cancellation together', async () => {
		const packet = await service.create(draft(), sender);
		await expect(db.transaction(async em => {
			await service.cancelInTransaction(em, [packet.id]);
			throw new Error('Host deletion failed');
		})).rejects.toThrow('Host deletion failed');
		expect(await service.show(packet.id, sender)).toMatchObject({ status: 'active', remainingCoins: 20 });
		expect(await balance(sender.id)).toEqual({ balance: 980, reservedBalance: 20 });
		expect(await db.getRepository(MiWalletTransaction).countBy({ type: 'redPacketRefund' })).toBe(0);
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
		const cover = await import(pathToFileURL(resolve('migration/1790848574121-red-packet-cover.js')).href);
		const room = await import(pathToFileURL(resolve('migration/1790909745748-RedPacketRoomAudience.js')).href);
		const amount = await import(pathToFileURL(resolve('migration/1790947761601-RemoveRedPacketAmountLimit.js')).href);
		const amountMigration = new amount.RemoveRedPacketAmountLimit1790947761601();
		const decimal = await import(pathToFileURL(resolve('migration/1790948183102-DecimalWalletCoins.js')).href);
		const decimalMigration = new decimal.DecimalWalletCoins1790948183102();
		const runner = db.createQueryRunner();
		try {
			await decimalMigration.down(runner);
			await amountMigration.down(runner);
			await amountMigration.up(runner);
			await migration.down(runner);
			await migration.up(runner);
			await new cover.RedPacketCover1790848574121().up(runner);
			await new room.RedPacketRoomAudience1790909745748().up(runner);
			await amountMigration.up(runner);
			await decimalMigration.up(runner);
			const start = await import(pathToFileURL(resolve('migration/1791004249931-RedPacketStartTime.js')).href);
			await new start.RedPacketStartTime1791004249931().up(runner);
			const password = await import(pathToFileURL(resolve('migration/1791138656847-RedPacketPassword.js')).href);
			const passwordMigration = new password.RedPacketPassword1791138656847();
			await passwordMigration.up(runner);
			await passwordMigration.down(runner);
			await passwordMigration.up(runner);
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
