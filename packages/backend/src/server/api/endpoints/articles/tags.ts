/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { CONTENT_LIMITS } from 'misskey-js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { MetasRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';

export const meta = {
	tags: ['articles'],
	requireCredential: false,
	allowGet: true,
	res: {
		type: 'array', optional: false, nullable: false,
		items: { type: 'string', optional: false, nullable: false },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string', maxLength: 100, default: '' },
		limit: { type: 'integer', minimum: 1, maximum: 50, default: 24 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.metasRepository)
		private metasRepository: MetasRepository,
	) {
		super(meta, paramDef, async (ps) => {
			const query = normalizeForSearch(ps.query).trim();
			const config = await this.metasRepository.findOne({ where: {}, order: { id: 'DESC' }, select: { articleTags: true } });
			return (config?.articleTags ?? []).filter(tag => Array.from(tag).length <= CONTENT_LIMITS.articleTag && tag.includes(query)).slice(0, ps.limit);
		});
	}
}
