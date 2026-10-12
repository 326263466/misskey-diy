/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { CONTENT_LIMITS } from 'misskey-js';
import { ArticleService } from '@/core/ArticleService.js';
import type { MiPage } from '@/models/Page.js';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test.each(['字', '😀'])('文章评论拒绝超过上限的 %s，写入前保留原文', async character => {
	const db = { transaction: vi.fn() };
	const service = new ArticleService(db as never, {} as never, {} as never, {} as never, {} as never, {} as never);
	await expect(service.createComment('article', { id: 'reader' }, character.repeat(CONTENT_LIMITS.commentText + 1))).rejects.toBeInstanceOf(ArticleService.InvalidCommentError);
	expect(db.transaction).not.toHaveBeenCalled();
});

test('article reading finishes when view-count Redis commands do not resolve', async () => {
	vi.useFakeTimers();
	const repository = { countBy: vi.fn().mockResolvedValue(0), existsBy: vi.fn().mockResolvedValue(false), createQueryBuilder: vi.fn() };
	const db = { getRepository: () => repository };
	const redis = { status: 'ready', set: vi.fn().mockReturnValue(new Promise(() => {})) };
	const pageEntity = { pack: vi.fn(async (page: MiPage) => ({ id: page.id, articleViews: page.articleViews })) };
	const service = new ArticleService(db as never, redis as never, {} as never, {} as never, pageEntity as never, {} as never);
	vi.spyOn(service, 'getArticle').mockResolvedValue({ id: 'article', userId: 'author', articleViews: 0 } as MiPage);
	let finished = false;
	const reading = service.show('article', { id: 'reader' }).then(value => { finished = true; return value; });
	await vi.advanceTimersByTimeAsync(199);
	expect(finished).toBe(false);
	await vi.advanceTimersByTimeAsync(1);
	expect((await reading).article).toEqual({ id: 'article', articleViews: 0 });
	expect(repository.createQueryBuilder).not.toHaveBeenCalled();
});
