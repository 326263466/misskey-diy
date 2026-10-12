/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatMessageEditedAt1790929313215 {
	name = 'ChatMessageEditedAt1790929313215';

	async up(queryRunner) {
		await queryRunner.query('ALTER TABLE "chat_message" ADD "editedAt" TIMESTAMP WITH TIME ZONE');
	}

	async down(queryRunner) {
		await queryRunner.query('ALTER TABLE "chat_message" DROP COLUMN "editedAt"');
	}
}
