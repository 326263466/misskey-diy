/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { MiUser } from '@/models/User.js';
import { MiUserCheckinCardBatch } from '@/models/UserCheckinCardBatch.js';
import type { Packed } from '@/misc/json-schema.js';
import { IdService } from '@/core/IdService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';

export type CheckinHistoryType = 'grant' | 'use' | 'exchange';

type HistoryRow = {
	id: string;
	createdAt: Date | null;
	userId: string;
	operatorId: string | null;
	recipientUsername: string | null;
	amount: number;
	before: number | null;
	after: number | null;
	date: string | null;
	pointsSpent: number | null;
};

// Aggregate each source before joining so repeated grants and uses cannot multiply balances.
const sourceTotals = `
	WITH grants AS (
		SELECT info->>'userId' AS "userId", SUM((info->>'amount')::bigint) AS cards
		FROM moderation_log WHERE type = 'grantCheckinCards' GROUP BY info->>'userId'
	), uses AS (
		SELECT "userId", COUNT(*) AS cards FROM user_checkin WHERE "isMakeup" = TRUE GROUP BY "userId"
	), exchanges AS (
		SELECT "userId", SUM("cardsGranted") AS cards FROM user_checkin_exchange GROUP BY "userId"
	), balances AS (
		SELECT u.id AS "userId", COALESCE(g.cards, 0) AS "grantedCards", COALESCE(c.cards, 0) AS "usedCards",
			COALESCE(e.cards, 0) AS "exchangedCards", p."checkinMakeupCards" AS "availableCards", p."checkinPoints" AS points
		FROM "user" u INNER JOIN user_profile p ON p."userId" = u.id
		LEFT JOIN grants g ON g."userId" = u.id LEFT JOIN uses c ON c."userId" = u.id LEFT JOIN exchanges e ON e."userId" = u.id
		WHERE u.host IS NULL AND ($1::varchar IS NULL OR u.id = $1)
			AND ($1::varchar IS NOT NULL OR g.cards > 0 OR c.cards > 0 OR e.cards > 0 OR p."checkinMakeupCards" > 0 OR p."checkinPoints" > 0)
	)
`;

@Injectable()
export class CheckinAdminService {
	constructor(
		@Inject(DI.db) private db: DataSource,
		private userEntityService: UserEntityService,
		private idService: IdService,
	) {
	}

	@bindThis
	public async stats(userId?: string) {
		// These are retained-record totals. Cards are pooled, so use cannot be attributed to a grant source.
		const [row] = await this.db.query<{
			grantedCards: string; grantCount: string; grantedUsers: string; usedCards: string;
			usedUsers: string; exchangedCards: string; availableCards: string;
		}[]>(`
			WITH grants AS (
				SELECT COALESCE(SUM((info->>'amount')::bigint), 0) AS cards, COUNT(*) AS count, COUNT(DISTINCT info->>'userId') AS users
				FROM moderation_log WHERE type = 'grantCheckinCards' AND ($1::varchar IS NULL OR info->>'userId' = $1)
			), uses AS (
				SELECT COUNT(*) AS cards, COUNT(DISTINCT "userId") AS users
				FROM user_checkin WHERE "isMakeup" = TRUE AND ($1::varchar IS NULL OR "userId" = $1)
			)
			SELECT grants.cards AS "grantedCards", grants.count AS "grantCount", grants.users AS "grantedUsers",
				uses.cards AS "usedCards", uses.users AS "usedUsers",
				(SELECT COALESCE(SUM("cardsGranted"), 0) FROM user_checkin_exchange WHERE $1::varchar IS NULL OR "userId" = $1) AS "exchangedCards",
				(SELECT COALESCE(SUM(p."checkinMakeupCards"), 0) FROM user_profile p INNER JOIN "user" u ON u.id = p."userId"
					WHERE u.host IS NULL AND ($1::varchar IS NULL OR p."userId" = $1)) AS "availableCards"
			FROM grants CROSS JOIN uses
		`, [userId ?? null]);
		return {
			grantedCards: Number(row.grantedCards), grantCount: Number(row.grantCount), grantedUsers: Number(row.grantedUsers),
			usedCards: Number(row.usedCards), usedUsers: Number(row.usedUsers), exchangedCards: Number(row.exchangedCards), availableCards: Number(row.availableCards),
		};
	}

