/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, defineComponent, h, nextTick, unref } from 'vue';
import * as mfm from 'mfm-js';
import type { App, Component, VNode } from 'vue';
import type * as Misskey from 'misskey-js';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import MkPostForm from '@/components/MkPostForm.vue';
import MkNotePreview from '@/components/MkNotePreview.vue';
import { i18n } from '@/i18n.js';
import { updateDeviceKind } from '@/utility/device-kind.js';
import { hotkeyDirective } from '@/directives/hotkey.js';

const mocks = vi.hoisted(() => ({
	misskeyApi: vi.fn(), popup: vi.fn(), apiWithDialog: vi.fn(),
	hashtags: '#前端开发 #设计', withHashtags: true,
}));
vi.hoisted(() => {
	vi.stubGlobal('_LANGS_', []);
	vi.stubGlobal('_VERSION_', 'test');
	vi.stubGlobal('_DEV_', false);
});
vi.mock('misskey-js', () => ({ acct: { toString: (user: { username: string; host?: string }) => `${user.username}${user.host ? `@${user.host}` : ''}` } }));
vi.mock('insert-text-at-cursor', () => ({ default: vi.fn() }));
vi.mock('@/events.js', () => ({ globalEvents: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } }));
vi.mock('@/os.js', () => ({
	claimZIndex: () => 1000, popup: mocks.popup, apiWithDialog: mocks.apiWithDialog,
	confirm: vi.fn(async () => ({ canceled: false })), popupMenu: vi.fn(),
}));
vi.mock('@@/js/config.js', () => ({
	host: 'example.com', hostname: 'example.com', url: 'https://example.com',
	apiUrl: 'https://example.com/api', lang: 'zh-CN', version: 'test', prefersReducedMotion: false,
}));
vi.mock('@/i18n.js', async () => {
	const { I18n } = await import('@@/js/i18n.js');
	// Use the generated locale so screenshots exercise the same copy as the app.
	const { version } = await import('../../../../package.json');
	const locales = import.meta.glob('../../../../built/_frontend_dist_/locales/zh-CN.*.json', { eager: true, import: 'default' });
	const locale = locales[`../../../../built/_frontend_dist_/locales/zh-CN.${version}.json`];
	if (!locale) throw new Error('Build i18n before running the composer browser tests.');
	return { i18n: new I18n(locale as never) };
});
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.misskeyApi }));
vi.mock('@/i.js', () => {
	const user = {
		id: 'self', name: '设计与开发', username: 'admin', host: null, isSilenced: false,
		avatarUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="48" height="48"%3E%3Crect width="48" height="48" rx="24" fill="%23788b6a"/%3E%3Ctext x="24" y="32" text-anchor="middle" fill="white" font-size="25"%3EA%3C/text%3E%3C/svg%3E',
		policies: { scheduledNoteLimit: 10 },
	};
	return { ensureSignin: () => user, $i: user, notesCount: 0, incNotesCount: vi.fn() };
});
vi.mock('@/store.js', async () => {
	const { ref } = await import('vue');
	return { store: {
		s: { showPreview: false, reactionAcceptance: null }, r: { tips: ref({ postForm: true }) },
		model: (key: string) => ref(key === 'postFormHashtags' ? mocks.hashtags : mocks.withHashtags), set: vi.fn(),
	} };
});
vi.mock('@/preferences.js', () => ({ prefer: {
	s: { keepCw: true, defaultNoteVisibility: 'public', defaultNoteLocalOnly: false, emojiStyle: 'native', animation: false, menuStyle: 'popup' },
	commit: vi.fn(),
} }));
vi.mock('@/instance.js', () => ({ instance: { maxNoteTextLength: 3000 } }));
vi.mock('@/accounts.js', () => ({ getAccounts: vi.fn(), getAccountMenu: vi.fn() }));
vi.mock('@/plugin.js', () => ({ getPluginHandlers: () => [] }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { detach() {} } }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: vi.fn() }));
vi.mock('@/utility/drive.js', () => ({ chooseDriveFile: vi.fn() }));
vi.mock('@/utility/emoji-picker.js', () => ({ emojiPicker: { show: vi.fn() } }));
vi.mock('@/utility/mfm-function-picker.js', () => ({ mfmFunctionPicker: vi.fn() }));
vi.mock('@/utility/tour.js', () => ({ startTour: vi.fn() }));
vi.mock('@/tips.js', () => ({ closeTip: vi.fn() }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release: () => {} }) }));
vi.mock('@/components/MkNoteSimple.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPostFormAttaches.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkUploaderItems.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPollEditor.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPoll.vue', () => ({ default: { render: () => null } }));
vi.mock('@/composables/use-uploader.js', async () => {
	const { ref } = await import('vue');
	return { useUploader: () => ({
		items: ref([]), uploading: ref(false), readyForUpload: ref(true), allItemsUploaded: ref(true),
		events: { on: vi.fn() }, dispose: vi.fn(), abortAll: vi.fn(), reset: vi.fn(),
	}) };
});

