/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from 'node:os';
import { statfs } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as Redis from 'ioredis';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { InternalStorageService } from '@/core/InternalStorageService.js';

export const meta = {
	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:server-info',

	tags: ['admin', 'meta'],

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			version: {
				type: 'string', optional: false, nullable: false,
			},
			machine: {
				type: 'string',
				optional: false, nullable: false,
			},
			os: {
				type: 'string',
				optional: false, nullable: false,
				example: 'linux',
			},
			node: {
				type: 'string',
				optional: false, nullable: false,
			},
			psql: {
				type: 'string',
				optional: false, nullable: false,
			},
			redis: {
				type: 'string', optional: false, nullable: true,
			},
			cpu: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					model: {
						type: 'string',
						optional: false, nullable: true,
					},
					cores: {
						type: 'number',
						optional: false, nullable: false,
						description: 'Logical processors reported by the operating system.',
					},
					available: {
						type: 'number', optional: false, nullable: false,
						description: 'Parallelism available to the server process.',
					},
				},
			},
			mem: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					total: {
						type: 'number',
						optional: false, nullable: false,
						format: 'bytes',
						description: 'Total system memory reported by the operating system.',
					},
					limit: {
						type: 'number', optional: false, nullable: true, format: 'bytes',
						description: 'Operating-system memory constraint on the process, if known.',
					},
					rss: {
						type: 'number', optional: false, nullable: false, format: 'bytes',
						description: 'Resident memory of this API worker, not the whole server.',
					},
				},
			},
			fs: {
				type: 'object',
				optional: false, nullable: true,
				description: 'Filesystem containing the local uploads directory, not object storage or the total size of uploaded files.',
				properties: {
					total: {
						type: 'number',
						optional: false, nullable: false,
						format: 'bytes',
					},
					used: {
						type: 'number',
						optional: false, nullable: false,
						format: 'bytes',
					},
				},
			},
			net: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					interface: {
						type: 'string',
						optional: false, nullable: false,
						example: 'eth0',
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.config)
		private config: Config,

		private internalStorageService: InternalStorageService,
	) {
		super(meta, paramDef, async () => {
			const [fsStats, netInterface, redisServerInfo, psql] = await Promise.all([
				this.storageFilesystem(),
				import('systeminformation').then(si => si.networkInterfaceDefault()),
				this.redisClient.info('Server'),
				this.db.query('SHOW server_version').then(x => x[0].server_version as string),
			]);
			const cpus = os.cpus();
			const memoryLimit = process.constrainedMemory();

			return {
				version: this.config.version,
				machine: os.hostname(),
				os: `${os.type()} ${os.release()} (${os.arch()})`,
				node: process.version,
				psql,
				redis: redisServerInfo.match(/^redis_version:(.+)$/m)?.[1].trim() ?? null,
				cpu: {
					model: cpus[0]?.model ?? null,
					cores: cpus.length,
					available: os.availableParallelism(),
				},
				mem: {
					total: os.totalmem(),
					limit: memoryLimit > 0 ? memoryLimit : null,
					rss: process.memoryUsage.rss(),
				},
				fs: fsStats,
				net: {
					interface: netInterface,
				},
			};
		});
	}

	private async storageFilesystem() {
		let path = this.internalStorageService.resolvePath('');
		while (true) {
			try {
				const stats = await statfs(path);
				return {
					total: stats.bsize * stats.blocks,
					used: stats.bsize * (stats.blocks - stats.bfree),
				};
			} catch (error) {
				// 尚无上传目录时查找其所在文件系统；权限等错误不伪装成零容量。
				const parent = dirname(path);
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || parent === path) return null;
				path = parent;
			}
		}
	}
}
