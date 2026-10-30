/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ArticleCommentLikes1792117681317 {
	name = 'ArticleCommentLikes1792117681317';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "article_comment_like" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "commentId" character varying(32) NOT NULL, CONSTRAINT "PK_article_comment_like" PRIMARY KEY ("id"), CONSTRAINT "FK_article_comment_like_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE, CONSTRAINT "FK_article_comment_like_comment" FOREIGN KEY ("commentId") REFERENCES "article_comment"("id") ON DELETE CASCADE)`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_article_comment_like_user_comment" ON "article_comment_like" ("userId", "commentId")`);
		await queryRunner.query(`CREATE INDEX "IDX_article_comment_like_comment_id" ON "article_comment_like" ("commentId")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE "article_comment_like"`);
	}
}
