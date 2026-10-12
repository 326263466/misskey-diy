/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 只跟踪内容字段，浏览数、反应数等更新不重新解析附件。
const sources = [
	['note', 'id', ['fileIds', 'text', 'cw']],
	['page', 'id', ['eyeCatchingImageId', 'content', 'variables', 'script', 'summary']],
	['article_comment', 'id', ['text']],
	['chat_message', 'id', ['fileId', 'text']],
	['chat_room', 'id', ['avatarId', 'description']],
	['note_draft', 'id', ['fileIds', 'text', 'cw']],
	['drive_file_draft', 'draft', ['data']],
	['user', 'id', ['avatarId', 'bannerId', 'avatarUrl', 'bannerUrl']],
	['user_profile', 'userId', ['description', 'fields', 'followedMessage']],
	['channel', 'id', ['bannerId', 'description']],
	['gallery_post', 'id', ['fileIds', 'description']],
	['clip', 'id', ['description']],
	['registry_item', 'id', ['value']],
	['access_token', 'id', ['iconUrl']],
	['flash', 'id', ['script', 'summary']],
	['red_packet', 'id', ['coverFileId', 'coverUrl']],
	['announcement', 'id', ['imageUrl', 'text']],
	['role', 'id', ['iconUrl', 'description']],
	['ad', 'id', ['imageUrl', 'url']],
	['emoji', 'id', ['originalUrl', 'publicUrl']],
	['avatar_decoration', 'id', ['url']],
	['instance', 'id', ['iconUrl', 'faviconUrl']],
	['meta', 'id', ['mascotImageUrl', 'bannerUrl', 'backgroundImageUrl', 'logoImageUrl', 'iconUrl', 'app192IconUrl', 'app512IconUrl', 'serverErrorImageUrl', 'notFoundImageUrl', 'infoImageUrl', 'description']],
	['feedback', 'id', ['description', 'response']],
	['abuse_user_report', 'id', ['snapshot', 'comment', 'moderationNote']],
];

