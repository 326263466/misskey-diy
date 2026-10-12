/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { MiNote } from '@/models/Note.js';
import { bindThis } from '@/decorators.js';
import type { MiUser, NotesRepository } from '@/models/_.js';
import type { Config } from '@/config.js';
import { PER_NOTE_REACTION_USER_PAIR_CACHE_MAX } from '@/const.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { parseReactionUserPair } from '@/misc/reaction.js';
import type { OnApplicationShutdown } from '@nestjs/common';

const REDIS_DELTA_PREFIX = 'reactionsBufferDeltas';
const REDIS_PAIR_PREFIX = 'reactionsBufferPairs';
const REDIS_PAIR_OPERATION_PREFIX = 'reactionsBufferPairOperations';

const CREATE_SCRIPT = `
redis.call('HINCRBY', KEYS[1], ARGV[1], 1)
local currentPairs = cjson.decode(ARGV[5])
for i, pair in ipairs(currentPairs) do
	if redis.call('HGET', KEYS[3], pair) ~= '-1' then
		redis.call('ZADD', KEYS[2], 'NX', i, pair)
	end
end
redis.call('HSET', KEYS[3], ARGV[2], 1)
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[2])
redis.call('ZREMRANGEBYRANK', KEYS[2], 0, -(tonumber(ARGV[4]) + 1))
`;

const DELETE_SCRIPT = `
redis.call('HINCRBY', KEYS[1], ARGV[1], -1)
redis.call('HSET', KEYS[3], ARGV[2], -1)
redis.call('ZREM', KEYS[2], ARGV[2])
`;

const DRAIN_SCRIPT = `
local snapshot = {
	redis.call('HGETALL', KEYS[1]),
	redis.call('ZRANGE', KEYS[2], 0, -1, 'WITHSCORES'),
	redis.call('HGETALL', KEYS[3])
}
redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
return snapshot
`;

const RESTORE_SCRIPT = `
local snapshot = cjson.decode(ARGV[1])
for i = 1, #snapshot[1], 2 do
	redis.call('HINCRBY', KEYS[1], snapshot[1][i], snapshot[1][i + 1])
end
for i = 1, #snapshot[3], 2 do
	local pair = snapshot[3][i]
	redis.call('HSETNX', KEYS[3], pair, snapshot[3][i + 1])
	if redis.call('HGET', KEYS[3], pair) == '-1' then
		redis.call('ZREM', KEYS[2], pair)
	end
end
for i = 1, #snapshot[2], 2 do
	local pair = snapshot[2][i]
	if redis.call('HGET', KEYS[3], pair) ~= '-1' then
		redis.call('ZADD', KEYS[2], 'NX', snapshot[2][i + 1], pair)
	end
end
redis.call('ZREMRANGEBYRANK', KEYS[2], 0, -(tonumber(ARGV[2]) + 1))
`;

type BufferedSnapshot = [string[], string[], string[]];

