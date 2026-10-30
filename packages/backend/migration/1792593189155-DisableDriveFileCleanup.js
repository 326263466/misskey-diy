/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { DriveFileLifecycle1791215330183 } from './1791215330183-DriveFileLifecycle.js';
import { ArticleDrafts1791353790645 } from './1791353790645-ArticleDrafts.js';
import { CommentFeedbackImages1791547968366 } from './1791547968366-CommentFeedbackImages.js';

export class DisableDriveFileCleanup1792593189155 {
	name = 'DisableDriveFileCleanup1792593189155';

	async up(queryRunner) {
		await queryRunner.query(`DROP TRIGGER IF EXISTS drive_file_source_write ON "article_draft"`);
		await queryRunner.query(`DROP TRIGGER IF EXISTS drive_file_source_delete ON "article_draft"`);
		await new DriveFileLifecycle1791215330183().down(queryRunner);
	}

	async down(queryRunner) {
		// 回滚重建旧规则及现存引用；已移除的回收计划和临时草稿登记无法还原。
		await new DriveFileLifecycle1791215330183().up(queryRunner);
		await new CommentFeedbackImages1791547968366().updateDirectIds(queryRunner, true);

		// 原安装器严格检查直接附件；历史回填只登记尚存文件，不拒绝已删除的附件。
		for (const [table, fields] of [
			['article_comment', ['text', 'fileIds']],
			['feedback', ['description', 'response', 'fileIds', 'responseFileIds']],
		]) {
			await queryRunner.query(`DROP TRIGGER drive_file_source_write ON "${table}"`);
			await queryRunner.query(`DROP TRIGGER drive_file_source_delete ON "${table}"`);
			const columns = ['id', ...fields].map(field => `"${field}"`).join(', ');
			await queryRunner.query(`CREATE TRIGGER drive_file_source_write AFTER INSERT OR UPDATE OF ${columns} ON "${table}" FOR EACH ROW EXECUTE FUNCTION drive_file_source_trigger('id', '${fields.join(',')}')`);
			await queryRunner.query(`CREATE TRIGGER drive_file_source_delete AFTER DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION drive_file_source_trigger('id', '${fields.join(',')}')`);
			const payload = fields.map(field => `'${field}', source."${field}"`).join(', ');
			await queryRunner.query(`SELECT drive_file_sync_references('${table}', source."id", jsonb_build_object(${payload}), false) FROM "${table}" source`);
		}

		await new ArticleDrafts1791353790645().installTracking(queryRunner);
		await queryRunner.query(`
			SELECT drive_file_sync_references('article_draft', source."userId" || ':' || source."draftId", jsonb_build_object('data', source."data"), false)
			FROM "article_draft" source WHERE source."data" IS NOT NULL
		`);
	}
}
