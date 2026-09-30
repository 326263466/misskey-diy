/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CheckinCardBatches1790667840847 {
	name = 'CheckinCardBatches1790667840847';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "user_checkin_card_batch" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "source" character varying(16) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "amount" integer NOT NULL, "remaining" integer NOT NULL, "used" integer NOT NULL DEFAULT 0, "revoked" integer NOT NULL DEFAULT 0, "grantLogId" character varying(32), "adminId" character varying(32), CONSTRAINT "PK_checkin_card_batch" PRIMARY KEY ("id"), CONSTRAINT "CHK_checkin_card_batch_balance" CHECK (amount > 0 AND remaining >= 0 AND used >= 0 AND revoked >= 0 AND amount = remaining + used + revoked))`);
		await queryRunner.query(`CREATE INDEX "IDX_checkin_card_batch_user_created" ON "user_checkin_card_batch" ("userId", "createdAt", "id")`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_checkin_card_batch_grant_log" ON "user_checkin_card_batch" ("grantLogId")`);
		await queryRunner.query(`ALTER TABLE "user_checkin_card_batch" ADD CONSTRAINT "FK_checkin_card_batch_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		// Existing balances have no reliable source attribution. Preserve them as non-reclaimable opening batches.
		await queryRunner.query(`INSERT INTO "user_checkin_card_batch" ("id", "userId", "source", "createdAt", "amount", "remaining") SELECT md5('checkin-opening:' || "userId"), "userId", 'legacy', CURRENT_TIMESTAMP, "checkinMakeupCards", "checkinMakeupCards" FROM "user_profile" WHERE "checkinMakeupCards" > 0`);
		await queryRunner.query(`ALTER TABLE "user_checkin" ADD "cardBatchId" character varying(32)`);
		await queryRunner.query(`ALTER TABLE "user_checkin" ADD CONSTRAINT "FK_user_checkin_card_batch" FOREIGN KEY ("cardBatchId") REFERENCES "user_checkin_card_batch"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_checkin" DROP CONSTRAINT "FK_user_checkin_card_batch"`);
		await queryRunner.query(`ALTER TABLE "user_checkin" DROP COLUMN "cardBatchId"`);
		await queryRunner.query(`DROP TABLE "user_checkin_card_batch"`);
		// Current balances are preserved; rolling back intentionally drops source attribution.
	}
}
