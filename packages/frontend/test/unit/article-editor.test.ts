/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import { CONTENT_LIMITS } from 'misskey-js';
import type { entities } from 'misskey-js';
import type { ArticleDraft } from '@/utility/article-drafts.js';
import Editor from '@/pages/articles/editor.vue';
import { i18n } from '@/i18n.js';
import { DI } from '@/di.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn(), push: vi.fn(), pushByPath: vi.fn(), selectFile: vi.fn(), createCover: vi.fn(), uploadFile: vi.fn(), popup: vi.fn(), popupMenu: vi.fn(), confirm: vi.fn(), getAccountMenu: vi.fn(), fetchInstance: vi.fn() }));
vi.mock('@/os.js', () => ({ toast: mocks.toast, popupAsyncWithDialog: mocks.popup, popupMenu: mocks.popupMenu, confirm: mocks.confirm }));
vi.mock('@/i.js', () => ({ ensureSignin: () => ({ id: 'article-test' }) }));
vi.mock('@/accounts.js', () => ({ getAccountMenu: mocks.getAccountMenu }));
vi.mock('@/router.js', async () => {
	const { inject } = await import('vue');
	const { DI } = await import('@/di.js');
	const router = { push: mocks.push, pushByPath: mocks.pushByPath };
	return { mainRouter: router, useRouter: () => inject(DI.router, undefined) ?? router };
});
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/store.js', () => ({ store: { s: { darkMode: false } } }));
vi.mock('@/instance.js', () => ({ instance: { articleCategories: [{ id: 'tech', name: '技术' }, { id: 'life', name: '生活' }] }, fetchInstance: mocks.fetchInstance }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/drive.js', () => ({ selectFile: mocks.selectFile, uploadFile: mocks.uploadFile }));
vi.mock('@/utility/article-cover.js', () => ({ createArticleCoverFile: mocks.createCover }));
vi.mock('@/utility/draft-file-protection.js', async () => {
	const { ref } = await import('vue');
	return { createDraftFileProtection: () => ({ id: 'composer:test', status: ref('saved'), restore: vi.fn(), update: vi.fn(), release: vi.fn(), markPersisted: vi.fn(), markStorageFailed: vi.fn(), dispose: vi.fn() }) };
});
vi.mock('@/components/MkUploaderDialog.vue', () => ({ default: {} }));
vi.mock('@/pages/articles/article.vue', () => ({ default: {} }));
vi.mock('md-editor-v3', async () => {
	const { defineComponent, h } = await import('vue');
	return { MdEditor: defineComponent({
		props: ['modelValue', 'disabled'],
		emits: ['update:modelValue', 'onUploadImg', 'onSave'],
		setup: (props, { emit, slots }) => () => h('div', [
			h('div', { class: 'md-editor-input-wrapper' }, [h('textarea', {
				'data-testid': 'markdown-body',
				value: props.modelValue,
				disabled: props.disabled,
				onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
				onKeydown: (event: KeyboardEvent) => { if (event.ctrlKey && event.key === 's') emit('onSave'); },
			})]),
			slots.defFooters?.(),
		]),
	}) };
});

const Button = defineComponent({ props: ['disabled'], emits: ['click'], setup: (p, { slots, emit }) => () => h('button', { disabled: p.disabled, onClick: (e: Event) => emit('click', e) }, slots.default?.()) });

function editor(articleId?: string, draftKey?: string, provide: Record<symbol, unknown> = {}) {
	const view = render(Editor, { props: { articleId, draftKey }, global: { provide, stubs: {
		PageWithHeader: { template: '<div><slot/></div>' }, MkLoading: true, MkAvatar: true, MkTime: true, Teleport: false,
		MkA: { template: '<a><slot/></a>' },
		MkModal: defineComponent({ inheritAttrs: false, emits: ['closed'], setup: (_, { emit, expose, slots }) => {
			expose({ close: () => emit('closed') });
			return () => h('div', slots.default?.({ maxHeight: 800, type: 'popup' }));
		} }),
		MkModalWindow: defineComponent({ inheritAttrs: false, emits: ['close', 'closed'], setup: (_, { emit, expose, slots }) => {
			expose({ close: () => emit('closed') });
			return () => h('section', { role: 'dialog' }, [slots.header?.(), slots.default?.(), slots.footer?.()]);
		} }),
		MkButton: Button,
	} } });
	const local = within(view.container as HTMLElement);
	const portal = within(document.body);
	return { ...view, ...local,
		getByRole: (role: Parameters<typeof local.getByRole>[0], options?: Parameters<typeof local.getByRole>[1]) => (role === 'dialog' ? portal : local).getByRole(role, options),
		queryByRole: (role: Parameters<typeof local.queryByRole>[0], options?: Parameters<typeof local.queryByRole>[1]) => (role === 'dialog' ? portal : local).queryByRole(role, options),
	};
}

async function fill(view: ReturnType<typeof editor>, title = 'Article') {
	await waitFor(() => expect(view.queryAllByRole('textbox')).toHaveLength(2));
	await fireEvent.update(view.getByLabelText(i18n.ts._article.title), title);
	await fireEvent.update(view.getByTestId('markdown-body'), '# Markdown');
}

async function openSettings(view: ReturnType<typeof editor>, editing = false) {
	await fireEvent.click(view.getAllByRole('button', { name: editing ? i18n.ts.save : i18n.ts.publish })[0]);
	return within(view.getByRole('dialog'));
}

async function openDrafts(view: ReturnType<typeof editor>) {
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._article.menu }));
	const items = mocks.popupMenu.mock.calls.at(-1)![0] as { text?: string; action?: () => void }[];
	items.find(item => item.text === i18n.ts._article.drafts)!.action!();
	await waitFor(() => expect(view.queryByRole('dialog')).not.toBeNull());
}

