/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class MultipleNoteReactions1791201325841 {
	name = 'MultipleNoteReactions1791201325841';

	async up(queryRunner) {
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_note_reaction_user_note_reaction" ON "note_reaction" ("userId", "noteId", "reaction")`);
		await queryRunner.query(`DROP INDEX "IDX_ad0c221b25672daf2df320a817"`);
	}

	async down(queryRunner) {
		// 已使用多表情时停止回滚，避免静默丢失用户的回应。
		await queryRunner.query(`DO $$ BEGIN
			IF EXISTS (SELECT 1 FROM "note_reaction" GROUP BY "userId", "noteId" HAVING count(*) > 1) THEN
				RAISE EXCEPTION 'Cannot restore single-reaction constraint while multiple reactions exist';
			END IF;
		END $$`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ad0c221b25672daf2df320a817" ON "note_reaction" ("userId", "noteId")`);
		await queryRunner.query(`DROP INDEX "IDX_note_reaction_user_note_reaction"`);
	}
}
