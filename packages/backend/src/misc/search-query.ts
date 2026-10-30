/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ApiError } from '@/server/api/error.js';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export const searchTimeoutError = {
	message: 'Search took too long. Refine the query and try again.',
	code: 'SEARCH_TIMEOUT',
	id: 'ba0473a0-5a82-431a-bf14-4b8145756bd5',
	kind: 'server',
	httpStatusCode: 503,
} as const;

export const searchProviderErrors = {
	searchUnavailable: {
		message: 'Search is temporarily unavailable. Please try again later.',
		code: 'SEARCH_UNAVAILABLE',
		id: '8d0ad6de-f1e2-4f89-9bdc-2bf493473ca2',
		kind: 'server',
		httpStatusCode: 503,
	},
} as const;

export type DatabaseSearchProvider = 'sqlLike' | 'sqlPgroonga';

export async function runSearchQuery<T extends ObjectLiteral>(query: SelectQueryBuilder<T>, options: { deadline?: number; master?: boolean } = {}): Promise<T[]> {
	const timeout = Math.min(2500, options.deadline == null ? 2500 : options.deadline - Date.now());
	if (timeout <= 0) throw new ApiError(searchTimeoutError);
	const runner = query.connection.createQueryRunner(options.master ? 'master' : 'slave');
	try {
		await runner.startTransaction();
		// SET LOCAL 不泄漏到连接池中的下一个请求；由数据库真正取消查询，而非仅让 HTTP 超时。
		await runner.query("SELECT set_config('statement_timeout', $1, true)", [`${timeout}ms`]);
		const rows = await query.clone().setQueryRunner(runner).getMany();
		await runner.commitTransaction();
		return rows;
	} catch (error) {
		if (runner.isTransactionActive) await runner.rollbackTransaction();
		if ((error as { driverError?: { code?: string } }).driverError?.code === '57014') {
			throw new ApiError(searchTimeoutError);
		}
		throw error;
	} finally {
		await runner.release();
	}
}