function selectedCategory(dialog: ReturnType<typeof within>) {
	const name = dialog.getByLabelText(i18n.ts._article.category).textContent?.trim();
	return name === '技术' ? 'tech' : name === '生活' ? 'life' : name === i18n.ts._article.categoryUnavailable ? 'deleted-category' : '';
}

async function chooseCategory(dialog: ReturnType<typeof within>, name: string) {
	await fireEvent.click(dialog.getByLabelText(i18n.ts._article.category));
	const options = within(within(document.body).getByRole('group', { name: i18n.ts._article.category }));
	await fireEvent.click(options.getByRole('button', { name }));
}

function storeDraft(key: string, values: Partial<ArticleDraft> = {}) {
	const draft: ArticleDraft = { version: 1, title: 'Draft title', summary: 'Draft summary', text: 'Draft body', name: 'draft-name', articleCategoryId: null, cover: null, updatedAt: '2026-10-07T00:00:00.000Z', ...values };
	localStorage.setItem(key, JSON.stringify(draft));
	return draft;
}

function drafts() {
	return Object.keys(localStorage).filter(key => key.startsWith('misskey:articleDraft:article-test')).map(key => ({ key, draft: JSON.parse(localStorage.getItem(key)!) as ArticleDraft }));
}

const generatedCover = { id: 'generated-cover', name: 'article-cover.png', type: 'image/png', url: 'https://example.com/generated.png', thumbnailUrl: null, isSensitive: false } as entities.DriveFile;

async function pagehide() {
	await fireEvent(window, new Event('pagehide'));
}

beforeEach(() => {
	vi.clearAllMocks();
	const storage: Record<string, string> = {};
	vi.stubGlobal('localStorage', new Proxy({ getItem: (key: string) => storage[key] ?? null, setItem: (key: string, value: string) => { storage[key] = value; }, removeItem: (key: string) => { delete storage[key]; }, clear: () => { for (const key of Object.keys(storage)) delete storage[key]; } }, { ownKeys: () => Object.keys(storage), getOwnPropertyDescriptor: () => ({ configurable: true, enumerable: true }) }));
	mocks.api.mockImplementation(async (endpoint: string) => endpoint === 'articles/drafts/list' ? [] : { id: 'published' });
	mocks.fetchInstance.mockResolvedValue(undefined);
	mocks.getAccountMenu.mockReturnValue([{ type: 'label', text: 'Account menu' }]);
	mocks.confirm.mockResolvedValue({ canceled: false });
	mocks.createCover.mockReset().mockImplementation(async () => new File(['cover'], 'article-cover.png', { type: 'image/png' }));
	mocks.uploadFile.mockReset().mockImplementation(() => ({ filePromise: Promise.resolve(generatedCover), abort: vi.fn() }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test.each([false, true])('owns one complete header without an external host (window: %s)', async inWindow => {
	const view = editor(undefined, undefined, inWindow ? { [DI.router]: { push: vi.fn(), pushByPath: vi.fn() } } : {});
	await waitFor(() => expect(view.queryByTestId('markdown-body')).not.toBeNull());
	const header = within(view.getByRole('banner'));
	expect(header.getByRole('textbox', { name: i18n.ts._article.title })).toBeTruthy();
	expect(header.getByRole('button', { name: i18n.ts._article.menu })).toBeTruthy();
	await fireEvent.click(header.getByRole('button', { name: i18n.ts._article.menu }));
	expect(mocks.popupMenu).toHaveBeenCalledTimes(1);
});

test.each(['title', 'summary', 'text'] as const)('retains an oversized legacy %s, blocks remote saves and accepts the Unicode boundary after correction', async field => {
	const content = {
		title: '😀'.repeat(CONTENT_LIMITS.articleTitle),
		summary: '😀'.repeat(CONTENT_LIMITS.articleSummary),
		text: '😀'.repeat(CONTENT_LIMITS.articleText),
	};
	const oversized = { ...content, [field]: `${content[field]}😀` };
	storeDraft('misskey:articleDraft:article-test:legacy', oversized);
	const view = editor();
	await waitFor(() => expect(view.queryByTestId('markdown-body')).not.toBeNull());
	const title = view.getByLabelText(i18n.ts._article.title) as HTMLInputElement;
	const body = view.getByTestId('markdown-body') as HTMLTextAreaElement;
	expect(title.value).toBe(oversized.title);
	expect(body.value).toBe(oversized.text);
	const settings = await openSettings(view);
	const summary = settings.getByLabelText(i18n.ts._article.summary) as HTMLTextAreaElement;
	expect(summary.value).toBe(oversized.summary);
	const submit = settings.getByRole('button', { name: i18n.ts.publish }) as HTMLButtonElement;
	expect(submit.disabled).toBe(true);
	expect((view.getByRole('button', { name: i18n.ts._article.saveDraft }) as HTMLButtonElement).disabled).toBe(true);
	await fireEvent.keyDown(body, { key: 's', ctrlKey: true });
	expect(mocks.toast).toHaveBeenCalledWith(i18n.ts._article.invalidArticle, 'error');
	expect(mocks.api).not.toHaveBeenCalled();
	await pagehide();
	expect(drafts().some(({ draft }) => draft[field] === oversized[field])).toBe(true);

	await fireEvent.update({ title, summary, text: body }[field], content[field]);
	expect(view.getByText(`${CONTENT_LIMITS.articleTitle}/${CONTENT_LIMITS.articleTitle}`)).toBeTruthy();
	expect(settings.getByText(`${CONTENT_LIMITS.articleSummary}/${CONTENT_LIMITS.articleSummary}`)).toBeTruthy();
	expect(view.getByText(`${CONTENT_LIMITS.articleText}/${CONTENT_LIMITS.articleText}`)).toBeTruthy();
	expect(submit.disabled).toBe(false);
	await fireEvent.click(submit);
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('pages/create', expect.objectContaining({
		title: content.title,
		summary: content.summary,
		content: [{ id: 'body', type: 'markdown', text: content.text }],
	})));
});

test('preserves unchanged oversized published fields while saving other edits, without allowing new oversized values', async () => {
	const original = {
		title: ` ${'😀'.repeat(CONTENT_LIMITS.articleTitle)} `,
		summary: ` ${'😀'.repeat(CONTENT_LIMITS.articleSummary)} `,
		text: '😀'.repeat(CONTENT_LIMITS.articleText + 1),
		articleTags: ['旧'.repeat(CONTENT_LIMITS.articleTag + 1)],
	};
	mocks.api.mockImplementation(async endpoint => {
		if (endpoint === 'pages/show') return { id: 'mine', userId: 'article-test', title: original.title, summary: original.summary, articleTags: original.articleTags, name: 'published-name', articleCategoryId: null, eyeCatchingImage: null, content: [{ type: 'markdown', text: original.text }] };
		if (endpoint === 'articles/drafts/save') return { revision: 1 };
		return {};
	});
	const view = editor('mine');
	await waitFor(() => expect(view.queryByTestId('markdown-body')).not.toBeNull());
	const settings = await openSettings(view, true);
	const summary = settings.getByLabelText(i18n.ts._article.summary) as HTMLTextAreaElement;
	const submit = settings.getByRole('button', { name: i18n.ts.save }) as HTMLButtonElement;
	expect(summary.value).toBe(original.summary);
	expect(submit.disabled).toBe(false);
	await chooseCategory(settings, '技术');
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._article.saveDraft }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('articles/drafts/save', expect.objectContaining({ ...original, articleId: 'mine', articleCategoryId: 'tech' })));
	await fireEvent.update(summary, `${original.summary}x`);
	expect(submit.disabled).toBe(true);
	await fireEvent.keyDown(view.getByTestId('markdown-body'), { key: 's', ctrlKey: true });
	expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'articles/drafts/save')).toHaveLength(1);
	await fireEvent.update(summary, original.summary);
	await waitFor(() => expect(submit.disabled).toBe(false));
	await fireEvent.click(submit);
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('pages/update', expect.objectContaining({ pageId: 'mine', title: original.title, summary: original.summary, content: [{ id: 'body', type: 'markdown', text: original.text }], articleCategoryId: 'tech' })));
});

