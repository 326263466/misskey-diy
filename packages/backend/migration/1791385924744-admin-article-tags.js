/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AdminArticleTags1791385924744 {
    name = 'AdminArticleTags1791385924744';

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "articleTags" character varying(100) array NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`UPDATE "meta" SET "articleTags" = $1`, [['技术', '生活', '开发', '前端', '后端', '设计', '随笔', '开源', '数据库', 'javascript', 'typescript', 'vue']]);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "articleTags"`);
    }
}
