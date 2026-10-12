/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class Transfers1791004285849 {
	name = 'Transfers1791004285849';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "transfer" ("id" character varying(32) NOT NULL, "senderId" character varying(32) NOT NULL, "recipientId" character varying(32) NOT NULL, "requestId" uuid NOT NULL, "amount" numeric(12,2) NOT NULL, "message" character varying(200), "status" character varying(16) NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "completedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_transfer" PRIMARY KEY ("id"), CONSTRAINT "CHK_transfer_amount" CHECK ("amount" >= 0.01 AND "amount" <= 2000000000))`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_transfer_request" ON "transfer" ("senderId", "requestId")`);
		await queryRunner.query(`CREATE INDEX "IDX_transfer_sender" ON "transfer" ("senderId", "id")`);
		await queryRunner.query(`CREATE INDEX "IDX_transfer_recipient" ON "transfer" ("recipientId", "id")`);
		await queryRunner.query(`CREATE INDEX "IDX_transfer_expiration" ON "transfer" ("status", "expiresAt")`);
		await queryRunner.query(`ALTER TABLE "transfer" ADD CONSTRAINT "FK_transfer_sender" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		// 撤回模块前先解冻待收款项，不能留下无法核销的冻结余额。
		await queryRunner.query(`UPDATE "wallet" AS w SET "balance" = w."balance" + t.amount, "reservedBalance" = w."reservedBalance" - t.amount FROM (SELECT "senderId", SUM("amount") AS amount FROM "transfer" WHERE "status" = 'pending' GROUP BY "senderId") AS t WHERE w."userId" = t."senderId"`);
		await queryRunner.query(`DROP TABLE "transfer"`);
	}
}
