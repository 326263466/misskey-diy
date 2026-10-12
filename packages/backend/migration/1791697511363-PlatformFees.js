/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class PlatformFees1791697511363 {
	name = 'PlatformFees1791697511363';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "payment_settings" (
			"id" character varying(32) NOT NULL,
			"feeRateBps" integer NOT NULL DEFAULT 1500,
			CONSTRAINT "PK_payment_settings" PRIMARY KEY ("id"),
			CONSTRAINT "CHK_payment_settings_fee_rate" CHECK ("feeRateBps" >= 0 AND "feeRateBps" <= 10000)
		)`);
		await queryRunner.query(`CREATE TABLE "platform_account" (
			"id" character varying(32) NOT NULL,
			"balanceUnits" bigint NOT NULL DEFAULT 0,
			CONSTRAINT "PK_platform_account" PRIMARY KEY ("id"),
			CONSTRAINT "CHK_platform_account_balance" CHECK ("balanceUnits" >= 0 AND "balanceUnits" <= 100000000000000)
		)`);
		await queryRunner.query(`CREATE TABLE "platform_transaction" (
			"id" uuid NOT NULL,
			"accountId" character varying(32) NOT NULL,
			"referenceId" character varying(64) NOT NULL,
			"amountUnits" bigint NOT NULL,
			"balanceUnits" bigint NOT NULL,
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			CONSTRAINT "PK_platform_transaction" PRIMARY KEY ("id"),
			CONSTRAINT "CHK_platform_transaction_amount" CHECK ("amountUnits" > 0 AND "amountUnits" <= 200000000000),
			CONSTRAINT "CHK_platform_transaction_balance" CHECK ("balanceUnits" >= 0 AND "balanceUnits" <= 100000000000000)
		)`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_platform_transaction_reference" ON "platform_transaction" ("accountId", "referenceId")`);
		await queryRunner.query(`CREATE INDEX "IDX_platform_transaction_created" ON "platform_transaction" ("accountId", "createdAt")`);
		await queryRunner.query(`ALTER TABLE "platform_transaction" ADD CONSTRAINT "FK_platform_transaction_account" FOREIGN KEY ("accountId") REFERENCES "platform_account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
		await queryRunner.query(`INSERT INTO "payment_settings" ("id", "feeRateBps") VALUES ('default', 1500)`);
		await queryRunner.query(`INSERT INTO "platform_account" ("id", "balanceUnits") VALUES ('platform', 0)`);
		await queryRunner.query(`ALTER TABLE "order" ADD "feeRateBps" integer, ADD "platformFee" numeric(12,2), ADD "sellerAmount" numeric(12,2)`);
		// 只有实际存在卖方入账凭证的记录能确定净额；其余历史订单保留未知结算信息。
		await queryRunner.query(`UPDATE "order" SET "feeRateBps" = 0, "platformFee" = 0, "sellerAmount" = "total" WHERE "sellerTransactionId" IS NOT NULL`);
		await queryRunner.query(`ALTER TABLE "order" ADD CONSTRAINT "CHK_order_settlement" CHECK (
			("redemptionCode" IS NULL OR "feeRateBps" IS NOT NULL) AND (
				("feeRateBps" IS NULL AND "platformFee" IS NULL AND "sellerAmount" IS NULL) OR
				("feeRateBps" IS NOT NULL AND "platformFee" IS NOT NULL AND "sellerAmount" IS NOT NULL AND "feeRateBps" >= 0 AND "feeRateBps" <= 10000 AND "platformFee" >= 0 AND "sellerAmount" >= 0 AND "platformFee" + "sellerAmount" = "total" AND "platformFee" = CEIL("total"::numeric * 100 * "feeRateBps" / 10000) / 100)
			)
		)`);
	}

	async down(queryRunner) {
		const [state] = await queryRunner.query(`SELECT
			EXISTS (SELECT 1 FROM "platform_transaction") OR
			EXISTS (SELECT 1 FROM "platform_account" WHERE "balanceUnits" <> 0) OR
			EXISTS (SELECT 1 FROM "order" WHERE "platformFee" > 0) AS "hasSettlements"`);
		if (state.hasSettlements) throw new Error('Cannot revert platform fees while recorded platform settlements exist.');
		await queryRunner.query(`ALTER TABLE "order" DROP CONSTRAINT "CHK_order_settlement"`);
		await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "feeRateBps", DROP COLUMN "platformFee", DROP COLUMN "sellerAmount"`);
		await queryRunner.query(`DROP TABLE "platform_transaction"`);
		await queryRunner.query(`DROP TABLE "platform_account"`);
		await queryRunner.query(`DROP TABLE "payment_settings"`);
	}
}
