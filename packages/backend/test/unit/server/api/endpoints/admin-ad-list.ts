/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { DataSource } from 'typeorm';
import { describe, expect, test, vi } from 'vitest';
import { QueryService } from '@/core/QueryService.js';
import AdminAdListEndpoint from '@/server/api/endpoints/admin/ad/list.js';

function createEndpoint() {
	const dataSource = new DataSource({ type: 'postgres', entities: [] });
	const query = dataSource.createQueryBuilder().select('ad.*').from('ad', 'ad');
	vi.spyOn(query, 'getMany').mockResolvedValue([]);

	const repository = { createQueryBuilder: vi.fn(() => query) };
	const queryService = {
		makePaginationQuery: QueryService.prototype.makePaginationQuery.bind({
			idService: { gen: vi.fn(() => 'generated-id') },
		}),
	};
	const endpoint = new AdminAdListEndpoint(repository as never, queryService as never);

	return { endpoint, query, repository };
}

describe('admin/ad/list publishing filter', () => {
	test.each([
		['until', { untilId: 'upper' }, /ad\.id < :untilId/],
		['since', { sinceId: 'lower' }, /ad\.id > :sinceId/],
		['bounded', { sinceId: 'lower', untilId: 'upper' }, /ad\.id > :sinceId.*ad\.id < :untilId/s],
	] as const)('keeps the %s cursor constraint grouped with expired-or-future filtering', async (_name, cursor, range) => {
		const { endpoint, query } = createEndpoint();

		await endpoint.exec({ limit: 10, publishing: false, ...cursor }, { id: 'moderator' } as never, null);

		const sql = query.getQuery();
		expect(sql).toMatch(range);
		expect(sql).toMatch(/AND \(ad\.expiresAt <= :now OR ad\.startsAt > :now\)/);
		expect(query.getParameters()).toMatchObject({ ...cursor, now: expect.any(Date) });
	});
});
