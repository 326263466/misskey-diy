/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class UserOnlineStatusAutoReplies1790562037343 {
    name = 'UserOnlineStatusAutoReplies1790562037343';

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" ADD "onlineStatusAutoReplies" jsonb NOT NULL DEFAULT '{}'`);
        await queryRunner.query('ALTER TABLE "chat_message" ADD "isAutoReply" boolean NOT NULL DEFAULT false');
    }

    async down(queryRunner) {
        await queryRunner.query(`UPDATE "user" SET "onlineStatusOverride" = 'busy' WHERE "onlineStatusOverride" = 'doNotDisturb'`);
        await queryRunner.query('ALTER TABLE "chat_message" DROP COLUMN "isAutoReply"');
        await queryRunner.query('ALTER TABLE "user" DROP COLUMN "onlineStatusAutoReplies"');
    }
}
