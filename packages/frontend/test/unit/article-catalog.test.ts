/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/vue';
import MkMarkdown from '@/components/MkMarkdown.vue';
import type { MarkdownHeading } from '@/components/MkMarkdown.vue';
import ArticleToc from '@/pages/articles/article.toc.vue';

vi.mock('@/store.js', () => ({ store: { s: { darkMode: false } } }));
vi.mock('@/utility/external-link.js', () => ({ confirmExternalLink: vi.fn() }));

afterEach(cleanup);

function latestCatalog(view: ReturnType<typeof render>): MarkdownHeading[] | undefined {
	return (view.emitted().catalog?.at(-1) as [MarkdownHeading[]] | undefined)?.[0];
}

test('目录对应真实标题，保留重复标题并识别 Setext 层级', async () => {
	const view = render(MkMarkdown, { props: {
		previewId: 'article-catalog',
		text: '# 重复标题\n\n> ## 引用内标题\n\n## 重复标题\n\nSetext 一级\n===\n\nSetext 二级\n---',
	} });
	await waitFor(() => expect(latestCatalog(view)).toHaveLength(4));
	const catalog = latestCatalog(view)!;
	expect(catalog.map(({ text, level }) => ({ text, level }))).toEqual([
		{ text: '重复标题', level: 1 },
		{ text: '重复标题', level: 2 },
		{ text: 'Setext 一级', level: 1 },
		{ text: 'Setext 二级', level: 2 },
	]);
	expect(new Set(catalog.map(heading => heading.id)).size).toBe(catalog.length);
	const headings = within(view.container as HTMLElement).getAllByRole('heading');
	expect(catalog.map(heading => heading.id)).toEqual(headings.filter(heading => heading.id).map(heading => heading.id));
	for (const entry of catalog) {
		const heading = document.getElementById(entry.id);
		expect(view.container.contains(heading)).toBe(true);
		expect(heading?.textContent).toBe(entry.text);
		expect(heading?.tagName).toBe(`H${entry.level}`);
	}
});

test('正文不再包含标题时清空目录，代码块内的井号不算标题', async () => {
	const view = render(MkMarkdown, { props: { text: '# 原有标题' } });
	await waitFor(() => expect(latestCatalog(view)).toHaveLength(1));
	await view.rerender({ text: '普通正文\n\n```md\n# 代码中的标题\n```' });
	await waitFor(() => expect(latestCatalog(view)).toEqual([]));
	expect(within(view.container as HTMLElement).queryAllByRole('heading')).toHaveLength(0);
});

test('点击同名目录项时聚焦对应的正文标题', async () => {
	const previewId = 'article-catalog-navigation';
	const view = render(MkMarkdown, { props: { previewId, text: '# 重复标题\n\n正文\n\n## 重复标题' } });
	await waitFor(() => expect(latestCatalog(view)).toHaveLength(2));
	const headings = latestCatalog(view)!;
	const toc = render(ArticleToc, { props: { headings, previewId, compact: false } });
	const links = within(toc.container as HTMLElement).getAllByRole('link', { name: '重复标题' });
	await fireEvent.click(links[1]);
	expect(document.activeElement).toBe(document.getElementById(headings[1].id));
	expect(document.activeElement).not.toBe(document.getElementById(headings[0].id));
});
