/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { In } from 'typeorm';
import ms from 'ms';
import { DI } from '@/di-symbols.js';
import type { NotesRepository } from '@/models/_.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DELETED_REPLY_THREAD_PREFIX, isDeletedReply } from '@/misc/is-reply.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['notes'],
	requireCredential: true,
	kind: 'read:account',
	limit: { duration: ms('1minute'), max: 120 },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteIds: { type: 'array', uniqueItems: true, minItems: 1, maxItems: 50, items: { type: 'string', format: 'misskey:id' } },
	},
	required: ['noteIds'],
} as const;

const VIEW_DEDUP_INTERVAL = ms('1day');
const VIEW_BUDGET_INTERVAL = ms('1minute');
const VIEW_BUDGET_MAX = 120;

// 去重和滚动窗口额度在同一段脚本内预留，批量或并发请求无法绕过限制。
const reserveView = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now - tonumber(ARGV[3]))
if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[4]) then return -1 end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
redis.call('ZADD', KEYS[2], now, ARGV[1])
redis.call('PEXPIRE', KEYS[2], ARGV[3])
return 1
`;

const releaseView = `
if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('DEL', KEYS[1]) end
return redis.call('ZREM', KEYS[2], ARGV[1])
`;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository) private notesRepository: NotesRepository,
		@Inject(DI.redis) private redisClient: Redis.Redis,
		private noteEntityService: NoteEntityService,
		private globalEventService: GlobalEventService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const notes = await this.notesRepository.findBy({ id: In(ps.noteIds) });
			for (const note of notes) {
				if (isDeletedReply(note) || !await this.noteEntityService.isContentVisible(note, me)) continue;
				const key = `noteView:${me.id}:${note.id}`;
				const budgetKey = `noteViewBudget:${me.id}`;
				const reservation = randomUUID();
				const reserved = await this.redisClient.eval(reserveView, 2, key, budgetKey, reservation, VIEW_DEDUP_INTERVAL, VIEW_BUDGET_INTERVAL, VIEW_BUDGET_MAX);
				if (reserved !== 1) continue;
				const release = () => this.redisClient.eval(releaseView, 2, key, budgetKey, reservation);
				let changed: boolean;
				try {
					// 原子累加并复查删除状态，避免并发上报覆盖计数。
					const result = await this.notesRepository.createQueryBuilder().update()
						.set({ viewsCount: () => '"viewsCount" + 1' })
						.where('id = :id AND ("threadId" IS NULL OR "threadId" NOT LIKE :deleted)', { id: note.id, deleted: `${DELETED_REPLY_THREAD_PREFIX}%` })
						.execute();
					changed = result.affected === 1;
				} catch (error) {
					await release();
					throw error;
				}
				if (changed) {
					this.globalEventService.publishNoteStream(note, 'statsUpdated', null);
				} else {
					await release();
				}
			}
		});
	}
}
