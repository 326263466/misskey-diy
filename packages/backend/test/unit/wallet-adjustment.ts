/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { WalletService } from '@/core/WalletService.js';
import AdjustEndpoint from '@/server/api/endpoints/admin/wallet/adjust.js';

test.each([undefined, '', ' \n ', 'Grant', '🎁'.repeat(500)])('the adjustment endpoint accepts an optional reason (%#)', async reason => {
	const adjust = vi.fn().mockResolvedValue({ balance: 10, adjusted: true });
	const endpoint = new AdjustEndpoint({ adjust } as never);
	const requestId = randomUUID();
	const request = { userId: 'recipient', amount: 10, requestId, ...(reason === undefined ? {} : { reason }) };
	expect(await endpoint.exec(request, { id: 'admin' } as never, null)).toEqual({ balance: 10, adjusted: true });
	expect(adjust).toHaveBeenCalledWith('recipient', 10, reason ?? '', requestId, 'admin');
});

test.each([null, 1, 'a'.repeat(501), '🎁'.repeat(501)])('the adjustment endpoint still rejects invalid reasons (%#)', async reason => {
	const adjust = vi.fn();
	const endpoint = new AdjustEndpoint({ adjust } as never);
	await expect(endpoint.exec({ userId: 'recipient', amount: 10, reason, requestId: randomUUID() }, { id: 'admin' } as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
	expect(adjust).not.toHaveBeenCalled();
});

test.each(['', ' \n ', '  Grant  '])('optional reasons are normalized before writing an attributed ledger entry (%#)', async reason => {
	const manager = { findOneBy: vi.fn().mockResolvedValue(null) };
	const service = new WalletService({ transaction: async (callback: (transactionManager: typeof manager) => Promise<unknown>) => callback(manager) } as never, {} as never);
	vi.spyOn(service, 'lockWalletsInTransaction').mockResolvedValue(undefined);
	const change = vi.spyOn(service, 'changeBalanceInTransaction').mockResolvedValue(10);
	const requestId = randomUUID();
	expect(await service.adjust('recipient', 10, reason, requestId, 'admin')).toEqual({ balance: 10, adjusted: true });
	expect(change).toHaveBeenCalledWith(manager, 'recipient', 10, {
		type: 'adminAdjustment', description: reason.trim() || undefined, requestId, actorId: 'admin',
	});
});

test('invalid amounts and overlong reasons are rejected before a transaction starts', async () => {
	const transaction = vi.fn();
	const service = new WalletService({ transaction } as never, {} as never);
	for (const amount of [0, 1.5, 2000000001, -2000000001]) {
		await expect(service.adjust('recipient', amount, '', randomUUID(), 'admin')).rejects.toBeInstanceOf(WalletService.InvalidAmountError);
	}
	await expect(service.adjust('recipient', 1, '🎁'.repeat(501), randomUUID(), 'admin')).rejects.toBeInstanceOf(WalletService.InvalidAmountError);
	expect(transaction).not.toHaveBeenCalled();
});
