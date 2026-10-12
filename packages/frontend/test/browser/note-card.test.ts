/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cdp, page, userEvent } from 'vitest/browser';
import type { CDPSession } from '@vitest/browser-playwright';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import type * as Misskey from 'misskey-js';
import '@/style.scss';
import 'virtual:tabler-icons.css';
import MkNote from '@/components/MkNote.vue';
import MkNoteDetailed from '@/components/MkNoteDetailed.vue';
import MkMfm from '@/components/global/MkMfm.js';
import MkA from '@/components/global/MkA.vue';
import MkResult from '@/components/global/MkResult.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkSystemIcon from '@/components/global/MkSystemIcon.vue';
import { hotkeyDirective } from '@/directives/hotkey.js';

const mocks = vi.hoisted(() => {
	vi.stubGlobal('_LANGS_', []);
	vi.stubGlobal('_VERSION_', 'test');
	return {
		navigate: vi.fn(), reply: vi.fn(), like: vi.fn(), renote: vi.fn(), react: vi.fn(), favorite: vi.fn(), share: vi.fn(), report: vi.fn(),
		api: vi.fn().mockResolvedValue([]), pendingRenotes: false,
		paginators: [] as { endpoint: string; fetching: { value: boolean } }[],
		preferences: { s: {
			animation: false, useStickyIcons: false, showNoteActionsOnlyHover: false,
			showClipButtonInNoteFooter: false, advancedMfm: false, animatedMfm: false,
		} },
	};
});
vi.mock('misskey-js', async importOriginal => ({
	...await importOriginal<typeof import('misskey-js')>(),
	acct: { toString: (user: Misskey.Acct) => `${user.username}${user.host ? `@${user.host}` : ''}` },
}));
vi.mock('@@/js/config.js', () => ({ host: 'localhost', url: 'http://localhost', lang: 'zh-CN' }));
vi.mock('@/preferences.js', () => ({ prefer: mocks.preferences }));
vi.mock('@/instance.js', () => ({ instance: { infoImageUrl: null } }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ pushByPath: mocks.navigate }) }));
vi.mock('@/i.js', () => ({ $i: { id: 'viewer' } }));
vi.mock('@/events.js', () => ({ useGlobalEvent: vi.fn() }));
vi.mock('@/os.js', () => ({ contextMenu: vi.fn() }));
vi.mock('@/components/MkTipSection.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkCommentGuest.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPostForm.vue', async () => {
	const { defineComponent, h, ref } = await import('vue');
	return { default: defineComponent({
		props: ['reply', 'commentMode', 'fixed', 'autofocus'],
		setup(props, { expose }) {
			const input = ref<HTMLTextAreaElement>();
			expose({ focus: () => input.value?.focus() });
			return () => h('textarea', { ref: input, 'aria-label': '评论内容', 'data-reply-id': props.reply.id });
		},
	}) };
});
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/paginator.js', async () => {
	const { ref } = await import('vue');
	return { Paginator: class {
		items = ref([]);
		error = ref(null);
		fetching = ref(false);
		fetchingOlder = ref(false);
		fetchingNewer = ref(false);
		order = ref('newest');
		canFetchOlder = ref(false);
		canFetchNewer = ref(false);
		init = vi.fn(() => { this.fetching.value = mocks.pendingRenotes; });
		reload = vi.fn();
		constructor(public endpoint: string) { mocks.paginators.push(this); }
	} };
});
vi.mock('@/utility/get-note-menu.js', () => ({ getAbuseNoteMenu: () => ({ action: mocks.report }) }));
vi.mock('@/utility/url-preview.js', () => ({ isEnabledUrlPreview: false }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	more: '更多', showMore: '展开全文', showLess: '收起', reply: '回复', renote: '转发', like: '赞', unlike: '取消赞',
	viewsCount: '浏览量', share: '分享', _profile: {},
	_chat: { addReaction: '添加回应' },
	_visibility: { public: '公开' },
	_article: { comment: '评论', noComments: '暂无评论' },
	replies: '评论', renotes: '转发列表', reactions: '回应', note: '帖子', favorite: '收藏', unfavorite: '取消收藏', reportAbuse: '举报',
	reload: '刷新',
} } }));
vi.mock('@/components/global/MkA.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ setup: (_props, { slots }) => () => h('a', slots.default?.()) }) };
});
vi.mock('@/components/MkNoteSimple.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkReactionsViewer.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkMediaList.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkCwButton.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPoll.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkRedPacket.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkUrlPreview.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkInstanceTicker.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkLikeSummary.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkNoteTags.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkNoteSub.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPullToRefresh.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPaginationControl.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkUserCardMini.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkReactionIcon.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkUrl.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkTime.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkLink.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkMention.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkEmoji.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkCustomEmoji.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkCode.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkGoogle.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkSparkle.vue', () => ({ default: { render: () => null } }));
vi.mock('@/composables/use-note.js', async () => {
	const { ref } = await import('vue');
	const { parse } = await import('mfm-js');
	return { useNote: (props: { note: Misskey.entities.Note }) => ({
		note: props.note, appearNote: props.note, $appearNote: props.note,
		reactionNote: props.note, $reactionNote: props.note,
		hideByPlugin: ref(false), isRenote: ref(false), isDeleted: ref(false),
		showContent: ref(true), translating: ref(false), translation: ref(null),
		muted: ref(false), hardMuted: ref(false), isMyRenote: ref(false),
		isRenotedByMe: ref(false), isRenoteTargetDeleted: ref(false),
		displayedRenoteCount: ref(0), renoteCollapsed: ref(false),
		parsed: ref(parse(props.note.text ?? '')), urls: ref([]), showTicker: ref(false),
		canRenote: ref(true), liking: ref(false),
		reply: mocks.reply, toggleLike: mocks.like, toggleRenote: mocks.renote, toggleReact: mocks.react, share: mocks.share,
		isFavorited: ref(false), favoriting: ref(false), toggleFavorite: mocks.favorite,
		reactViaMfmEmoji: vi.fn(),
	}) };
});

