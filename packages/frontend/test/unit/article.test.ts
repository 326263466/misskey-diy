/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/vue';
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue';
import type { Endpoints } from 'misskey-js';
import { isArticle, articleBody, rememberPublishedArticle } from '@/utility/article.js';
import { sanitizeMarkdown } from '@/utility/markdown.js';
import ArticleComments from '@/pages/articles/article-comments.vue';
import Article from '@/pages/articles/article.vue';
import { i18n } from '@/i18n.js';
import { DI } from '@/di.js';

const mocks = vi.hoisted(() => ({ api: vi.fn<(endpoint: string, params: Record<string, unknown>) => Promise<unknown>>(), confirm: vi.fn(), toast: vi.fn(), router: {}, signedIn: true }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/i.js', () => ({ get $i() { return mocks.signedIn ? { id: 'self', username: 'self' } : null; } }));
vi.mock('@/os.js', () => ({ confirm: mocks.confirm, toast: mocks.toast }));
vi.mock('@/router.js', () => ({ useRouter: () => mocks.router }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/components/MkUserCardMini.vue', () => ({ default: { template: '<aside/>' } }));
vi.mock('@/components/MkTipSection.vue', () => ({ default: { template: '<aside/>' } }));
vi.mock('@/components/MkMarkdown.vue', () => ({ default: { props: ['text'], template: '<div>{{ text }}</div>' } }));
vi.mock('@/utility/emoji-picker.js', () => ({ emojiPicker: { show: vi.fn() } }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { detach() {} } }));
vi.mock('@/components/MkPostFormAttaches.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkUploaderItems.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/composables/use-uploader.js', async () => {
	const { ref } = await import('vue');
	return { useUploader: () => ({ items: ref([]), readyForUpload: ref(false), events: { on: vi.fn() }, reset: vi.fn() }) };
});
vi.mock('@/components/MkTextarea.vue', () => ({
	default: {
		props: ['modelValue', 'disabled', 'readonly', 'placeholder'], emits: ['update:modelValue'],
		template: '<div><label><slot name="label"/><textarea :value="modelValue" :disabled="disabled" :readonly="readonly" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)"/></label><slot name="counter"/></div>',
	},
}));
vi.mock('@/components/MkButton.vue', () => ({
	default: { props: ['type', 'disabled'], template: '<button :type="type ?? \'button\'" :disabled="disabled"><slot/></button>' },
}));

test('distinguishes Markdown articles from Pages and keeps older MFM blocks unchanged', () => {
	const article = { content: [{ id: 'body', type: 'markdown' as const, text: '# Article' }] };
	expect(isArticle(article)).toBe(true);
	expect(articleBody(article)).toBe('# Article');
	for (const content of [[], [{ id: 'body', type: 'text' as const, text: '$[rainbow MFM]' }], [...article.content, { id: 'extra', type: 'text' as const, text: 'Page' }]]) {
		expect(isArticle({ content })).toBe(false);
		expect(articleBody({ content })).toBe('');
	}
});

test('removes executable HTML, remote embeds, unsafe URLs and event attributes', () => {
	const html = sanitizeMarkdown('<script>alert(1)</script><iframe src="https://evil.test"></iframe><img src="javascript:alert(1)" onerror="alert(1)"><a href="data:text/html,evil" onclick="alert(1)">bad</a><a href="//evil.test">relative</a><svg onload="alert(1)"></svg><span style="position:fixed">text</span>');
	expect(html).not.toMatch(/script|iframe|javascript:|data:|onerror|onclick|onload|<svg|style=/);
	expect(html).not.toContain('//evil.test');
	expect(html).toContain('text');
	const deferred = sanitizeMarkdown('<img src="//evil.test/image.png"><img data-image-src="javascript:alert(1)"><img src="data:image/svg+xml,evil">');
	expect(deferred).not.toMatch(/evil\.test|javascript:|data:image/);
});

test('preserves safe headings, tables, code, links, images and disabled task checkboxes', () => {
	const html = sanitizeMarkdown('<h2 id="heading">Heading</h2><table><tr><td align="right">Cell</td></tr></table><pre><code class="language-ts">const n = 1;</code></pre><a href="https://example.com">Link</a><img src="https://example.com/image.png" alt="Image"><input checked onclick="evil()"><input type="text" value="editable">');
	expect(html).toContain('id="heading"');
	expect(html).toContain('align="right"');
	expect(html).toContain('class="language-ts"');
	expect(html).toContain('href="https://example.com"');
	expect(html).toContain('alt="Image"');
	const host = document.createElement('div');
	host.innerHTML = html;
	expect(host.querySelector('img')?.getAttribute('src')).toBeNull();
	expect(host.querySelector('img')?.getAttribute('data-image-src')).toBe('https://example.com/image.png');
	const inputs = [...host.querySelectorAll('input')];
	expect(inputs).toHaveLength(2);
	expect(inputs.every(input => input.type === 'checkbox' && input.disabled)).toBe(true);
	expect(inputs[0].checked).toBe(true);
	expect(inputs[1].checked).toBe(false);
});

describe('published article navigation', () => {
	beforeEach(() => { vi.clearAllMocks(); });
	afterEach(cleanup);

	function detail(title: string): Endpoints['articles/show']['res'] {
		return {
			article: { id: 'article', title, name: 'article', userId: 'self', user: { id: 'self', username: 'self', host: null }, createdAt: '2026-10-08T00:00:00.000Z', updatedAt: '2026-10-08T00:00:00.000Z', content: [{ id: 'body', type: 'markdown', text: `Body ${title}` }], likedCount: 0, isLiked: false },
			commentsCount: 0, isFavorited: false,
		} as Endpoints['articles/show']['res'];
	}

	function mountArticle(mode: 'keepAlive' | 'stacked') {
		const visible = ref(true);
		const pageActive = ref(true);
		const host = defineComponent({ setup: () => () => h(KeepAlive, null, { default: () => visible.value ? h(Article, { articleId: 'article' }) : h('div') }) });
		const view = render(host, {
			global: {
				provide: { [DI.pageActive]: pageActive, inWindow: true },
				directives: { tooltip: {} },
				stubs: {
					PageWithHeader: { template: '<main><slot/></main>' },
					MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
					MkUserName: { props: ['user'], template: '<span>{{ user.username }}</span>' },
					MkAvatar: true, MkTime: true, MkLoading: true, MkError: true, XArticleComments: true,
				},
			},
		});
		return { ...view, active: mode === 'keepAlive' ? visible : pageActive };
	}

	test.each(['keepAlive', 'stacked'] as const)('uses fresh published content immediately and ignores a stale request in %s navigation', async mode => {
		rememberPublishedArticle(mocks.router, 'article', detail('Before'));
		const view = mountArticle(mode);
		expect(view.getByRole('heading', { name: 'Before' })).toBeTruthy();
		expect(mocks.api).not.toHaveBeenCalled();
		let finishPrevious: (value: Endpoints['articles/show']['res']) => void;
		mocks.api.mockImplementationOnce(() => new Promise(resolve => { finishPrevious = resolve; }));
		await fireEvent.click(view.getAllByRole('button', { name: i18n.ts.reload })[0]);
		view.active.value = false;
		await nextTick();
		rememberPublishedArticle(mocks.router, 'article', detail('After'));
		view.active.value = true;
		await waitFor(() => expect(view.getByRole('heading', { name: 'After' })).toBeTruthy());
		finishPrevious!(detail('Stale'));
		await nextTick();
		expect(view.queryByRole('heading', { name: 'Stale' })).toBeNull();
		expect(view.getByText('Body After')).toBeTruthy();
		expect(mocks.api).toHaveBeenCalledTimes(1);
	});

	test('refreshes a cached article after optional preloading fails', async () => {
		rememberPublishedArticle(mocks.router, 'article', detail('Before'));
		const view = mountArticle('stacked');
		view.active.value = false;
		await nextTick();
		rememberPublishedArticle(mocks.router, 'article', null);
		mocks.api.mockResolvedValueOnce(detail('After'));
		view.active.value = true;
		await waitFor(() => expect(view.getByRole('heading', { name: 'After' })).toBeTruthy());
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('articles/show', { articleId: 'article' });
		expect(mocks.toast).not.toHaveBeenCalled();
	});
});

type ArticleComment = Endpoints['articles/comments']['res'][number];

function makeComment(id: string, replyTo: ArticleComment | null = null, repliesCount = 0): ArticleComment {
	return {
		id, articleId: 'article', text: `text-${id}`, files: [], createdAt: '2026-10-07T00:00:00.000Z',
		user: { id: `user-${id}`, username: `user-${id}`, host: null } as ArticleComment['user'],
		canDelete: true, replyId: replyTo?.id ?? null, repliesCount,
		replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, user: replyTo.user } : null,
	};
}

function renderComments(articleId = 'article') {
	const view = render(ArticleComments, {
		props: { articleId, count: 3 },
		global: {
			stubs: {
				MkAvatar: { props: ['user'], template: '<img :alt="user.username"/>' },
				MkUserName: { props: ['user'], template: '<span>{{ user.username }}</span>' },
				MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
				MkTime: { props: ['time'], template: '<time>{{ time }}</time>' },
				Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
				MkCommentEmpty: true,
				MkLoading: true,
			},
			directives: { appear: () => {} },
		},
	});
	view.container.querySelector('section')!.scrollIntoView = vi.fn();
	return view;
}

describe('article comment threads', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.signedIn = true;
		mocks.api.mockResolvedValue([]);
		mocks.confirm.mockResolvedValue({ canceled: false });
	});
	afterEach(() => {
		cleanup();
		mocks.signedIn = true;
	});

	test('未登录可以输入评论，但按钮和键盘提交都不能发布', async () => {
		mocks.signedIn = false;
		const view = renderComments();
		await fireEvent.update(view.getByRole('textbox'), '游客评论');
		expect((view.getByRole('button', { name: i18n.ts._article.publishComment }) as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.submit(view.container.querySelector('form')!);
		expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'articles/comments/create')).toBe(false);
		expect((view.getByRole('textbox') as HTMLTextAreaElement).value).toBe('游客评论');
	});

	test('keeps replies to a child in its parent thread and retains the target and draft after failure', async () => {
		const parent = makeComment('parent', null, 1);
		const child = makeComment('child', parent, 1);
		const grandchild = makeComment('grandchild', child);
		const other = makeComment('other');
		const created = makeComment('created', child);
		let shouldFail = true;
		mocks.api.mockImplementation(async (endpoint, params) => {
			if (endpoint === 'articles/comments/create') {
				if (shouldFail) throw new Error('Offline');
				return created;
			}
			return params.replyId === null ? [parent, other] : params.replyId === parent.id ? [child] : [grandchild];
		});
		const view = renderComments();
		await waitFor(() => expect(view.getByText(other.text)).toBeTruthy());
		expect(mocks.api).toHaveBeenCalledWith('articles/comments', expect.objectContaining({ articleId: 'article', replyId: null, limit: 21 }));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.loadMore }));
		await waitFor(() => expect(view.getAllByText(grandchild.text)).toHaveLength(1));
		const childRow = view.getByRole('img', { name: child.user.username }).closest('article')!;
		const parentThread = childRow.parentElement!;
		expect(view.getByText(parent.text).closest('article')!.parentElement).toBe(parentThread);
		expect(view.getByText(grandchild.text).closest('article')!.parentElement).toBe(parentThread);
		expect(view.getByText(other.text).closest('article')!.parentElement).not.toBe(parentThread);
		await fireEvent.click(within(childRow).getByRole('button', { name: new RegExp(i18n.ts.reply) }));
		// 回复框展开在被回复的评论下方，而不是复用顶部的发表评论框。
		const replyBox = await waitFor(() => within(childRow).getByRole('textbox') as HTMLTextAreaElement);
		expect(within(childRow).getByRole('button', { name: new RegExp(i18n.ts._article.cancelReply) }).getAttribute('aria-expanded')).toBe('true');
		await fireEvent.update(replyBox, 'New child reply');
		await fireEvent.submit(replyBox.closest('form')!);
		await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(i18n.ts.somethingHappened, 'error'));
		expect(replyBox.value).toBe('New child reply');
		shouldFail = false;
		await fireEvent.submit(replyBox.closest('form')!);
		await waitFor(() => expect(view.getByText(created.text)).toBeTruthy());
		expect(within(childRow).queryByRole('textbox')).toBeNull();
		expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'articles/comments/create').map(([, params]) => params)).toEqual([
			{ articleId: 'article', replyId: child.id, text: 'New child reply', fileIds: [] },
			{ articleId: 'article', replyId: child.id, text: 'New child reply', fileIds: [] },
		]);
		expect(view.getByText(created.text).closest('article')!.parentElement).toBe(parentThread);
		expect(view.emitted().countChange).toEqual([[1]]);
		expect((view.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
	});

	test('reloads promoted children after deleting a parent without deleting its descendants or the draft', async () => {
		const parent = makeComment('parent', null, 1);
		const child = makeComment('child', parent, 1);
		const grandchild = makeComment('grandchild', child);
		let deleted = false;
		mocks.api.mockImplementation(async (endpoint, params) => {
			if (endpoint === 'articles/comments/delete') { deleted = true; return undefined; }
			if (params.replyId === null) return deleted ? [{ ...child, replyId: null, replyTo: null }] : [parent];
			return params.replyId === parent.id ? [child] : [grandchild];
		});
		const view = renderComments();
		await waitFor(() => expect(view.getByText(parent.text)).toBeTruthy());
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.loadMore }));
		await waitFor(() => expect(view.getByText(grandchild.text)).toBeTruthy());
		await fireEvent.update(view.getByRole('textbox'), 'Unsent draft');
		const parentRow = view.getByText(parent.text).closest('article')!;
		await fireEvent.click(within(parentRow).getByRole('button', { name: i18n.ts.delete }));
		await waitFor(() => expect(view.queryByText(parent.text)).toBeNull());
		await waitFor(() => expect(view.getByText(child.text)).toBeTruthy());
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.loadMore }));
		await waitFor(() => expect(view.getByText(grandchild.text)).toBeTruthy());
		expect(view.getByText(child.text).closest('article')).toBe(view.container.querySelector('article'));
		expect(view.getByText(grandchild.text).closest('article')!.parentElement).toBe(view.getByText(child.text).closest('article')!.parentElement);
		expect(view.emitted().countChange).toEqual([[-1]]);
		expect((view.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Unsent draft');
	});

	test('keeps a failed reply page retryable without duplicating its parent', async () => {
		const parent = makeComment('parent', null, 1);
		const child = makeComment('child', parent);
		let shouldFail = true;
		mocks.api.mockImplementation(async (_endpoint, params) => {
			if (params.replyId === null) return [parent];
			if (shouldFail) throw new Error('Offline');
			return [child];
		});
		const view = renderComments();
		await waitFor(() => expect(view.getByText(parent.text)).toBeTruthy());
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.loadMore }));
		await waitFor(() => expect(view.getByRole('button', { name: i18n.ts.retry })).toBeTruthy());
		shouldFail = false;
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(view.getByText(child.text)).toBeTruthy());
		expect(view.getAllByText(parent.text)).toHaveLength(1);
	});

	test('ignores a pending page from the previous article', async () => {
		let resolvePrevious: (comments: ArticleComment[]) => void;
		const previousPage = new Promise<ArticleComment[]>(resolve => { resolvePrevious = resolve; });
		mocks.api.mockImplementation(async (_endpoint, params) => params.articleId === 'previous' ? previousPage : [makeComment('current')]);
		const view = renderComments('previous');
		await view.rerender({ articleId: 'current', count: 1 });
		await waitFor(() => expect(view.getByText('text-current')).toBeTruthy());
		resolvePrevious!([makeComment('previous')]);
		await new Promise<void>(resolve => window.setTimeout(resolve, 0));
		expect(view.queryByText('text-previous')).toBeNull();
		expect(view.getByText('text-current')).toBeTruthy();
	});
});
