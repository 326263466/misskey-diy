/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RemoveRedPacketAmountLimit1790947761601 {
	name = 'RemoveRedPacketAmountLimit1790947761601';

	async up(queryRunner) {
		await queryRunner.query('ALTER TABLE "red_packet" DROP CONSTRAINT "CHK_red_packet_amounts"');
		await queryRunner.query('ALTER TABLE "red_packet" ADD CONSTRAINT "CHK_red_packet_amounts" CHECK ("totalCoins" >= count AND count >= 1 AND count <= 100 AND "remainingCoins" >= 0 AND "remainingCoins" <= "totalCoins" AND "remainingCount" >= 0 AND "remainingCount" <= count)');
	}

	async down(queryRunner) {
		await queryRunner.query('ALTER TABLE "red_packet" DROP CONSTRAINT "CHK_red_packet_amounts"');
		await queryRunner.query('ALTER TABLE "red_packet" ADD CONSTRAINT "CHK_red_packet_amounts" CHECK ("totalCoins" >= count AND "totalCoins" <= 1000000 AND count >= 1 AND count <= 100 AND "remainingCoins" >= 0 AND "remainingCoins" <= "totalCoins" AND "remainingCount" >= 0 AND "remainingCount" <= count)');
	}
}
