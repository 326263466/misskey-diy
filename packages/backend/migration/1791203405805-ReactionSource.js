/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ReactionSource1791203405805 {
	name = 'ReactionSource1791203405805';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note_reaction" ADD "sourceReaction" text`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note_reaction" DROP COLUMN "sourceReaction"`);
	}
}
