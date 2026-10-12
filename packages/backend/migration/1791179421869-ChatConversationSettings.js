/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatConversationSettings1791179421869 {
    name = 'ChatConversationSettings1791179421869';

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "chat_conversation_setting" ("id" character varying(32) NOT NULL, "ownerId" character varying(32) NOT NULL, "userId" character varying(32), "roomId" character varying(32), "notificationMode" character varying(16) NOT NULL DEFAULT 'all', "mutedUntil" TIMESTAMP WITH TIME ZONE, "hidden" boolean NOT NULL DEFAULT false, "hiddenThroughId" character varying(32), "markedUnread" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_chat_conversation_setting" PRIMARY KEY ("id"), CONSTRAINT "CHK_chat_conversation_target" CHECK (("userId" IS NULL) <> ("roomId" IS NULL)), CONSTRAINT "FK_chat_conversation_owner" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE, CONSTRAINT "FK_chat_conversation_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE, CONSTRAINT "FK_chat_conversation_room" FOREIGN KEY ("roomId") REFERENCES "chat_room"("id") ON DELETE CASCADE)`);
        await queryRunner.query('CREATE UNIQUE INDEX "UQ_chat_conversation_user" ON "chat_conversation_setting" ("ownerId", "userId")');
        await queryRunner.query('CREATE UNIQUE INDEX "UQ_chat_conversation_room" ON "chat_conversation_setting" ("ownerId", "roomId")');
        await queryRunner.query('CREATE INDEX "IDX_chat_conversation_room" ON "chat_conversation_setting" ("roomId")');
        await queryRunner.query(`INSERT INTO "chat_conversation_setting" ("id", "ownerId", "roomId", "notificationMode", "mutedUntil") SELECT "id", "userId", "roomId", 'silent', "mutedUntil" FROM "chat_room_membership" WHERE "isMuted" = true`);
        await queryRunner.query(`INSERT INTO "chat_conversation_setting" ("id", "ownerId", "roomId", "notificationMode", "mutedUntil") SELECT "id", "ownerId", "id", 'silent', "ownerMutedUntil" FROM "chat_room" WHERE "ownerIsMuted" = true`);
    }

    async down(queryRunner) {
        await queryRunner.query('DROP TABLE "chat_conversation_setting"');
    }
}