@Injectable()
export class ReactionsBufferingService implements OnApplicationShutdown {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.redisForReactions)
		private redisForReactions: Redis.Redis, // TODO: 専用のRedisインスタンスにする

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,
	) {
		this.redisForSub.on('message', this.onMessage);
	}

	@bindThis
	private async onMessage(_: string, data: string) {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			switch (type) {
				case 'metaUpdated': {
					// リアクションバッファリングが有効→無効になったら即bake
					if (body.before != null && body.before.enableReactionsBuffering && !body.after.enableReactionsBuffering) {
						this.bake();
					}
					break;
				}
				default:
					break;
			}
		}
	}

	@bindThis
	public async create(noteId: MiNote['id'], userId: MiUser['id'], reaction: string, currentPairs: string[]): Promise<void> {
		await this.redisForReactions.eval(CREATE_SCRIPT, 3, ...this.bufferKeys(noteId),
			reaction, `${userId}/${reaction}`, Date.now(), PER_NOTE_REACTION_USER_PAIR_CACHE_MAX, JSON.stringify(currentPairs));
	}

	@bindThis
	public async delete(noteId: MiNote['id'], userId: MiUser['id'], reaction: string): Promise<void> {
		await this.redisForReactions.eval(DELETE_SCRIPT, 3, ...this.bufferKeys(noteId), reaction, `${userId}/${reaction}`);
	}

	private bufferKeys(noteId: MiNote['id']): [string, string, string] {
		return [`${REDIS_DELTA_PREFIX}:${noteId}`, `${REDIS_PAIR_PREFIX}:${noteId}`, `${REDIS_PAIR_OPERATION_PREFIX}:${noteId}`];
	}

	@bindThis
	public async get(noteId: MiNote['id']): Promise<{
		deltas: Record<string, number>;
		pairs: ([MiUser['id'], string])[];
	}> {
		const pipeline = this.redisForReactions.pipeline();
		pipeline.hgetall(`${REDIS_DELTA_PREFIX}:${noteId}`);
		pipeline.zrange(`${REDIS_PAIR_PREFIX}:${noteId}`, 0, -1);
		const results = await pipeline.exec();

		const resultDeltas = results![0][1] as Record<string, string>;
		const resultPairs = results![1][1] as string[];

		const deltas = {} as Record<string, number>;
		for (const [name, count] of Object.entries(resultDeltas)) {
			deltas[name] = parseInt(count, 10);
		}

		const pairs = resultPairs.map(parseReactionUserPair);

		return {
			deltas,
			pairs,
		};
	}

	@bindThis
	public async getMany(noteIds: MiNote['id'][]): Promise<Map<MiNote['id'], {
		deltas: Record<string, number>;
		pairs: ([MiUser['id'], string])[];
	}>> {
		const map = new Map<MiNote['id'], {
			deltas: Record<string, number>;
			pairs: ([MiUser['id'], string])[];
		}>();

		const pipeline = this.redisForReactions.pipeline();
		for (const noteId of noteIds) {
			pipeline.hgetall(`${REDIS_DELTA_PREFIX}:${noteId}`);
			pipeline.zrange(`${REDIS_PAIR_PREFIX}:${noteId}`, 0, -1);
		}
		const results = await pipeline.exec();

		const opsForEachNotes = 2;
		for (let i = 0; i < noteIds.length; i++) {
			const noteId = noteIds[i];
			const resultDeltas = results![i * opsForEachNotes][1] as Record<string, string>;
			const resultPairs = results![i * opsForEachNotes + 1][1] as string[];

			const deltas = {} as Record<string, number>;
			for (const [name, count] of Object.entries(resultDeltas)) {
				deltas[name] = parseInt(count, 10);
			}

			const pairs = resultPairs.map(parseReactionUserPair);

			map.set(noteId, {
				deltas,
				pairs,
			});
		}

		return map;
	}

	// TODO: scanは重い可能性があるので、別途 bufferedNoteIds を直接Redis上に持っておいてもいいかもしれない
	@bindThis
	public async bake(): Promise<void> {
		const bufferedNoteIds = [];
		let cursor = '0';
		do {
			// https://github.com/redis/ioredis#transparent-key-prefixing
			const result = await this.redisForReactions.scan(
				cursor,
				'MATCH',
				`${this.config.redis.prefix}:${REDIS_DELTA_PREFIX}:*`,
				'COUNT',
				'1000');

			cursor = result[0];
			bufferedNoteIds.push(...result[1].map(x => x.replace(`${this.config.redis.prefix}:${REDIS_DELTA_PREFIX}:`, '')));
		} while (cursor !== '0');

		for (const noteId of new Set(bufferedNoteIds)) {
			let snapshot: BufferedSnapshot | undefined;
			try {
				await this.notesRepository.manager.transaction(async manager => {
					// 与增删回应共用帖子行锁，防止多个落库任务覆盖用户缓存。
					const note = await manager.findOne(MiNote, { where: { id: noteId }, lock: { mode: 'pessimistic_write' } });
					snapshot = await this.redisForReactions.eval(DRAIN_SCRIPT, 3, ...this.bufferKeys(noteId)) as BufferedSnapshot;
					if (note == null || snapshot[0].length === 0) return;

					const parameters: Record<string, string | number> = {};
					let sql = '"reactions"';
					for (let i = 0; i < snapshot[0].length; i += 2) {
						parameters[`reaction${i}`] = snapshot[0][i];
						parameters[`delta${i}`] = Number(snapshot[0][i + 1]);
						// 每个增量只修改自己的键，避免后面的更新覆盖前面的结果。
						sql = `jsonb_set(${sql}, ARRAY[CAST(:reaction${i} AS text)], to_jsonb(COALESCE(("reactions"->>:reaction${i})::int, 0) + CAST(:delta${i} AS int)))`;
					}

					const pairs = new Map(note.reactionAndUserPairCache.map((pair, index) => [pair, index]));
					for (let i = 0; i < snapshot[1].length; i += 2) {
						pairs.set(snapshot[1][i], Number(snapshot[1][i + 1]));
					}
					for (let i = 0; i < snapshot[2].length; i += 2) {
						if (snapshot[2][i + 1] === '-1') pairs.delete(snapshot[2][i]);
					}

					await manager.createQueryBuilder().update(MiNote)
						.set({
							reactions: () => sql,
							reactionAndUserPairCache: [...pairs].sort((a, b) => a[1] - b[1]).slice(-PER_NOTE_REACTION_USER_PAIR_CACHE_MAX).map(([pair]) => pair),
						})
						.where('id = :id', { id: noteId })
						.setParameters(parameters)
						.execute();
				});
			} catch (err) {
				if (snapshot != null) {
					// 新到达的增量继续累加，增删状态以新操作为准。
					await this.redisForReactions.eval(RESTORE_SCRIPT, 3, ...this.bufferKeys(noteId), JSON.stringify(snapshot), PER_NOTE_REACTION_USER_PAIR_CACHE_MAX);
				}
				throw err;
			}
		}
	}

	@bindThis
	public mergeReactions(src: MiNote['reactions'], delta: Record<string, number>): MiNote['reactions'] {
		const reactions = { ...src };
		for (const [name, count] of Object.entries(delta)) {
			if (reactions[name] != null) {
				reactions[name] += count;
			} else {
				reactions[name] = count;
			}
		}
		return reactions;
	}

	@bindThis
	public dispose(): void {
		this.redisForSub.off('message', this.onMessage);
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
