/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomManagement1791177077040 {
    name = 'ChatRoomManagement1791177077040';

    async up(queryRunner) {
        await queryRunner.query('ALTER TABLE "chat_room" ADD "announcement" character varying(2048) NOT NULL DEFAULT \'\'');
        await queryRunner.query('ALTER TABLE "chat_room" ADD "ownerNickname" character varying(32) NOT NULL DEFAULT \'\'');
        await queryRunner.query('ALTER TABLE "chat_room_membership" ADD "nickname" character varying(32) NOT NULL DEFAULT \'\'');
        await queryRunner.query('ALTER TABLE "chat_room_membership" ADD "isSilenced" boolean NOT NULL DEFAULT false');
        await queryRunner.query('ALTER TABLE "chat_room_membership" ADD "silenceUntil" TIMESTAMP WITH TIME ZONE');
        await queryRunner.query('ALTER TABLE "chat_room_invitation" ADD "inviterId" character varying(32)');
        await queryRunner.query('ALTER TABLE "chat_room_invitation" ADD CONSTRAINT "FK_chat_room_invitation_inviter" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION');
        await queryRunner.query('ALTER TABLE "chat_message" ADD "systemEvent" jsonb');
    }

    async down(queryRunner) {
        await queryRunner.query('ALTER TABLE "chat_message" DROP COLUMN "systemEvent"');
        await queryRunner.query('ALTER TABLE "chat_room_invitation" DROP CONSTRAINT "FK_chat_room_invitation_inviter"');
        await queryRunner.query('ALTER TABLE "chat_room_invitation" DROP COLUMN "inviterId"');
        await queryRunner.query('ALTER TABLE "chat_room_membership" DROP COLUMN "silenceUntil"');
        await queryRunner.query('ALTER TABLE "chat_room_membership" DROP COLUMN "isSilenced"');
        await queryRunner.query('ALTER TABLE "chat_room_membership" DROP COLUMN "nickname"');
        await queryRunner.query('ALTER TABLE "chat_room" DROP COLUMN "ownerNickname"');
        await queryRunner.query('ALTER TABLE "chat_room" DROP COLUMN "announcement"');
    }
}
