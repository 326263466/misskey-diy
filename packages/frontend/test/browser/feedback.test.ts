/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import type { Locale } from '../../../i18n/src/autogen/locale.js';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import '@/style.scss';
import FeedbackPage from '@/pages/feedback.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), user: { id: 'self', isAdmin: false, isModerator: true } }));
vi.hoisted(() => { vi.stubGlobal('_LANGS_', []); vi.stubGlobal('_VERSION_', 'test'); vi.stubGlobal('_DEV_', false); });
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/i.js', () => ({ $i: mocks.user }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/instance.js', () => ({ instance: { maintainerEmail: 'help@example.invalid' } }));
vi.mock('@/utility/please-login.js', () => ({ pleaseLogin: async () => true }));
vi.mock('@/os.js', () => ({ confirm: async () => ({ canceled: true }) }));
vi.mock('@/filters/user.js', () => ({ userPage: () => '/@alice' }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', async () => {
	const { I18n } = await import('@@/js/i18n.js');
	const { version } = await import('../../../../package.json');
	const locales = import.meta.glob<Locale>('../../../../built/_frontend_dist_/locales/zh-CN.*.json', { eager: true, import: 'default' });
	return { i18n: new I18n<Locale>(locales[`../../../../built/_frontend_dist_/locales/zh-CN.${version}.json`]) };
});

let app: App | undefined;
let host: HTMLElement | undefined;
let originalStyle = '';
afterEach(() => { app?.unmount(); host?.remove(); document.documentElement.style.cssText = originalStyle; });

