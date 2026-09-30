/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class UserProfessionalProfile1790575910682 {
    name = 'UserProfessionalProfile1790575910682';

    async up(queryRunner) {
        await queryRunner.query('ALTER TABLE "user_profile" ADD "company" character varying(128)');
        await queryRunner.query('ALTER TABLE "user_profile" ADD "jobTitle" character varying(128)');
    }

    async down(queryRunner) {
        await queryRunner.query('ALTER TABLE "user_profile" DROP COLUMN "jobTitle"');
        await queryRunner.query('ALTER TABLE "user_profile" DROP COLUMN "company"');
    }
}