const fixtures: { app: App; host: HTMLElement }[] = [];

afterEach(() => {
	for (const { app, host } of fixtures.splice(0)) { app.unmount(); host.remove(); }
	document.getSelection()?.removeAllRanges();
	vi.clearAllMocks();
	vi.restoreAllMocks();
	mocks.api.mockResolvedValue([]);
	mocks.pendingRenotes = false;
	mocks.paginators.splice(0);
	mocks.preferences.s.animation = false;
});

async function mountCard(detailWidth?: number, text = '正文 **粗体内容** 可以划选复制') {
	const openTab = vi.spyOn(window, 'open').mockReturnValue(null);
	const currentUrl = window.location.href;
	const host = document.createElement('div');
	host.style.cssText = `width:${detailWidth ?? 650}px;--MI-margin:16px;--MI-cardPadding:18px;--MI-cardRadius:12px;--MI_THEME-bg:#f3f4f6;--MI_THEME-buttonBg:#e5e7eb;--MI_THEME-panel:white;--MI_THEME-fg:#555;--MI_THEME-fgOnAccent:white;--MI_THEME-fgTransparentWeak:#777;--MI_THEME-accent:#1677ff;`;
	host.style.background = 'var(--MI_THEME-bg)';
	if (detailWidth != null) host.style.cssText += 'height:500px;overflow:auto;container-type:inline-size;';
	document.body.append(host);
	const note = {
		id: 'displayed-note', userId: 'author', user: { id: 'author', name: '作者', username: 'author', host: null },
		text, cw: null, files: [], reactions: {}, reactionEmojis: {},
		visibility: 'public', localOnly: false, replyId: null, renoteId: null,
		repliesCount: 2, likeCount: 3, viewsCount: 128,
	} as unknown as Misskey.entities.Note;
	if (detailWidth != null) note.text = `${note.text}\n${'正文内容\n'.repeat(40)}`;
	const app = createApp({ render: () => detailWidth == null ? h(MkNote, { note }) : h(MkNoteDetailed, { note, sideActions: true, separateActivity: true }) });
	app.component('MkA', MkA);
	app.component('MkAvatar', { render: () => h('a', { style: 'display:block;width:40px;height:40px;' }) });
	app.component('MkUserName', { render: () => h('span', '作者') });
	app.component('MkAcct', { render: () => h('span', '@author') });
	app.component('MkTime', { render: () => h('span', '刚刚') });
	app.component('MkLoading', MkLoading);
	app.component('MkResult', MkResult);
	app.component('MkSystemIcon', MkSystemIcon);
	app.component('I18n', { render: () => null }); // eslint-disable-line vue/multi-word-component-names
	app.component('MkError', { render: () => null });
	// eslint-disable-next-line vue/multi-word-component-names
	app.component('Mfm', MkMfm);
	app.directive('hotkey', hotkeyDirective);
	for (const directive of ['user-preview', 'tooltip', 'appear']) app.directive(directive, () => {});
	app.mount(host);
	fixtures.push({ app, host });
	await nextTick();
	await document.fonts.ready;
	const root = detailWidth == null ? host.querySelector<HTMLElement>('[data-note-card]')! : host.firstElementChild as HTMLElement;
	return { host, root, openTab, currentUrl };
}

