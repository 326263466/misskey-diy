/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class Wallet1790821089956 {
	name = 'Wallet1790821089956';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "wallet" ("userId" character varying(32) NOT NULL, "balance" integer NOT NULL DEFAULT 0, "reservedBalance" integer NOT NULL DEFAULT 0, CONSTRAINT "PK_wallet" PRIMARY KEY ("userId"), CONSTRAINT "CHK_wallet_balance" CHECK ("balance" >= 0 AND "reservedBalance" >= 0 AND "balance"::bigint + "reservedBalance"::bigint <= 2000000000), CONSTRAINT "FK_wallet_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
		await queryRunner.query(`CREATE TABLE "wallet_transaction" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "type" character varying(32) NOT NULL, "amount" integer NOT NULL, "balance" integer NOT NULL, "description" character varying(500), "relatedId" character varying(32), "requestId" uuid, "pointsSpent" integer, "actorId" character varying(32), CONSTRAINT "PK_wallet_transaction" PRIMARY KEY ("id"), CONSTRAINT "CHK_wallet_transaction_amount" CHECK ("amount" <> 0 AND "amount" >= -2000000000 AND "amount" <= 2000000000), CONSTRAINT "CHK_wallet_transaction_balance" CHECK ("balance" >= 0 AND "balance" <= 2000000000), CONSTRAINT "FK_wallet_transaction_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
		await queryRunner.query(`CREATE INDEX "IDX_wallet_transaction_user_id" ON "wallet_transaction" ("userId", "id")`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_wallet_transaction_user_request" ON "wallet_transaction" ("userId", "requestId")`);
		await queryRunner.query(`CREATE TABLE "wallet_settings" ("id" character varying(16) NOT NULL, "exchangeEnabled" boolean NOT NULL DEFAULT true, "exchangeRate" integer NOT NULL DEFAULT 1, CONSTRAINT "PK_wallet_settings" PRIMARY KEY ("id"), CONSTRAINT "CHK_wallet_settings_rate" CHECK ("exchangeRate" >= 1 AND "exchangeRate" <= 1000000))`);
	}

	async down(queryRunner) {
		await queryRunner.query('DROP TABLE "wallet_settings"');
		await queryRunner.query('DROP TABLE "wallet_transaction"');
		await queryRunner.query('DROP TABLE "wallet"');
	}
}
