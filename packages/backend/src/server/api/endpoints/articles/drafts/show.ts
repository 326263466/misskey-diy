/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { ArticleDraftService } from '@/core/ArticleDraftService.js';
import { articleDraftIdSchema, articleDraftSchema } from '@/misc/article-draft-schema.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['articles', 'drafts'],
	requireCredential: true,
	kind: 'read:pages',
	res: articleDraftSchema,
	errors: {
		noSuchDraft: { message: 'No such article draft.', code: 'NO_SUCH_DRAFT', id: '97bdbfd2-2eee-427c-8826-eb23d8fed07a' },
	},
} as const;

export const paramDef = { type: 'object', properties: { draftId: articleDraftIdSchema }, required: ['draftId'] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private articleDraftService: ArticleDraftService) {
		super(meta, paramDef, async (ps, me) => {
			try { return await this.articleDraftService.pack(await this.articleDraftService.show(me.id, ps.draftId)); } catch (error) {
				if (error instanceof ArticleDraftService.NotFoundError) throw new ApiError(meta.errors.noSuchDraft);
				throw error;
			}
		});
	}
}