function expectCurrentPage(currentUrl: string): void {
	expect(mocks.navigate).not.toHaveBeenCalled();
	expect(window.location.href).toBe(currentUrl);
}

describe('real note card navigation', () => {
	test('长文可展开和收起，短文不显示折叠控件', async () => {
		const { root, openTab, currentUrl } = await mountCard(undefined, '正文内容\n'.repeat(20));
		const body = root.querySelector<HTMLElement>('._mfm')!;
		const viewport = body.parentElement!.parentElement!.parentElement!;
		const more = page.elementLocator(root).getByRole('button', { name: '展开全文', exact: true });
		const less = page.elementLocator(root).getByRole('button', { name: '收起', exact: true });
		await expect.element(more).toBeVisible();
		const collapsedHeight = viewport.getBoundingClientRect().height;
		await more.click();
		await expect.element(less).toBeVisible();
		expect(viewport.getBoundingClientRect().height).toBeGreaterThan(collapsedHeight);
		await less.click();
		await expect.element(more).toBeVisible();
		await expect.element(less).not.toBeInTheDocument();
		expect(viewport.getBoundingClientRect().height).toBeCloseTo(collapsedHeight, 1);
		expect(openTab).not.toHaveBeenCalled();
		expectCurrentPage(currentUrl);
		const { root: shortNote } = await mountCard(undefined, '短消息');
		await expect.element(page.elementLocator(shortNote).getByRole('button', { name: '展开全文', exact: true })).not.toBeInTheDocument();
		await expect.element(page.elementLocator(shortNote).getByRole('button', { name: '收起', exact: true })).not.toBeInTheDocument();
	});

	test.each(['blank', 'body'] as const)('navigates within the app from the $0 surface', async surface => {
		const { root, openTab, currentUrl } = await mountCard();
		const target = surface === 'blank' ? root : root.querySelector<HTMLElement>('._mfm b')!;
		expect(getComputedStyle(target).cursor).toBe('pointer');
		await page.elementLocator(target).click(surface === 'blank' ? { position: { x: root.clientWidth / 2, y: 4 } } : {});
		expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith('/notes/displayed-note');
		expect(openTab).not.toHaveBeenCalled();
		expect(window.location.href).toBe(currentUrl);
	});

	test.each([{ ctrlKey: true }, { metaKey: true }, { button: 1 }])('opens one separate tab for a modified click: %j', async options => {
		const { root, openTab, currentUrl } = await mountCard();
		root.dispatchEvent(new MouseEvent(options.button === 1 ? 'auxclick' : 'click', { bubbles: true, cancelable: true, ...options }));
		expect(openTab).toHaveBeenCalledExactlyOnceWith('/notes/displayed-note', '_blank', 'noopener');
		expectCurrentPage(currentUrl);
	});

	test('excludes the views icon, count and footer blank space', async () => {
		const { root, openTab, currentUrl } = await mountCard();
		const footer = root.querySelector<HTMLElement>('footer')!;
		const icon = footer.querySelector<HTMLElement>('[aria-label="浏览量"]')!;
		const count = icon.parentElement!.querySelector<HTMLElement>('[aria-hidden="true"]')!;
		await page.elementLocator(icon).click();
		await page.elementLocator(count).click();
		const slot = icon.parentElement!.parentElement!;
		await page.elementLocator(slot).click({ position: { x: slot.getBoundingClientRect().width - 10, y: 1 } });
		expect(openTab).not.toHaveBeenCalled();
		expectCurrentPage(currentUrl);
	});

	test.each([
		{ label: '回复', action: mocks.reply },
		{ label: '赞', action: mocks.like },
		{ label: '转发', action: mocks.renote },
	])('keeps the $label button mouse and Enter behavior', async ({ label, action }) => {
		const { root, openTab, currentUrl } = await mountCard();
		const button = page.elementLocator(root).getByRole('button', { name: label, exact: true });
		await button.click();
		expect(action).toHaveBeenCalledOnce();
		await userEvent.keyboard('{Enter}');
		expect(action).toHaveBeenCalledTimes(2);
		expect(openTab).not.toHaveBeenCalled();
		expectCurrentPage(currentUrl);
	});

	test('navigates within the app with Enter exactly once', async () => {
		const { root, openTab, currentUrl } = await mountCard();
		root.focus();
		expect(root.getAttribute('role')).toBe('link');
		await userEvent.keyboard('{Enter}');
		expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith('/notes/displayed-note');
		expect(openTab).not.toHaveBeenCalled();
		expect(window.location.href).toBe(currentUrl);
	});

	test('allows a mouse drag to select body text without opening a tab', async () => {
		const { root, openTab, currentUrl } = await mountCard();
		const body = root.querySelector<HTMLElement>('._mfm')!;
		const rect = body.getBoundingClientRect();
		const frame = window.frameElement!.getBoundingClientRect();
		expect(getComputedStyle(body).userSelect).toBe('text');
		const session = cdp() as CDPSession;
		const coordinates = (x: number) => ({
			x: frame.left + x * frame.width / window.innerWidth,
			y: frame.top + (rect.top + rect.height / 2) * frame.height / window.innerHeight,
		});
		const start = coordinates(rect.left + 1);
		const end = coordinates(rect.right - 1);
		await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...start });
		await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...start });
		await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
		for (let step = 1; step <= 5; step++) {
			await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, ...coordinates(rect.left + 1 + (rect.width - 2) * step / 5) });
			await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
		}
		await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...end });
		expect(document.getSelection()?.toString()).toContain('粗体内容');
		expect(openTab).not.toHaveBeenCalled();
		expectCurrentPage(currentUrl);
	});
});

