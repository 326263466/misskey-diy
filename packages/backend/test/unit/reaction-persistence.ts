/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { DataSource, type EntityManager } from 'typeorm';
import { loadConfig } from '@/config.js';
import { ReactionService } from '@/core/ReactionService.js';
import { ReactionsBufferingService } from '@/core/ReactionsBufferingService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { parseReactionUserPair } from '@/misc/reaction.js';
import { MiNote, MiNoteReaction, MiUser } from '@/models/_.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { initTestDb } from '../utils.js';

const note = {
	id: 'note',
	userId: 'author',
	userHost: null,
	host: null,
	localOnly: true,
	visibility: 'public',
	reactions: {},
	reactionAndUserPairCache: [],
	reactionAcceptance: null,
	replyId: null,
	channelId: null,
	mentions: [],
	visibleUserIds: [],
} as any;

function queryBuilder() {
	const builder = new DataSource({ type: 'postgres' }).createQueryBuilder().update('note');
	vi.spyOn(builder, 'update').mockReturnValue(builder);
	vi.spyOn(builder, 'execute').mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
	return builder;
}

function createService() {
	const builders: ReturnType<typeof queryBuilder>[] = [];
	const repository = {
		insert: vi.fn().mockResolvedValue(undefined),
		findOneByOrFail: vi.fn().mockResolvedValue(undefined),
		findOneBy: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue({ affected: 1 }),
		createQueryBuilder: vi.fn(() => {
			const builder = queryBuilder();
			builders.push(builder);
			return builder;
		}),
	};
	const manager = {
		findOneOrFail: vi.fn().mockResolvedValue(note),
		findOne: (_entity: unknown, options: { where: unknown }) => repository.findOneBy(options.where),
		find: async (_entity: unknown, options: { where: unknown }) => {
			const record = await repository.findOneBy(options.where);
			return record ? [record] : [];
		},
		existsBy: vi.fn().mockResolvedValue(false),
		insert: (_entity: unknown, record: unknown) => repository.insert(record),
		delete: (_entity: unknown, id: string) => repository.delete(id),
		createQueryBuilder: (entity?: unknown) => {
			if (entity) {
				const query = { select: () => query, distinct: () => query, where: () => query, getRawMany: async () => [] };
				return query;
			}
			return repository.createQueryBuilder();
		},
	};
	Object.assign(repository, { manager: { transaction: (callback: (manager: unknown) => unknown) => callback(manager) } });
	const service = Object.assign(Object.create(ReactionService.prototype), {
		meta: { enableReactionsBuffering: false, enableChartsForRemoteUser: true },
		usersRepository: {},
		notesRepository: repository,
		noteReactionsRepository: repository,
		emojisRepository: { findOne: vi.fn() },
		utilityService: { toPunyNullable: (host: string | null) => host, isMediaSilencedHost: () => false },
		customEmojiService: { localEmojisCache: { fetch: vi.fn().mockResolvedValue(new Map()) } },
		roleService: { getUserRoles: vi.fn().mockResolvedValue([]) },
		userEntityService: { isLocalUser: () => false },
		noteEntityService: { isVisibleForMe: vi.fn().mockResolvedValue(true) },
		userBlockingService: { checkBlocked: vi.fn().mockResolvedValue(false) },
		reactionsBufferingService: {},
		idService: { gen: () => 'reaction', parse: () => ({ date: new Date(0) }) },
		featuredService: { updateGlobalNotesRanking: vi.fn(), updatePerUserNotesRanking: vi.fn() },
		globalEventService: { publishNoteStream: vi.fn() },
		apRendererService: {},
		apDeliverManagerService: {},
		notificationService: { createNotification: vi.fn() },
		perUserReactionsChart: { update: vi.fn() },
	});
	return { service: service as ReactionService, repository, builders };
}

