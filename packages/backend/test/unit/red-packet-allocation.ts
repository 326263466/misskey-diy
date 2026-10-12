/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { RedPacketService } from '@/core/RedPacketService.js';
import { MiRedPacket } from '@/models/RedPacket.js';
import { isCoinAmount, toCoinUnits } from '@/misc/coins.js';

const service = Object.create(RedPacketService.prototype) as RedPacketService;

describe('cent-based double-mean allocation', () => {
	test.each([{ total: 1, count: 1 }, { total: 1, count: 100 }, { total: 1.01, count: 100 }, { total: 1.23, count: 20 }, { total: 999.99, count: 100 }, { total: 1000, count: 2 }, { total: 2000000000, count: 100 }])('preserves positive cent shares and total for $total / $count', ({ total, count }) => {
		for (let trial = 0; trial < 100; trial++) {
			const packet = Object.assign(new MiRedPacket(), { mode: 'random', remainingCoins: total, remainingCount: count });
			let sum = 0;
			while (packet.remainingCount > 0) {
				const coins = service['drawCoins'](packet);
				expect(isCoinAmount(coins) && coins >= 0.01).toBe(true);
				packet.remainingCoins = (toCoinUnits(packet.remainingCoins) - toCoinUnits(coins)) / 100;
				packet.remainingCount--;
				expect(toCoinUnits(packet.remainingCoins)).toBeGreaterThanOrEqual(packet.remainingCount);
				sum += toCoinUnits(coins);
			}
			expect(sum).toBe(toCoinUnits(total));
		}
	});

	test('rounding does not favor the first or last recipient at small denominations', () => {
		const totals = [0, 0, 0, 0, 0];
		const trials = 50000;
		for (let trial = 0; trial < trials; trial++) {
			const packet = Object.assign(new MiRedPacket(), { mode: 'random', remainingCoins: 0.07, remainingCount: 5 });
			for (let index = 0; index < totals.length; index++) {
				const coins = service['drawCoins'](packet);
				totals[index] += toCoinUnits(coins);
				packet.remainingCoins = (toCoinUnits(packet.remainingCoins) - toCoinUnits(coins)) / 100;
				packet.remainingCount--;
			}
		}
		for (const total of totals) expect(Math.abs(total / trials - 1.4)).toBeLessThan(0.04);
	});
});
