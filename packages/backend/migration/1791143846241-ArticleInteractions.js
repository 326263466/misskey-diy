/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ArticleInteractions1791143846241 {
	name = 'ArticleInteractions1791143846241';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "article_comment" ("id" character varying(32) NOT NULL, "articleId" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "text" character varying(3000) NOT NULL, "replyId" character varying(32), CONSTRAINT "PK_article_comment" PRIMARY KEY ("id"), CONSTRAINT "FK_article_comment_article" FOREIGN KEY ("articleId") REFERENCES "page"("id") ON DELETE CASCADE, CONSTRAINT "FK_article_comment_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE, CONSTRAINT "FK_article_comment_reply" FOREIGN KEY ("replyId") REFERENCES "article_comment"("id") ON DELETE SET NULL)`);
		await queryRunner.query(`CREATE INDEX "IDX_article_comment_article_id_id" ON "article_comment" ("articleId", "id")`);
		await queryRunner.query(`CREATE INDEX "IDX_article_comment_user_id" ON "article_comment" ("userId")`);
		await queryRunner.query(`CREATE TABLE "article_favorite" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "articleId" character varying(32) NOT NULL, CONSTRAINT "PK_article_favorite" PRIMARY KEY ("id"), CONSTRAINT "FK_article_favorite_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE, CONSTRAINT "FK_article_favorite_article" FOREIGN KEY ("articleId") REFERENCES "page"("id") ON DELETE CASCADE)`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_article_favorite_user_article" ON "article_favorite" ("userId", "articleId")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE "article_favorite"`);
		await queryRunner.query(`DROP TABLE "article_comment"`);
	}
}
