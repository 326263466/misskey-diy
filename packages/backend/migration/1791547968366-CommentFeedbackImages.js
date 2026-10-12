/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CommentFeedbackImages1791547968366 {
	name = 'CommentFeedbackImages1791547968366';

	async updateDirectIds(queryRunner, includeResponses) {
		await queryRunner.query(`
			CREATE OR REPLACE FUNCTION drive_file_direct_ids(payload jsonb, source_type text) RETURNS character varying[]
			LANGUAGE sql IMMUTABLE AS $body$
				SELECT COALESCE(array_agg(DISTINCT value::character varying), ARRAY[]::character varying[]) FROM (
					SELECT item #>> '{}' AS value FROM jsonb_path_query(payload, 'lax $.fileIds[*]') AS item
					${includeResponses ? "UNION SELECT item #>> '{}' FROM jsonb_path_query(payload, 'lax $.responseFileIds[*]') AS item" : ''}
					UNION SELECT item #>> '{}' FROM jsonb_path_query(payload, 'lax $.data.fileIds[*]') AS item
					UNION SELECT payload->>'fileId'
					UNION SELECT payload->>'avatarId'
					UNION SELECT payload->>'bannerId'
					UNION SELECT payload->>'eyeCatchingImageId'
					UNION SELECT payload->>'coverFileId'
					UNION SELECT item #>> '{}' FROM jsonb_path_query(payload, 'lax $.content.**.fileId') AS item WHERE source_type = 'page'
				) AS direct WHERE value IS NOT NULL AND value <> ''
			$body$;
		`);
	}

	async updateReferences(queryRunner, table, fields) {
		await queryRunner.query(`DROP TRIGGER drive_file_source_write ON "${table}"`);
		await queryRunner.query(`DROP TRIGGER drive_file_source_delete ON "${table}"`);
		const columns = ['id', ...fields].map(field => `"${field}"`).join(', ');
		await queryRunner.query(`CREATE TRIGGER drive_file_source_write AFTER INSERT OR UPDATE OF ${columns} ON "${table}" FOR EACH ROW EXECUTE FUNCTION drive_file_source_trigger('id', '${fields.join(',')}')`);
		await queryRunner.query(`CREATE TRIGGER drive_file_source_delete AFTER DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION drive_file_source_trigger('id', '${fields.join(',')}')`);
		const payload = fields.map(field => `'${field}', source."${field}"`).join(', ');
		await queryRunner.query(`SELECT drive_file_sync_references('${table}', source.id, jsonb_build_object(${payload})) FROM "${table}" source`);
	}

	async installTracking(queryRunner) {
		await this.updateDirectIds(queryRunner, true);
		await this.updateReferences(queryRunner, 'article_comment', ['text', 'fileIds']);
		await this.updateReferences(queryRunner, 'feedback', ['description', 'response', 'fileIds', 'responseFileIds']);
	}

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "article_comment" ADD "fileIds" character varying(32) array NOT NULL DEFAULT '{}'`);
		await queryRunner.query(`ALTER TABLE "feedback" ADD "fileIds" character varying(32) array NOT NULL DEFAULT '{}'`);
		await queryRunner.query(`ALTER TABLE "feedback" ADD "responseFileIds" character varying(32) array NOT NULL DEFAULT '{}'`);
		await this.installTracking(queryRunner);
	}

	async down(queryRunner) {
		await this.updateReferences(queryRunner, 'article_comment', ['text']);
		await this.updateReferences(queryRunner, 'feedback', ['description', 'response']);
		await this.updateDirectIds(queryRunner, false);
		await queryRunner.query(`ALTER TABLE "article_comment" DROP COLUMN "fileIds"`);
		await queryRunner.query(`ALTER TABLE "feedback" DROP COLUMN "fileIds"`);
		await queryRunner.query(`ALTER TABLE "feedback" DROP COLUMN "responseFileIds"`);
	}
}