describe('reaction persistence', () => {
	test('preserves existing emoji and legacy normalization', async () => {
		const emoji = createService();
		await emoji.service.create({ id: 'user', host: null, isBot: false }, note, '👍');
		assert.equal(emoji.repository.insert.mock.calls[0][0].reaction, '👍');
		const legacy = createService();
		await legacy.service.create({ id: 'user', host: null, isBot: false }, note, 'like');
		assert.equal(legacy.repository.insert.mock.calls[0][0].reaction, '👍');
	});

	test.each([null, 'remote.example'])('文字输入按普通回应规则处理，不保存文字（host: %s）', async host => {
		for (const [input, expected] of [['hello', '❤'], ['', '❤'], ['hello 👍', '👍']]) {
			const { service, repository } = createService();
			await service.create({ id: 'user', host, isBot: false }, note, input);
			assert.equal(repository.insert.mock.calls[0][0].reaction, expected);
		}
	});

	test('撤回表情回应时保留参数绑定，并撤回原有联邦 Like', async () => {
		const { service, repository, builders } = createService();
		const record = { id: 'reaction', userId: 'user', noteId: note.id, reaction: '❤' };
		repository.findOneBy.mockResolvedValue(record);
		const renderer = Object.assign(Object.create(ApRendererService.prototype), { config: { url: 'https://example.com' } });
		const delivery = { addFollowersRecipe: vi.fn(), execute: vi.fn().mockResolvedValue(undefined) };
		const createDeliverManager = vi.fn().mockReturnValue(delivery);
		Object.assign(service, {
			userEntityService: { isLocalUser: () => true },
			apRendererService: {
				renderLike: renderer.renderLike.bind(renderer),
				renderUndo: (object: unknown) => ({ type: 'Undo', object }),
				addContext: (object: unknown) => object,
			},
			apDeliverManagerService: { createDeliverManager },
		});
		await service.delete({ id: 'user', host: null, isBot: false }, { ...note, localOnly: false }, '❤');
		assert.deepEqual(repository.delete.mock.calls, [['reaction']]);
		const [sql, parameters] = builders[0].getQueryAndParameters();
		assert.ok(!sql.includes(record.reaction));
		assert.ok(parameters.includes(record.reaction));
		assert.ok(parameters.includes(`user/${record.reaction}`));
		assert.deepEqual(createDeliverManager.mock.calls[0][1], {
			type: 'Undo',
			object: {
				type: 'Like', id: 'https://example.com/likes/reaction', actor: 'https://example.com/users/user',
				object: 'https://example.com/notes/note', content: '❤', _misskey_reaction: '❤',
			},
		});
		assert.equal(delivery.execute.mock.calls.length, 1);
	});

	test('does not write reactions for deleted or inaccessible notes', async () => {
		const deleted = createService();
		await assert.rejects(deleted.service.create({ id: 'user', host: null, isBot: false }, { ...note, isDeleted: true }, '👍'));
		const inaccessible = createService();
		(inaccessible.service as any)['noteEntityService'].isVisibleForMe.mockResolvedValue(false);
		await assert.rejects(inaccessible.service.create({ id: 'user', host: null, isBot: false }, note, '👍'));
		assert.equal(deleted.repository.insert.mock.calls.length, 0);
		assert.equal(inaccessible.repository.insert.mock.calls.length, 0);
	});

	test('parses cached pairs at the first slash', () => {
		assert.deepEqual(parseReactionUserPair("user/text:x/'{}"), ['user', "text:x/'{}"]);
	});
});

describe('buffered reactions', () => {
	test('保留 Redis 中含斜线的历史回应内容', async () => {
		const service = Object.assign(Object.create(ReactionsBufferingService.prototype), {
			redisForReactions: {
				pipeline: () => ({
					hgetall: vi.fn(), zrange: vi.fn(), exec: vi.fn().mockResolvedValue([
						[null, {}], [null, ['user/text:a/b']],
					]),
				}),
			},
		});
		const result = await service.get('note');
		assert.deepEqual(result.pairs, [['user', 'text:a/b']]);
	});
});

