/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CheckinCardExchange1790650436304 {
	name = 'CheckinCardExchange1790650436304';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "user_checkin_exchange" ("userId" character varying(32) NOT NULL, "requestId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "pointsSpent" integer NOT NULL, "cardsGranted" integer NOT NULL, CONSTRAINT "PK_user_checkin_exchange_user_request" PRIMARY KEY ("userId", "requestId"))`);
		await queryRunner.query(`ALTER TABLE "user_checkin_exchange" ADD CONSTRAINT "FK_user_checkin_exchange_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE "user_checkin_exchange"`);
	}
}
