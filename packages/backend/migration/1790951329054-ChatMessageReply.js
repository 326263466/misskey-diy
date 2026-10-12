/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatMessageReply1790951329054 {
	name = 'ChatMessageReply1790951329054';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_message" ADD "replyId" varchar(32), ADD "replyType" varchar(8)`);
		await queryRunner.query(`CREATE INDEX "IDX_chat_message_reply" ON "chat_message" ("replyId")`);
		await queryRunner.query(`ALTER TABLE "chat_message" ADD CONSTRAINT "FK_chat_message_reply" FOREIGN KEY ("replyId") REFERENCES "chat_message"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_message" DROP CONSTRAINT "FK_chat_message_reply"`);
		await queryRunner.query(`DROP INDEX "IDX_chat_message_reply"`);
		await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN "replyType", DROP COLUMN "replyId"`);
	}
}
