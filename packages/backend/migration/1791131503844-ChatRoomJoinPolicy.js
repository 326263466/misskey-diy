/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomJoinPolicy1791131503844 {
    name = 'ChatRoomJoinPolicy1791131503844';

    async up(queryRunner) {
        await queryRunner.query('ALTER TABLE "chat_room" ADD "joinPolicy" character varying(24) NOT NULL DEFAULT \'invitation\'');
    }

    async down(queryRunner) {
        await queryRunner.query('ALTER TABLE "chat_room" DROP COLUMN "joinPolicy"');
    }
}
