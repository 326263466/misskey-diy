/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RedPacketStartTime1791004249931 {
	name = 'RedPacketStartTime1791004249931';

	async up(queryRunner) {
		await queryRunner.query('ALTER TABLE "red_packet" ADD "startsAt" TIMESTAMP WITH TIME ZONE');
	}

	async down(queryRunner) {
		await queryRunner.query('ALTER TABLE "red_packet" DROP COLUMN "startsAt"');
	}
}
