/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { CONTENT_LIMITS } from 'misskey-js';
import { assertContentLength, collectPageText, contentTooLongError, isContentTooLong } from '@/misc/content-limits.js';
import { assertArticleTagsAvailable, invalidArticleTagsErrorId, normalizeArticleTags } from '@/misc/article-tags.js';
import { NoteDraftService } from '@/core/NoteDraftService.js';
import { PageService } from '@/core/PageService.js';
import type { MiLocalUser } from '@/models/User.js';

describe('内容字数限制', () => {
	test('按 Unicode 码点接受边界，超限时拒绝且不截断', () => {
		const text = '😀'.repeat(CONTENT_LIMITS.noteText);
		expect(() => assertContentLength(text, CONTENT_LIMITS.noteText)).not.toThrow();
		expect(() => assertContentLength(`${text}字`, CONTENT_LIMITS.noteText)).toThrow(contentTooLongError.message);
		expect(Array.from(text)).toHaveLength(CONTENT_LIMITS.noteText);
	});

	test('只有未修改的历史超限内容可以保留', () => {
		const previous = '旧'.repeat(3000);
		expect(isContentTooLong(previous, CONTENT_LIMITS.noteText, previous)).toBe(false);
		expect(isContentTooLong(undefined, CONTENT_LIMITS.noteText, previous)).toBe(false);
		expect(isContentTooLong(null, CONTENT_LIMITS.noteText, previous)).toBe(false);
		expect(isContentTooLong(`${previous}新`, CONTENT_LIMITS.noteText, previous)).toBe(true);
	});

	test.each(['字', '😀'])('文章标签接受10个%s，拒绝新超限值并保留原样旧标签', async character => {
		const tag = character.repeat(CONTENT_LIMITS.articleTag);
		const legacy = `${tag}${character}`;
		const repository = { findOne: vi.fn().mockResolvedValue({ articleTags: [tag, legacy] }) };
		await expect(assertArticleTagsAvailable([tag], repository as never)).resolves.toBeUndefined();
		await expect(assertArticleTagsAvailable([legacy], repository as never)).rejects.toMatchObject({ id: invalidArticleTagsErrorId });
		await expect(assertArticleTagsAvailable([legacy], repository as never, [legacy])).resolves.toBeUndefined();
	});

	test('文章标签按NFKC归一化后的字数验证，不能通过兼容字符绕过上限', async () => {
		const tags = normalizeArticleTags(['㍿'.repeat(3)]);
		const repository = { findOne: vi.fn().mockResolvedValue({ articleTags: tags }) };
		await expect(assertArticleTagsAvailable(tags, repository as never)).rejects.toMatchObject({ id: invalidArticleTagsErrorId });
		expect(repository.findOne).not.toHaveBeenCalled();
	});

	test('正文不能通过多个或嵌套区块绕过总上限', async () => {
		const content = [{ type: 'markdown', text: '😀'.repeat(CONTENT_LIMITS.articleText) }, { type: 'section', children: [{ type: 'text', text: '字' }] }];
		expect(Array.from(collectPageText(content))).toHaveLength(CONTENT_LIMITS.articleText + 1);
		const repository = { findBy: vi.fn() };
		const service = new PageService({} as never, repository as never, {} as never, {} as never, {} as never, {} as never, {} as never);
		await expect(service.create({ id: 'owner' } as never, { title: '标题', summary: null, content } as never)).rejects.toMatchObject({ id: contentTooLongError.id });
		expect(repository.findBy).not.toHaveBeenCalled();
	});

	test.each([undefined, 'text'])('草稿改成回复时，%s 文字参数都不能绕过评论限制', async textParam => {
		const draft = { id: 'draft', userId: 'owner', replyId: null, text: '字'.repeat(CONTENT_LIMITS.commentText + 1) };
		const repository = { findOneBy: vi.fn().mockResolvedValue(draft), createQueryBuilder: vi.fn() };
		const service = new NoteDraftService(
			{} as never, repository as never, {} as never, {} as never, {} as never, {} as never,
			{} as never, {} as never, {} as never, {} as never, {} as never,
		);
		await expect(service.update({ id: 'owner' } as MiLocalUser, draft.id, {
			replyId: 'parent', ...(textParam ? { text: draft.text } : {}),
		})).rejects.toMatchObject({ id: contentTooLongError.id });
		expect(repository.createQueryBuilder).not.toHaveBeenCalled();
	});
});
