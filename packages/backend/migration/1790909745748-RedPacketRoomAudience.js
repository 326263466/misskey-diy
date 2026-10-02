/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RedPacketRoomAudience1790909745748 {
	name = 'RedPacketRoomAudience1790909745748';

	async up(queryRunner) {
		await queryRunner.query('ALTER TABLE "red_packet" ADD "roomId" character varying(32)');
		await queryRunner.query('CREATE INDEX "IDX_red_packet_room" ON "red_packet" ("roomId")');
		await queryRunner.query('ALTER TABLE "red_packet" ADD CONSTRAINT "FK_red_packet_room" FOREIGN KEY ("roomId") REFERENCES "chat_room"("id") ON DELETE SET NULL ON UPDATE NO ACTION');
	}

	async down(queryRunner) {
		// 回滚时固定为当前成员名单，避免丢失群限制后变成公开红包；金额与领取记录不变。
		await queryRunner.query(`INSERT INTO "red_packet_recipient" ("redPacketId", "userId")
			SELECT packet.id, members."userId" FROM "red_packet" packet
			JOIN (SELECT "roomId", "userId" FROM "chat_room_membership" UNION SELECT id AS "roomId", "ownerId" AS "userId" FROM "chat_room") members ON members."roomId" = packet."roomId"
			WHERE packet.audience = 'room' AND members."userId" <> packet."userId"
			ON CONFLICT DO NOTHING`);
		await queryRunner.query("UPDATE \"red_packet\" SET audience = 'recipients' WHERE audience = 'room'");
		await queryRunner.query('ALTER TABLE "red_packet" DROP CONSTRAINT "FK_red_packet_room"');
		await queryRunner.query('DROP INDEX "IDX_red_packet_room"');
		await queryRunner.query('ALTER TABLE "red_packet" DROP COLUMN "roomId"');
	}
}
