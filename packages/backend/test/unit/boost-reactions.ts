/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert/strict';
import { describe, test, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { ReactionService } from '@/core/ReactionService.js';
import { ReactionsBufferingService } from '@/core/ReactionsBufferingService.js';
import { normalizeTextReaction, parseReactionUserPair } from '@/misc/reaction.js';

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

describe('text boosts', () => {
	test('normalizes a single-line NFC body and keeps the text prefix', () => {
		assert.equal(normalizeTextReaction('text:  Cafe\u0301 👍  '), 'text:Café 👍');
		assert.equal(normalizeTextReaction(`text:${'🚀'.repeat(16)}`), `text:${'🚀'.repeat(16)}`);
	});

	test('counts grapheme clusters rather than UTF-16 code units', () => {
		assert.equal(normalizeTextReaction(`text:${'👨‍👩‍👧‍👦'.repeat(16)}`), `text:${'👨‍👩‍👧‍👦'.repeat(16)}`);
		assert.equal(normalizeTextReaction(`text:${'a'.repeat(17)}`), null);
	});

	test('rejects empty, multiline, control and oversized bodies', () => {
		assert.equal(normalizeTextReaction('text:   '), null);
		assert.equal(normalizeTextReaction('hello'), null);
		assert.equal(normalizeTextReaction('text:\u200d'), null);
		assert.equal(normalizeTextReaction('text:a\nb'), null);
		assert.equal(normalizeTextReaction('text:a\u0000b'), null);
		assert.equal(normalizeTextReaction(`text:${'a'.repeat(241)}`), null);
	});

	test('uses parameter bindings for quote, slash and brace content', async () => {
		const { service, builders } = createService();
		await service.create({ id: 'user', host: null, isBot: false }, note, `text:x/'{} `);
		const [sql, parameters] = builders[0].getQueryAndParameters();
		assert.doesNotMatch(sql, /x\/\'\{\}/);
		assert.ok(Object.values(parameters).includes("text:x/'{}"));
		assert.ok(Object.values(parameters).includes("user/text:x/'{}"));
	});

	test('preserves existing emoji and legacy normalization', async () => {
		const emoji = createService();
		await emoji.service.create({ id: 'user', host: null, isBot: false }, note, '👍');
		assert.equal(emoji.repository.insert.mock.calls[0][0].reaction, '👍');
		const legacy = createService();
		await legacy.service.create({ id: 'user', host: null, isBot: false }, note, 'like');
		assert.equal(legacy.repository.insert.mock.calls[0][0].reaction, '👍');
	});

	test('downgrades text content from remote Like activities', async () => {
		const { service, repository } = createService();
		await service.create({ id: 'user', host: 'remote.example', isBot: false }, note, 'text:hello');
		assert.equal(repository.insert.mock.calls[0][0].reaction, '❤');
	});

	test('rejects invalid text boosts from local actors', async () => {
		const { service, repository } = createService();
		await assert.rejects(service.create({ id: 'user', host: null, isBot: false }, note, 'text:'), {
			id: '979fafab-ba6d-4316-be72-84010a218365',
		});
		assert.equal(repository.insert.mock.calls.length, 0);
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
	test('parses Redis pairs with slashes in the boost body', async () => {
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
