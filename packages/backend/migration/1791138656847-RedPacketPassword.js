/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RedPacketPassword1791138656847 {
	name = 'RedPacketPassword1791138656847';

	async up(queryRunner) {
		await queryRunner.query('ALTER TABLE "red_packet" ADD "password" character varying(64)');
		await queryRunner.query('CREATE INDEX "IDX_red_packet_password" ON "red_packet" ("password") WHERE "password" IS NOT NULL');
	}

	async down(queryRunner) {
		await queryRunner.query('DROP INDEX "IDX_red_packet_password"');
		await queryRunner.query('ALTER TABLE "red_packet" DROP COLUMN "password"');
	}
}