const fixtures: { app: App; host: HTMLElement }[] = [];
const longTopic = '一个很长很长的话题名称用来验证省略与完整提示文字';
const summary = '包含剧情讨论，展开前请留意剧透';
const body = '这里是默认折叠的正文，只有点击展开后才会显示。';
const themes = {
	light: '--MI_THEME-bg:#f4f5f6;--MI_THEME-panel:#fff;--MI_THEME-fg:#35434a;--MI_THEME-fgTransparentWeak:#78838a;--MI_THEME-windowHeader:#fff;--MI_THEME-divider:#e0e4e6;--MI_THEME-buttonBg:#edf0f2;--MI_THEME-buttonHoverBg:#e8ecef;--MI_THEME-warn:#bf861b;',
	dark: '--MI_THEME-bg:#11171a;--MI_THEME-panel:#20282d;--MI_THEME-fg:#e0e5e8;--MI_THEME-fgTransparentWeak:#9eabb3;--MI_THEME-windowHeader:#20282d;--MI_THEME-divider:#3c474e;--MI_THEME-buttonBg:#2d383f;--MI_THEME-buttonHoverBg:#34424a;--MI_THEME-warn:#e3ae49;',
};

function configureApp(app: App) {
	app.directive('hotkey', hotkeyDirective);
	for (const name of ['tooltip', 'click-anime', 'adaptive-border']) app.directive(name, () => {});
	for (const name of ['MkTip', 'MkEllipsis', 'MkAcct', 'MkTime', 'I18n']) app.component(name, { render: () => null });
	app.component('MkAvatar', { render: () => h('span', { style: 'display:grid;place-items:center;background:#788b6a;color:white' }, 'A') });
	app.component('MkUserName', { render: () => h('span', '设计与开发') });
	app.component('MkA', defineComponent({ props: ['to'], setup: (props, { slots }) => () => h('a', { href: props.to }, slots.default?.()) }));
	app.component('Mfm', defineComponent({ props: ['text', 'parsedNodes'], setup: props => () => h('span', { style: 'white-space:pre-wrap;overflow-wrap:anywhere' }, props.parsedNodes ? mfm.toString(props.parsedNodes) : props.text) }));
}

async function settle() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
}

async function mount(render: () => VNode, width: number, theme: keyof typeof themes) {
	await page.viewport(width, 880);
	updateDeviceKind(width < 500 ? 'smartphone' : 'desktop');
	document.documentElement.style.cssText = `--MI-radius:10px;--MI-cardRadius:12px;--MI-cardPadding:20px;--MI_THEME-accent:#86b83b;--MI_THEME-fgOnAccent:#fff;--MI_THEME-accentedBg:#86b83b20;--MI_THEME-focus:#86b83b;--MI_THEME-hashtag:#398bce;--MI_THEME-link:#398bce;--MI_THEME-modalBg:#0008;--MI_THEME-panelBorder:#8882;--MI_THEME-popup:var(--MI_THEME-panel);--MI_THEME-shadow:#0002;--MI_THEME-inputBorder:var(--MI_THEME-divider);--MI_THEME-buttonGradateA:#a7cb48;--MI_THEME-buttonGradateB:#7fc442;${themes[theme]}`;
	document.body.style.cssText = 'margin:0;background:var(--MI_THEME-bg);color:var(--MI_THEME-fg);';
	const host = document.createElement('div');
	host.style.cssText = `box-sizing:border-box;width:calc(100% - 24px);max-width:760px;margin:20px auto;padding:8px 0;background:var(--MI_THEME-panel);border-radius:12px;`;
	document.body.append(host);
	const app = createApp({ render });
	configureApp(app);
	app.mount(host);
	fixtures.push({ app, host });
	await document.fonts.ready;
	await settle();
	return host;
}