test('saves an article locally after a three-second pause and restores its publishing settings', async () => {
	const view = editor();
	await waitFor(() => expect(view.queryByTestId('markdown-body')).not.toBeNull());
	vi.useFakeTimers();
	await fill(view);
	const dialog = await openSettings(view);
	await chooseCategory(dialog, '技术');
	await fireEvent.update(dialog.getByLabelText(i18n.ts._article.summary), 'Unpublished summary');
	await vi.advanceTimersByTimeAsync(2999);
	expect(drafts()).toHaveLength(0);
	await vi.advanceTimersByTimeAsync(1);
	expect(drafts()).toHaveLength(1);
	expect(drafts()[0].draft).toMatchObject({ title: 'Article', text: '# Markdown', summary: 'Unpublished summary', articleCategoryId: 'tech' });
	expect(mocks.api).not.toHaveBeenCalled();
	view.unmount();
	vi.useRealTimers();
	const reopened = editor();
	await waitFor(() => expect(reopened.queryByTestId('markdown-body')).not.toBeNull());
	expect((reopened.getByLabelText(i18n.ts._article.title) as HTMLInputElement).value).toBe('Article');
	expect((reopened.getByTestId('markdown-body') as HTMLTextAreaElement).value).toBe('# Markdown');
	const freshDialog = await openSettings(reopened);
	expect(selectedCategory(freshDialog)).toBe('tech');
	expect((freshDialog.getByLabelText(i18n.ts._article.summary) as HTMLTextAreaElement).value).toBe('Unpublished summary');
	expect(mocks.api).not.toHaveBeenCalled();
});

test('publishes without a cover when neither upload nor generation was requested', async () => {
	const view = editor(); await fill(view);
	const settings = await openSettings(view);
	expect(settings.queryByAltText(i18n.ts._article.cover)).toBeNull();
	await fireEvent.click(settings.getByRole('button', { name: i18n.ts.publish }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('pages/create', expect.objectContaining({ eyeCatchingImageId: null })));
	expect(mocks.createCover).not.toHaveBeenCalled();
	expect(mocks.uploadFile).not.toHaveBeenCalled();
});

test('persists a manually generated cover in local and cloud drafts and publishes the restored image', async () => {
	mocks.api.mockImplementation(async endpoint => endpoint === 'articles/drafts/save' ? { revision: 1 } : { id: 'published' });
	const view = editor(); await fill(view);
	const settings = await openSettings(view);
	await fireEvent.click(settings.getByRole('button', { name: i18n.ts._article.generateDefaultCover }));
	await waitFor(() => expect(settings.getByAltText(i18n.ts._article.cover).getAttribute('src')).toBe(generatedCover.url));
	expect(mocks.uploadFile).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ isManaged: true, draftId: expect.any(String) }));
	expect(drafts()[0].draft.cover?.id).toBe(generatedCover.id);
	await fireEvent.click(settings.getByRole('button', { name: i18n.ts.cancel }));
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._article.saveDraft }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('articles/drafts/save', expect.objectContaining({ coverId: generatedCover.id })));
	view.unmount();
	const restored = editor();
	await waitFor(() => expect(restored.queryByTestId('markdown-body')).not.toBeNull());
	const restoredSettings = await openSettings(restored);
	expect(restoredSettings.getByAltText(i18n.ts._article.cover).getAttribute('src')).toBe(generatedCover.url);
	await fireEvent.click(restoredSettings.getByRole('button', { name: i18n.ts.publish }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('pages/create', expect.objectContaining({ eyeCatchingImageId: generatedCover.id })));
	expect(mocks.createCover).toHaveBeenCalledTimes(1);
});

