/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiMeta } from '@/models/Meta.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { SearchService } from '@/core/SearchService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { RoleService } from '@/core/RoleService.js';
import { IdService } from '@/core/IdService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: false,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},

	errors: {
		unavailable: {
			message: 'Search of notes unavailable.',
			code: 'UNAVAILABLE',
			id: '0b44998d-77aa-4427-80d0-d2c9b8523011',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string' },
		rangeStartAt: { type: 'integer', nullable: true },
		rangeEndAt: { type: 'integer', nullable: true },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', minimum: 0, default: 0 },
		sort: {
			type: 'string', enum: ['time', 'popularity'],
			description: 'Sort the full matching set before offset pagination. Explicit sorting uses database text matching, including when Meilisearch is configured. Popularity is the sum of reactions, replies and renotes.',
		},
		order: { type: 'string', enum: ['asc', 'desc'], description: 'Direction for explicit sorting (default: desc). Use offset for subsequent sorted pages.' },
		host: {
			type: 'string',
			description: 'The local host is represented with `.`.',
		},
		userId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		channelId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
	},
	required: ['query'],
} as const;

// TODO: ロジックをサービスに切り出す

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private noteEntityService: NoteEntityService,
		private searchService: SearchService,
		private roleService: RoleService,
		private idService: IdService,
		@Inject(DI.meta)
		private serverSettings: MiMeta,
	) {
		super(meta, paramDef, async (ps, me) => {
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.gen(ps.untilDate!) : undefined);
			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.gen(ps.sinceDate!) : undefined);

			if (me || this.serverSettings.clientOptions.openGuestAccess !== true) {
				const policies = await this.roleService.getUserPolicies(me?.id ?? null);
				if (!policies.canSearchNotes) throw new ApiError(meta.errors.unavailable);
			}

			const notes = await this.searchService.searchNote(ps.query, me, {
				userId: ps.userId,
				channelId: ps.channelId,
				host: ps.host,
				rangeStartAt: ps.rangeStartAt,
				rangeEndAt: ps.rangeEndAt,
				sort: ps.sort,
				order: ps.order,
			}, {
				untilId: untilId,
				sinceId: sinceId,
				limit: ps.limit,
				offset: ps.offset,
			});

			return await this.noteEntityService.packMany(notes, me);
		});
	}
}
