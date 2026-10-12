/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ContentTips1791254648999 {
	name = 'ContentTips1791254648999';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "tip" ("id" character varying(32) NOT NULL, "senderId" character varying(32), "recipientId" character varying(32) NOT NULL, "requestId" uuid NOT NULL, "amount" numeric(12,2) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "targetType" character varying(32), "targetId" character varying(32), CONSTRAINT "CHK_tip_amount" CHECK ("amount" >= 1 AND "amount" <= 1000), CONSTRAINT "CHK_tip_target" CHECK (("targetType" IS NULL AND "targetId" IS NULL) OR ("targetType" IS NOT NULL AND "targetId" IS NOT NULL)), CONSTRAINT "PK_tip" PRIMARY KEY ("id"), CONSTRAINT "FK_tip_sender" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE SET NULL)`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_tip_sender_request" ON "tip" ("senderId", "requestId")`);
		await queryRunner.query(`CREATE INDEX "IDX_tip_target_id" ON "tip" ("targetType", "targetId", "id")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE "tip"`);
	}
}
