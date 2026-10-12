/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/Meta.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { IdService } from '@/core/IdService.js';
import { checkinDate } from '@/core/CheckinService.js';
import { getVisitorContentVisibility } from '@/misc/visitor-content.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

const rankingTypes = ['points', 'replies', 'posts', 'checkin', 'tips'] as const;
// 与 IdService 的各格式解析范围一致，不包含同一毫秒内的随机部分。
const idTimeLengths: Record<string, number> = { aid: 8, aidx: 8, meid: 12, meidg: 12, ulid: 10, objectid: 8 };

export const meta = {
	tags: ['users'],
	requireCredential: false,
	description: 'Rank discoverable local users by current points, public replies and article comments, public posts and articles, total check-in days including makeup days, or number of tips sent to public content. Ties are ordered by user ID. Private and deleted content is excluded.',
	limit: { duration: 60_000, max: 30 },
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			type: { type: 'string', enum: rankingTypes, optional: false, nullable: false },
			items: {
				type: 'array', optional: false, nullable: false,
				items: {
					type: 'object', optional: false, nullable: false,
					properties: {
						rank: { type: 'integer', optional: false, nullable: false },
						value: { type: 'number', optional: false, nullable: false },
						user: { type: 'object', ref: 'UserLite', optional: false, nullable: false },
					},
				},
			},
			myRank: {
				type: 'object', optional: false, nullable: true,
				properties: {
					rank: { type: 'integer', optional: false, nullable: false },
					value: { type: 'number', optional: false, nullable: false },
				},
			},
			updatedAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		type: { type: 'string', enum: rankingTypes, default: 'points' },
		offset: { type: 'integer', minimum: 0, maximum: 99, default: 0 },
		limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
	},
	required: [],
} as const;

