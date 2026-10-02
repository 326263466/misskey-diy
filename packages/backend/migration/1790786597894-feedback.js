/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class Feedback1790786597894 {
	name = 'Feedback1790786597894';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "feedback" ("id" character varying(32) NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "title" character varying(120) NOT NULL, "description" character varying(10000) NOT NULL, "category" character varying(16) NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'open', "response" character varying(10000), "userId" character varying(32) NOT NULL, CONSTRAINT "PK_8389f9e087a57689cd5be8b2b13" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE INDEX "IDX_feedback_status_id" ON "feedback" ("status", "id")`);
		await queryRunner.query(`CREATE INDEX "IDX_feedback_category_id" ON "feedback" ("category", "id")`);
		await queryRunner.query(`CREATE INDEX "IDX_feedback_user_id" ON "feedback" ("userId", "id")`);
		await queryRunner.query(`CREATE INDEX "IDX_feedback_updated_id" ON "feedback" ("updatedAt", "id")`);
		await queryRunner.query(`ALTER TABLE "feedback" ADD CONSTRAINT "FK_4a39e6ac0cecdf18307a365cf3c" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE "feedback"`);
	}
}
