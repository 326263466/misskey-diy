/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AvatarDecorationScale1792062895500 {
	name = 'AvatarDecorationScale1792062895500';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "avatar_decoration" ADD "scale" double precision NOT NULL DEFAULT '1'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "avatar_decoration" DROP COLUMN "scale"`);
	}
}
