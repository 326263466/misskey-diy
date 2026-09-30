/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['account'], requireCredential: true, kind: 'read:account',
	limit: { duration: 60000, max: 120 },
	description: 'Lists only the authenticated account’s makeup-card acquisitions, exchanges, or uses. Legacy acquisitions are opening balances, not reconstructed historical rewards.',
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			total: { type: 'integer', optional: false, nullable: false },
			items: {
				type: 'array', optional: false, nullable: false,
				items: {
					type: 'object', optional: false, nullable: false,
					properties: {
						id: { type: 'string', optional: false, nullable: false },
						createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
						source: { type: 'string', enum: ['admin', 'exchange', 'reward', 'redemption', 'legacy'], optional: false, nullable: true },
						amount: { type: 'integer', optional: false, nullable: false },
						used: { type: 'integer', optional: false, nullable: true },
						remaining: { type: 'integer', optional: false, nullable: true },
						revoked: { type: 'integer', optional: false, nullable: true },
						date: { type: 'string', optional: false, nullable: true },
						pointsSpent: { type: 'integer', optional: false, nullable: true },
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		type: { type: 'string', enum: ['earned', 'exchange', 'use'], default: 'earned' },
		offset: { type: 'integer', minimum: 0, maximum: 100000, default: 0 },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
	},
	required: [],
} as const;

type HistoryRow = {
	id: string;
	createdAt: Date;
	source: 'admin' | 'exchange' | 'reward' | 'redemption' | 'legacy' | null;
	amount: number;
	used: number | null;
	remaining: number | null;
	revoked: number | null;
	date: string | null;
	pointsSpent: number | null;
};

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(@Inject(DI.db) private db: DataSource) {
		super(meta, paramDef, async (ps, me) => {
			const source = {
				earned: {
					from: 'user_checkin_card_batch WHERE "userId" = $1',
					select: 'id, "createdAt", source, amount, used, remaining, revoked, NULL::text AS date, NULL::integer AS "pointsSpent"',
					order: '"createdAt" DESC, id DESC',
				},
				exchange: {
					from: 'user_checkin_exchange WHERE "userId" = $1',
					select: `'requestId:' || "requestId"::text AS id, "createdAt", 'exchange'::text AS source, "cardsGranted" AS amount,
						NULL::integer AS used, NULL::integer AS remaining, NULL::integer AS revoked, NULL::text AS date, "pointsSpent"`,
					order: '"createdAt" DESC, "requestId" DESC',
				},
				use: {
					from: 'user_checkin c LEFT JOIN user_checkin_card_batch b ON b.id = c."cardBatchId" AND b."userId" = c."userId" WHERE c."userId" = $1 AND c."isMakeup" = TRUE',
					select: `c.date::text AS id, c."createdAt", b.source, 1 AS amount, NULL::integer AS used,
						NULL::integer AS remaining, NULL::integer AS revoked, c.date::text AS date, NULL::integer AS "pointsSpent"`,
					order: 'c."createdAt" DESC, c.date DESC',
				},
			}[ps.type];
			return this.db.transaction('REPEATABLE READ', async manager => {
				// me.id is the only account selector, regardless of unrecognized client fields.
				const [count] = await manager.query<{ total: string }[]>(`SELECT COUNT(*) AS total FROM ${source.from}`, [me.id]);
				const rows = await manager.query<HistoryRow[]>(`SELECT ${source.select} FROM ${source.from} ORDER BY ${source.order} OFFSET $2 LIMIT $3`, [me.id, ps.offset, ps.limit]);
				return { total: Number(count.total), items: rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })) };
			});
		});
	}
}
