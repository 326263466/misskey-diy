/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import PageWithHeader from '@/components/global/PageWithHeader.vue';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import MkSwiper from '@/components/MkSwiper.vue';

const preferences = vi.hoisted(() => ({
	s: { animation: false, enableHorizontalSwipe: true, showPageTabBarBottom: false },
	r: { animation: { value: false }, enableHorizontalSwipe: { value: true } },
}));

vi.mock('@/preferences.js', () => ({ prefer: preferences }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ useListener: vi.fn() }) }));
vi.mock('@/accounts.js', () => ({ getAccountMenu: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/os.js', () => ({ popupMenu: vi.fn() }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { goBack: '返回' } } }));

const fixtures: { app: App; host: HTMLElement }[] = [];
const tabs = [{ key: 'all', title: '全部' }, { key: 'mine', title: '我的' }];

async function nextFrame() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
}

async function mountPage({
	layout = 'ancestor', swipe = false, hideHeader = false, omitTitle = false, actions = false,
	direct = false, embedded = false, body = 'spacer', footer = false,
}: {
	layout?: 'ancestor' | 'root' | 'standalone'; swipe?: boolean; hideHeader?: boolean; omitTitle?: boolean; actions?: boolean;
	direct?: boolean; embedded?: boolean; body?: 'spacer' | 'wrapped' | 'card'; footer?: boolean;
} = {}) {
	const host = document.createElement('div');
	host.style.cssText = 'width:calc(100% - 32px);max-width:880px;height:600px;margin:16px;container-type:inline-size;';
	if (layout === 'ancestor') host.className = '_pageContent';
	document.body.append(host);
	const headerHidden = ref(hideHeader);
	const spacer = () => h('div', {
		class: body === 'card' ? '_spacer _spacerCard' : '_pageBody',
	}, h('div', { 'data-testid': 'first-control', style: 'height:32px;' }, '开放注册'));
	const content = () => body === 'spacer' ? spacer() : h('div', body === 'wrapped'
		? { 'data-page-body': '' }
		: { class: '_panel', 'data-testid': 'nested-card' }, spacer());
	const footerContent = () => footer ? h('div', {
		class: '_pageFooter', 'data-testid': 'footer-spacer',
	}, h('button', { type: 'button' }, '保存')) : null;
	const app = createApp({
		render: () => direct ? h(MkStickyContainer, {}, {
			header: () => headerHidden.value ? null : h(MkPageHeader, {
				overridePageMetadata: { title: '管理设置' }, embedded, tabs: swipe ? tabs : [], tab: 'all',
			}),
			default: () => swipe
				? h(MkSwiper, { tab: 'all', tabs }, () => h('div', { 'data-page-body': '' }, content()))
				: h('div', { 'data-page-body': '' }, content()),
			footer: footerContent,
		}) : h(PageWithHeader, {
			class: layout === 'root' ? '_pageContent' : undefined,
			overridePageMetadata: { title: '管理设置' },
			tabs: swipe ? tabs : [], tab: 'all', hideHeader: headerHidden.value,
		}, {
			default: content,
			footer: footerContent,
			...(actions ? { 'header-actions': () => h('button', { type: 'button' }, '创建') } : {}),
		}),
	});
	app.provide('shouldOmitHeaderTitle', omitTitle);
	app.component('MkPageHeader', MkPageHeader);
	app.component('MkStickyContainer', MkStickyContainer);
	for (const name of ['MkAvatar', 'MkUserName']) app.component(name, { render: () => null });
	app.directive('tooltip', () => {});
	app.mount(host);
	fixtures.push({ app, host });
	await nextFrame();
	await nextFrame();
	const stickyBody = host.querySelector<HTMLElement>('[data-sticky-container-header-height]')!;
	const stickyHeader = stickyBody.previousElementSibling as HTMLElement;
	const header = stickyHeader.querySelector<HTMLElement>('[data-page-header]');
	const control = host.querySelector<HTMLElement>('[data-testid="first-control"]')!;
	return {
		host, stickyBody, stickyHeader, header, control,
		async setHeaderHidden(value: boolean) {
			headerHidden.value = value;
			await nextFrame();
			await nextFrame();
		},
	};
}

beforeEach(async () => {
	preferences.s.showPageTabBarBottom = false;
	await page.viewport(1000, 900);
	window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
});

afterEach(async () => {
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
	await nextFrame();
});

describe('page header to content spacing', () => {
	test.each([320, 700, 1000])('separates channel tabs from long titles and actions without overflow at %i px', async width => {
		await page.viewport(Math.max(width, 1000), 900);
		const host = document.createElement('div');
		host.style.width = `${width}px`;
		document.body.append(host);
		const app = createApp({
			render: () => h(MkPageHeader, {
				overridePageMetadata: { title: '科技范的频道名称很长也需要完整的操作区域'.repeat(4), icon: 'ti ti-device-tv' },
				tabsBelow: true,
				tabs: ['概览', '时间线', '热门', '搜索'].map((title, index) => ({ key: `${index}`, title })), tab: '1',
				actions: ['复制链接', '分享', '静音', '编辑'].map(text => ({ text, icon: 'ti ti-settings', handler: () => {} })),
			}, { actions: () => h('button', { type: 'button', style: 'width:120px;height:32px;', 'data-testid': 'sort' }, '最新 / 刷新') }),
		});
		for (const name of ['MkAvatar', 'MkUserName']) app.component(name, { render: () => null });
		app.directive('tooltip', () => {});
		app.mount(host);
		fixtures.push({ app, host });
		await nextFrame();
		await nextFrame();
		const header = host.querySelector<HTMLElement>('[data-page-header]')!;
		const upper = header.firstElementChild as HTMLElement;
		const lower = header.lastElementChild as HTMLElement;
		const headerBox = header.getBoundingClientRect();
		const upperBox = upper.getBoundingClientRect();
		const lowerBox = lower.getBoundingClientRect();
		expect(header.children).toHaveLength(2);
		expect(lowerBox.top).toBeCloseTo(upperBox.bottom, 1);
		expect(lower.querySelectorAll('button')).toHaveLength(4);
		expect(upper.querySelectorAll('button')).toHaveLength(5);
		for (const button of upper.querySelectorAll('button')) {
			const box = button.getBoundingClientRect();
			expect(box.left).toBeGreaterThanOrEqual(headerBox.left);
			expect(box.right).toBeLessThanOrEqual(headerBox.right);
			expect(box.top).toBeGreaterThanOrEqual(upperBox.top);
			expect(box.bottom).toBeLessThanOrEqual(lowerBox.top);
			if (width >= 700) expect((box.top + box.bottom) / 2).toBeCloseTo((upperBox.top + upperBox.bottom) / 2, 1);
		}
		if (width === 1000) await page.screenshot({ element: host, path: '../e2e/artifacts/component-browser/channel-header-two-rows.png' });
	});

	test.each([320, 520, 700, 1000])('keeps custom actions on the right and centered beside overflowing tabs at %i px', async width => {
		const host = document.createElement('div');
		host.style.width = `${width}px`;
		document.body.append(host);
		const app = createApp({
			render: () => h(MkPageHeader, {
				overridePageMetadata: { title: '频道' }, hideTitle: true,
				tabs: Array.from({ length: 8 }, (_, index) => ({ key: `${index}`, title: `频道列表 ${index}` })), tab: '0',
			}, { actions: () => h('button', { type: 'button', style: 'width:100px;height:32px;' }, '新建') }),
		});
		app.mount(host);
		fixtures.push({ app, host });
		await nextFrame();
		const header = host.querySelector<HTMLElement>('[data-page-header]')!;
		const button = Array.from(host.querySelectorAll('button')).find(item => item.textContent === '新建')!;
		const headerBox = header.getBoundingClientRect();
		const buttonBox = button.getBoundingClientRect();
		expect(headerBox.height).toBe(50);
		expect(headerBox.right - buttonBox.right).toBeCloseTo(8, 1);
		expect((buttonBox.top + buttonBox.bottom) / 2).toBeCloseTo((headerBox.top + headerBox.bottom) / 2, 1);
	});

	test.each([
		{ width: 1000, layout: 'ancestor' as const, swipe: false },
		{ width: 320, layout: 'ancestor' as const, swipe: false },
		{ width: 1000, layout: 'root' as const, swipe: false },
		{ width: 320, layout: 'root' as const, swipe: false },
		{ width: 1000, layout: 'ancestor' as const, swipe: true },
		{ width: 320, layout: 'ancestor' as const, swipe: true },
	])('keeps one 18px gap at $width px with $layout layout and swipe=$swipe', async options => {
		await page.viewport(options.width, 900);
		const { host, header, stickyBody, control } = await mountPage(options);
		expect(header).not.toBeNull();
		const headerBox = header!.getBoundingClientRect();
		expect(headerBox.height).toBe(options.swipe && options.width < 500 ? 100 : 50);
		expect(control.getBoundingClientRect().top - headerBox.bottom).toBe(18);
		expect(Number(stickyBody.dataset.stickyContainerHeaderHeight)).toBe(headerBox.height + 18);
		expect(getComputedStyle(control.parentElement!).paddingTop).toBe('0px');
		expect(control.getBoundingClientRect().left).toBe(headerBox.left);
		expect(control.getBoundingClientRect().right).toBe(headerBox.right);
		expect(host.querySelectorAll('[data-page-body]').length).toBe(options.swipe ? 2 : 1);
	});

	test.each([320, 1000])('uses the shared 18px gap and full column width at %i px', async width => {
		await page.viewport(width, 900);
		const { header, stickyBody, control } = await mountPage({ layout: 'standalone' });
		const headerBox = header!.getBoundingClientRect();
		expect(getComputedStyle(control.parentElement!).paddingTop).toBe('0px');
		expect(getComputedStyle(control.parentElement!).paddingBottom).toBe('18px');
		expect(control.getBoundingClientRect().left).toBe(headerBox.left);
		expect(control.getBoundingClientRect().right).toBe(headerBox.right);
		expect(control.getBoundingClientRect().top - headerBox.bottom).toBe(18);
		expect(Number(stickyBody.dataset.stickyContainerHeaderHeight)).toBe(headerBox.height + 18);
	});

	test.each([
		{ hideHeader: true, omitTitle: false },
		{ hideHeader: false, omitTitle: true },
	])('leaves no empty header gap with hideHeader=$hideHeader and omitTitle=$omitTitle', async options => {
		const { host, header, stickyHeader, stickyBody, control } = await mountPage(options);
		expect(header).toBeFalsy();
		expect(stickyHeader.getBoundingClientRect().height).toBe(0);
		expect(Number(stickyBody.dataset.stickyContainerHeaderHeight)).toBe(0);
		expect(control.getBoundingClientRect().top).toBe(host.getBoundingClientRect().top);
	});

	test('retains the gap when omitted titles still have custom header actions', async () => {
		const { header, control } = await mountPage({ omitTitle: true, actions: true });
		expect(header!.getBoundingClientRect().height).toBe(50);
		expect(control.getBoundingClientRect().top - header!.getBoundingClientRect().bottom).toBe(18);
	});

	test('counts the visible nested header gap once when its parent page title is hidden', async () => {
		const host = document.createElement('div');
		host.className = '_pageContent _pageContainer';
		host.style.cssText = 'width:880px;height:600px;margin:16px;';
		document.body.append(host);
		// Settings omits its desktop shell title; nested admin content can own a sticky header.
		const app = createApp({
			render: () => h(PageWithHeader, {
				overridePageMetadata: { title: '设置' }, hideTitle: true,
			}, {
				default: () => h(MkStickyContainer, {}, {
					header: () => h(MkPageHeader, { overridePageMetadata: { title: '自定义表情' } }),
					default: () => h('div', { class: '_gaps', 'data-testid': 'nested-control', style: 'height:32px;' }, '管理表情'),
				}),
			}),
		});
		app.component('MkPageHeader', MkPageHeader);
		app.component('MkStickyContainer', MkStickyContainer);
		for (const name of ['MkAvatar', 'MkUserName']) app.component(name, { render: () => null });
		app.mount(host);
		fixtures.push({ app, host });
		await nextFrame();
		await nextFrame();

		const stickyBodies = host.querySelectorAll<HTMLElement>('[data-sticky-container-header-height]');
		expect(stickyBodies).toHaveLength(2);
		expect(host.querySelectorAll('[data-page-header]')).toHaveLength(1);
		expect(Number(stickyBodies[0].dataset.stickyContainerHeaderHeight)).toBe(0);
		expect(Number(stickyBodies[1].dataset.stickyContainerHeaderHeight)).toBe(68);
		expect(getComputedStyle(stickyBodies[1].previousElementSibling!).top).toBe('0px');

		const header = host.querySelector<HTMLElement>('[data-page-header]')!;
		const control = host.querySelector<HTMLElement>('[data-testid="nested-control"]')!;
		expect(header.getBoundingClientRect().top).toBe(host.getBoundingClientRect().top);
		expect(control.getBoundingClientRect().top - header.getBoundingClientRect().bottom).toBe(18);
		expect(getComputedStyle(control).getPropertyValue('--MI-stickyTop').trim()).toBe('68px');
	});

	test('updates both the content gap and sticky height when toggling the header', async () => {
		const { host, stickyHeader, stickyBody, control, setHeaderHidden } = await mountPage();
		expect(control.getBoundingClientRect().top - host.getBoundingClientRect().top).toBe(68);
		await setHeaderHidden(true);
		expect(stickyHeader.getBoundingClientRect().height).toBe(0);
		expect(Number(stickyBody.dataset.stickyContainerHeaderHeight)).toBe(0);
		expect(control.getBoundingClientRect().top).toBe(host.getBoundingClientRect().top);
		await setHeaderHidden(false);
		expect(stickyHeader.getBoundingClientRect().height).toBe(68);
		expect(Number(stickyBody.dataset.stickyContainerHeaderHeight)).toBe(68);
		expect(control.getBoundingClientRect().top - host.getBoundingClientRect().top).toBe(68);
	});

	test('leaves no top gap when tabs move to the footer and the title is omitted', async () => {
		preferences.s.showPageTabBarBottom = true;
		const { host, header, stickyHeader, control } = await mountPage({ omitTitle: true, swipe: true });
		expect(header).toBeFalsy();
		expect(stickyHeader.getBoundingClientRect().height).toBe(0);
		expect(control.getBoundingClientRect().top).toBe(host.getBoundingClientRect().top);
		expect(host.querySelectorAll('button').length).toBe(2);
	});

	test.each([
		{ width: 1000, swipe: false, embedded: false },
		{ width: 320, swipe: false, embedded: false },
		{ width: 1000, swipe: true, embedded: false },
		{ width: 320, swipe: true, embedded: false },
		{ width: 1000, swipe: false, embedded: true },
		{ width: 320, swipe: false, embedded: true },
	])('applies direct header spacing at $width px with swipe=$swipe and embedded=$embedded', async options => {
		await page.viewport(options.width, 900);
		const { header, stickyBody, control } = await mountPage({ ...options, direct: true, layout: 'standalone' });
		const headerBox = header!.getBoundingClientRect();
		const gap = options.embedded ? 0 : 18;
		expect(headerBox.height).toBe(options.swipe && options.width < 500 ? 100 : 50);
		expect(control.getBoundingClientRect().top - headerBox.bottom).toBe(gap);
		expect(Number(stickyBody.dataset.stickyContainerHeaderHeight)).toBe(headerBox.height + gap);
	});

	test('leaves no gap for a direct header that automatically hides its title', async () => {
		const { host, header, stickyHeader, stickyBody, control } = await mountPage({ direct: true, omitTitle: true, layout: 'standalone' });
		expect(header).toBeNull();
		expect(stickyHeader.getBoundingClientRect().height).toBe(0);
		expect(Number(stickyBody.dataset.stickyContainerHeaderHeight)).toBe(0);
		expect(control.getBoundingClientRect().top).toBe(host.getBoundingClientRect().top);
	});

	test.each([false, true])('removes duplicate spacer padding through explicit content boundaries with swipe=%s', async swipe => {
		const { header, control } = await mountPage({ layout: 'standalone', body: 'wrapped', swipe });
		expect(control.getBoundingClientRect().top - header!.getBoundingClientRect().bottom).toBe(18);
		expect(getComputedStyle(control.parentElement!).paddingTop).toBe('0px');
	});

	test.each([320, 1000])('preserves a nested card spacer when no page spacer surrounds it at %i px', async width => {
		await page.viewport(width, 900);
		const { host, header, control } = await mountPage({ body: 'card' });
		const card = host.querySelector<HTMLElement>('[data-testid="nested-card"]')!;
		const expectedPadding = 18;
		expect(card.getBoundingClientRect().top - header!.getBoundingClientRect().bottom).toBe(18);
		expect(control.getBoundingClientRect().top - card.getBoundingClientRect().top).toBe(expectedPadding);
		expect(getComputedStyle(control.parentElement!).paddingBottom).toBe(`${expectedPadding}px`);
	});

	test.each([320, 1000])('preserves sticky footer spacer padding at %i px', async width => {
		await page.viewport(width, 900);
		const { host } = await mountPage({ footer: true });
		const footer = host.querySelector<HTMLElement>('[data-testid="footer-spacer"]')!;
		const expectedPadding = '18px';
		expect(getComputedStyle(footer).paddingTop).toBe(expectedPadding);
		expect(getComputedStyle(footer).paddingBottom).toBe(expectedPadding);
	});
});
