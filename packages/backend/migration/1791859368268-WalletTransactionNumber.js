/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class WalletTransactionNumber1791859368268 {
	name = 'WalletTransactionNumber1791859368268';

	async up(queryRunner) {
		await queryRunner.query(`CREATE SEQUENCE "wallet_transaction_number_seq" AS bigint START WITH 1000000000000000000 MINVALUE 1000000000000000000 MAXVALUE 9223372036854775807 NO CYCLE`);
		// volatile 默认值为历史流水逐条分配编号，新写入也使用同一序列。
		await queryRunner.query(`ALTER TABLE "wallet_transaction" ADD "number" bigint NOT NULL DEFAULT nextval('wallet_transaction_number_seq'::regclass)`);
		await queryRunner.query(`ALTER SEQUENCE "wallet_transaction_number_seq" OWNED BY "wallet_transaction"."number"`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_wallet_transaction_number" ON "wallet_transaction" ("number")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "IDX_wallet_transaction_number"`);
		// 删除列时 PostgreSQL 同时删除它拥有的序列。
		await queryRunner.query(`ALTER TABLE "wallet_transaction" DROP COLUMN "number"`);
	}
}
