/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class UserCustomStatus1790337118232 {
    name = 'UserCustomStatus1790337118232';

    async up(queryRunner) {
        await queryRunner.query('ALTER TABLE "user" ADD "customStatus" jsonb');
    }

    async down(queryRunner) {
        await queryRunner.query('ALTER TABLE "user" DROP COLUMN "customStatus"');
    }
}
