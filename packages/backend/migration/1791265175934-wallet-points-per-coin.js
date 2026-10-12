/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class WalletPointsPerCoin1791265175934 {
	name = 'WalletPointsPerCoin1791265175934';

	async up(queryRunner) {
		await queryRunner.query('ALTER TABLE "wallet_settings" ADD "pointsPerCoin" integer');
		await queryRunner.query('ALTER TABLE "wallet_settings" ADD CONSTRAINT "CHK_wallet_settings_points_per_coin" CHECK ("pointsPerCoin" IS NULL OR ("pointsPerCoin" >= 1 AND "pointsPerCoin" <= 1000000))');
	}

	async down(queryRunner) {
		// 旧版本无法表达除法汇率，回滚时暂停这些兑换，避免按旧乘法额外发币。
		await queryRunner.query('UPDATE "wallet_settings" SET "exchangeEnabled" = false WHERE "pointsPerCoin" > 1');
		await queryRunner.query('ALTER TABLE "wallet_settings" DROP CONSTRAINT "CHK_wallet_settings_points_per_coin"');
		await queryRunner.query('ALTER TABLE "wallet_settings" DROP COLUMN "pointsPerCoin"');
	}
}
