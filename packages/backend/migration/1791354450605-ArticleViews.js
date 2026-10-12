/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ArticleViews1791354450605 {
	name = 'ArticleViews1791354450605';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "page" ADD "articleViews" integer NOT NULL DEFAULT 0`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "page" DROP COLUMN "articleViews"`);
	}
}