function assertNoOverflow(element: HTMLElement) {
	expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth);
	const bounds = element.getBoundingClientRect();
	expect(bounds.left).toBeGreaterThanOrEqual(0);
	expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
}

async function addComposerTopics(tags: string[]) {
	await page.getByRole('button', { name: i18n.ts.hashtags, exact: true }).click();
	const dialog = page.getByRole('dialog', { name: i18n.ts._topics.title });
	await expect.element(dialog).toBeVisible();
	const search = page.getByRole('combobox', { name: i18n.ts._topics.search });
	for (const tag of tags) {
		await search.fill(tag);
		search.element().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await settle();
	}
	await page.getByRole('button', { name: i18n.ts.close, exact: true }).click();
	await expect.element(dialog).not.toBeInTheDocument();
}

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	mocks.hashtags = `#前端开发 #设计 #${longTopic}`;
	mocks.withHashtags = true;
	mocks.misskeyApi.mockResolvedValue([]);
	mocks.popup.mockImplementation((component: Component, props: Record<string, unknown>, events: Record<string, (...args: unknown[]) => void>) => {
		const host = document.createElement('div');
		document.body.append(host);
		const eventProps = Object.fromEntries(Object.entries(events ?? {}).map(([key, value]) => [`on${key[0].toUpperCase()}${key.slice(1)}`, value]));
		const app = createApp({ render: () => h(component, { ...Object.fromEntries(Object.entries(props).map(([key, value]) => [key, unref(value)])), ...eventProps }) });
		configureApp(app);
		app.mount(host);
		const fixture = { app, host };
		fixtures.push(fixture);
		return { dispose: () => {
			const index = fixtures.indexOf(fixture);
			if (index >= 0) fixtures.splice(index, 1);
			app.unmount();
			host.remove();
		} };
	});
});

afterEach(async () => {
	for (const { app, host } of fixtures.splice(0).reverse()) { app.unmount(); host.remove(); }
	document.documentElement.style.cssText = '';
	document.body.style.cssText = '';
	updateDeviceKind(null);
	await settle();
});

test.each([
	{ width: 900, theme: 'light' as const },
	{ width: 390, theme: 'dark' as const },
	{ width: 320, theme: 'light' as const },
])('CW composer separates summary, hidden body and topics at $width px in $theme', async ({ width, theme }) => {
	const host = await mount(() => h(MkPostForm, { fixed: true, initialText: body, initialCw: summary }), width, theme);
	await addComposerTopics(['前端开发', '设计', longTopic]);
	const input = page.getByRole('textbox', { name: i18n.ts._postForm.cwSummary }).element() as HTMLInputElement;
	const textarea = page.getByTestId('post-form-text').element() as HTMLTextAreaElement;
	expect(input.value).toBe(summary);
	expect(input.getAttribute('aria-required')).toBe('true');
	expect(input.getAttribute('aria-describedby')).toBeTruthy();
	expect(textarea.value).toBe(body);
	assertNoOverflow(host);
	await page.screenshot({ element: host, path: `../e2e/artifacts/component-browser/post-form-cw-topics-${theme}-${width}.png` });
	await page.getByRole('button', { name: i18n.ts._postForm.cwRemove, exact: true }).click();
	await settle();
	expect(document.activeElement).toBe(textarea);
	expect(input.getClientRects()).toHaveLength(0);
	await page.getByRole('button', { name: i18n.ts.useCw, exact: true }).click();
	await settle();
	expect(document.activeElement).toBe(input);
	expect(input.value).toBe(summary);
	expect(textarea.value).toBe(body);
});

