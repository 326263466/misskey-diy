/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class WalletLedgerCurrencies1791294520689 {
	name = 'WalletLedgerCurrencies1791294520689';

	async up(queryRunner) {
		await queryRunner.query('DROP INDEX "IDX_wallet_transaction_user_request"');
		await queryRunner.query('ALTER TABLE "wallet_transaction" ADD "currency" character varying(8) NOT NULL DEFAULT \'coins\'');
		await queryRunner.query('ALTER TABLE "wallet_transaction" ADD "reservedAmount" numeric(12,2) NOT NULL DEFAULT 0');
		await queryRunner.query('ALTER TABLE "wallet_transaction" ADD "reservedBalance" numeric(12,2) NOT NULL DEFAULT 0');
		await queryRunner.query('ALTER TABLE "wallet_transaction" DROP CONSTRAINT "CHK_wallet_transaction_amount"');
		await queryRunner.query('ALTER TABLE "wallet_transaction" DROP CONSTRAINT "CHK_wallet_transaction_balance"');
		await queryRunner.query('ALTER TABLE "wallet_transaction" ADD CONSTRAINT "CHK_wallet_transaction_currency" CHECK ("currency" IN (\'coins\', \'points\'))');
		await queryRunner.query('ALTER TABLE "wallet_transaction" ADD CONSTRAINT "CHK_wallet_transaction_amount" CHECK (("amount" <> 0 OR "reservedAmount" <> 0) AND "amount" >= -2000000000 AND "amount" <= 2000000000 AND "reservedAmount" >= -2000000000 AND "reservedAmount" <= 2000000000 AND ("currency" = \'coins\' OR ("currency" = \'points\' AND "amount" = trunc("amount") AND "reservedAmount" = 0)))');
		await queryRunner.query('ALTER TABLE "wallet_transaction" ADD CONSTRAINT "CHK_wallet_transaction_balance" CHECK ("balance" >= 0 AND "balance" <= 2000000000 AND "reservedBalance" >= 0 AND "reservedBalance" <= 2000000000 AND ("currency" = \'points\' OR "balance" + "reservedBalance" <= 2000000000) AND ("currency" = \'coins\' OR ("balance" = trunc("balance") AND "reservedBalance" = 0)))');
		await queryRunner.query('CREATE UNIQUE INDEX "IDX_wallet_transaction_user_currency_request" ON "wallet_transaction" ("userId", "currency", "requestId")');
	}

	async down(queryRunner) {
		const rows = await queryRunner.query('SELECT 1 FROM "wallet_transaction" WHERE "currency" <> \'coins\' OR "reservedAmount" <> 0 OR "reservedBalance" <> 0 LIMIT 1');
		if (rows.length > 0) throw new Error('Cannot revert the wallet ledger while points or reservation entries exist.');
		await queryRunner.query('DROP INDEX "IDX_wallet_transaction_user_currency_request"');
		await queryRunner.query('ALTER TABLE "wallet_transaction" DROP CONSTRAINT "CHK_wallet_transaction_currency"');
		await queryRunner.query('ALTER TABLE "wallet_transaction" DROP CONSTRAINT "CHK_wallet_transaction_amount"');
		await queryRunner.query('ALTER TABLE "wallet_transaction" DROP CONSTRAINT "CHK_wallet_transaction_balance"');
		await queryRunner.query('ALTER TABLE "wallet_transaction" DROP COLUMN "currency"');
		await queryRunner.query('ALTER TABLE "wallet_transaction" DROP COLUMN "reservedAmount"');
		await queryRunner.query('ALTER TABLE "wallet_transaction" DROP COLUMN "reservedBalance"');
		await queryRunner.query('ALTER TABLE "wallet_transaction" ADD CONSTRAINT "CHK_wallet_transaction_amount" CHECK ("amount" <> 0 AND "amount" >= -2000000000 AND "amount" <= 2000000000)');
		await queryRunner.query('ALTER TABLE "wallet_transaction" ADD CONSTRAINT "CHK_wallet_transaction_balance" CHECK ("balance" >= 0 AND "balance" <= 2000000000)');
		await queryRunner.query('CREATE UNIQUE INDEX "IDX_wallet_transaction_user_request" ON "wallet_transaction" ("userId", "requestId")');
	}
}
