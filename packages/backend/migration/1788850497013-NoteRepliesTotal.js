/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class NoteRepliesTotal1788850497013 {
	name = 'NoteRepliesTotal1788850497013';

	async up(queryRunner) {
		await queryRunner.query('LOCK TABLE note IN SHARE ROW EXCLUSIVE MODE');
		await queryRunner.query(`
			WITH RECURSIVE replies AS (
				SELECT "replyId" AS ancestor, id FROM note WHERE "replyId" IS NOT NULL
				UNION
				SELECT r.ancestor, n.id FROM note n INNER JOIN replies r ON n."replyId" = r.id
			), totals AS (
				SELECT ancestor, COUNT(*)::integer AS total FROM replies GROUP BY ancestor
			), counts AS (
				SELECT n.id, COALESCE(t.total, 0) AS total FROM note n LEFT JOIN totals t ON t.ancestor = n.id
			)
			UPDATE note n SET "repliesCount" = counts.total FROM counts
			WHERE n.id = counts.id AND n."repliesCount" <> counts.total
		`);
	}

	async down(queryRunner) {
		await queryRunner.query('LOCK TABLE note IN SHARE ROW EXCLUSIVE MODE');
		await queryRunner.query(`
			WITH totals AS (
				SELECT "replyId", COUNT(*)::integer AS total FROM note
				WHERE "replyId" IS NOT NULL AND ("threadId" IS NULL OR "threadId" NOT LIKE 'reply-hidden:deleted:%')
				GROUP BY "replyId"
			), counts AS (
				SELECT n.id, COALESCE(t.total, 0) AS total FROM note n LEFT JOIN totals t ON t."replyId" = n.id
			)
			UPDATE note n SET "repliesCount" = counts.total FROM counts
			WHERE n.id = counts.id AND n."repliesCount" <> counts.total
		`);
	}
}
