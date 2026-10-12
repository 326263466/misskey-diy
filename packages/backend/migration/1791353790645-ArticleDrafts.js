/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ArticleDrafts1791353790645 {
	name = 'ArticleDrafts1791353790645';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "article_draft" ("userId" character varying(32) NOT NULL, "draftId" character varying(100) NOT NULL, "revision" integer NOT NULL, "updatedAt" timestamp with time zone NOT NULL, "data" jsonb, CONSTRAINT "PK_article_draft" PRIMARY KEY ("userId", "draftId"), CONSTRAINT "FK_article_draft_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
		await queryRunner.query(`CREATE INDEX "IDX_article_draft_user_updated" ON "article_draft" ("userId", "updatedAt")`);
		await this.installTracking(queryRunner);
	}

	async installTracking(queryRunner) {
		// 云稿拥有独立附件引用，本地编辑器关闭或丢弃不会解除这里的保护。
		await queryRunner.query(`CREATE TRIGGER drive_file_source_write AFTER INSERT OR UPDATE OF "userId", "draftId", "data" ON "article_draft" FOR EACH ROW EXECUTE FUNCTION drive_file_source_trigger('draft', 'data')`);
		await queryRunner.query(`CREATE TRIGGER drive_file_source_delete AFTER DELETE ON "article_draft" FOR EACH ROW EXECUTE FUNCTION drive_file_source_trigger('draft', 'data')`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DELETE FROM "drive_file_reference" WHERE "sourceType" = 'article_draft'`);
		await queryRunner.query(`DROP TABLE "article_draft"`);
	}
}
