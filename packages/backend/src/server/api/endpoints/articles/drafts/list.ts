/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { ArticleDraftService } from '@/core/ArticleDraftService.js';
import { articleDraftIdSchema, articleDraftSchema } from '@/misc/article-draft-schema.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['articles', 'drafts'],
	requireCredential: true,
	kind: 'read:pages',
	res: { type: 'array', optional: false, nullable: false, items: articleDraftSchema },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
		untilId: articleDraftIdSchema,
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private articleDraftService: ArticleDraftService) {
		super(meta, paramDef, async (ps, me) => Promise.all((await this.articleDraftService.list(me.id, ps.limit, ps.untilId)).map(draft => this.articleDraftService.pack(draft))));
	}
}
