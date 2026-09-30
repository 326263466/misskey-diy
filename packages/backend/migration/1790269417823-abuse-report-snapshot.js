/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AbuseReportSnapshot1790269417823 {
    name = 'AbuseReportSnapshot1790269417823';

    async up(queryRunner) {
        await queryRunner.query('ALTER TABLE "abuse_user_report" ALTER COLUMN "comment" TYPE text');
        await queryRunner.query('ALTER TABLE "abuse_user_report" DROP CONSTRAINT "FK_a9021cc2e1feb5f72d3db6e9f5f"');
        await queryRunner.query('ALTER TABLE "abuse_user_report" DROP CONSTRAINT "FK_04cc96756f89d0b7f9473e8cdf3"');
        await queryRunner.query('ALTER TABLE "abuse_user_report" ADD "snapshot" jsonb');
        await queryRunner.query('ALTER TABLE "abuse_user_report" ADD "reason" character varying(256)');
        await queryRunner.query('ALTER TABLE "abuse_user_report" ADD "requestId" character varying(36)');
        await queryRunner.query('ALTER TABLE "abuse_user_report" ADD "requestFingerprint" character varying(64)');
        await queryRunner.query('CREATE UNIQUE INDEX "IDX_abuse_user_report_reporter_request" ON "abuse_user_report" ("reporterId", "requestId")');
        await queryRunner.query(`CREATE FUNCTION "prevent_abuse_report_evidence_update"() RETURNS trigger AS $$
            BEGIN
                IF OLD."snapshot" IS DISTINCT FROM NEW."snapshot"
                    OR OLD."reason" IS DISTINCT FROM NEW."reason"
                    OR OLD."comment" IS DISTINCT FROM NEW."comment"
                    OR OLD."targetUserId" IS DISTINCT FROM NEW."targetUserId"
                    OR OLD."reporterId" IS DISTINCT FROM NEW."reporterId"
                    OR OLD."requestId" IS DISTINCT FROM NEW."requestId"
                    OR OLD."requestFingerprint" IS DISTINCT FROM NEW."requestFingerprint"
                    OR OLD."targetUserHost" IS DISTINCT FROM NEW."targetUserHost"
                    OR OLD."reporterHost" IS DISTINCT FROM NEW."reporterHost" THEN
                    RAISE EXCEPTION 'Abuse report evidence is immutable';
                END IF;
                RETURN NEW;
            END;
        $$ LANGUAGE plpgsql`);
        await queryRunner.query('CREATE TRIGGER "abuse_report_evidence_immutable" BEFORE UPDATE ON "abuse_user_report" FOR EACH ROW EXECUTE FUNCTION "prevent_abuse_report_evidence_update"()');
    }

    async down(queryRunner) {
        await queryRunner.query(`DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM "abuse_user_report" WHERE char_length("comment") > 2048) THEN
                RAISE EXCEPTION 'Cannot revert report storage while long evidence descriptions exist';
            END IF;
        END $$`);
        await queryRunner.query('ALTER TABLE "abuse_user_report" ALTER COLUMN "comment" TYPE character varying(2048)');
        await queryRunner.query('DROP TRIGGER "abuse_report_evidence_immutable" ON "abuse_user_report"');
        await queryRunner.query('DROP FUNCTION "prevent_abuse_report_evidence_update"()');
        await queryRunner.query('DROP INDEX "IDX_abuse_user_report_reporter_request"');
        await queryRunner.query('ALTER TABLE "abuse_user_report" DROP COLUMN "requestFingerprint"');
        await queryRunner.query('ALTER TABLE "abuse_user_report" DROP COLUMN "requestId"');
        await queryRunner.query('ALTER TABLE "abuse_user_report" DROP COLUMN "reason"');
        await queryRunner.query('ALTER TABLE "abuse_user_report" DROP COLUMN "snapshot"');
        await queryRunner.query('ALTER TABLE "abuse_user_report" ADD CONSTRAINT "FK_a9021cc2e1feb5f72d3db6e9f5f" FOREIGN KEY ("targetUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID');
        await queryRunner.query('ALTER TABLE "abuse_user_report" ADD CONSTRAINT "FK_04cc96756f89d0b7f9473e8cdf3" FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID');
    }
}
