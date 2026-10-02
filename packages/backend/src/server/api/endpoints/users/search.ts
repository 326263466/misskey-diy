/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiMeta } from '@/models/Meta.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { UserSearchService } from '@/core/UserSearchService.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['users'],

	requireCredential: false,

	description: 'Search for users.',

	errors: {
		permissionDenied: {
			message: 'You are not assigned to a required role.',
			code: 'ROLE_PERMISSION_DENIED',
			kind: 'permission',
			id: '8e8def46-653b-4cdb-81a5-d29597240528',
		},
	},

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'User',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string' },
		offset: { type: 'integer', default: 0 },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		origin: { type: 'string', enum: ['local', 'remote', 'combined'], default: 'combined' },
		detail: { type: 'boolean', default: true },
	},
	required: ['query'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private userEntityService: UserEntityService,
		private userSearchService: UserSearchService,
		private roleService: RoleService,
		@Inject(DI.meta)
		private serverSettings: MiMeta,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (me || this.serverSettings.clientOptions.openGuestAccess !== true) {
				const policies = await this.roleService.getUserPolicies(me?.id ?? null);
				if (!policies.canSearchUsers && !(me && await this.roleService.isAdministrator(me))) {
					throw new ApiError(meta.errors.permissionDenied);
				}
			}

			const users = await this.userSearchService.search(ps.query.trim(), me?.id ?? null, {
				offset: ps.offset,
				limit: ps.limit,
				origin: ps.origin,
			});

			return await this.userEntityService.packMany(users, me, { schema: ps.detail ? 'UserDetailed' : 'UserLite' });
		});
	}
}
