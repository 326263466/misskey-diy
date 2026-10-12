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
		reply: vi.fn(), like: vi.fn(), renote: vi.fn(), react: vi.fn(), share: vi.fn(),
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
vi.mock('@/router.js', () => ({ useRouter: () => ({}) }));
vi.mock('@/i.js', () => ({ $i: { id: 'viewer' } }));
vi.mock('@/events.js', () => ({ useGlobalEvent: vi.fn() }));
vi.mock('@/os.js', () => ({ contextMenu: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn().mockResolvedValue([]) }));
vi.mock('@/utility/url-preview.js', () => ({ isEnabledUrlPreview: false }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	more: '更多', showMore: '展开全文', showLess: '收起', reply: '回复', renote: '转发', like: '赞', unlike: '取消赞',
	viewsCount: '浏览量', share: '分享', _profile: {},
	_chat: { addReaction: '添加回应' },
	_visibility: { public: '公开' },
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
		reactViaMfmEmoji: vi.fn(),
	}) };
});

const fixtures: { app: App; host: HTMLElement }[] = [];

afterEach(() => {
	for (const { app, host } of fixtures.splice(0)) { app.unmount(); host.remove(); }
	document.getSelection()?.removeAllRanges();
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

async function mountCard(text = '正文 **粗体内容** 可以划选复制') {
	const host = document.createElement('div');
	host.style.cssText = 'width:650px;--MI-margin:16px;--MI-cardPadding:18px;--MI-cardRadius:12px;--MI_THEME-bg:#f3f4f6;--MI_THEME-buttonBg:#e5e7eb;--MI_THEME-panel:white;--MI_THEME-fg:#555;--MI_THEME-fgOnAccent:white;--MI_THEME-fgTransparentWeak:#777;--MI_THEME-accent:#1677ff;';
	host.style.background = 'var(--MI_THEME-bg)';
	document.body.append(host);
	const note = {
		id: 'displayed-note', userId: 'author', user: { id: 'author', name: '作者', username: 'author', host: null },
		text, cw: null, files: [], reactions: {}, reactionEmojis: {},
		visibility: 'public', localOnly: false, replyId: null, renoteId: null,
		repliesCount: 2, likeCount: 3, viewsCount: 128,
	} as unknown as Misskey.entities.Note;
	const app = createApp({ render: () => h(MkNote, { note }) });
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
	return host.firstElementChild as HTMLElement;
}

describe('real note card', () => {
	test('长文可展开和收起，短文不显示折叠控件', async () => {
		const root = await mountCard('正文内容\n'.repeat(20));
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
		const shortNote = await mountCard('短消息');
		await expect.element(page.elementLocator(shortNote).getByRole('button', { name: '展开全文', exact: true })).not.toBeInTheDocument();
		await expect.element(page.elementLocator(shortNote).getByRole('button', { name: '收起', exact: true })).not.toBeInTheDocument();
	});

	test.each([
		{ label: '回复', action: mocks.reply },
		{ label: '赞', action: mocks.like },
		{ label: '转发', action: mocks.renote },
	])('keeps the $label button mouse and Enter behavior', async ({ label, action }) => {
		const root = await mountCard();
		const button = page.elementLocator(root).getByRole('button', { name: label, exact: true });
		await button.click();
		expect(action).toHaveBeenCalledOnce();
		await userEvent.keyboard('{Enter}');
		expect(action).toHaveBeenCalledTimes(2);
	});

	test('allows a mouse drag to select body text', async () => {
		const root = await mountCard();
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
	});
});