const scores = {
	points: 'SELECT "userId", balance AS value FROM "wallet"',
	checkin: 'SELECT "userId", COUNT(*) AS value FROM "user_checkin" WHERE date <= (SELECT date FROM today) GROUP BY "userId"',
	posts: `SELECT "userId", COUNT(*) AS value FROM (
		SELECT n."userId" FROM public_notes n WHERE n."replyId" IS NULL AND n."isPost"
		UNION ALL SELECT "userId" FROM public_articles
	) contributions GROUP BY "userId"`,
	replies: `SELECT "userId", COUNT(*) AS value FROM (
		SELECT n."userId" FROM public_notes n INNER JOIN public_notes parent ON parent.id = n."replyId"
		UNION ALL SELECT c."userId" FROM "article_comment" c INNER JOIN public_articles p ON p.id = c."articleId"
	) contributions GROUP BY "userId"`,
	tips: `SELECT t."senderId" AS "userId", COUNT(*) AS value FROM "tip" t
		WHERE (t."targetType" = 'note' AND EXISTS (
			SELECT 1 FROM public_notes n WHERE n.id = t."targetId"
				AND (n."replyId" IS NULL OR EXISTS (SELECT 1 FROM public_notes parent WHERE parent.id = n."replyId"))
		)) OR (t."targetType" = 'page' AND EXISTS (SELECT 1 FROM public_articles p WHERE p.id = t."targetId"))
		GROUP BY t."senderId"`,
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db) private db: DataSource,
		@Inject(DI.config) private config: Config,
		@Inject(DI.meta) private instance: MiMeta,
		private userEntityService: UserEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const now = new Date();
			const end = Math.min(ps.offset + ps.limit, 100);
			const timeLength = idTimeLengths[this.config.id.toLowerCase()];
			if (timeLength == null) throw new Error('Unsupported note ID format.');
			const rows = await this.db.transaction('REPEATABLE READ', async manager => {
				let noteCutoffs: { userId: string; prefix: string }[] = [];
				if (ps.type === 'posts' || ps.type === 'replies' || ps.type === 'tips') {
					// 只读取用户的时间限制，避免把全部历史帖子 ID 拉入内存。
					const timedUsers = await manager.query<{ id: string; hiddenBefore: number | null; followersBefore: number | null }[]>(`
						SELECT id, "makeNotesHiddenBefore" AS "hiddenBefore", "makeNotesFollowersOnlyBefore" AS "followersBefore"
						FROM "user" WHERE "makeNotesHiddenBefore" IS NOT NULL OR "makeNotesFollowersOnlyBefore" IS NOT NULL
					`);
					noteCutoffs = timedUsers.flatMap(user => {
						const cutoff = Math.max(...[user.hiddenBefore, user.followersBefore]
							.filter((value): value is number => value != null)
							.map(value => value <= 0 ? now.getTime() + value * 1000 : value * 1000));
						if (cutoff >= now.getTime()) return [{ userId: user.id, prefix: '~' }];
						if (!this.idService.isSafeT(cutoff)) return [];
						return [{ userId: user.id, prefix: this.idService.gen(cutoff).slice(0, timeLength) }];
					});
				}
				return manager.query<{ userId: string; value: string; rank: number }[]>(`
					WITH today AS (SELECT $2::date AS date), note_cutoffs AS (
						SELECT * FROM jsonb_to_recordset($3::jsonb) AS cutoff("userId" varchar, prefix text)
					), visible_users AS (
						SELECT u.id, u.host, u.username, u."isExplorable", u."requireSigninToViewContents"
						FROM "user" u WHERE u."isSuspended" = FALSE AND u."isDeleted" = FALSE AND u."movedToUri" IS NULL
							AND NOT EXISTS (SELECT 1 FROM "blocking" b WHERE (b."blockerId" = $1 AND b."blockeeId" = u.id) OR (b."blockeeId" = $1 AND b."blockerId" = u.id))
							AND NOT EXISTS (SELECT 1 FROM "muting" m WHERE m."muterId" = $1 AND m."muteeId" = u.id AND (m."expiresAt" IS NULL OR m."expiresAt" > CURRENT_TIMESTAMP))
					), eligible_users AS (
						SELECT id FROM visible_users WHERE host IS NULL AND "isExplorable" = TRUE AND username NOT LIKE '%.%'
					), public_notes AS (
						SELECT n.id, n."userId", n."replyId",
							(n."renoteId" IS NULL OR n.text IS NOT NULL OR n.cw IS NOT NULL OR n."hasPoll" OR n."hasRedPacket" OR cardinality(n."fileIds") > 0) AS "isPost"
						FROM "note" n INNER JOIN visible_users u ON u.id = n."userId"
						WHERE $4::text <> 'none' AND ($4 = 'all' OR u.host IS NULL) AND n.visibility = 'public' AND n."deletedBy" IS NULL
							AND (n."threadId" IS NULL OR n."threadId" NOT LIKE 'reply-hidden:deleted:%')
							AND ($1::varchar IS NOT NULL OR u."requireSigninToViewContents" = FALSE)
							AND NOT EXISTS (SELECT 1 FROM note_cutoffs c WHERE c."userId" = u.id AND left(n.id, $7) COLLATE "C" <= c.prefix COLLATE "C")
					), public_articles AS (
						SELECT p.id, p."userId" FROM "page" p INNER JOIN visible_users u ON u.id = p."userId"
						WHERE $4::text <> 'none' AND ($4 = 'all' OR u.host IS NULL) AND p.visibility = 'public' AND jsonb_array_length(p.content) = 1
							AND ($1::varchar IS NOT NULL OR u."requireSigninToViewContents" = FALSE)
							AND p.content->0->>'type' = 'markdown' AND jsonb_typeof(p.content->0->'text') = 'string'
					), scores AS (${scores[ps.type]}), ranked AS (
						SELECT s."userId", s.value, ROW_NUMBER() OVER (ORDER BY s.value DESC, s."userId" ASC)::integer AS rank
						FROM scores s INNER JOIN eligible_users u ON u.id = s."userId" WHERE s.value > 0
					)
					SELECT * FROM ranked WHERE (rank > $5 AND rank <= $6) OR "userId" = $1 ORDER BY rank ASC
				`, [me?.id ?? null, checkinDate(now), JSON.stringify(noteCutoffs), me != null ? 'all' : getVisitorContentVisibility(this.instance), ps.offset, end, timeLength]);
			});
			const entries = rows.filter(row => row.rank > ps.offset && row.rank <= end);
			const users = new Map((await this.userEntityService.packMany(entries.map(row => row.userId), me)).map(user => [user.id, user]));
			const own = rows.find(row => row.userId === me?.id);
			return {
				type: ps.type,
				items: entries.map(row => ({ rank: row.rank, value: Number(row.value), user: users.get(row.userId)! })),
				myRank: own ? { rank: own.rank, value: Number(own.value) } : null,
				updatedAt: now.toISOString(),
			};
		});
	}
}
