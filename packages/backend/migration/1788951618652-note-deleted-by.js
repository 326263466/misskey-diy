/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class NoteDeletedBy1788951618652 {
	name = 'NoteDeletedBy1788951618652';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note" ADD "deletedBy" character varying(16)`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "deletedBy"`);
	}
}
