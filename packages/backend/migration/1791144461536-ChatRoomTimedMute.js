/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomTimedMute1791144461536 {
    name = 'ChatRoomTimedMute1791144461536';

    async up(queryRunner) {
        await queryRunner.query('ALTER TABLE "chat_room_membership" ADD "mutedUntil" TIMESTAMP WITH TIME ZONE');
        await queryRunner.query('ALTER TABLE "chat_room" ADD "ownerIsMuted" boolean NOT NULL DEFAULT false');
        await queryRunner.query('ALTER TABLE "chat_room" ADD "ownerMutedUntil" TIMESTAMP WITH TIME ZONE');
    }

    async down(queryRunner) {
        await queryRunner.query('ALTER TABLE "chat_room" DROP COLUMN "ownerMutedUntil"');
        await queryRunner.query('ALTER TABLE "chat_room" DROP COLUMN "ownerIsMuted"');
        await queryRunner.query('ALTER TABLE "chat_room_membership" DROP COLUMN "mutedUntil"');
    }
}
