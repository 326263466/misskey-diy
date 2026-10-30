/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const sources = [
	['note', 'notes', 'id', ['text', 'cw', 'userId', 'userHost', 'channelId', 'visibility', 'visibleUserIds', 'threadId', 'deletedBy', 'repliesCount', 'renoteCount', 'reactions']],
	['page', 'articles', 'id', ['title', 'summary', 'content', 'visibility', 'userId', 'articleCategoryId', 'likedCount']],
	['user', 'users', 'id', ['name', 'username', 'usernameLower', 'host', 'isSuspended', 'isDeleted', 'updatedAt']],
	['user_profile', 'users', 'userId', ['description']],
];

export class SearchIndexOutbox1793091571749 {
	name = 'SearchIndexOutbox1793091571749';

	static async installTriggers(queryRunner) {
		await queryRunner.query(`CREATE OR REPLACE FUNCTION public.misskey_enqueue_search_index() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN
			IF EXISTS (SELECT 1 FROM search_index_state WHERE id = 0 AND enabled) THEN
				INSERT INTO search_index_job (kind, "documentId")
				VALUES (TG_ARGV[0], CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)->>TG_ARGV[1] ELSE to_jsonb(NEW)->>TG_ARGV[1] END)
				ON CONFLICT (kind, "documentId") DO UPDATE
				SET revision = search_index_job.revision + 1, "updatedAt" = now();
			END IF;
			RETURN NULL;
		END $$`);
		for (const [table, kind, key, fields] of sources) {
			await queryRunner.query(`CREATE TRIGGER search_index_change AFTER INSERT OR DELETE OR UPDATE OF ${fields.map(field => `"${field}"`).join(', ')} ON "${table}"
				FOR EACH ROW EXECUTE FUNCTION public.misskey_enqueue_search_index('${kind}', '${key}')`);
		}
	}

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE search_index_state (
			id integer NOT NULL DEFAULT 0,
			enabled boolean NOT NULL DEFAULT false,
			ready boolean NOT NULL DEFAULT false,
			target varchar(64) NOT NULL DEFAULT '',
			CONSTRAINT "PK_search_index_state" PRIMARY KEY (id)
		)`);
		await queryRunner.query(`CREATE TABLE search_index_job (
			kind varchar(16) NOT NULL,
			"documentId" varchar(32) NOT NULL,
			revision bigint NOT NULL DEFAULT 0,
			"updatedAt" timestamptz NOT NULL DEFAULT now(),
			CONSTRAINT "PK_search_index_job" PRIMARY KEY (kind, "documentId")
		)`);
		await queryRunner.query('CREATE INDEX "IDX_search_index_job_updated_at" ON search_index_job ("updatedAt")');
		await queryRunner.query('INSERT INTO search_index_state (id) VALUES (0)');
		await SearchIndexOutbox1793091571749.installTriggers(queryRunner);
	}

	async down(queryRunner) {
		for (const [table] of sources.toReversed()) {
			await queryRunner.query(`DROP TRIGGER search_index_change ON "${table}"`);
		}
		await queryRunner.query('DROP FUNCTION public.misskey_enqueue_search_index()');
		await queryRunner.query('DROP TABLE search_index_job');
		await queryRunner.query('DROP TABLE search_index_state');
	}
}
