/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ArticleCommentTombstones1792142693702 {
	name = 'ArticleCommentTombstones1792142693702';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "article_comment" ADD "isDeleted" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`CREATE INDEX "IDX_article_comment_article_reply_id_id" ON "article_comment" ("articleId", "replyId", "id")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "IDX_article_comment_article_reply_id_id"`);
		// 回退到物理删除语义，避免空占位恢复为正常评论。
		await queryRunner.query(`DELETE FROM "article_comment" WHERE "isDeleted" = true`);
		await queryRunner.query(`ALTER TABLE "article_comment" DROP COLUMN "isDeleted"`);
	}
}