test.each(['render', 'upload'])('keeps the previous cover and permits publishing after a %s failure', async failure => {
	const original = { ...generatedCover, id: 'original-cover', url: 'https://example.com/original.png' };
	storeDraft('misskey:articleDraft:article-test:with-cover', { cover: original });
	if (failure === 'render') mocks.createCover.mockRejectedValueOnce(new Error('Rendering failed'));
	else mocks.uploadFile.mockImplementationOnce(() => ({ filePromise: Promise.reject(new Error('Upload failed')), abort: vi.fn() }));
	const view = editor(); await fill(view);
	const settings = await openSettings(view);
	await fireEvent.click(settings.getByRole('button', { name: i18n.ts._article.generateDefaultCover }));
	await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(i18n.ts._article.generateCoverFailed, 'error'));
	expect(settings.getByAltText(i18n.ts._article.cover).getAttribute('src')).toBe(original.url);
	await fireEvent.click(settings.getByRole('button', { name: i18n.ts.publish }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('pages/create', expect.objectContaining({ eyeCatchingImageId: original.id })));
});

test('aborts a stalled generated-cover upload and restores publishing with the previous image', async () => {
	storeDraft('misskey:articleDraft:article-test:with-cover', { cover: generatedCover });
	let failUpload: (error: Error) => void;
	const abort = vi.fn(() => failUpload(new Error('Upload aborted')));
	mocks.uploadFile.mockImplementationOnce(() => ({ filePromise: new Promise((_, reject) => { failUpload = reject; }), abort }));
	const view = editor(); await fill(view);
	const settings = await openSettings(view);
	vi.useFakeTimers();
	await fireEvent.click(settings.getByRole('button', { name: i18n.ts._article.generateDefaultCover }));
	await nextTick();
	expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(60_000);
	expect(abort).toHaveBeenCalledTimes(1);
	expect(mocks.toast).toHaveBeenCalledWith(i18n.ts._article.generateCoverFailed, 'error');
	expect(settings.getByAltText(i18n.ts._article.cover).getAttribute('src')).toBe(generatedCover.url);
	expect((settings.getByRole('button', { name: i18n.ts.publish }) as HTMLButtonElement).disabled).toBe(false);
});