test.each([
	{ width: 900, theme: 'light' as const },
	{ width: 390, theme: 'dark' as const },
	{ width: 320, theme: 'light' as const },
])('published CW keeps body and topics gated at $width px in $theme', async ({ width, theme }) => {
	const host = await mount(() => h(MkNotePreview, {
		text: `${body} #前端开发 #${longTopic}`, useCw: true, cw: summary, files: [],
		user: { id: 'self', username: 'admin', host: null } as Misskey.entities.User,
	}), width, theme);
	host.style.padding = '16px';
	await settle();
	const expand = page.getByRole('button', { name: i18n.ts._cw.showContent, exact: true });
	expect(expand.element().getAttribute('aria-expanded')).toBe('false');
	expect(host.querySelector('nav')?.getClientRects()).toHaveLength(0);
	assertNoOverflow(host);
	await page.screenshot({ element: host, path: `../e2e/artifacts/component-browser/published-cw-collapsed-${theme}-${width}.png` });
	await expand.click();
	await settle();
	const collapse = page.getByRole('button', { name: i18n.ts._cw.hideContent, exact: true });
	expect(collapse.element().getAttribute('aria-expanded')).toBe('true');
	const tags = host.querySelector('nav')!;
	expect(tags.getClientRects().length).toBeGreaterThan(0);
	const longTag = tags.querySelector<HTMLElement>(`a[title="#${longTopic}"]`)!;
	expect(longTag.getAttribute('href')).toBe(`/tags/${encodeURIComponent(longTopic)}`);
	assertNoOverflow(host);
	if (width < 500) {
		const label = longTag.lastElementChild as HTMLElement;
		expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);
		expect(getComputedStyle(label).textOverflow).toBe('ellipsis');
	}
	await page.screenshot({ element: host, path: `../e2e/artifacts/component-browser/published-cw-expanded-${theme}-${width}.png` });
	await collapse.click();
	await settle();
	expect(tags.getClientRects()).toHaveLength(0);
});

test.each([
	{ width: 900, theme: 'light' as const },
	{ width: 390, theme: 'dark' as const },
	{ width: 320, theme: 'light' as const },
])('topic picker stays inside the viewport and selects existing or custom topics at $width px', async ({ width, theme }) => {
	mocks.hashtags = '';
	mocks.withHashtags = false;
	localStorage.setItem('hashtags', JSON.stringify(['前端开发', '设计', longTopic]));
	const existing = `浏览器性能${width}${theme}`;
	const custom = `新的创作话题${width}${theme}`;
	mocks.misskeyApi.mockImplementation(async (endpoint: string, params: { query?: string }) => {
		if (endpoint === 'hashtags/trend') return [{ tag: '每日分享' }, { tag: longTopic }];
		if (endpoint === 'hashtags/search') return params.query === existing ? [existing] : [];
		return [];
	});
	const host = await mount(() => h(MkPostForm, { fixed: true, initialText: body }), width, theme);
	const toolbar = page.getByRole('button', { name: i18n.ts.hashtags, exact: true });
	await toolbar.click();
	const dialog = page.getByRole('dialog', { name: i18n.ts._topics.title });
	await expect.element(dialog).toBeVisible();
	await settle();
	const search = page.getByRole('combobox', { name: i18n.ts._topics.search });
	const input = search.element() as HTMLInputElement;
	await expect.poll(() => document.activeElement === input).toBe(true);
	expect(toolbar.element().getAttribute('aria-expanded')).toBe('true');
	assertNoOverflow(dialog.element() as HTMLElement);
	const bounds = dialog.element().getBoundingClientRect();
	expect(bounds.top).toBeGreaterThanOrEqual(0);
	expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);
	await page.screenshot({ path: `../e2e/artifacts/component-browser/topic-picker-recent-${theme}-${width}.png` });
	// Burst updates should issue only one search, after the user pauses typing.
	for (const value of ['浏览', '浏览器', existing]) {
		input.value = value;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await nextTick();
	}
	expect(mocks.misskeyApi.mock.calls.filter(([endpoint]) => endpoint === 'hashtags/search')).toHaveLength(0);
	await expect.poll(() => mocks.misskeyApi.mock.calls.filter(([endpoint]) => endpoint === 'hashtags/search').length).toBe(1);
	const result = page.getByRole('option', { name: existing, exact: true });
	await expect.element(result).toBeVisible();
	await page.screenshot({ path: `../e2e/artifacts/component-browser/topic-picker-results-${theme}-${width}.png` });
	await result.click();
	await settle();
	expect(input.value).toBe('');
	expect(document.activeElement).toBe(input);
	expect(host.querySelector(`[title="#${existing}"]`)).toBeTruthy();
	await search.fill(custom);
	const create = page.getByRole('option', { name: i18n.tsx._topics.create({ tag: custom }), exact: true });
	await expect.element(create).toBeVisible();
	await expect.poll(() => mocks.misskeyApi.mock.calls.filter(([endpoint]) => endpoint === 'hashtags/search').length).toBe(2);
	await page.screenshot({ path: `../e2e/artifacts/component-browser/topic-picker-create-${theme}-${width}.png` });
	await create.click();
	await settle();
	expect(host.querySelector(`[title="#${custom}"]`)).toBeTruthy();
	input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	await expect.element(dialog).not.toBeInTheDocument();
	expect(toolbar.element().getAttribute('aria-expanded')).toBe('false');
	expect(document.activeElement).toBe(toolbar.element());
	assertNoOverflow(host);
});

