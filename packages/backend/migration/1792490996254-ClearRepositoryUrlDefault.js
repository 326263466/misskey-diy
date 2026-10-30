/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ClearRepositoryUrlDefault1792490996254 {
    name = 'ClearRepositoryUrlDefault1792490996254'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "repositoryUrl" DROP DEFAULT`);
        await queryRunner.query(`UPDATE "meta" SET "repositoryUrl" = NULL WHERE "repositoryUrl" = 'https://github.com/misskey-dev/misskey'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "repositoryUrl" SET DEFAULT 'https://github.com/misskey-dev/misskey'`);
        // 已清空的上游地址和原本的空值无法区分，因此不回填。
    }
}