test('allows replacing and removing a generated cover without generating another one', async () => {
	const view = editor(); await fill(view);
	const settings = await openSettings(view);
	await fireEvent.click(settings.getByRole('button', { name: i18n.ts._article.generateDefaultCover }));
	await waitFor(() => expect(settings.queryByAltText(i18n.ts._article.cover)).not.toBeNull());
	const uploaded = { ...generatedCover, id: 'uploaded-cover', url: 'https://example.com/uploaded.png' };
	mocks.selectFile.mockResolvedValueOnce(uploaded);
	await fireEvent.click(settings.getByRole('button', { name: i18n.ts._article.chooseCover }));
	await waitFor(() => expect(settings.getByAltText(i18n.ts._article.cover).getAttribute('src')).toBe(uploaded.url));
	await fireEvent.click(settings.getByRole('button', { name: i18n.ts.remove }));
	expect(settings.queryByAltText(i18n.ts._article.cover)).toBeNull();
	await fireEvent.click(settings.getByRole('button', { name: i18n.ts.publish }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('pages/create', expect.objectContaining({ eyeCatchingImageId: null })));
	expect(mocks.createCover).toHaveBeenCalledTimes(1);
});

test('does not upload a late generated cover after leaving and returning to the editor', async () => {
	let finishRendering: (file: File) => void;
	mocks.createCover.mockImplementationOnce(() => new Promise<File>(resolve => { finishRendering = resolve; }));
	const active = ref(true);
	const view = editor(undefined, undefined, { [DI.pageActive]: active }); await fill(view);
	const settings = await openSettings(view);
	await fireEvent.click(settings.getByRole('button', { name: i18n.ts._article.generateDefaultCover }));
	expect((settings.getByRole('button', { name: i18n.ts.publish }) as HTMLButtonElement).disabled).toBe(true);
	active.value = false;
	await nextTick();
	active.value = true;
	finishRendering!(new File(['cover'], 'article-cover.png', { type: 'image/png' }));
	await waitFor(() => expect((view.getByRole('button', { name: i18n.ts.publish }) as HTMLButtonElement).disabled).toBe(false));
	expect(mocks.uploadFile).not.toHaveBeenCalled();
	expect(drafts()[0].draft.cover).toBeNull();
});

test('shortens the save countdown to one second after leaving the editor', async () => {
	const view = editor();
	await waitFor(() => expect(view.queryByTestId('markdown-body')).not.toBeNull());
	vi.useFakeTimers();
	await fill(view);
	await fireEvent.focusOut(view.getByTestId('markdown-body'));
	await vi.advanceTimersByTimeAsync(999);
	expect(drafts()).toHaveLength(0);
	await vi.advanceTimersByTimeAsync(1);
	expect(drafts()[0].draft.text).toBe('# Markdown');
});

test.each(['pagehide', 'unmount'])('flushes pending article changes on %s', async event => {
	const view = editor(); await fill(view);
	expect(drafts()).toHaveLength(0);
	if (event === 'pagehide') await pagehide();
	else view.unmount();
	expect(drafts()).toHaveLength(1);
	expect(drafts()[0].draft).toMatchObject({ title: 'Article', text: '# Markdown' });
	expect(mocks.api).not.toHaveBeenCalled();
});

test('ignores whitespace-only articles and removes a saved draft when all content is cleared', async () => {
	const view = editor();
	await waitFor(() => expect(view.queryByTestId('markdown-body')).not.toBeNull());
	await fireEvent.update(view.getByLabelText(i18n.ts._article.title), ' \t');
	await fireEvent.update(view.getByTestId('markdown-body'), '\n\u200B ');
	await pagehide();
	expect(drafts()).toHaveLength(0);
	await fill(view);
	await pagehide();
	expect(drafts()).toHaveLength(1);
	await fireEvent.update(view.getByLabelText(i18n.ts._article.title), '');
	await fireEvent.update(view.getByTestId('markdown-body'), '');
	await pagehide();
	expect(drafts()).toHaveLength(0);
});

test('restores the latest new-article draft for the signed-in account', async () => {
	storeDraft('misskey:articleDraft:article-test:older', { title: 'Older', updatedAt: '2026-10-05T00:00:00.000Z' });
	storeDraft('misskey:articleDraft:article-test:latest', { title: 'Latest' });
	storeDraft('misskey:articleDraft:article-test:edit:mine:edited', { articleId: 'mine', title: 'Published edit', updatedAt: '2026-10-08T00:00:00.000Z' });
	storeDraft('misskey:articleDraft:another-account:latest', { title: 'Other account', updatedAt: '2026-10-09T00:00:00.000Z' });
	const view = editor();
	await waitFor(() => expect((view.getByLabelText(i18n.ts._article.title) as HTMLInputElement).value).toBe('Latest'));
	expect((view.getByTestId('markdown-body') as HTMLTextAreaElement).value).toBe('Draft body');
	expect(mocks.api).not.toHaveBeenCalled();
});

test('restores an owned article draft after checking ownership and retains the server URL name', async () => {
	storeDraft('misskey:articleDraft:article-test:edit:mine:legacy', { title: 'Local edit', name: 'outdated-name', text: 'Local body' });
	mocks.api.mockResolvedValueOnce({ id: 'mine', userId: 'article-test', title: 'Published title', summary: '', name: 'published-name', articleCategoryId: null, eyeCatchingImage: null, content: [{ type: 'markdown', text: 'Published body' }] });
	const view = editor('mine');
	await waitFor(() => expect((view.getByLabelText(i18n.ts._article.title) as HTMLInputElement).value).toBe('Local edit'));
	expect(mocks.api).toHaveBeenCalledWith('pages/show', { pageId: 'mine' });
	const dialog = await openSettings(view, true);
	await fireEvent.click(dialog.getByRole('button', { name: i18n.ts.save }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('pages/update', expect.objectContaining({ pageId: 'mine', name: 'published-name', title: 'Local edit', content: [{ id: 'body', type: 'markdown', text: 'Local body' }] })));
});

test('keeps content editable after local storage fails and permits a manual retry', async () => {
	const view = editor(); await fill(view);
	const setItem = vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => { throw new DOMException('Full', 'QuotaExceededError'); });
	await pagehide();
	expect(view.getByText(i18n.ts._article.draftSaveFailed)).toBeTruthy();
	expect((view.getByTestId('markdown-body') as HTMLTextAreaElement).value).toBe('# Markdown');
	expect(drafts()).toHaveLength(0);
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
	expect(setItem).toHaveBeenCalledTimes(2);
	expect(drafts()[0].draft.title).toBe('Article');
	expect(mocks.api).not.toHaveBeenCalled();
});

test('keeps concurrent editors from overwriting drafts restored from the same snapshot', async () => {
	storeDraft('misskey:articleDraft:article-test:source');
	const first = editor();
	await waitFor(() => expect(first.queryByTestId('markdown-body')).not.toBeNull());
	const second = editor();
	await waitFor(() => expect(second.queryByTestId('markdown-body')).not.toBeNull());
	await fill(first, 'First editor');
	await fill(second, 'Second editor');
	await pagehide();
	expect(drafts().map(entry => entry.draft.title)).toEqual(expect.arrayContaining(['First editor', 'Second editor']));
	expect(new Set(drafts().map(entry => entry.key)).size).toBe(drafts().length);
	expect(mocks.api).not.toHaveBeenCalled();
});

test('publishing removes only this editor snapshot and keeps another draft', async () => {
	const otherKey = 'misskey:articleDraft:article-test:other';
	storeDraft(otherKey, { title: 'Other draft', updatedAt: '2026-10-01T00:00:00.000Z' });
	storeDraft('misskey:articleDraft:article-test:current');
	const view = editor(); await fill(view);
	await pagehide();
	expect(drafts().some(entry => entry.draft.title === 'Article')).toBe(true);
	const dialog = await openSettings(view);
	await fireEvent.click(dialog.getByRole('button', { name: i18n.ts.publish }));
	await waitFor(() => expect(mocks.push).toHaveBeenCalled());
	view.unmount();
	expect(drafts()).toHaveLength(1);
	expect(drafts()[0]).toMatchObject({ key: otherKey, draft: { title: 'Other draft' } });
});

test('opens article actions from the avatar without including account settings', async () => {
	const view = editor();
	await waitFor(() => expect(view.queryByTestId('markdown-body')).not.toBeNull());
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._article.menu }));
	expect(mocks.getAccountMenu).not.toHaveBeenCalled();
	expect(mocks.popupMenu).toHaveBeenCalled();
	expect(mocks.popupMenu.mock.calls[0][0].map((item: { text: string }) => item.text)).toEqual([i18n.ts.home, i18n.ts._article.drafts, i18n.ts._article.newArticle]);
});

