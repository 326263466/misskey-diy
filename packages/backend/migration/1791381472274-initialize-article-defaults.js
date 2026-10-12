/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 迁移保留当时的默认值，避免后续修改常量改变历史迁移结果。
const defaultTags = ['技术', '生活', '开发', '前端', '后端', '设计', '随笔', '开源', '数据库', 'javascript', 'typescript', 'vue'];
const seedIds = defaultTags.map((_, index) => `article-seed-1791381472274-${index.toString().padStart(2, '0')}`);
const defaultCategories = [
	{ id: 'wrong-place', name: '错误地方' },
	{ id: 'technology', name: '技术交流' },
	{ id: 'resources', name: '资源分享' },
	{ id: 'benefits', name: '福利放送' },
	{ id: 'questions', name: '求助问答' },
	{ id: 'thoughts', name: '深度思考' },
	{ id: 'promotion', name: '我要推广' },
	{ id: 'governance', name: '社区治理' },
	{ id: 'announcements', name: '社区公告' },
	{ id: 'flood-control', name: '大禹治水' },
];

export class InitializeArticleDefaults1791381472274 {
	name = 'InitializeArticleDefaults1791381472274';

	async up(queryRunner) {
		await queryRunner.query(`
			INSERT INTO "hashtag" ("id", "name")
			SELECT * FROM unnest($1::varchar[], $2::varchar[])
			ON CONFLICT ("name") DO NOTHING
		`, [seedIds, defaultTags]);
		await queryRunner.query(`
			UPDATE "meta" SET "articleCategories" = $1::jsonb
			WHERE "articleCategories" = '[]'::jsonb
		`, [JSON.stringify(defaultCategories)]);
	}

	async down(queryRunner) {
		// 只清理本迁移创建且未使用的标签，保留原有标签和已关联的用户数据。
		await queryRunner.query(`
			DELETE FROM "hashtag" AS "tag"
			WHERE ("tag"."id", "tag"."name") IN (
				SELECT * FROM unnest($1::varchar[], $2::varchar[])
			)
			AND "tag"."mentionedUsersCount" = 0
			AND "tag"."mentionedLocalUsersCount" = 0
			AND "tag"."mentionedRemoteUsersCount" = 0
			AND "tag"."attachedUsersCount" = 0
			AND "tag"."attachedLocalUsersCount" = 0
			AND "tag"."attachedRemoteUsersCount" = 0
			AND cardinality("tag"."mentionedUserIds") = 0
			AND cardinality("tag"."mentionedLocalUserIds") = 0
			AND cardinality("tag"."mentionedRemoteUserIds") = 0
			AND cardinality("tag"."attachedUserIds") = 0
			AND cardinality("tag"."attachedLocalUserIds") = 0
			AND cardinality("tag"."attachedRemoteUserIds") = 0
			AND NOT EXISTS (
				SELECT 1 FROM "note" WHERE "tags" @> ARRAY["tag"."name"]
			)
			AND NOT EXISTS (
				SELECT 1 FROM "user" WHERE "tags" @> ARRAY["tag"."name"]
			)
			AND NOT EXISTS (
				SELECT 1 FROM "page"
				WHERE "content" @> jsonb_build_array(jsonb_build_object('articleTags', jsonb_build_array("tag"."name")))
			)
			AND NOT EXISTS (
				SELECT 1 FROM "article_draft" WHERE "data" -> 'articleTags' ? "tag"."name"
			)
		`, [seedIds, defaultTags]);
		// 无法区分初始化后被管理员保留的默认分类，回滚时保留分类补值，避免删除有效配置。
	}
}
