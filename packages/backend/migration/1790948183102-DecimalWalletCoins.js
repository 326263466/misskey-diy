/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const columns = [
	['wallet', 'balance'], ['wallet', 'reservedBalance'],
	['wallet_transaction', 'amount'], ['wallet_transaction', 'balance'],
	['red_packet', 'totalCoins'], ['red_packet', 'remainingCoins'],
	['red_packet_claim', 'coins'],
];

export class DecimalWalletCoins1790948183102 {
	name = 'DecimalWalletCoins1790948183102';

	async up(queryRunner) {
		await queryRunner.query('ALTER TABLE "wallet" DROP CONSTRAINT "CHK_wallet_balance"');
		await queryRunner.query('ALTER TABLE "red_packet" DROP CONSTRAINT "CHK_red_packet_amounts"');
		for (const [table, column] of columns) {
			await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE numeric(12,2) USING "${column}"::numeric(12,2)`);
		}
		await queryRunner.query('ALTER TABLE "wallet" ADD CONSTRAINT "CHK_wallet_balance" CHECK ("balance" >= 0 AND "reservedBalance" >= 0 AND "balance" + "reservedBalance" <= 2000000000)');
		// 新发红包的 1000 上限由接口和服务校验，历史大额红包仍可领取、退款。
		await queryRunner.query('ALTER TABLE "red_packet" ADD CONSTRAINT "CHK_red_packet_amounts" CHECK ("totalCoins" >= 1 AND "totalCoins" >= count * 0.01 AND count >= 1 AND count <= 100 AND "remainingCoins" >= 0 AND "remainingCoins" <= "totalCoins" AND "remainingCount" >= 0 AND "remainingCount" <= count)');
	}

	async down(queryRunner) {
		// 已有小数流水时拒绝降级，避免强制转整数造成资金丢失。
		for (const [table, column] of columns) {
			const rows = await queryRunner.query(`SELECT 1 FROM "${table}" WHERE "${column}" <> trunc("${column}") LIMIT 1`);
			if (rows.length) throw new Error('Cannot revert decimal coins while fractional balances or records exist.');
		}
		const smallPackets = await queryRunner.query('SELECT 1 FROM "red_packet" WHERE "totalCoins" < count LIMIT 1');
		if (smallPackets.length) throw new Error('Cannot revert decimal coins while packets contain shares below one coin.');
		await queryRunner.query('ALTER TABLE "wallet" DROP CONSTRAINT "CHK_wallet_balance"');
		await queryRunner.query('ALTER TABLE "red_packet" DROP CONSTRAINT "CHK_red_packet_amounts"');
		for (const [table, column] of columns) {
			await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE integer USING "${column}"::integer`);
		}
		await queryRunner.query('ALTER TABLE "wallet" ADD CONSTRAINT "CHK_wallet_balance" CHECK ("balance" >= 0 AND "reservedBalance" >= 0 AND "balance"::bigint + "reservedBalance"::bigint <= 2000000000)');
		await queryRunner.query('ALTER TABLE "red_packet" ADD CONSTRAINT "CHK_red_packet_amounts" CHECK ("totalCoins" >= count AND count >= 1 AND count <= 100 AND "remainingCoins" >= 0 AND "remainingCoins" <= "totalCoins" AND "remainingCount" >= 0 AND "remainingCount" <= count)');
	}
}