test('saves the current article before starting another and can restore it from the article drafts dialog', async () => {
	const view = editor(); await fill(view, 'First article');
	await openDrafts(view);
	expect(drafts()[0].draft.title).toBe('First article');
	await fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: i18n.ts._article.newDraft }));
	expect(view.queryByRole('dialog')).toBeNull();
	expect((view.getByLabelText(i18n.ts._article.title) as HTMLInputElement).value).toBe('');
	expect((view.getByTestId('markdown-body') as HTMLTextAreaElement).value).toBe('');
	await fill(view, 'Second article');
	await openDrafts(view);
	const dialog = within(view.getByRole('dialog'));
	const firstDraft = dialog.getByRole('heading', { name: 'First article' }).closest('li')!;
	await fireEvent.click(within(firstDraft).getByRole('button', { name: i18n.ts._drafts.restore }));
	await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
	expect((view.getByLabelText(i18n.ts._article.title) as HTMLInputElement).value).toBe('First article');
	expect(drafts().some(entry => entry.draft.title === 'Second article')).toBe(true);
	expect(mocks.api.mock.calls.every(([endpoint]) => endpoint === 'articles/drafts/list')).toBe(true);
});

test('does not discard current input when starting another draft fails to save locally', async () => {
	const view = editor(); await fill(view);
	vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
	await openDrafts(view);
	await fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: i18n.ts._article.newDraft }));
	expect((view.getByLabelText(i18n.ts._article.title) as HTMLInputElement).value).toBe('Article');
	expect((view.getByTestId('markdown-body') as HTMLTextAreaElement).value).toBe('# Markdown');
	expect(view.getByRole('alert').textContent).toContain(i18n.ts._article.draftSaveFailed);
	expect(mocks.pushByPath).not.toHaveBeenCalled();
});

test('keeps category selection usable after metadata refresh fails and includes it when publishing', async () => {
	mocks.fetchInstance.mockRejectedValueOnce(new Error('offline'));
	const view = editor(); await fill(view);
	const dialog = await openSettings(view);
	await chooseCategory(dialog, '技术');
	expect(selectedCategory(dialog)).toBe('tech');
	expect(mocks.toast).not.toHaveBeenCalled();
	await fireEvent.click(dialog.getByRole('button', { name: i18n.ts.publish }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('pages/create', expect.objectContaining({ articleCategoryId: 'tech' })));
});

test('saves to the private article draft API only on request and keeps its revision locally', async () => {
	const view = editor(); await fill(view);
	await pagehide();
	expect(mocks.api).not.toHaveBeenCalled();
	mocks.api.mockResolvedValueOnce({ id: 'cloud', revision: 1 });
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._article.saveDraft }));
	await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(i18n.ts._article.cloudDraftSaved, 'success'));
	const request = mocks.api.mock.calls[0][1];
	expect(mocks.api).toHaveBeenCalledWith('articles/drafts/save', expect.objectContaining({ expectedRevision: 0, title: 'Article', text: '# Markdown', articleId: null, articleTags: [] }));
	expect(drafts()[0].draft).toMatchObject({ cloudId: request.draftId, cloudRevision: 1 });
	mocks.api.mockResolvedValueOnce({ id: request.draftId, revision: 2 });
	await fireEvent.update(view.getByTestId('markdown-body'), 'Changed');
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._article.saveDraft }));
	await waitFor(() => expect(mocks.api).toHaveBeenLastCalledWith('articles/drafts/save', expect.objectContaining({ draftId: request.draftId, expectedRevision: 1, text: 'Changed' })));
});

test('retains local content on a cloud conflict and saves a separate copy on request', async () => {
	const view = editor(); await fill(view);
	mocks.api.mockRejectedValueOnce({ code: 'DRAFT_CONFLICT' });
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._article.saveDraft }));
	await waitFor(() => expect(view.getByRole('alert').textContent).toContain(i18n.ts._article.cloudDraftConflict));
	const originalId = mocks.api.mock.calls[0][1].draftId;
	expect(drafts()[0].draft.text).toBe('# Markdown');
	mocks.api.mockResolvedValueOnce({ revision: 1 });
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._article.saveDraftCopy }));
	await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(i18n.ts._article.cloudDraftSaved, 'success'));
	expect(mocks.api.mock.calls[1][1]).toMatchObject({ expectedRevision: 0, text: '# Markdown' });
	expect(mocks.api.mock.calls[1][1].draftId).not.toBe(originalId);
});

test('allows starting another article after a cloud backup succeeds while local storage is full', async () => {
	const view = editor(); await fill(view);
	vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
	mocks.api.mockResolvedValueOnce({ revision: 1 });
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._article.saveDraft }));
	await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(i18n.ts._article.cloudDraftSaved, 'success'));
	await openDrafts(view);
	await fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: i18n.ts._article.newDraft }));
	expect(view.queryByRole('dialog')).toBeNull();
	expect((view.getByLabelText(i18n.ts._article.title) as HTMLInputElement).value).toBe('');
});

