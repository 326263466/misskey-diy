/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RedPacketCover1790848574121 {
	name = 'RedPacketCover1790848574121';

	async up(queryRunner) {
		await queryRunner.query('ALTER TABLE "red_packet" ADD "coverFileId" varchar(32), ADD "coverUrl" varchar(1024)');
	}

	async down(queryRunner) {
		await queryRunner.query('ALTER TABLE "red_packet" DROP COLUMN "coverUrl", DROP COLUMN "coverFileId"');
	}
}
