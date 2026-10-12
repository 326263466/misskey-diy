/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { ArticleDraftService } from '@/core/ArticleDraftService.js';
import { articleDraftIdSchema } from '@/misc/article-draft-schema.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['articles', 'drafts'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:pages',
	limit: { duration: 60_000, max: 120 },
	errors: {
		draftConflict: { message: 'The article draft has changed. Reload it before deleting.', code: 'DRAFT_CONFLICT', id: '684ff63a-de23-4d26-a62d-2da4cef0e3b0' },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { draftId: articleDraftIdSchema, expectedRevision: { type: 'integer', minimum: 1, maximum: 2147483646 } },
	required: ['draftId', 'expectedRevision'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private articleDraftService: ArticleDraftService) {
		super(meta, paramDef, async (ps, me) => {
			try { await this.articleDraftService.delete(me.id, ps.draftId, ps.expectedRevision); } catch (error) {
				if (error instanceof ArticleDraftService.ConflictError) throw new ApiError(meta.errors.draftConflict);
				throw error;
			}
		});
	}
}