test('recovers a cloud article after browser storage is cleared and removes its revision after publishing', async () => {
	const cloud = { id: 'cloud-draft_1', revision: 4, title: 'Cloud article', summary: 'Cloud summary', text: '# Cloud body', name: 'cloud-article', articleCategoryId: 'tech', articleTags: ['vue'], cover: null, articleId: null, updatedAt: '2026-10-07T12:00:00.000Z' };
	localStorage.clear();
	mocks.api.mockImplementation(async (endpoint: string) => {
		if (endpoint === 'articles/drafts/list') return [cloud];
		if (endpoint === 'articles/drafts/show') return cloud;
		return { id: 'published' };
	});
	const view = editor();
	await waitFor(() => expect(view.queryByTestId('markdown-body')).not.toBeNull());
	await openDrafts(view);
	await fireEvent.click(within(view.getByRole('dialog')).getByRole('tab', { name: i18n.ts._article.cloudDrafts }));
	await waitFor(() => expect(within(view.getByRole('dialog')).getByRole('heading', { name: cloud.title })).toBeTruthy());
	await fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: i18n.ts._drafts.restore }));
	await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
	expect((view.getByTestId('markdown-body') as HTMLTextAreaElement).value).toBe(cloud.text);
	expect(drafts()[0].draft).toMatchObject({ cloudId: cloud.id, cloudRevision: 4, articleTags: ['vue'] });
	const settings = await openSettings(view);
	await fireEvent.click(settings.getByRole('button', { name: i18n.ts.publish }));
	await waitFor(() => expect(mocks.push).toHaveBeenCalled());
	expect(mocks.api).toHaveBeenCalledWith('articles/drafts/delete', { draftId: cloud.id, expectedRevision: 4 });
	expect(drafts()).toHaveLength(0);
});

test('searches existing tags, refuses free text and binds at most three tags when publishing', async () => {
	const stale = Promise.withResolvers<string[]>();
	mocks.api.mockImplementation(async (endpoint: string, params: { query?: string }) => {
		if (endpoint !== 'articles/tags') return { id: 'published' };
		if (params.query === 'old') return stale.promise;
		if (!params.query) return ['vue', '前端'];
		if (params.query === 'existing') return ['existing'];
		return params.query === 'vue' || params.query === '前端' ? [params.query] : [];
	});
	const view = editor(); await fill(view);
	const dialog = await openSettings(view);
	expect(mocks.api).not.toHaveBeenCalled();
	await fireEvent.click(dialog.getByLabelText(i18n.ts._article.tags));
	const input = within(document.body).getByRole('combobox', { name: i18n.ts._article.tagsHint }) as HTMLInputElement;
	const picker = within(input.closest('section')!);
	await waitFor(() => expect(picker.getByRole('option', { name: '#vue' })).toBeTruthy());
	mocks.api.mockClear();
	vi.useFakeTimers();
	await fireEvent.update(input, 'unlisted');
	await fireEvent.keyDown(input, { key: 'Enter' });
	await vi.advanceTimersByTimeAsync(249);
	expect(mocks.api).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	expect(picker.getByText(i18n.ts._article.tagsNotFound)).toBeTruthy();
	expect(picker.queryByRole('button', { name: `${i18n.ts.remove}: unlisted` })).toBeNull();
	await fireEvent.update(input, '');
	expect(picker.getByRole('option', { name: '#vue' })).toBeTruthy();
	await fireEvent.compositionStart(input);
	await fireEvent.update(input, '前');
	expect(picker.queryByRole('option')).toBeNull();
	await fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
	await vi.advanceTimersByTimeAsync(250);
	expect(picker.queryByRole('button', { name: `${i18n.ts.remove}: 前端` })).toBeNull();
	await fireEvent.compositionEnd(input);
	expect(picker.getByRole('option', { name: '#前端' })).toBeTruthy();
	await fireEvent.update(input, 'old');
	await vi.advanceTimersByTimeAsync(250);
	const staleSignal = mocks.api.mock.calls.at(-1)![3] as AbortSignal;
	await fireEvent.update(input, 'existing');
	expect(staleSignal.aborted).toBe(true);
	await vi.advanceTimersByTimeAsync(250);
	stale.resolve(['outdated-tag']);
	await vi.advanceTimersByTimeAsync(0);
	expect(picker.queryByRole('option', { name: '#outdated-tag' })).toBeNull();
	await fireEvent.click(picker.getByRole('option', { name: '#existing' }));
	expect(picker.getByRole('button', { name: `${i18n.ts.remove}: existing` })).toBeTruthy();
	expect(picker.getByRole('option', { name: '#vue' })).toBeTruthy();
	for (const tag of ['vue', '前端']) {
		await fireEvent.update(input, tag);
		expect(picker.getByRole('option', { name: `#${tag}` })).toBeTruthy();
		await vi.advanceTimersByTimeAsync(250);
		await fireEvent.click(picker.getByRole('option', { name: `#${tag}` }));
	}
	vi.useRealTimers();
	expect(input.readOnly).toBe(true);
	await fireEvent.click(picker.getByRole('button', { name: i18n.ts.close }));
	await chooseCategory(dialog, '技术');
	await chooseCategory(dialog, '生活');
	await fireEvent.click(dialog.getByRole('button', { name: i18n.ts.publish }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('pages/create', expect.objectContaining({ articleTags: ['existing', 'vue', '前端'], articleCategoryId: 'life' })));
});

test('keeps settings in memory after cancellation and retains a failed article for retry', async () => {
	const view = editor(); await fill(view);
	let dialog = await openSettings(view);
	expect(mocks.api).not.toHaveBeenCalled();
	await fireEvent.update(dialog.getByLabelText(i18n.ts._article.summary), 'Summary stays while editing');
	await chooseCategory(dialog, '技术');
	await fireEvent.click(dialog.getByRole('button', { name: i18n.ts.cancel }));
	expect(view.queryByRole('dialog')).toBeNull();
	expect((view.getByLabelText(i18n.ts._article.title) as HTMLInputElement).value).toBe('Article');
	expect((view.getByTestId('markdown-body') as HTMLTextAreaElement).value).toBe('# Markdown');
	dialog = await openSettings(view);
	expect((dialog.getByLabelText(i18n.ts._article.summary) as HTMLTextAreaElement).value).toBe('Summary stays while editing');
	expect(selectedCategory(dialog)).toBe('tech');
	mocks.api.mockRejectedValueOnce(new Error('offline'));
	await fireEvent.click(dialog.getByRole('button', { name: i18n.ts.publish }));
	await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(i18n.ts.somethingHappened, 'error'));
	expect((view.getByTestId('markdown-body') as HTMLTextAreaElement).value).toBe('# Markdown');
	mocks.api.mockRejectedValueOnce({ code: 'INVALID_ARTICLE_TAGS' });
	await fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: i18n.ts.publish }));
	await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(i18n.ts._article.tagsUnavailable, 'error'));
	expect((view.getByTestId('markdown-body') as HTMLTextAreaElement).value).toBe('# Markdown');
	await fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: i18n.ts.publish }));
	await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/articles/:articleId', { params: { articleId: 'published' } }));
	expect(mocks.api).toHaveBeenCalledWith('pages/create', expect.objectContaining({ title: 'Article', summary: 'Summary stays while editing', articleCategoryId: 'tech', content: [{ id: 'body', type: 'markdown', text: '# Markdown' }] }));
	expect(view.getByRole('dialog')).toBeTruthy();
	expect(mocks.toast.mock.calls.every(([, type]) => type === 'error')).toBe(true);
});