test.each([1280, 390, 320].flatMap(width => [false, true].map(dark => ({ width, dark }))))('feedback cards align within their column at $width px, dark $dark', async ({ width, dark }) => {
	originalStyle = document.documentElement.style.cssText;
	await page.viewport(width, 1000);
	document.documentElement.style.cssText = `--MI-pageGap:18px;--MI-margin:16px;--MI-cardRadius:12px;--MI-radius:12px;--MI_THEME-accent:#86b300;--MI_THEME-accentedBg:#86b30020;--MI_THEME-link:#2686ff;--MI_THEME-success:#49a86d;--MI_THEME-warn:#cc8726;--MI_THEME-error:#e34f5b;--MI_THEME-fgOnAccent:#fff;--MI_THEME-buttonBg:#8882;--MI_THEME-buttonHoverBg:#8883;--MI_THEME-focus:#86b300;--MI_THEME-inputBorder:#8885;--MI_THEME-bg:${dark ? '#202225' : '#f2f3f5'};--MI_THEME-panel:${dark ? '#2c2e32' : '#fff'};--MI_THEME-fg:${dark ? '#dedee1' : '#38404a'};--MI_THEME-fgTransparentWeak:${dark ? '#a5a7b0' : '#777f88'};--MI_THEME-divider:${dark ? '#ffffff18' : '#e9ebef'};`;
	const feedback = [
		{ title: '搜索结果在手机上显示不完整', category: 'bug', status: 'open', description: '在手机浏览器搜索话题时，结果列表右侧内容被截断。希望能优化小屏幕显示。', response: null },
		{ title: '希望增加文章收藏夹', category: 'feature', status: 'inProgress', description: '想把感兴趣的文章按不同主题整理，方便以后阅读。', response: '已加入开发计划，我们会在这里同步进度。' },
		{ title: '深色模式下文字对比度', category: 'other', status: 'resolved', description: '已确认新版本中的显示效果，谢谢反馈。', response: '已修复，欢迎继续提出建议。' },
	].map((item, index) => ({ ...item, id: `feedback-${index}`, userId: 'self', user: { id: 'self', username: 'alice', name: '社区成员' }, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' }));
	mocks.api.mockResolvedValue({ items: feedback, total: 3, counts: { all: 3, open: 1, inProgress: 1, resolved: 1, closed: 0 } });
	host = document.createElement('div');
	host.style.cssText = 'width:100%;background:var(--MI_THEME-bg);';
	document.body.append(host);
	app = createApp(FeedbackPage);
	app.component('PageWithHeader', { render: function () { return h('div', { 'data-page-body': '' }, this.$slots.default?.()); } });
	app.component('MkA', { render: function () { return h('a', { href: '#' }, this.$slots.default?.()); } });
	app.component('MkAvatar', { render: () => h('span', { style: 'display:inline-block;border-radius:50%;background:var(--MI_THEME-accentedBg);' }) });
	app.component('MkTime', { render: () => h('time', '10 月 1 日') });
	app.component('MkLoading', { render: () => h('span', '…') });
	app.mount(host);
	await expect.element(page.getByText(feedback[0].title, { exact: true })).toBeVisible();
	await document.fonts.ready;
	const root = host.querySelector<HTMLElement>('[data-testid="feedback-page"]')!;
	const heading = root.querySelector('header')!;
	expect(heading.getBoundingClientRect().top).toBe(root.getBoundingClientRect().top);
	const board = root.querySelector('main > section')!;
	expect(heading.getBoundingClientRect().left).toBe(board.getBoundingClientRect().left);
	expect(heading.getBoundingClientRect().right).toBe(board.getBoundingClientRect().right);
	for (const card of root.querySelectorAll('header, article, aside > section')) expect(getComputedStyle(card).padding).toBe('18px');
	if (width > 1000) expect(root.querySelector('aside')!.getBoundingClientRect().top).toBe(heading.getBoundingClientRect().top);
	expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
	for (const item of root.querySelectorAll<HTMLElement>('article, input, select, aside')) {
		expect(item.getBoundingClientRect().right).toBeLessThanOrEqual(width + 1);
		expect(item.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
	}
	// Exercise scrolling in the app's nested scroll container, not only the document.
	host.style.height = '600px';
	host.style.overflowY = 'auto';
	const aside = root.querySelector('aside')!;
	const initialAsideTop = aside.getBoundingClientRect().top;
	const initialHeadingTop = heading.getBoundingClientRect().top;
	host.scrollTop = 200;
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	expect(host.scrollTop).toBe(200);
	expect(heading.getBoundingClientRect().top).toBe(initialHeadingTop - 200);
	if (width > 1000) {
		expect(aside.getBoundingClientRect().top).toBe(initialAsideTop);
	} else {
		expect(aside.getBoundingClientRect().top).toBe(initialAsideTop - 200);
	}
	host.scrollTop = 0;
	host.style.removeProperty('height');
	host.style.removeProperty('overflow-y');
	await page.viewport(width, Math.ceil(root.getBoundingClientRect().height) + 20);
	await nextTick();
	await page.screenshot({ element: root, path: `../e2e/artifacts/component-browser/feedback-${width}-${dark ? 'dark' : 'light'}.png` });
	const input = page.getByPlaceholder(i18n.ts._feedback.publishDescription);
	const initialInput = host.querySelector('textarea')!;
	expect(initialInput.rows).toBe(2);
	const inputStyle = getComputedStyle(initialInput);
	expect(initialInput.clientHeight).toBeLessThanOrEqual(2 * parseFloat(inputStyle.lineHeight) + parseFloat(inputStyle.paddingTop) + parseFloat(inputStyle.paddingBottom) + 1);
	await input.click();
	await input.fill('直接在当前页填写反馈');
	await expect.element(input).toBeVisible();
	expect(heading.contains(document.activeElement)).toBe(true);
	expect(getComputedStyle(host.querySelector('textarea')!).resize).toBe('none');
	expect(getComputedStyle(host.querySelector('textarea')!).outlineStyle).toBe('none');
	expect(getComputedStyle(host.querySelector('textarea')!).boxShadow).toBe('none');
	const textarea = host.querySelector('textarea')!.getBoundingClientRect();
	const publish = host.querySelector('[data-testid="feedback-publish"]')!.getBoundingClientRect();
	expect(publish.top).toBeGreaterThanOrEqual(textarea.bottom);
	expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
	await page.screenshot({ element: root, path: `../e2e/artifacts/component-browser/feedback-composer-${width}-${dark ? 'dark' : 'light'}.png` });
});
