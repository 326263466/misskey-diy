/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CheckinStreakRewards1790786122156 {
	name = 'CheckinStreakRewards1790786122156';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_checkin" ADD "rewardConsumed" boolean NOT NULL DEFAULT false`);
		// Settle past 30-day milestones without issuing cards. Retain each streak's
		// unfinished tail, including makeup days, and preserve existing balances.
		await queryRunner.query(`
			WITH grouped AS (
				SELECT "userId", date,
					date - ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY date)::integer AS streak_group
				FROM "user_checkin"
			), milestones AS (
				SELECT "userId", date,
					ROW_NUMBER() OVER (PARTITION BY "userId", streak_group ORDER BY date) AS position,
					COUNT(*) OVER (PARTITION BY "userId", streak_group) / 30 * 30 AS settled_days
				FROM grouped
			)
			UPDATE "user_checkin" c SET "rewardConsumed" = true
			FROM milestones m
			WHERE c."userId" = m."userId" AND c.date = m.date AND m.position <= m.settled_days
		`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_checkin" DROP COLUMN "rewardConsumed"`);
	}
}
