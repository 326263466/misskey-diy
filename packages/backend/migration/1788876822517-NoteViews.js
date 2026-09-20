/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class NoteViews1788876822517 {
	name = 'NoteViews1788876822517';
	async up(queryRunner) {
		await queryRunner.query('ALTER TABLE "note" ADD "viewsCount" integer NOT NULL DEFAULT 0');
	}
	async down(queryRunner) {
		await queryRunner.query('ALTER TABLE "note" DROP COLUMN "viewsCount"');
	}
}
