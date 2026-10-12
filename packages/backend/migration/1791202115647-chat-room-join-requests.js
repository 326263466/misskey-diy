/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomJoinRequests1791202115647 {
    name = 'ChatRoomJoinRequests1791202115647';

    async up(queryRunner) {
        await queryRunner.query('ALTER TABLE "chat_room_invitation" ADD "isRequest" boolean NOT NULL DEFAULT false');
        await queryRunner.query('ALTER TABLE "chat_room_invitation" ADD "requestMessage" character varying(500)');
    }

    async down(queryRunner) {
        // 回滚后申请不能变成可直接入群的邀请。
        await queryRunner.query('DELETE FROM "chat_room_invitation" WHERE "isRequest" = true');
        await queryRunner.query('UPDATE "chat_room" SET "joinPolicy" = \'invitation\' WHERE "joinPolicy" = \'approval\'');
        await queryRunner.query('ALTER TABLE "chat_room_invitation" DROP COLUMN "requestMessage"');
        await queryRunner.query('ALTER TABLE "chat_room_invitation" DROP COLUMN "isRequest"');
    }
}
