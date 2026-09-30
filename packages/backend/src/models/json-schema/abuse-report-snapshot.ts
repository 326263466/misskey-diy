/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const abuseReportSnapshotSchema = {
	type: 'object',
	nullable: false, optional: false,
	properties: {
		version: { type: 'number', nullable: false, optional: false },
		capturedAt: { type: 'string', format: 'date-time', nullable: false, optional: false },
		type: { type: 'string', enum: ['user', 'note', 'boost', 'chat', 'page', 'gallery', 'play'], nullable: false, optional: false },
		sourceUrl: { type: 'string', nullable: false, optional: false },
		user: {
			type: 'object', nullable: false, optional: false,
			properties: {
				id: { type: 'string', format: 'id', nullable: false, optional: false },
				username: { type: 'string', nullable: false, optional: false },
				host: { type: 'string', nullable: true, optional: false },
				name: { type: 'string', nullable: true, optional: false },
			},
		},
		content: { type: 'string', nullable: false, optional: false },
		files: {
			type: 'array', nullable: false, optional: false,
			items: {
				type: 'object', nullable: false, optional: false,
				properties: {
					id: { type: 'string', format: 'id', nullable: false, optional: false },
					name: { type: 'string', nullable: false, optional: false },
					type: { type: 'string', nullable: false, optional: false },
					size: { type: 'number', nullable: false, optional: false },
					url: { type: 'string', nullable: false, optional: false },
					comment: { type: 'string', nullable: true, optional: false },
					sha256: { type: 'string', nullable: false, optional: false },
				},
			},
		},
	},
} as const;
