/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ArticleCategories1791094550156 {
	name = 'ArticleCategories1791094550156';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "articleCategories" jsonb NOT NULL DEFAULT '[{"id":"wrong-place","name":"错误地方"},{"id":"technology","name":"技术交流"},{"id":"resources","name":"资源分享"},{"id":"benefits","name":"福利放送"},{"id":"questions","name":"求助问答"},{"id":"thoughts","name":"深度思考"},{"id":"promotion","name":"我要推广"},{"id":"governance","name":"社区治理"},{"id":"announcements","name":"社区公告"},{"id":"flood-control","name":"大禹治水"}]'`);
		await queryRunner.query('ALTER TABLE "page" ADD "articleCategoryId" character varying(64)');
		await queryRunner.query('CREATE INDEX "IDX_page_article_category_id" ON "page" ("articleCategoryId")');
	}

	async down(queryRunner) {
		await queryRunner.query('DROP INDEX "IDX_page_article_category_id"');
		await queryRunner.query('ALTER TABLE "page" DROP COLUMN "articleCategoryId"');
		await queryRunner.query('ALTER TABLE "meta" DROP COLUMN "articleCategories"');
	}
}
