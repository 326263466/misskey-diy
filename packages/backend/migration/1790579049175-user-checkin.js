/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class UserCheckin1790579049175 {
	name = 'UserCheckin1790579049175';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "user_checkin" ("userId" character varying(32) NOT NULL, "date" date NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "totalDays" integer NOT NULL, "consecutiveDays" integer NOT NULL, CONSTRAINT "PK_user_checkin_user_date" PRIMARY KEY ("userId", "date"))`);
		await queryRunner.query(`CREATE INDEX "IDX_user_checkin_date_user" ON "user_checkin" ("date", "userId")`);
		await queryRunner.query(`ALTER TABLE "user_checkin" ADD CONSTRAINT "FK_user_checkin_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE "user_checkin"`);
	}
}
