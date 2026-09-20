/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 * @typedef {import('typeorm').QueryRunner} QueryRunner
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
export class NoteLikes1788796449935 {
    name = 'NoteLikes1788796449935'

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "note_like" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "noteId" character varying(32) NOT NULL, CONSTRAINT "PK_note_like" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_note_like_user" ON "note_like" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_note_like_note" ON "note_like" ("noteId", "id")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_note_like_user_note" ON "note_like" ("userId", "noteId")`);
        await queryRunner.query(`ALTER TABLE "note_like" ADD CONSTRAINT "FK_note_like_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "note_like" ADD CONSTRAINT "FK_note_like_note" FOREIGN KEY ("noteId") REFERENCES "note"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note_like" DROP CONSTRAINT "FK_note_like_note"`);
        await queryRunner.query(`ALTER TABLE "note_like" DROP CONSTRAINT "FK_note_like_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_note_like_user_note"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_note_like_note"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_note_like_user"`);
        await queryRunner.query(`DROP TABLE "note_like"`);
    }
}
