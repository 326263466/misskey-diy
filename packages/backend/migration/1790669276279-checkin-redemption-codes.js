/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CheckinRedemptionCodes1790669276279 {
	name = 'CheckinRedemptionCodes1790669276279';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "checkin_redemption_code" ("id" character varying(32) NOT NULL, "code" character varying(32) NOT NULL, "name" character varying(100) NOT NULL, "amount" integer NOT NULL, "maxRedemptions" integer NOT NULL, "redemptions" integer NOT NULL DEFAULT 0, "expiresAt" TIMESTAMP WITH TIME ZONE, "enabled" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdBy" character varying(32) NOT NULL, CONSTRAINT "PK_checkin_redemption_code" PRIMARY KEY ("id"), CONSTRAINT "CHK_checkin_redemption_code_limits" CHECK (amount > 0 AND "maxRedemptions" > 0 AND redemptions >= 0 AND redemptions <= "maxRedemptions"))`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_checkin_redemption_code_code" ON "checkin_redemption_code" ("code")`);
		// Claims retain recipient IDs after account deletion so historical redemption quotas are not recycled.
		await queryRunner.query(`CREATE TABLE "checkin_redemption_claim" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "codeId" character varying(32) NOT NULL, "batchId" character varying(32) NOT NULL, "amount" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_checkin_redemption_claim" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_checkin_redemption_claim_user_code" ON "checkin_redemption_claim" ("userId", "codeId")`);
		await queryRunner.query(`CREATE INDEX "IDX_checkin_redemption_claim_code_created" ON "checkin_redemption_claim" ("codeId", "createdAt", "id")`);
		await queryRunner.query(`ALTER TABLE "checkin_redemption_claim" ADD CONSTRAINT "FK_checkin_redemption_claim_code" FOREIGN KEY ("codeId") REFERENCES "checkin_redemption_code"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE "checkin_redemption_claim"`);
		await queryRunner.query(`DROP TABLE "checkin_redemption_code"`);
		// Granted card batches and current user balances are intentionally preserved.
	}
}
