/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CONTENT_LIMITS } from 'misskey-js';
import { MetaService } from '@/core/MetaService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin', 'articles'],
	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:meta',
	limit: { duration: 60 * 1000, max: 120 },
	errors: {
		invalidArticleTag: {
			message: 'New or renamed article tags must be non-empty and at most 10 characters after normalization.',
			code: 'INVALID_ARTICLE_TAG',
			id: 'd031a79e-8c5c-4d4e-ac15-fead83049b46',
		},
		noSuchArticleTag: {
			message: 'No such article tag.',
			code: 'NO_SUCH_ARTICLE_TAG',
			id: '9848025c-ef0b-4e19-aef6-2a0ee157029f',
		},
		articleTagAlreadyExists: {
			message: 'This article tag already exists.',
			code: 'ARTICLE_TAG_ALREADY_EXISTS',
			id: '9db3322d-916f-4428-96a6-aae1dd97b8ab',
		},
		tooManyArticleTags: {
			message: 'At most 500 article tags can be configured.',
			code: 'TOO_MANY_ARTICLE_TAGS',
			id: '3e00857d-0468-4673-ac1f-f6cec3ed2105',
		},
	},
	res: {
		type: 'array', optional: false, nullable: false,
		items: { type: 'string', optional: false, nullable: false },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		action: { type: 'string', enum: ['create', 'update', 'delete'] },
		name: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[^\\u0000]*$' },
		newName: { type: 'string', description: 'Renamed tags are limited to 10 characters after normalization.', minLength: 1, maxLength: 100, pattern: '^[^\\u0000]*$' },
	},
	required: ['action', 'name'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private metaService: MetaService,
		private moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const name = normalizeForSearch(ps.name).trim();
			const newName = ps.newName === undefined ? undefined : normalizeForSearch(ps.newName).trim();
			if ([name, ...(newName === undefined ? [] : [newName])].some(tag => !tag || tag.includes('\u0000') || Array.from(tag).length > 100)
				|| (ps.action === 'create' && Array.from(name).length > CONTENT_LIMITS.articleTag)
				|| (newName !== undefined && Array.from(newName).length > CONTENT_LIMITS.articleTag)
				|| (ps.action === 'update' && !newName)) {
				throw new ApiError(meta.errors.invalidArticleTag);
			}

			const result = await this.metaService.updateArticleTags(tags => {
				const index = tags.indexOf(name);
				if (ps.action === 'create') {
					if (index !== -1) throw new ApiError(meta.errors.articleTagAlreadyExists);
					if (tags.length >= 500) throw new ApiError(meta.errors.tooManyArticleTags);
					return [...tags, name];
				}
				if (index === -1) throw new ApiError(meta.errors.noSuchArticleTag);
				if (ps.action === 'delete') return tags.filter(tag => tag !== name);
				if (newName !== name && tags.includes(newName!)) throw new ApiError(meta.errors.articleTagAlreadyExists);
				return tags.map((tag, i) => i === index ? newName! : tag);
			});

			this.moderationLogService.log(me, 'updateServerSettings', {
				before: { articleTags: result.before.articleTags },
				after: { articleTags: result.after.articleTags },
			});
			return result.after.articleTags;
		});
	}
}
