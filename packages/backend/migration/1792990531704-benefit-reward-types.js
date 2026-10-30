/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class BenefitRewardTypes1792990531704 {
	name = 'BenefitRewardTypes1792990531704';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "checkin_redemption_code" RENAME TO "benefit_redemption_code"`);
		await queryRunner.query(`ALTER TABLE "checkin_redemption_claim" RENAME TO "benefit_redemption_claim"`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_code" RENAME CONSTRAINT "PK_checkin_redemption_code" TO "PK_benefit_redemption_code"`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_code" RENAME CONSTRAINT "CHK_checkin_redemption_code_limits" TO "CHK_benefit_redemption_code_limits"`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_claim" RENAME CONSTRAINT "PK_checkin_redemption_claim" TO "PK_benefit_redemption_claim"`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_claim" RENAME CONSTRAINT "FK_checkin_redemption_claim_code" TO "FK_benefit_redemption_claim_code"`);
		await queryRunner.query(`ALTER INDEX "IDX_checkin_redemption_code_code" RENAME TO "IDX_benefit_redemption_code_code"`);
		await queryRunner.query(`ALTER INDEX "IDX_checkin_redemption_claim_user_code" RENAME TO "IDX_benefit_redemption_claim_user_code"`);
		await queryRunner.query(`ALTER INDEX "IDX_checkin_redemption_claim_code_created" RENAME TO "IDX_benefit_redemption_claim_code_created"`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_code" ADD "rewardType" character varying(16) NOT NULL DEFAULT 'makeupCards'`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_code" ALTER COLUMN "rewardType" DROP DEFAULT`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_code" ADD "deletedAt" timestamp with time zone`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_code" ADD CONSTRAINT "CHK_benefit_redemption_code_reward" CHECK ("rewardType" IN ('makeupCards', 'points'))`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_claim" ADD "rewardType" character varying(16) NOT NULL DEFAULT 'makeupCards'`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_claim" ALTER COLUMN "rewardType" DROP DEFAULT`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_claim" ALTER COLUMN "batchId" DROP NOT NULL`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_claim" ADD CONSTRAINT "CHK_benefit_redemption_claim_reward" CHECK (amount > 0 AND (("rewardType" = 'makeupCards' AND "batchId" IS NOT NULL) OR ("rewardType" = 'points' AND "batchId" IS NULL)))`);
		await queryRunner.query(`CREATE INDEX "IDX_benefit_redemption_claim_user_created" ON "benefit_redemption_claim" ("userId", "createdAt", "id")`);
		await queryRunner.query(`DROP INDEX "IDX_checkin_card_batch_grant_log"`);
		await queryRunner.query(`ALTER TABLE "user_checkin_card_batch" DROP COLUMN "grantLogId", DROP COLUMN "adminId"`);
		await queryRunner.query(`UPDATE "user_checkin_card_batch" SET source = 'legacy' WHERE source = 'admin'`);
	}

	async down(queryRunner) {
		// Older versions cannot represent points rewards; never reinterpret them as cards.
		await queryRunner.query(`DO $$ BEGIN
			IF EXISTS (SELECT 1 FROM "benefit_redemption_code" WHERE "rewardType" = 'points') OR
				EXISTS (SELECT 1 FROM "benefit_redemption_claim" WHERE "rewardType" = 'points') THEN
				RAISE EXCEPTION 'Cannot revert while points redemption records exist.';
			END IF;
		END $$`);
		// Removed grant attribution cannot be reconstructed; card balances are unchanged.
		await queryRunner.query(`ALTER TABLE "user_checkin_card_batch" ADD "grantLogId" character varying(32), ADD "adminId" character varying(32)`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_checkin_card_batch_grant_log" ON "user_checkin_card_batch" ("grantLogId")`);
		await queryRunner.query(`DROP INDEX "IDX_benefit_redemption_claim_user_created"`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_claim" DROP CONSTRAINT "CHK_benefit_redemption_claim_reward"`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_claim" ALTER COLUMN "batchId" SET NOT NULL`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_claim" DROP COLUMN "rewardType"`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_code" DROP CONSTRAINT "CHK_benefit_redemption_code_reward"`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_code" DROP COLUMN "rewardType"`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_code" DROP COLUMN "deletedAt"`);
		await queryRunner.query(`ALTER INDEX "IDX_benefit_redemption_claim_code_created" RENAME TO "IDX_checkin_redemption_claim_code_created"`);
		await queryRunner.query(`ALTER INDEX "IDX_benefit_redemption_claim_user_code" RENAME TO "IDX_checkin_redemption_claim_user_code"`);
		await queryRunner.query(`ALTER INDEX "IDX_benefit_redemption_code_code" RENAME TO "IDX_checkin_redemption_code_code"`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_claim" RENAME CONSTRAINT "FK_benefit_redemption_claim_code" TO "FK_checkin_redemption_claim_code"`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_claim" RENAME CONSTRAINT "PK_benefit_redemption_claim" TO "PK_checkin_redemption_claim"`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_code" RENAME CONSTRAINT "CHK_benefit_redemption_code_limits" TO "CHK_checkin_redemption_code_limits"`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_code" RENAME CONSTRAINT "PK_benefit_redemption_code" TO "PK_checkin_redemption_code"`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_claim" RENAME TO "checkin_redemption_claim"`);
		await queryRunner.query(`ALTER TABLE "benefit_redemption_code" RENAME TO "checkin_redemption_code"`);
	}
}
