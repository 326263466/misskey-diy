/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomAvatar1791136122260 {
    name = 'ChatRoomAvatar1791136122260';

    async up(queryRunner) {
        await queryRunner.query('ALTER TABLE "chat_room" ADD "avatarId" character varying(32)');
        await queryRunner.query('ALTER TABLE "chat_room" ADD CONSTRAINT "FK_e3631e9ea9ee3fd6e8fa90928ba" FOREIGN KEY ("avatarId") REFERENCES "drive_file"("id") ON DELETE SET NULL ON UPDATE NO ACTION');
    }

    async down(queryRunner) {
        await queryRunner.query('ALTER TABLE "chat_room" DROP CONSTRAINT "FK_e3631e9ea9ee3fd6e8fa90928ba"');
        await queryRunner.query('ALTER TABLE "chat_room" DROP COLUMN "avatarId"');
    }
}
