/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class TipMessage1791267213599 {
	name = 'TipMessage1791267213599';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "tip" ADD "message" character varying(100)`);
		await queryRunner.query(`UPDATE "tip" SET "message" = NULLIF(BTRIM("transaction"."description"), '') FROM "wallet_transaction" AS "transaction" WHERE "transaction"."userId" = "tip"."senderId" AND "transaction"."requestId" = "tip"."requestId" AND "transaction"."type" = 'tipSend'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "tip" DROP COLUMN "message"`);
	}
}