test('removing topic chips keeps keyboard focus on the next action', async () => {
	const host = await mount(() => h(MkPostForm, { fixed: true, initialText: body }), 320, 'light');
	await addComposerTopics(['前端开发', '设计']);
	const removeFirst = page.getByRole('button', { name: i18n.tsx._topics.remove({ tag: '前端开发' }), exact: true });
	const removeNext = page.getByRole('button', { name: i18n.tsx._topics.remove({ tag: '设计' }), exact: true });
	await removeFirst.click();
	await settle();
	expect(document.activeElement).toBe(removeNext.element());
	await removeNext.click();
	await settle();
	expect(document.activeElement).toBe(page.getByRole('button', { name: i18n.ts.hashtags, exact: true }).element());
	expect(host.querySelector('[role="group"]')).toBeNull();
});

test('reopening an ordinary composer starts clean despite previous local draft and topic settings', async () => {
	localStorage.setItem('drafts', JSON.stringify({ 'note:self': { data: {
		text: '旧正文', useCw: true, cw: '旧摘要', withHashtags: true, hashtags: '#旧话题', files: [],
	} } }));
	function assertFresh(host: HTMLElement) {
		expect((host.querySelector('[data-testid="post-form-text"]') as HTMLTextAreaElement).value).toBe('');
		expect(host.querySelector('input')!.getClientRects()).toHaveLength(0);
		expect(page.getByRole('button', { name: i18n.ts.useCw, exact: true }).element().getAttribute('aria-pressed')).toBe('false');
		expect(host.querySelector('[role="group"]')).toBeNull();
	}
	const first = await mount(() => h(MkPostForm, { fixed: true }), 390, 'light');
	assertFresh(first);
	await page.getByTestId('post-form-text').fill('这次输入的正文');
	await page.getByRole('button', { name: i18n.ts.useCw, exact: true }).click();
	await page.getByRole('textbox', { name: i18n.ts._postForm.cwSummary }).fill('这次输入的摘要');
	await addComposerTopics(['这次话题']);
	const index = fixtures.findIndex(fixture => fixture.host === first);
	fixtures.splice(index, 1)[0].app.unmount();
	first.remove();
	const reopened = await mount(() => h(MkPostForm, { fixed: true }), 390, 'light');
	assertFresh(reopened);
});
