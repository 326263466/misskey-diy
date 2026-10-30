/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class PersistRandomBusinessNumbers1791866973641 {
	name = 'PersistRandomBusinessNumbers1791866973641';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "number" character varying(33)`);
		// 历史订单保留原显示号，只回填一次；新订单由业务事务生成并保存。
		await queryRunner.query(`UPDATE "order" SET "number" =
			CASE WHEN "receipt"->>'type' = 'physical' THEN 'SW' ELSE 'CDK' END ||
			to_char("createdAt" AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS') ||
			CASE WHEN length(to_hex("id"::bigint - 1000000000000000000)) < 6
				THEN lpad(to_hex("id"::bigint - 1000000000000000000), 6, '0')
				ELSE to_hex("id"::bigint - 1000000000000000000) END
			WHERE "number" IS NULL`);
		await queryRunner.query(`ALTER TABLE "order" ALTER COLUMN "number" SET NOT NULL`);
		await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_order_number" ON "order" ("number")`);
		// 保留历史流水号和序列本身，移除自动递增默认值；新写入必须显式给号。
		await queryRunner.query(`ALTER TABLE "wallet_transaction" ALTER COLUMN "number" DROP DEFAULT`);
	}

	async down(queryRunner) {
		// 回滚后默认序列需越过已写入的随机号，避免与既有凭证重复。
		await queryRunner.query(`SELECT setval('wallet_transaction_number_seq', GREATEST(
			(SELECT last_value FROM "wallet_transaction_number_seq"),
			COALESCE((SELECT MAX("number") FROM "wallet_transaction"), 1000000000000000000)
		), true)`);
		await queryRunner.query(`ALTER TABLE "wallet_transaction" ALTER COLUMN "number" SET DEFAULT nextval('wallet_transaction_number_seq'::regclass)`);
		await queryRunner.query(`DROP INDEX "IDX_order_number"`);
		await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "number"`);
	}
}