	@bindThis
	public async history(type: CheckinHistoryType, offset: number, limit: number, me: MiUser, userId?: string) {
		const sources = {
			grant: {
				from: `moderation_log WHERE type = 'grantCheckinCards' AND ($1::varchar IS NULL OR info->>'userId' = $1)`,
				select: `id, NULL::timestamptz AS "createdAt", info->>'userId' AS "userId", "userId" AS "operatorId", info->>'userUsername' AS "recipientUsername",
					(info->>'amount')::integer AS amount, (info->>'before')::integer AS before, (info->>'after')::integer AS after, NULL::text AS date, NULL::integer AS "pointsSpent"`,
				order: 'id DESC',
			},
			use: {
				from: `user_checkin WHERE "isMakeup" = TRUE AND ($1::varchar IS NULL OR "userId" = $1)`,
				select: `"userId" || ':' || date::text AS id, "createdAt", "userId", NULL::varchar AS "operatorId", NULL::varchar AS "recipientUsername",
					1 AS amount, NULL::integer AS before, NULL::integer AS after, date::text AS date, NULL::integer AS "pointsSpent"`,
				order: '"createdAt" DESC, "userId" ASC, date DESC',
			},
			exchange: {
				from: `user_checkin_exchange WHERE $1::varchar IS NULL OR "userId" = $1`,
				select: `"userId" || ':' || "requestId"::text AS id, "createdAt", "userId", NULL::varchar AS "operatorId", NULL::varchar AS "recipientUsername",
					"cardsGranted" AS amount, NULL::integer AS before, NULL::integer AS after, NULL::text AS date, "pointsSpent"`,
				order: '"createdAt" DESC, "userId" ASC, "requestId" ASC',
			},
		}[type];
		const { rows, total } = await this.db.transaction('REPEATABLE READ', async manager => {
			const [count] = await manager.query<{ total: string }[]>(`SELECT COUNT(*) AS total FROM ${sources.from}`, [userId ?? null]);
			const rows = await manager.query<HistoryRow[]>(`SELECT ${sources.select} FROM ${sources.from} ORDER BY ${sources.order} OFFSET $2 LIMIT $3`, [userId ?? null, offset, limit]);
			return { rows, total: Number(count.total) };
		});
		const users = await this.packUsers(rows.flatMap(row => [row.userId, ...(row.operatorId ? [row.operatorId] : [])]), me);
		const batches = type === 'grant' && rows.length > 0
			? await this.db.getRepository(MiUserCheckinCardBatch).findBy({ grantLogId: In(rows.map(row => row.id)) })
			: [];
		const batchByLog = new Map(batches.map(batch => [batch.grantLogId, batch]));
		return {
			total,
			items: rows.map(({ operatorId, ...row }) => {
				const batch = batchByLog.get(row.id);
				const usageStatus: 'legacy' | 'revoked' | 'used' | 'partial' | 'unused' = !batch ? 'legacy' : batch.revoked > 0 ? 'revoked' : batch.remaining === 0 ? 'used' : batch.used > 0 ? 'partial' : 'unused';
				return {
					...row,
					createdAt: (row.createdAt ?? this.idService.parse(row.id).date).toISOString(),
					user: users.get(row.userId) ?? null,
					operator: operatorId ? users.get(operatorId) ?? null : null,
					batchId: batch?.id ?? null, usageStatus,
					used: batch?.used ?? null, remaining: batch?.remaining ?? null, revoked: batch?.revoked ?? null,
				};
			}),
		};
	}

	@bindThis
	public async users(offset: number, limit: number, me: MiUser, userId?: string) {
		const { rows, total } = await this.db.transaction('REPEATABLE READ', async manager => {
			const [count] = await manager.query<{ total: string }[]>(`${sourceTotals} SELECT COUNT(*) AS total FROM balances`, [userId ?? null]);
			const rows = await manager.query<{
				userId: string; grantedCards: string; usedCards: string; exchangedCards: string; availableCards: number; points: number;
			}[]>(`${sourceTotals} SELECT * FROM balances ORDER BY "availableCards" DESC, "userId" ASC OFFSET $2 LIMIT $3`, [userId ?? null, offset, limit]);
			return { rows, total: Number(count.total) };
		});
		const users = await this.packUsers(rows.map(row => row.userId), me);
		return {
			total,
			items: rows.flatMap(row => {
				const user = users.get(row.userId);
				return user ? [{
					user, grantedCards: Number(row.grantedCards), usedCards: Number(row.usedCards), exchangedCards: Number(row.exchangedCards),
					availableCards: row.availableCards, points: row.points,
				}] : [];
			}),
		};
	}

	private async packUsers(ids: string[], me: MiUser): Promise<Map<string, Packed<'UserLite'>>> {
		if (ids.length === 0) return new Map();
		const users = await this.db.getRepository(MiUser).findBy({ id: In([...new Set(ids)]) });
		const packed = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
		return new Map(packed.map(user => [user.id, user]));
	}
}