test('keeps publishing settings stable and never republishes after detail preloading fails', async () => {
	let failPreload: (reason?: unknown) => void;
	const detail = new Promise((_, reject) => { failPreload = reject; });
	mocks.api.mockImplementation((endpoint: string) => endpoint === 'articles/show' ? detail : Promise.resolve({ id: 'published' }));
	const active = ref(true);
	const view = editor(undefined, undefined, { [DI.pageActive]: active }); await fill(view);
	const settings = await openSettings(view);
	const submit = settings.getByRole('button', { name: i18n.ts.publish });
	await fireEvent.click(submit);
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('articles/show', { articleId: 'published' }, undefined, expect.any(AbortSignal)));
	expect(view.getByRole('dialog')).toBeTruthy();
	expect((submit as HTMLButtonElement).disabled).toBe(true);
	expect(mocks.push).not.toHaveBeenCalled();
	expect(mocks.toast).not.toHaveBeenCalled();
	await fireEvent.click(submit);
	failPreload!(new Error('offline'));
	await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/articles/:articleId', { params: { articleId: 'published' } }));
	expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'pages/create')).toHaveLength(1);
	expect(mocks.toast).not.toHaveBeenCalled();
	expect(view.getByRole('dialog')).toBeTruthy();
	active.value = false;
	await nextTick();
	active.value = true;
	await waitFor(() => expect((view.getByTestId('markdown-body') as HTMLTextAreaElement).disabled).toBe(false));
	expect((view.getByLabelText(i18n.ts._article.title) as HTMLInputElement).value).toBe('');
});

test("rejects editing someone else's article and does not send an update", async () => {
	mocks.api.mockResolvedValueOnce({ id: 'other', userId: 'someone-else', content: [{ type: 'markdown', text: 'Body' }] });
	const view = editor('other');
	await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/articles/:articleId', { params: { articleId: 'other' } }));
	expect(view.queryByTestId('markdown-body')).toBeNull();
	expect(mocks.api).toHaveBeenCalledTimes(1);
});

test.each([
	{ storedCategory: 'tech', clear: false, expectedCategory: 'tech' },
	{ storedCategory: 'tech', clear: true, expectedCategory: null },
	{ storedCategory: 'deleted-category', clear: false, expectedCategory: 'deleted-category' },
])('updates the owned article with category $expectedCategory and preserves its URL name', async ({ storedCategory, clear, expectedCategory }) => {
	mocks.api.mockResolvedValueOnce({ id: 'mine', userId: 'article-test', title: 'Before', summary: 'Summary', name: 'permanent-name', articleCategoryId: storedCategory, eyeCatchingImage: null, content: [{ type: 'markdown', text: '# Before' }] });
	const view = editor('mine'); await fill(view, 'After');
	const dialog = await openSettings(view, true);
	if (clear) await chooseCategory(dialog, i18n.ts._article.uncategorized);
	expect(selectedCategory(dialog)).toBe(expectedCategory ?? '');
	await fireEvent.click(dialog.getByRole('button', { name: i18n.ts.save }));
	await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/articles/:articleId', { params: { articleId: 'mine' } }));
	expect(mocks.api).toHaveBeenCalledWith('pages/update', expect.objectContaining({ pageId: 'mine', name: 'permanent-name', title: 'After', articleCategoryId: expectedCategory, content: [{ id: 'body', type: 'markdown', text: '# Markdown' }] }));
});