describe('多表情回应数据库约束与计数', () => {
	let db: DataSource;
	let redis: Redis.Redis;
	const redisPrefix = `reaction-persistence-${randomUUID()}`;
	const bufferedNoteIds: string[] = [];
	let serial = 0;
	const users = ['notereactionauthor', 'notereactionalice', 'notereactionbob'];
	const emojiNames = Array.from({ length: 110 }, (_, index) => `reaction${index}`);
	let service: ReactionService;

	beforeAll(async () => {
		db = await initTestDb();
		redis = new Redis.Redis({ ...loadConfig().redis, keyPrefix: `${redisPrefix}:` });
		await db.getRepository(MiUser).insert(users.map(id => ({ id, username: id, usernameLower: id })));
		service = createService().service;
		Object.assign(service, {
			notesRepository: db.getRepository(MiNote),
			noteReactionsRepository: db.getRepository(MiNoteReaction),
			idService: { gen: () => `notereaction${String(++serial).padStart(8, '0')}`, parse: () => ({ date: new Date(0) }) },
			customEmojiService: { localEmojisCache: { fetch: async () => new Map(emojiNames.map(name => [name, { name, roleIdsThatCanBeUsedThisEmojiAsReaction: [] }])) } },
		});
	});
	afterAll(async () => {
		if (redis) {
			const pipeline = redis.pipeline();
			for (const id of bufferedNoteIds) {
				pipeline.del(`reactionsBufferDeltas:${id}`, `reactionsBufferPairs:${id}`, `reactionsBufferPairOperations:${id}`);
			}
			await pipeline.exec();
			await redis.quit();
		}
		if (db?.isInitialized) await db.destroy();
	});

	async function createNote() {
		const id = `reactionnote${++serial}`;
		await db.getRepository(MiNote).insert({ id, userId: users[0], text: 'reactions', visibility: 'public', localOnly: true });
		return db.getRepository(MiNote).findOneByOrFail({ id });
	}

	const actor = (id: string) => ({ id, host: null, isBot: false });

	function bufferingService(noteId: string) {
		bufferedNoteIds.push(noteId);
		return Object.assign(Object.create(ReactionsBufferingService.prototype), {
			config: { redis: { prefix: redisPrefix } },
			redisForReactions: redis,
			notesRepository: db.getRepository(MiNote),
		}) as ReactionsBufferingService;
	}

	test('缓冲撤回不会被旧缓存重新加入，单独撤回仍保留其他用户', async () => {
		const target = await createNote();
		const buffer = bufferingService(target.id);
		const originalPairs = [`${users[1]}/👍`, `${users[2]}/🎉`];
		await db.getRepository(MiNote).update(target.id, { reactions: { '👍': 1, '🎉': 1 }, reactionAndUserPairCache: originalPairs });
		await buffer.delete(target.id, users[1], '👍');
		await buffer.create(target.id, users[1], '😀', originalPairs);
		expect((await buffer.get(target.id)).pairs).not.toContainEqual([users[1], '👍']);
		await buffer.bake();
		let saved = await db.getRepository(MiNote).findOneByOrFail({ id: target.id });
		expect(saved.reactions).toEqual({ '👍': 0, '🎉': 1, '😀': 1 });
		expect(saved.reactionAndUserPairCache.sort()).toEqual([`${users[2]}/🎉`, `${users[1]}/😀`].sort());
		await buffer.delete(target.id, users[1], '😀');
		await buffer.bake();
		saved = await db.getRepository(MiNote).findOneByOrFail({ id: target.id });
		expect(saved.reactionAndUserPairCache).toEqual([`${users[2]}/🎉`]);
	});

	test('原子取出后到达的同种回应保留到下一批，多个计数均累加', async () => {
		const target = await createNote();
		const buffer = bufferingService(target.id);
		await buffer.create(target.id, users[1], '👍', []);
		await buffer.create(target.id, users[1], '🎉', []);
		const originalEval = redis.eval;
		const evalSpy = vi.spyOn(redis, 'eval').mockImplementationOnce(async (...args) => {
			const snapshot = await Reflect.apply(originalEval, redis, args);
			await buffer.create(target.id, users[2], '👍', []);
			return snapshot;
		});
		try {
			await buffer.bake();
		} finally {
			evalSpy.mockRestore();
		}
		expect((await db.getRepository(MiNote).findOneByOrFail({ id: target.id })).reactions).toEqual({ '👍': 1, '🎉': 1 });
		expect(await buffer.get(target.id)).toEqual({ deltas: { '👍': 1 }, pairs: [[users[2], '👍']] });
		await buffer.bake();
		const saved = await db.getRepository(MiNote).findOneByOrFail({ id: target.id });
		expect(saved.reactions).toEqual({ '👍': 2, '🎉': 1 });
		expect(saved.reactionAndUserPairCache.sort()).toEqual([`${users[1]}/👍`, `${users[1]}/🎉`, `${users[2]}/👍`].sort());
	});

	test('落库失败合并新到达的增量，重试保留最新增删且不复活旧缓存', async () => {
		const target = await createNote();
		const buffer = bufferingService(target.id);
		const originalPairs = [`${users[1]}/👍`, `${users[2]}/❤`];
		await db.getRepository(MiNote).update(target.id, { reactions: { '👍': 1, '❤': 1 }, reactionAndUserPairCache: originalPairs });
		await buffer.delete(target.id, users[1], '👍');
		await buffer.delete(target.id, users[2], '❤');
		await buffer.create(target.id, users[1], '😀', originalPairs);
		Object.assign(buffer, {
			notesRepository: {
				manager: {
					transaction: (callback: (manager: EntityManager) => Promise<unknown>) => db.transaction(async manager => {
						await callback(manager);
						await buffer.create(target.id, users[1], '👍', originalPairs);
						await buffer.delete(target.id, users[1], '😀');
						await buffer.create(target.id, users[2], '🎉', originalPairs);
						throw new Error('database failed');
					}),
				},
			},
		});
		await expect(buffer.bake()).rejects.toThrow('database failed');
		const pending = await buffer.get(target.id);
		expect(pending.deltas).toEqual({ '👍': 0, '❤': -1, '😀': 0, '🎉': 1 });
		expect(pending.pairs.map(pair => pair.join('/')).sort()).toEqual([`${users[1]}/👍`, `${users[2]}/🎉`].sort());
		expect((await db.getRepository(MiNote).findOneByOrFail({ id: target.id })).reactions).toEqual({ '👍': 1, '❤': 1 });
		Object.assign(buffer, { notesRepository: db.getRepository(MiNote) });
		await buffer.bake();
		const saved = await db.getRepository(MiNote).findOneByOrFail({ id: target.id });
		expect(saved.reactions).toEqual({ '👍': 1, '❤': 0, '😀': 0, '🎉': 1 });
		expect(saved.reactionAndUserPairCache.sort()).toEqual([`${users[1]}/👍`, `${users[2]}/🎉`].sort());
		expect(await buffer.get(target.id)).toEqual({ deltas: {}, pairs: [] });
	});

	test('远端表情被降级后按原表情撤回，失败的重复回应不能撤回其他记录', async () => {
		const target = await createNote();
		target.reactionAcceptance = 'likeOnlyForRemote';
		await db.getRepository(MiNote).update(target.id, { reactionAcceptance: target.reactionAcceptance });
		const remote = { ...actor(users[1]), host: 'remote.example' };
		expect(await service.create(remote, target, '😀')).toBe('❤');
		await expect(service.create(remote, target, '🎉')).rejects.toThrow();
		await expect(service.delete(remote, target, '🎉')).rejects.toThrow('not reacted');
		expect((await db.getRepository(MiNote).findOneByOrFail({ id: target.id })).reactions).toEqual({ '❤': 1 });
		await service.delete(remote, target, '😀');
		expect(await db.getRepository(MiNoteReaction).countBy({ noteId: target.id })).toBe(0);
		expect((await db.getRepository(MiNote).findOneByOrFail({ id: target.id })).reactions['❤']).toBe(0);
	});

	test('同一人可添加不同表情，重复添加只计一次，撤回仅删除指定项', async () => {
		const target = await createNote();
		await service.create(actor(users[1]), target, '👍');
		await service.create(actor(users[1]), target, '🎉');
		await service.create(actor(users[2]), target, '👍');
		const duplicates = await Promise.allSettled(Array.from({ length: 3 }, () => service.create(actor(users[1]), target, '👍')));
		expect(duplicates.every(result => result.status === 'rejected')).toBe(true);
		await service.delete(actor(users[1]), target, '👍');
		const saved = await db.getRepository(MiNote).findOneByOrFail({ id: target.id });
		expect(saved.reactions).toEqual({ '👍': 1, '🎉': 1 });
		const entity = Object.assign(Object.create(NoteEntityService.prototype), { noteReactionsRepository: db.getRepository(MiNoteReaction), reactionService: service });
		expect(await entity.populateMyReactions(target, users[1])).toEqual(['🎉']);
		await expect(service.delete(actor(users[1]), target, '👍')).rejects.toThrow('not reacted');
		expect(await db.getRepository(MiNoteReaction).countBy({ noteId: target.id })).toBe(2);
	});

	test('历史别名、Unicode 变体和本地表情标记按同种回应去重并兼容撤回', async () => {
		for (const [legacy, canonical] of [['like', '👍'], ['❤️', '❤'], [':reaction0@.:', ':reaction0:']]) {
			const target = await createNote();
			await db.getRepository(MiNoteReaction).insert({ id: `legacyreaction${++serial}`, noteId: target.id, userId: users[1], reaction: legacy });
			await db.getRepository(MiNote).update(target.id, { reactions: { [legacy]: 1 }, reactionAndUserPairCache: [`${users[1]}/${legacy}`] });
			await expect(service.create(actor(users[1]), target, canonical)).rejects.toThrow();
			expect(await service.create(actor(users[2]), target, canonical)).toBe(service.decodeReaction(canonical).reaction);
			await service.delete(actor(users[1]), target, canonical);
			expect(Reflect.get(service, 'globalEventService').publishNoteStream).toHaveBeenLastCalledWith(target, 'unreacted', { reaction: service.decodeReaction(canonical).reaction, userId: users[1] });
			expect(await db.getRepository(MiNoteReaction).countBy({ noteId: target.id, userId: users[1] })).toBe(0);
			expect(await db.getRepository(MiNoteReaction).countBy({ noteId: target.id, userId: users[2] })).toBe(1);
			const saved = await db.getRepository(MiNote).findOneByOrFail({ id: target.id });
			expect(saved.reactions).toEqual({ [legacy]: 0, [canonical]: 1 });
			expect(saved.reactionAndUserPairCache).toEqual([`${users[2]}/${canonical}`]);
		}
	});

	test('种类上限合并历史别名并排除隐藏文字，满额仍可加入已有表情', async () => {
		const target = await createNote();
		const historical = [
			...emojiNames.slice(0, 98).map(name => ({ userId: users[1], reaction: `:${name}:` })),
			{ userId: users[1], reaction: 'like' },
			{ userId: users[2], reaction: '👍' },
			{ userId: users[1], reaction: 'text:以前的文字' },
		];
		await db.getRepository(MiNoteReaction).insert(historical.map(record => ({ ...record, id: `legacyreaction${++serial}`, noteId: target.id })));
		await db.getRepository(MiNote).update(target.id, { reactions: Object.fromEntries(historical.map(record => [record.reaction, 1])) });
		await service.create(actor(users[2]), target, ':reaction98:');
		await expect(service.create(actor(users[2]), target, ':reaction99:')).rejects.toThrow('100 different reactions');
		await service.create(actor(users[0]), target, '👍');
		const saved = await db.getRepository(MiNote).findOneByOrFail({ id: target.id });
		expect(saved.reactions['👍']).toBe(2);
		expect(saved.reactions['text:以前的文字']).toBe(1);
		expect(saved.reactions['❤']).toBeUndefined();
		expect(await db.getRepository(MiNoteReaction).countBy({ noteId: target.id, reaction: 'text:以前的文字' })).toBe(1);
	});

	test('显式撤回历史文字原值不会误删同用户的爱心', async () => {
		const target = await createNote();
		const legacy = 'text:以前的文字';
		await db.getRepository(MiNoteReaction).insert({ id: `legacyreaction${++serial}`, noteId: target.id, userId: users[1], reaction: legacy });
		await db.getRepository(MiNote).update(target.id, { reactions: { [legacy]: 1 }, reactionAndUserPairCache: [`${users[1]}/${legacy}`] });
		expect(await service.create(actor(users[1]), target, '❤')).toBe('❤');
		await service.delete(actor(users[1]), target, legacy);
		await expect(service.delete(actor(users[1]), target, legacy)).rejects.toThrow('not reacted');
		expect((await db.getRepository(MiNoteReaction).findBy({ noteId: target.id })).map(record => record.reaction)).toEqual(['❤']);
		expect((await db.getRepository(MiNote).findOneByOrFail({ id: target.id })).reactions).toEqual({ [legacy]: 0, '❤': 1 });
	});

	test('100 个容器只限制新种类，计数与人数不占容器，并发只接受最后一种', async () => {
		const target = await createNote();
		for (const name of emojiNames.slice(0, 99)) await service.create(actor(users[1]), target, `:${name}:`);
		const results = await Promise.allSettled(emojiNames.slice(99, 104).map(name => service.create(actor(users[1]), target, `:${name}:`)));
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		expect(results.filter(result => result.status === 'rejected')).toHaveLength(4);
		await service.create(actor(users[2]), target, ':reaction0:');
		let saved = await db.getRepository(MiNote).findOneByOrFail({ id: target.id });
		expect(saved.reactions[':reaction0:']).toBe(2);
		expect(Object.values(saved.reactions).reduce((sum, count) => sum + count, 0)).toBe(101);
		await service.delete(actor(users[1]), target, ':reaction0:');
		await expect(service.create(actor(users[1]), target, ':reaction105:')).rejects.toThrow('100 different reactions');
		await service.delete(actor(users[2]), target, ':reaction0:');
		await service.create(actor(users[1]), target, ':reaction105:');
		saved = await db.getRepository(MiNote).findOneByOrFail({ id: target.id });
		expect(Object.values(saved.reactions).filter(count => count > 0)).toHaveLength(100);
	});
});
