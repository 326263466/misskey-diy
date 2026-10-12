/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomAdministrators1791174521708 {
    name = 'ChatRoomAdministrators1791174521708';

    async up(queryRunner) {
        await queryRunner.query('ALTER TABLE "chat_room_membership" ADD "role" character varying(16) NOT NULL DEFAULT \'member\'');
    }

    async down(queryRunner) {
        await queryRunner.query('ALTER TABLE "chat_room_membership" DROP COLUMN "role"');
    }
}