describe('note detail side actions', () => {
	test('keeps desktop actions beside the article while scrolling and preserves button activation', async () => {
		const { host, root, openTab } = await mountCard(900);
		const aside = root.querySelector<HTMLElement>('aside')!;
		const article = root.querySelector<HTMLElement>('article')!;
		await expect.element(page.elementLocator(aside)).toBeVisible();
		expect(aside.getBoundingClientRect().right).toBeLessThan(article.getBoundingClientRect().left);
		for (const label of ['赞', '转发', '添加回应', '收藏', '分享', '举报']) {
			const button = page.elementLocator(aside).getByRole('button', { name: label, exact: true });
			await button.click();
			await userEvent.keyboard('{Enter}');
		}
		for (const action of [mocks.like, mocks.renote, mocks.react, mocks.favorite, mocks.share, mocks.report]) expect(action).toHaveBeenCalledTimes(2);
		expect(openTab).not.toHaveBeenCalled();
		const originalTop = aside.getBoundingClientRect().top;
		host.scrollTop = 200;
		await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
		expect(host.scrollTop).toBe(200);
		expect(aside.getBoundingClientRect().top).toBeCloseTo(originalTop, 1);
		expect(article.getBoundingClientRect().top).toBeLessThan(host.getBoundingClientRect().top);
		const activity = root.querySelector<HTMLElement>('[class*="activityCard"]')!;
		const input = activity.querySelector<HTMLTextAreaElement>('textarea')!;
		expect(input.getAttribute('data-reply-id')).toBe('displayed-note');
		const renotesLink = page.elementLocator(activity).getByRole('button', { name: '转发列表', exact: true });
		await renotesLink.click();
		await expect.element(renotesLink).toHaveAttribute('aria-pressed', 'true');
		const scrollToReplies = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
		await page.elementLocator(aside).getByRole('button', { name: '评论', exact: true }).click();
		await expect.element(renotesLink).toHaveAttribute('aria-pressed', 'false');
		expect(scrollToReplies).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
		expect(activity.getBoundingClientRect().top).toBeLessThan(host.getBoundingClientRect().bottom);
		await expect.element(page.elementLocator(input)).toBeVisible();
		await expect.element(page.elementLocator(input)).toHaveFocus();
		expect(activity.querySelector('textarea')).toBe(input);
		expect(mocks.reply).not.toHaveBeenCalled();
	});

	test('keeps one usable action toolbar above the body on a narrow screen', async () => {
		const { host, root } = await mountCard(390);
		const aside = root.querySelector<HTMLElement>('aside')!;
		const article = root.querySelector<HTMLElement>('article')!;
		await expect.element(page.elementLocator(aside)).toBeVisible();
		for (const label of ['赞', '转发', '添加回应', '收藏', '分享', '举报']) {
			const button = page.elementLocator(aside).getByRole('button', { name: label, exact: true });
			await expect.element(button).toBeVisible();
			await button.click();
			expect(root.querySelectorAll(`button[aria-label="${label}"]`)).toHaveLength(1);
			expect(article.querySelector(`button[aria-label="${label}"]`)).toBeNull();
		}
		for (const action of [mocks.like, mocks.renote, mocks.react, mocks.favorite, mocks.share, mocks.report]) expect(action).toHaveBeenCalledOnce();
		expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
		await page.elementLocator(aside).getByRole('button', { name: '评论', exact: true }).click();
		const comment = page.elementLocator(root).getByRole('textbox', { name: '评论内容', exact: true });
		await expect.element(comment).toBeVisible();
		await expect.element(comment).toHaveFocus();
		expect(mocks.reply).not.toHaveBeenCalled();
	});

	test('keeps asynchronous activity states and the comment draft stable while switching views', async () => {
		mocks.preferences.s.animation = true;
		mocks.pendingRenotes = true;
		let resolveReplies!: (notes: Misskey.entities.Note[]) => void;
		const replyRequest = new Promise<Misskey.entities.Note[]>(resolve => { resolveReplies = resolve; });
		mocks.api.mockImplementation((endpoint: string) => endpoint === 'notes/children' ? replyRequest : Promise.resolve([]));
		const { root } = await mountCard(900);
		const activity = root.querySelector<HTMLElement>('[class*="activityCard"]')!;
		const view = page.elementLocator(activity);
		const comment = view.getByRole('textbox', { name: '评论内容', exact: true });
		const input = activity.querySelector<HTMLTextAreaElement>('textarea')!;
		await comment.fill('尚未提交的评论');
		const renotes = view.getByRole('button', { name: '转发列表', exact: true });
		const reactions = view.getByRole('button', { name: '回应', exact: true });
		const replies = view.getByRole('button', { name: /^评论\s/ });
		const measure = () => {
			const cardBounds = activity.getBoundingClientRect();
			const bounds = input.getBoundingClientRect();
			return [cardBounds.height, bounds.left - cardBounds.left, bounds.top - cardBounds.top, bounds.width, bounds.height];
		};
		const sampleFrames = async (expected: number[]) => {
			await nextTick();
			for (let frame = 0; frame < 4; frame++) {
				await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
				measure().forEach((value, index) => expect(value).toBeCloseTo(expected[index], 1));
				expect(activity.querySelector('textarea')).toBe(input);
				expect(input.value).toBe('尚未提交的评论');
			}
		};
		await expect.element(view.getByRole('status')).toBeVisible();
		const pendingComments = measure();
		await sampleFrames(pendingComments);
		await renotes.click();
		await expect.element(renotes).toHaveAttribute('aria-pressed', 'true');
		await expect.element(view.getByRole('status')).toBeVisible();
		const pageState = measure();
		await sampleFrames(pageState);
		await reactions.click();
		await expect.element(reactions).toHaveAttribute('aria-pressed', 'true');
		await expect.element(view.getByRole('status')).not.toBeVisible();
		await sampleFrames(pageState);
		await replies.click();
		await expect.element(replies).toHaveAttribute('aria-pressed', 'true');
		await expect.element(comment).toHaveFocus();
		await expect.element(view.getByRole('status')).toBeVisible();
		await sampleFrames(pendingComments);
		await renotes.click();
		resolveReplies([]);
		mocks.paginators.find(paginator => paginator.endpoint === 'notes/renotes')!.fetching.value = false;
		await expect.poll(() => activity.querySelector('[aria-busy="true"]')).toBeNull();
		await sampleFrames(pageState);
		await replies.click();
		await expect.element(view.getByText('暂无评论', { exact: true })).toBeVisible();
		const emptyComments = measure();
		await sampleFrames(emptyComments);
		for (const button of [renotes, reactions]) {
			await button.click();
			await expect.element(button).toHaveAttribute('aria-pressed', 'true');
			await sampleFrames(pageState);
		}
		await replies.click();
		await sampleFrames(emptyComments);
		await expect.element(comment).toHaveFocus();
	});
});
