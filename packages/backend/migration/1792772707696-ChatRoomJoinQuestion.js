/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomJoinQuestion1792772707696 {
    name = 'ChatRoomJoinQuestion1792772707696';

    async up(queryRunner) {
        await queryRunner.query('ALTER TABLE "chat_room" ADD "joinQuestion" character varying(200) NOT NULL DEFAULT \'\'');
    }

    async down(queryRunner) {
        await queryRunner.query('ALTER TABLE "chat_room" DROP COLUMN "joinQuestion"');
    }
}
