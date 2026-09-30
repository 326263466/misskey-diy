/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test, vi } from 'vitest';
import OwnedChannels from '@/server/api/endpoints/channels/owned.js';

function endpoint() {
	const channels = [
		{ id: 'c4', userId: 'alice', isArchived: true },
		{ id: 'c3', userId: 'bob', isArchived: true },
		{ id: 'c2', userId: 'alice', isArchived: true },
		{ id: 'c1', userId: 'alice', isArchived: false },
	];
	const query = {
		conditions: [] as Record<string, unknown>[],
		untilId: undefined as string | undefined,
		count: 5,
		andWhere(condition: Record<string, unknown>) { this.conditions.push(condition); return this; },
		limit(count: number) { this.count = count; return this; },
		async getMany() {
			return channels.filter(channel => this.conditions.every(condition => Object.entries(condition).every(([key, value]) => channel[key as keyof typeof channel] === value)) && (!this.untilId || channel.id < this.untilId)).slice(0, this.count);
		},
	};
	const instance = new OwnedChannels(
		{ createQueryBuilder: () => query } as never,
		{ pack: vi.fn(async value => value) } as never,
		{ makePaginationQuery: (_: unknown, _sinceId: string | undefined, untilId: string | undefined) => { query.untilId = untilId; return query; } } as never,
	);
	return instance;
}

test('owned channels defaults to unarchived and only returns the current owner', async () => {
	const result = await endpoint().exec({}, { id: 'alice' } as never, null);
	expect(result.map((item: { id: string }) => item.id)).toEqual(['c1']);
});

test('archived owned channels remain discoverable with owner-scoped pagination', async () => {
	const first = await endpoint().exec({ isArchived: true, limit: 1 }, { id: 'alice' } as never, null);
	expect(first.map((item: { id: string }) => item.id)).toEqual(['c4']);
	const second = await endpoint().exec({ isArchived: true, limit: 1, untilId: first[0].id }, { id: 'alice' } as never, null);
	expect(second.map((item: { id: string }) => item.id)).toEqual(['c2']);
});

test('rejects non-boolean archive filters', async () => {
	await expect(endpoint().exec({ isArchived: 'true' }, { id: 'alice' } as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
});
