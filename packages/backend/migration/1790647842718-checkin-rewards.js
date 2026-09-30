/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CheckinRewards1790647842718 {
	name = 'CheckinRewards1790647842718';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_profile" ADD "checkinPoints" integer NOT NULL DEFAULT 0`);
		await queryRunner.query(`ALTER TABLE "user_profile" ADD "checkinMakeupCards" integer NOT NULL DEFAULT 0`);
		await queryRunner.query(`ALTER TABLE "user_checkin" ADD "isMakeup" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`UPDATE "user_profile" p SET "checkinPoints" = c.days FROM (SELECT "userId", COUNT(*)::integer AS days FROM "user_checkin" GROUP BY "userId") c WHERE p."userId" = c."userId"`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_checkin" DROP COLUMN "isMakeup"`);
		await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "checkinMakeupCards"`);
		await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "checkinPoints"`);
	}
}
