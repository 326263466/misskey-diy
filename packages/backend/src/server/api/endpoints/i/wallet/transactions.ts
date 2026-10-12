/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { WalletService } from '@/core/WalletService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { walletTransactionSchema } from '@/models/json-schema/wallet.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['account'], requireCredential: true, kind: 'read:account',
	res: { type: 'array', optional: false, nullable: false, items: walletTransactionSchema },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		untilId: { type: 'string', format: 'misskey:id' },
		category: { type: 'string', enum: ['all', 'income', 'expense', 'transfer', 'online'], default: 'all' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private walletService: WalletService,
		private userEntityService?: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const rows = await this.walletService.transactionsWithFlow(me.id, ps.limit, ps.untilId, ps.category);
			const ids = [...new Set(rows.flatMap(row => [row.flow.fromUserId, row.flow.toUserId].filter((id): id is string => id != null)))];
			const users = this.userEntityService ? await this.userEntityService.packMany(ids, me, { schema: 'UserLite' }) : [];
			const usersById = new Map(users.map(user => [user.id, user]));
			return rows.map(row => ({
				...row,
				flow: {
					...row.flow,
					fromUser: row.flow.fromUserId ? usersById.get(row.flow.fromUserId) ?? null : null,
					toUser: row.flow.toUserId ? usersById.get(row.flow.toUserId) ?? null : null,
				},
			}));
		});
	}
}
