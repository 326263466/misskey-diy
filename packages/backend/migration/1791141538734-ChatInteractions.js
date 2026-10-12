/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatInteractions1791141538734 {
	name = 'ChatInteractions1791141538734';

	async up(queryRunner) {
		await queryRunner.query('ALTER TABLE "chat_room" ADD "isSilenced" boolean NOT NULL DEFAULT false');
		await queryRunner.query('ALTER TABLE "chat_room" ADD "silenceUntil" TIMESTAMP WITH TIME ZONE');
		await queryRunner.query('ALTER TABLE "chat_message" ADD "isPoke" boolean NOT NULL DEFAULT false');
		await queryRunner.query('ALTER TABLE "chat_message" ADD "pokeUserId" character varying(32)');
		await queryRunner.query('CREATE INDEX "IDX_chat_message_poke_user" ON "chat_message" ("pokeUserId")');
		await queryRunner.query('ALTER TABLE "chat_message" ADD CONSTRAINT "FK_chat_message_poke_user" FOREIGN KEY ("pokeUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION');
	}

	async down(queryRunner) {
		await queryRunner.query('ALTER TABLE "chat_message" DROP CONSTRAINT "FK_chat_message_poke_user"');
		await queryRunner.query('DROP INDEX "IDX_chat_message_poke_user"');
		await queryRunner.query('ALTER TABLE "chat_message" DROP COLUMN "pokeUserId"');
		await queryRunner.query('ALTER TABLE "chat_message" DROP COLUMN "isPoke"');
		await queryRunner.query('ALTER TABLE "chat_room" DROP COLUMN "silenceUntil"');
		await queryRunner.query('ALTER TABLE "chat_room" DROP COLUMN "isSilenced"');
	}
}