export class DriveFileLifecycle1791215330183 {
	name = 'DriveFileLifecycle1791215330183';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "drive_file" ADD "isManaged" boolean NOT NULL DEFAULT false, ADD "isPinned" boolean NOT NULL DEFAULT true, ADD "cleanupAt" timestamp with time zone, ADD "deletingAt" timestamp with time zone`);
		await queryRunner.query(`CREATE INDEX "IDX_drive_file_cleanup_at" ON "drive_file" ("cleanupAt")`);
		await queryRunner.query(`CREATE TABLE "drive_file_reference" (
			"fileId" character varying(32) NOT NULL,
			"sourceType" character varying(64) NOT NULL,
			"sourceId" character varying(160) NOT NULL,
			CONSTRAINT "PK_drive_file_reference" PRIMARY KEY ("fileId", "sourceType", "sourceId"),
			CONSTRAINT "FK_drive_file_reference_file" FOREIGN KEY ("fileId") REFERENCES "drive_file"("id") ON DELETE CASCADE ON UPDATE NO ACTION
		)`);
		await queryRunner.query(`CREATE INDEX "IDX_drive_file_reference_source" ON "drive_file_reference" ("sourceType", "sourceId")`);
		await queryRunner.query(`CREATE TABLE "drive_file_target" (
			"fileId" character varying(32) NOT NULL,
			"kind" character varying(32) NOT NULL,
			"token" text NOT NULL,
			"tokenHash" character varying(32) NOT NULL,
			CONSTRAINT "PK_drive_file_target" PRIMARY KEY ("fileId", "kind"),
			CONSTRAINT "FK_drive_file_target_file" FOREIGN KEY ("fileId") REFERENCES "drive_file"("id") ON DELETE CASCADE ON UPDATE NO ACTION
		)`);
		await queryRunner.query(`CREATE INDEX "IDX_drive_file_target_hash" ON "drive_file_target" ("tokenHash")`);
		await queryRunner.query(`CREATE TABLE "drive_file_draft" (
			"userId" character varying(32) NOT NULL,
			"draftId" character varying(100) NOT NULL,
			"data" jsonb NOT NULL DEFAULT '{}',
			"updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
			CONSTRAINT "PK_drive_file_draft" PRIMARY KEY ("userId", "draftId"),
			CONSTRAINT "FK_drive_file_draft_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
		)`);
		await this.installTracking(queryRunner);
	}

	// 测试数据库通过 synchronize 建表后也使用同一套数据库约束。
	async installTracking(queryRunner) {
		for (const [table] of sources) {
			await queryRunner.query(`DROP TRIGGER IF EXISTS drive_file_source_write ON "${table}"`);
			await queryRunner.query(`DROP TRIGGER IF EXISTS drive_file_source_delete ON "${table}"`);
		}
		await queryRunner.query(`DROP TRIGGER IF EXISTS drive_file_cleanup_policy ON "drive_file"`);
		await queryRunner.query(`DROP TRIGGER IF EXISTS drive_file_targets_write ON "drive_file"`);
		await queryRunner.query(`DROP TRIGGER IF EXISTS drive_file_targets_delete ON "drive_file"`);
		await queryRunner.query(`DROP TRIGGER IF EXISTS drive_file_reference_insert ON "drive_file_reference"`);
		await queryRunner.query(`DROP TRIGGER IF EXISTS drive_file_reference_delete ON "drive_file_reference"`);
		await queryRunner.query(String.raw`
			CREATE OR REPLACE FUNCTION drive_file_decode_uri(input text) RETURNS text
			LANGUAGE plpgsql IMMUTABLE STRICT AS $body$
			DECLARE
				hex_bytes text;
			BEGIN
				IF position('%' IN input) = 0 THEN RETURN input; END IF;
				SELECT string_agg(CASE WHEN part[1] ~ '^%[0-9A-Fa-f]{2}$' THEN substring(part[1] FROM 2)
					ELSE encode(convert_to(part[1], 'UTF8'), 'hex') END, '' ORDER BY ordinal)
				INTO hex_bytes FROM regexp_matches(input, '%[0-9A-Fa-f]{2}|[^%]+|%', 'g') WITH ORDINALITY AS parts(part, ordinal);
				RETURN convert_from(decode(hex_bytes, 'hex'), 'UTF8');
			EXCEPTION WHEN character_not_in_repertoire OR untranslatable_character THEN
				RETURN input;
			END
			$body$;
		`);
		await queryRunner.query(String.raw`
			CREATE OR REPLACE FUNCTION drive_file_url_token(input text) RETURNS text
			LANGUAGE plpgsql IMMUTABLE STRICT AS $body$
			DECLARE
				value text;
				parts text[];
				origin text := '';
				path text;
				segments text[];
				normalized_segments text[] := ARRAY[]::text[];
				segment text;
				i integer;
			BEGIN
				value := drive_file_decode_uri(drive_file_decode_uri(replace(input, chr(92), '')));
				value := replace(value, '&amp;', '&');
				value := regexp_replace(value, '[?#].*$', '');
				IF left(value, 1) = '/' AND left(value, 2) <> '//' THEN path := value;
				ELSE
					parts := regexp_match(value, '^(https?://)([^/]+)(.*)$', 'i');
					IF parts IS NULL OR parts[2] LIKE '%@%' THEN RETURN NULL; END IF;
					parts[2] := lower(parts[2]);
					IF lower(parts[1]) = 'https://' THEN parts[2] := regexp_replace(parts[2], ':443$', '');
					ELSE parts[2] := regexp_replace(parts[2], ':80$', ''); END IF;
					origin := lower(parts[1]) || parts[2];
					path := CASE WHEN parts[3] = '' THEN '/' ELSE parts[3] END;
				END IF;
				-- 浏览器请求前会消解点路径；保留普通空路径段，并阻止 .. 越过根目录。
				segments := string_to_array(path, '/');
				FOR i IN 2..cardinality(segments) LOOP
					segment := segments[i];
					IF segment = '..' THEN
						IF cardinality(normalized_segments) > 0 THEN
							normalized_segments := normalized_segments[1:cardinality(normalized_segments) - 1];
						END IF;
					ELSIF segment <> '.' THEN normalized_segments := array_append(normalized_segments, segment);
					END IF;
				END LOOP;
				IF right(path, 2) = '/.' OR right(path, 3) = '/..' THEN normalized_segments := array_append(normalized_segments, ''); END IF;
				path := '/' || array_to_string(normalized_segments, '/');
				IF origin = '' AND path NOT LIKE '/files/%' THEN RETURN NULL; END IF;
				RETURN 'url:' || origin || path;
			END
			$body$;
		`);
		await queryRunner.query(String.raw`
			CREATE OR REPLACE FUNCTION drive_file_tokens(payload jsonb) RETURNS TABLE(token text)
			LANGUAGE plpgsql IMMUTABLE STRICT AS $body$
			DECLARE
				value text;
				variant text;
				candidate text[];
				address text;
			BEGIN
				FOR value IN SELECT item #>> '{}' FROM jsonb_path_query(payload, 'strict $.** ? (@.type() == "string")') AS item LOOP
					IF value ~ '^[a-zA-Z0-9]{1,32}$' THEN
						token := 'id:' || value; RETURN NEXT;
					END IF;
					value := replace(replace(value, chr(92), ''), '&amp;', '&');
					FOR variant IN SELECT DISTINCT unnest(ARRAY[value, CASE WHEN value ~* '^(https?%3A%2F%2F|%2Ffiles%2F)' THEN drive_file_decode_uri(value) ELSE value END]) LOOP
						FOR candidate IN
							-- 绝对 URL 可紧贴中文；相对路径仍需分隔，避免把其他主机的路径当成本地文件。
							SELECT regexp_matches(variant, $regexp$https?://[^[:space:]<>"'\x60]+$regexp$, 'gi')
							UNION SELECT regexp_matches(variant, $regexp$https?://[^[:space:]<>"'\x60()\[\]{},;]+$regexp$, 'gi')
							UNION SELECT regexp_matches(variant, $regexp$(?:^|[[:space:]<>"'\x60(\[{=])(/(?!/)[^[:space:]<>"'\x60]+)$regexp$, 'gi')
							UNION SELECT regexp_matches(variant, $regexp$(?:^|[[:space:]<>"'\x60(\[{=])(/(?!/)[^[:space:]<>"'\x60()\[\]{},;]+)$regexp$, 'gi')
						LOOP
							address := candidate[1];
							LOOP
								token := drive_file_url_token(address);
								IF token IS NOT NULL THEN RETURN NEXT; END IF;
								-- Markdown 和 MFM 的结束符也可能属于文件名，因此保留逐步裁剪前后的候选。
								EXIT WHEN right(address, 1) !~ $punct$[)\]},.;!?，。；！]$punct$;
								address := left(address, length(address) - 1);
							END LOOP;
						END LOOP;
					END LOOP;
				END LOOP;
			END
			$body$;
		`);
		await queryRunner.query(`
			CREATE OR REPLACE FUNCTION drive_file_update_targets(row_data jsonb) RETURNS void
			LANGUAGE plpgsql AS $body$
			DECLARE
				field text;
				value text;
			BEGIN
				DELETE FROM "drive_file_target" WHERE "fileId" = row_data->>'id';
				INSERT INTO "drive_file_target" ("fileId", "kind", "token", "tokenHash")
				VALUES (row_data->>'id', 'id', 'id:' || (row_data->>'id'), md5('id:' || (row_data->>'id')));
				FOREACH field IN ARRAY ARRAY['url', 'thumbnailUrl', 'webpublicUrl', 'accessKey', 'thumbnailAccessKey', 'webpublicAccessKey'] LOOP
					value := row_data->>field;
					IF field LIKE '%Key' THEN
						IF NOT (row_data->>'storedInternal')::boolean THEN CONTINUE; END IF;
						value := '/files/' || value;
					END IF;
					value := drive_file_url_token(value);
					IF value IS NOT NULL THEN
						INSERT INTO "drive_file_target" ("fileId", "kind", "token", "tokenHash")
						VALUES (row_data->>'id', field, value, md5(value));
					END IF;
				END LOOP;
			END
			$body$;
		`);
		await queryRunner.query(`
			CREATE OR REPLACE FUNCTION drive_file_targets_trigger() RETURNS trigger
			LANGUAGE plpgsql AS $body$
			BEGIN
				PERFORM drive_file_update_targets(to_jsonb(NEW));
				RETURN NEW;
			END
			$body$;
			CREATE TRIGGER drive_file_targets_write AFTER INSERT OR UPDATE OF "url", "thumbnailUrl", "webpublicUrl", "accessKey", "thumbnailAccessKey", "webpublicAccessKey", "storedInternal"
			ON "drive_file" FOR EACH ROW EXECUTE FUNCTION drive_file_targets_trigger();
		`);
		await queryRunner.query(`
			CREATE OR REPLACE FUNCTION drive_file_targets_before_delete() RETURNS trigger
			LANGUAGE plpgsql AS $body$
			BEGIN
				-- 外键置空可能保留旧 URL；先移除本事务内的匹配目标，避免级联更新重新登记它。
				DELETE FROM "drive_file_target" WHERE "fileId" = OLD."id";
				RETURN OLD;
			END
			$body$;
			CREATE TRIGGER drive_file_targets_delete BEFORE DELETE ON "drive_file"
			FOR EACH ROW EXECUTE FUNCTION drive_file_targets_before_delete();
		`);
		await queryRunner.query(`
			CREATE OR REPLACE FUNCTION drive_file_reference_guard() RETURNS trigger
			LANGUAGE plpgsql AS $body$
			DECLARE
				deleting_at timestamp with time zone;
			BEGIN
				SELECT "deletingAt" INTO deleting_at FROM "drive_file" WHERE "id" = NEW."fileId" FOR UPDATE;
				IF NOT FOUND OR deleting_at IS NOT NULL THEN
					RAISE EXCEPTION 'Drive file is being deleted or no longer exists' USING ERRCODE = '23514', CONSTRAINT = 'CHK_drive_file_reference_available';
				END IF;
				UPDATE "drive_file" SET "cleanupAt" = NULL WHERE "id" = NEW."fileId" AND "cleanupAt" IS NOT NULL;
				RETURN NEW;
			END
			$body$;
			CREATE TRIGGER drive_file_reference_insert BEFORE INSERT OR UPDATE ON "drive_file_reference"
			FOR EACH ROW EXECUTE FUNCTION drive_file_reference_guard();
		`);
		await queryRunner.query(`
			CREATE OR REPLACE FUNCTION drive_file_reference_removed() RETURNS trigger
			LANGUAGE plpgsql AS $body$
			BEGIN
				PERFORM 1 FROM "drive_file" WHERE "id" = OLD."fileId" FOR UPDATE;
				IF FOUND THEN
					UPDATE "drive_file" SET "cleanupAt" = CURRENT_TIMESTAMP + interval '7 days'
					WHERE "id" = OLD."fileId" AND "isManaged" AND NOT "isPinned" AND "deletingAt" IS NULL
					AND NOT EXISTS (SELECT 1 FROM "drive_file_reference" WHERE "fileId" = OLD."fileId");
				END IF;
				RETURN OLD;
			END
			$body$;
			CREATE TRIGGER drive_file_reference_delete AFTER DELETE OR UPDATE OF "fileId" ON "drive_file_reference"
			FOR EACH ROW EXECUTE FUNCTION drive_file_reference_removed();
		`);
		await queryRunner.query(`
			CREATE OR REPLACE FUNCTION drive_file_manage_cleanup() RETURNS trigger
			LANGUAGE plpgsql AS $body$
			BEGIN
				IF TG_OP = 'UPDATE' AND OLD."deletingAt" IS NOT NULL THEN
					RAISE EXCEPTION 'Drive file is being deleted' USING ERRCODE = '23514', CONSTRAINT = 'CHK_drive_file_reference_available';
				END IF;
				IF NEW."isManaged" AND NOT NEW."isPinned"
					AND NOT EXISTS (SELECT 1 FROM "drive_file_reference" WHERE "fileId" = NEW."id") THEN
					NEW."cleanupAt" := COALESCE(NEW."cleanupAt", CURRENT_TIMESTAMP + interval '7 days');
				ELSE NEW."cleanupAt" := NULL;
				END IF;
				RETURN NEW;
			END
			$body$;
			CREATE TRIGGER drive_file_cleanup_policy BEFORE INSERT OR UPDATE OF "isManaged", "isPinned"
			ON "drive_file" FOR EACH ROW EXECUTE FUNCTION drive_file_manage_cleanup();
		`);
		await queryRunner.query(`
			CREATE OR REPLACE FUNCTION drive_file_direct_ids(payload jsonb, source_type text) RETURNS character varying[]
			LANGUAGE sql IMMUTABLE AS $body$
				SELECT COALESCE(array_agg(DISTINCT value::character varying), ARRAY[]::character varying[]) FROM (
					SELECT item #>> '{}' AS value FROM jsonb_path_query(payload, 'lax $.fileIds[*]') AS item
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
		await queryRunner.query(`
			CREATE OR REPLACE FUNCTION drive_file_sync_references(source_type text, source_id text, payload jsonb, strict_direct boolean DEFAULT true, previous_payload jsonb DEFAULT '{}') RETURNS void
			LANGUAGE plpgsql AS $body$
			DECLARE
				next_ids character varying[];
				direct_ids character varying[] := ARRAY[]::character varying[];
				candidate_id character varying;
				deleting_at timestamp with time zone;
			BEGIN
				SELECT COALESCE(array_agg(DISTINCT target."fileId"), ARRAY[]::character varying[])
				INTO next_ids FROM (SELECT DISTINCT token FROM drive_file_tokens(payload)) AS candidate
				INNER JOIN "drive_file_target" AS target ON target."tokenHash" = md5(candidate.token) AND target."token" = candidate.token;
				-- 新增附件 ID 不能因目标刚被回收而漏登记；既有失效 ID 不阻止编辑历史内容。
				IF strict_direct THEN
					SELECT COALESCE(array_agg(value), ARRAY[]::character varying[]) INTO direct_ids
					FROM unnest(drive_file_direct_ids(payload, source_type)) AS value
					WHERE NOT (value = ANY(drive_file_direct_ids(previous_payload, source_type)));
					next_ids := next_ids || direct_ids;
				END IF;
				-- 与回收器使用同一行锁；等待后必须重新检查文件状态。
				FOR candidate_id IN
					SELECT file_id FROM (
						SELECT unnest(next_ids) AS file_id UNION
						SELECT "fileId" FROM "drive_file_reference" WHERE "sourceType" = source_type AND "sourceId" = source_id
					) AS affected ORDER BY file_id
				LOOP
					SELECT "deletingAt" INTO deleting_at FROM "drive_file" WHERE "id" = candidate_id FOR UPDATE;
					IF candidate_id = ANY(next_ids) AND (NOT FOUND OR deleting_at IS NOT NULL) THEN
						RAISE EXCEPTION 'Drive file is being deleted or no longer exists' USING ERRCODE = '23514', CONSTRAINT = 'CHK_drive_file_reference_available';
					END IF;
				END LOOP;
				INSERT INTO "drive_file_reference" ("fileId", "sourceType", "sourceId")
				SELECT unnest(next_ids), source_type, source_id ON CONFLICT DO NOTHING;
				DELETE FROM "drive_file_reference" WHERE "sourceType" = source_type AND "sourceId" = source_id AND NOT ("fileId" = ANY(next_ids));
			END
			$body$;
		`);
		await queryRunner.query(`
			CREATE OR REPLACE FUNCTION drive_file_source_trigger() RETURNS trigger
			LANGUAGE plpgsql AS $body$
			DECLARE
				row_data jsonb;
				old_data jsonb;
				payload jsonb;
				previous_payload jsonb := '{}';
				source_id text;
				old_source_id text;
				fields text[] := string_to_array(TG_ARGV[1], ',');
			BEGIN
				IF TG_OP = 'DELETE' THEN row_data := to_jsonb(OLD); ELSE row_data := to_jsonb(NEW); END IF;
				IF TG_ARGV[0] = 'draft' THEN source_id := (row_data->>'userId') || ':' || (row_data->>'draftId');
				ELSE source_id := row_data->>TG_ARGV[0]; END IF;
				IF TG_OP = 'DELETE' THEN
					PERFORM drive_file_sync_references(TG_TABLE_NAME, source_id, '{}'::jsonb);
					RETURN OLD;
				END IF;
				SELECT jsonb_object_agg(field, row_data->field) INTO payload FROM unnest(fields) AS field;
				IF TG_OP = 'UPDATE' THEN
					old_data := to_jsonb(OLD);
					IF TG_ARGV[0] = 'draft' THEN old_source_id := (old_data->>'userId') || ':' || (old_data->>'draftId');
					ELSE old_source_id := old_data->>TG_ARGV[0]; END IF;
					SELECT jsonb_object_agg(field, old_data->field) INTO previous_payload FROM unnest(fields) AS field;
					IF source_id = old_source_id AND payload IS NOT DISTINCT FROM previous_payload THEN RETURN NEW; END IF;
					IF source_id <> old_source_id THEN PERFORM drive_file_sync_references(TG_TABLE_NAME, old_source_id, '{}'::jsonb); END IF;
				END IF;
				PERFORM drive_file_sync_references(TG_TABLE_NAME, source_id, payload, true, previous_payload);
				RETURN NEW;
			END
			$body$;
		`);
		await queryRunner.query(`DO $body$ DECLARE file record; BEGIN FOR file IN SELECT * FROM "drive_file" LOOP PERFORM drive_file_update_targets(to_jsonb(file)); END LOOP; END $body$`);
		for (const [table, sourceKey, fields] of sources) {
			const keyFields = sourceKey === 'draft' ? ['userId', 'draftId'] : [sourceKey];
			const updatedFields = [...keyFields, ...fields].map(field => `"${field}"`).join(', ');
			await queryRunner.query(`CREATE TRIGGER drive_file_source_write AFTER INSERT OR UPDATE OF ${updatedFields} ON "${table}" FOR EACH ROW EXECUTE FUNCTION drive_file_source_trigger('${sourceKey}', '${fields.join(',')}')`);
			await queryRunner.query(`CREATE TRIGGER drive_file_source_delete AFTER DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION drive_file_source_trigger('${sourceKey}', '${fields.join(',')}')`);
			const sourceId = sourceKey === 'draft' ? `source."userId" || ':' || source."draftId"` : `source."${sourceKey}"`;
			const payload = fields.map(field => `'${field}', source."${field}"`).join(', ');
			await queryRunner.query(`DO $body$ DECLARE source record; BEGIN FOR source IN SELECT * FROM "${table}" LOOP PERFORM drive_file_sync_references('${table}', ${sourceId}, jsonb_build_object(${payload}), false); END LOOP; END $body$`);
		}
	}

	async down(queryRunner) {
		for (const [table] of sources) {
			await queryRunner.query(`DROP TRIGGER drive_file_source_write ON "${table}"`);
			await queryRunner.query(`DROP TRIGGER drive_file_source_delete ON "${table}"`);
		}
		await queryRunner.query(`DROP TRIGGER drive_file_cleanup_policy ON "drive_file"`);
		await queryRunner.query(`DROP TRIGGER drive_file_targets_write ON "drive_file"`);
		await queryRunner.query(`DROP TRIGGER drive_file_targets_delete ON "drive_file"`);
		await queryRunner.query(`DROP TRIGGER drive_file_reference_insert ON "drive_file_reference"`);
		await queryRunner.query(`DROP TRIGGER drive_file_reference_delete ON "drive_file_reference"`);
		await queryRunner.query(`DROP FUNCTION drive_file_source_trigger()`);
		await queryRunner.query(`DROP FUNCTION drive_file_sync_references(text, text, jsonb, boolean, jsonb)`);
		await queryRunner.query(`DROP FUNCTION drive_file_direct_ids(jsonb, text)`);
		await queryRunner.query(`DROP FUNCTION drive_file_manage_cleanup()`);
		await queryRunner.query(`DROP FUNCTION drive_file_reference_removed()`);
		await queryRunner.query(`DROP FUNCTION drive_file_reference_guard()`);
		await queryRunner.query(`DROP FUNCTION drive_file_targets_trigger()`);
		await queryRunner.query(`DROP FUNCTION drive_file_targets_before_delete()`);
		await queryRunner.query(`DROP FUNCTION drive_file_update_targets(jsonb)`);
		await queryRunner.query(`DROP FUNCTION drive_file_tokens(jsonb)`);
		await queryRunner.query(`DROP FUNCTION drive_file_url_token(text)`);
		await queryRunner.query(`DROP FUNCTION drive_file_decode_uri(text)`);
		await queryRunner.query(`DROP TABLE "drive_file_draft"`);
		await queryRunner.query(`DROP TABLE "drive_file_target"`);
		await queryRunner.query(`DROP TABLE "drive_file_reference"`);
		await queryRunner.query(`DROP INDEX "IDX_drive_file_cleanup_at"`);
		await queryRunner.query(`ALTER TABLE "drive_file" DROP COLUMN "deletingAt", DROP COLUMN "cleanupAt", DROP COLUMN "isPinned", DROP COLUMN "isManaged"`);
	}
}
