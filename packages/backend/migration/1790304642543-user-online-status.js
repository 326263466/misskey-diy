/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class UserOnlineStatus1790304642543 {
    name = 'UserOnlineStatus1790304642543';

    async up(queryRunner) {
        await queryRunner.query('ALTER TABLE "user" ADD "onlineStatusOverride" character varying(16) NOT NULL DEFAULT \'online\'');
    }

    async down(queryRunner) {
        await queryRunner.query('ALTER TABLE "user" DROP COLUMN "onlineStatusOverride"');
    }
}
