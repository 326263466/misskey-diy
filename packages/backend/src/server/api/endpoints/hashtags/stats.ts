/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository } from '@/models/_.js';
import { normalizeTag } from '@/misc/normalize-tag.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import { IdService } from '@/core/IdService.js';
import { DI } from '@/di-symbols.js';

const DAY = 1000 * 60 * 60 * 24;

export const meta = {
	tags: ['hashtags'],

	requireCredential: false,
	allowGet: true,
	cacheSec: 60,
	limit: { duration: 60_000, max: 30 },

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			notesCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			weekNotesCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			todayNotesCount: {
				type: 'number',
				optional: false, nullable: false,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		tag: { type: 'string', minLength: 1, maxLength: 128 },
	},
	required: ['tag'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private queryService: QueryService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps) => {
			const now = Date.now();
			// 结果对所有人相同并会被缓存：只计入公开和首页可见的帖子，不按查看者过滤。
			const query = this.notesRepository.createQueryBuilder('note')
				.innerJoin('note.user', 'user')
				.leftJoin('note.reply', 'reply')
				.leftJoin('note.renote', 'renote')
				.leftJoin('reply.user', 'replyUser')
				.leftJoin('renote.user', 'renoteUser')
				.select('COUNT(*)', 'total')
				.addSelect('COUNT(*) FILTER (WHERE note.id >= :weekId)', 'week')
				.addSelect('COUNT(*) FILTER (WHERE note.id >= :todayId)', 'today')
				.where(':tag <@ note.tags', { tag: [normalizeTag(ps.tag)] })
				.andWhere('note.visibility IN (\'public\', \'home\')')
				.setParameters({
					weekId: this.idService.gen(now - DAY * 7),
					todayId: this.idService.gen(now - DAY),
				});
			this.queryService.generateBaseNoteFilteringQuery(query, null);

			const row = await query.getRawOne<{ total: string; week: string; today: string }>();
			return {
				notesCount: Number(row?.total ?? 0),
				weekNotesCount: Number(row?.week ?? 0),
				todayNotesCount: Number(row?.today ?? 0),
			};
		});
	}
}
