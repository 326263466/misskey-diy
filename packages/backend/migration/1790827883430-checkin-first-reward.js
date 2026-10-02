/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CheckinFirstReward1790827883430 {
	name = 'CheckinFirstReward1790827883430';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_profile" ADD "checkinFirstRewardClaimed" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "user_checkin" ADD "earnedMakeupCards" integer NOT NULL DEFAULT 0`);
		// Previously settled rewards must not grant another introductory reward.
		await queryRunner.query(`UPDATE "user_profile" p SET "checkinFirstRewardClaimed" = true WHERE EXISTS (SELECT 1 FROM "user_checkin" c WHERE c."userId" = p."userId" AND c."rewardConsumed" = true) OR EXISTS (SELECT 1 FROM "user_checkin_card_batch" b WHERE b."userId" = p."userId" AND b.source = 'reward')`);
		// Only real reward batches prove that a card was credited (full inventory skips do not).
		await queryRunner.query(`UPDATE "user_checkin" c SET "earnedMakeupCards" = rewards.amount FROM (
			SELECT "userId", ("createdAt" AT TIME ZONE 'Asia/Shanghai')::date AS date, SUM(amount)::integer AS amount
			FROM "user_checkin_card_batch" WHERE source = 'reward' GROUP BY "userId", ("createdAt" AT TIME ZONE 'Asia/Shanghai')::date
		) rewards WHERE c."userId" = rewards."userId" AND c.date = rewards.date`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_checkin" DROP COLUMN "earnedMakeupCards"`);
		await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "checkinFirstRewardClaimed"`);
	}
}
