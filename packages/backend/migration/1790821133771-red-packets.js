/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RedPackets1790821133771 {
	name = 'RedPackets1790821133771';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note" ADD "hasRedPacket" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "note" ADD "redPacketId" character varying(32)`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_note_red_packet" ON "note" ("redPacketId")`);
		await queryRunner.query(`ALTER TABLE "chat_message" ADD "redPacketId" character varying(32)`);
		await queryRunner.query(`CREATE INDEX "IDX_chat_message_red_packet" ON "chat_message" ("redPacketId")`);
		await queryRunner.query(`CREATE TABLE "red_packet" ("id" character varying(32) NOT NULL, "kind" character varying(8) NOT NULL, "audience" character varying(16) NOT NULL, "userId" character varying(32) NOT NULL, "requestId" uuid NOT NULL, "recipientIdsHash" character varying(64) NOT NULL, "mode" character varying(8) NOT NULL, "message" character varying(100) NOT NULL, "coverId" character varying(16) NOT NULL DEFAULT 'classic', "totalCoins" integer NOT NULL, "count" integer NOT NULL, "remainingCoins" integer NOT NULL, "remainingCount" integer NOT NULL, "expiresInHours" integer NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'active', CONSTRAINT "PK_red_packet" PRIMARY KEY ("id"), CONSTRAINT "CHK_red_packet_amounts" CHECK ("totalCoins" >= count AND "totalCoins" <= 1000000 AND count >= 1 AND count <= 100 AND "remainingCoins" >= 0 AND "remainingCoins" <= "totalCoins" AND "remainingCount" >= 0 AND "remainingCount" <= count))`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_red_packet_request" ON "red_packet" ("userId", "requestId")`);
		await queryRunner.query(`CREATE INDEX "IDX_red_packet_user_id" ON "red_packet" ("userId", "id")`);
		await queryRunner.query(`CREATE INDEX "IDX_red_packet_expiration" ON "red_packet" ("status", "expiresAt")`);
		await queryRunner.query(`ALTER TABLE "red_packet" ADD CONSTRAINT "FK_red_packet_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`CREATE TABLE "red_packet_claim" ("id" character varying(32) NOT NULL, "redPacketId" character varying(32) NOT NULL, "userId" character varying(32), "coins" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_red_packet_claim" PRIMARY KEY ("id"), CONSTRAINT "CHK_red_packet_claim_coins" CHECK (coins > 0))`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_red_packet_claim_user" ON "red_packet_claim" ("redPacketId", "userId")`);
		await queryRunner.query(`ALTER TABLE "red_packet_claim" ADD CONSTRAINT "FK_red_packet_claim_packet" FOREIGN KEY ("redPacketId") REFERENCES "red_packet"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "red_packet_claim" ADD CONSTRAINT "FK_red_packet_claim_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
		await queryRunner.query(`CREATE TABLE "red_packet_recipient" ("redPacketId" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, CONSTRAINT "PK_red_packet_recipient" PRIMARY KEY ("redPacketId", "userId"))`);
		await queryRunner.query(`CREATE INDEX "IDX_red_packet_recipient_user" ON "red_packet_recipient" ("userId", "redPacketId")`);
		await queryRunner.query(`ALTER TABLE "red_packet_recipient" ADD CONSTRAINT "FK_red_packet_recipient_packet" FOREIGN KEY ("redPacketId") REFERENCES "red_packet"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "red_packet_recipient" ADD CONSTRAINT "FK_red_packet_recipient_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

	}

	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE "red_packet_recipient"`);
		await queryRunner.query(`DROP INDEX "IDX_note_red_packet"`);
		await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "redPacketId"`);
		await queryRunner.query(`DROP TABLE "red_packet_claim"`);
		await queryRunner.query(`DROP TABLE "red_packet"`);
		await queryRunner.query(`DROP INDEX "IDX_chat_message_red_packet"`);
		await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN "redPacketId"`);
		await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "hasRedPacket"`);
	}
}
