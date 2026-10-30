/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class UserLastDisconnectedAt1791897325823 {
	name = 'UserLastDisconnectedAt1791897325823';

	async up(queryRunner) {
		// 最后一个流式连接断开的时间；晚于 lastActiveDate 时视为离线。
		await queryRunner.query(`ALTER TABLE "user" ADD "lastDisconnectedAt" TIMESTAMP WITH TIME ZONE`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "lastDisconnectedAt"`);
	}
}
