/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, markRaw, nextTick, ref } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import MkPaginationControl from '@/components/MkPaginationControl.vue';
import MkTabs from '@/components/MkTabs.vue';
import type { PageMetadata } from '@/page.js';
import type { IPaginator } from '@/utility/paginator.js';
import { adaptiveBorderDirective } from '@/directives/adaptive-border.js';
import * as os from '@/os.js';

vi.mock('@/os.js', () => ({ popup: vi.fn(() => ({ dispose: vi.fn() })), popupMenu: vi.fn() }));
vi.mock('@/accounts.js', () => ({ getAccountMenu: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/theme.js', () => ({ themeManager: { on: vi.fn(), off: vi.fn() } }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/components/MkDialog.vue', () => ({ default: {} }));
vi.mock('@/components/global/MkA.vue', () => ({ default: {} }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	goBack: '返回', search: '搜索', filter: '筛选', dateAndTime: '日期', clear: '清除', reload: '刷新', apply: '应用',
	_order: { newest: '最新发布', oldest: '最早发布' },
} } }));

const fixtures: { app: App; host: HTMLElement }[] = [];
const tabs = [{ key: 'all', title: '全部' }, { key: 'mine', title: '我的' }];

function createPaginator() {
	return markRaw({
		items: ref([]), queuedAheadItemsCount: ref(0), fetching: ref(false), fetchingOlder: ref(false), fetchingNewer: ref(false),
		canFetchOlder: ref(false), canFetchNewer: ref(false), canSearch: true, error: ref(false), computedParams: null,
		initialId: null, initialDate: new Date('2026-09-23T00:00:00').getTime(), initialDirection: 'older' as const,
		noPaging: false, searchQuery: ref<string | null>(null), order: ref<'newest' | 'oldest'>('newest'),
		init: vi.fn().mockResolvedValue(undefined), reload: vi.fn().mockResolvedValue(undefined),
		fetchOlder: vi.fn().mockResolvedValue(undefined), fetchNewer: vi.fn().mockResolvedValue(undefined), trim: vi.fn(), unshiftItems: vi.fn(),
		pushItems: vi.fn(), prepend: vi.fn(), enqueue: vi.fn(), releaseQueue: vi.fn(), removeItem: vi.fn(), updateItem: vi.fn(),
	} satisfies IPaginator);
}

async function nextFrame() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
}

async function mountToolbar({ kind, withTabs = false, controls = true, height, theme, settle = true }: {
	kind: 'page' | 'card'; withTabs?: boolean; controls?: boolean; height?: number;
	theme?: { panel: string; inputBorder: string }; settle?: boolean;
}) {
	const host = document.createElement('div');
	host.id = `page-toolbar-fixture-${fixtures.length}`;
	// Match the border policy of the main content column in universal.vue.
	host.style.cssText = 'width:calc(100% - 32px);max-width:880px;margin:16px;--MI-pageHeaderBorder:none;';
	if (height != null) host.style.setProperty('--MI-pageHeaderHeight', `${height}px`);
	if (theme) {
		for (const [key, value] of Object.entries({ ...theme, divider: theme.inputBorder, pageHeaderBg: theme.panel })) {
			host.style.setProperty(`--MI_THEME-${key}`, value);
		}
	}
	document.body.append(host);
	const layout = ref({ kind, withTabs });
	const paginator = createPaginator();
	const tab = ref('all');
	const create = vi.fn();
	const updateTab = (value: string | undefined) => {
		if (value != null) tab.value = value;
	};
	const pagination = () => h(MkPaginationControl, { paginator, canFilter: true, 'data-testid': 'controls' }, {
		default: () => h('div', { 'data-testid': 'filters' }, '筛选选项'),
	});
	const app = createApp({
		render: () => layout.value.kind === 'page'
			? h(MkPageHeader, {
				overridePageMetadata: { title: '收藏', icon: 'ti ti-star' },
				tabs: layout.value.withTabs ? tabs : [], tab: tab.value, 'onUpdate:tab': updateTab,
				actions: controls ? [{ text: '新建', icon: 'ti ti-plus', handler: create }] : [],
			}, controls ? { actions: pagination } : {})
			: h(MkPaginationControl, { paginator, card: true, canFilter: true, 'data-testid': 'controls' }, {
				...(layout.value.withTabs ? { header: () => h(MkTabs, { tabs, tab: tab.value, 'onUpdate:tab': updateTab }) } : {}),
				default: () => h('div', { 'data-testid': 'filters' }, '筛选选项'),
			}),
	});
	app.directive('adaptive-border', adaptiveBorderDirective);
	app.directive('tooltip', () => {});
	for (const name of ['MkAvatar', 'MkUserName']) app.component(name, { render: () => null });
	app.mount(host);
	fixtures.push({ app, host });
	if (settle) {
		await document.fonts.ready;
		await nextFrame();
		await nextFrame();
	}
	const root = kind === 'page' ? host.querySelector<HTMLElement>('[data-page-header]')! : host.firstElementChild as HTMLElement;
	const row = root.firstElementChild as HTMLElement;
	const control = host.querySelector<HTMLElement>('[data-testid="controls"]');
	return {
		host, root, row, control, paginator, tab, create,
		async switchLayout(nextKind: 'page' | 'card', nextWithTabs: boolean) {
			layout.value = { kind: nextKind, withTabs: nextWithTabs };
			await nextTick();
		},
	};
}

function assertContained(element: HTMLElement, container: HTMLElement) {
	const box = element.getBoundingClientRect();
	const bounds = container.getBoundingClientRect();
	expect(box.width).toBeGreaterThan(0);
	expect(box.height).toBeGreaterThan(0);
	expect(box.left).toBeGreaterThanOrEqual(bounds.left - 1);
	expect(box.right).toBeLessThanOrEqual(bounds.right + 1);
	expect(box.top).toBeGreaterThanOrEqual(bounds.top - 1);
	expect(box.bottom).toBeLessThanOrEqual(bounds.bottom + 1);
}

function assertActionsVisible(host: HTMLElement, root: HTMLElement) {
	expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
	for (const control of host.querySelectorAll<HTMLElement>('button, [tabindex="0"]')) {
		assertContained(control, root);
		const box = control.getBoundingClientRect();
		const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
		expect(hit && (control === hit || control.contains(hit))).toBe(true);
	}
}

beforeEach(async () => {
	vi.clearAllMocks();
	await page.viewport(1000, 900);
	document.documentElement.style.scrollBehavior = 'auto';
	window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
});

afterEach(async () => {
	await nextFrame();
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
	document.documentElement.style.scrollBehavior = '';
	await nextFrame();
});

describe('shared page and card toolbar layout', () => {
	test.each([320, 1000])('keeps embedded back navigation accessible and aligned at viewport width %i', async width => {
		await page.viewport(width, 900);
		const host = document.createElement('div');
		host.tabIndex = -1;
		host.style.cssText = 'width:calc(100% - 32px);max-width:800px;margin:16px;--MI_THEME-panel:#fff;--MI_THEME-divider:rgba(0,0,0,0.12);--MI_THEME-pageHeaderFg:#333;';
		const parentClick = vi.fn();
		host.addEventListener('click', parentClick);
		document.body.append(host);
		const title = '张三的帖子 · 长标题仍然保留返回入口';
		const embedded = ref(false);
		const avatar = { id: 'author', username: 'author', name: '张三' } as PageMetadata['avatar'];
		const metadata = ref<PageMetadata>({ title, subtitle: '2026年9月25日', avatar });
		const app = createApp({ render: () => h(MkPageHeader, {
			embedded: embedded.value,
			displayBackButton: true,
			overridePageMetadata: metadata.value,
		}) });
		app.component('MkAvatar', { render: () => h('span', { 'data-testid': 'avatar', style: 'display:block;' }) });
		app.component('MkUserName', { render: () => null });
		app.mount(host);
		fixtures.push({ app, host });
		await document.fonts.ready;
		await nextFrame();
		await nextFrame();
		const root = host.querySelector<HTMLElement>('[data-page-header]')!;
		const back = root.querySelector<HTMLButtonElement>('button[aria-label="返回"]')!;
		const label = Array.from(root.querySelectorAll<HTMLElement>('div')).find(element => element.childElementCount === 0 && element.textContent === title)!;
		const avatarElement = root.querySelector<HTMLElement>('[data-testid="avatar"]')!;
		const geometry = () => {
			const headerRect = root.getBoundingClientRect();
			const style = getComputedStyle(root);
			return {
				width: headerRect.width,
				height: headerRect.height,
				padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
				contents: [back, label, avatarElement, avatarElement.parentElement!].map(element => {
					const rect = element.getBoundingClientRect();
					return { left: rect.left - headerRect.left, top: rect.top - headerRect.top, width: rect.width, height: rect.height };
				}),
			};
		};
		const regular = geometry();
		expect(regular.height).toBe(50);
		expect(getComputedStyle(root).borderRadius).toBe('4px');
		expect(root.parentElement!.getBoundingClientRect().height).toBe(70);
		expect(regular.contents[0]).toMatchObject({ width: 34, height: 34 });
		embedded.value = true;
		await nextFrame();
		await nextFrame();
		expect(geometry()).toEqual(regular);
		expect(getComputedStyle(root).borderTopLeftRadius).toBe('4px');
		expect(getComputedStyle(root).borderTopRightRadius).toBe('4px');
		expect(root.parentElement!.getBoundingClientRect().height).toBe(50);
		const divider = getComputedStyle(root, '::after');
		expect(divider.position).toBe('absolute');
		expect(divider.height).toBe('0.5px');
		expect(divider.bottom).toBe('0px');
		expect(divider.backgroundColor).toBe('rgba(0, 0, 0, 0.12)');
		expect(label.getBoundingClientRect().left - back.getBoundingClientRect().right).toBeGreaterThanOrEqual(11.9);
		assertContained(label, root);
		assertContained(avatarElement, root);
		assertActionsVisible(host, root);
		metadata.value = { title: '帖子' };
		await nextFrame();
		expect(root.getBoundingClientRect().height).toBe(regular.height);
		expect(root.querySelector('[data-testid="avatar"]')).toBeNull();
		expect(root.textContent).not.toContain('2026年9月25日');
		await expect.element(page.elementLocator(host).getByText('帖子', { exact: true })).toBeVisible();
		assertActionsVisible(host, root);
		const goBack = vi.spyOn(window.history, 'back').mockImplementation(() => {});
		try {
			await page.elementLocator(back).click();
			expect(goBack).toHaveBeenCalledOnce();
			expect(parentClick).not.toHaveBeenCalled();
			goBack.mockClear();
			host.focus();
			await userEvent.tab();
			expect(document.activeElement).toBe(back);
			await userEvent.keyboard('{Enter}');
			expect(goBack).toHaveBeenCalledOnce();
			expect(parentClick).not.toHaveBeenCalled();
		} finally {
			goBack.mockRestore();
		}
	});

	test.each([
		{ name: 'light', panel: 'rgb(255, 255, 255)', inputBorder: 'rgba(0, 0, 0, 0.1)' },
		{ name: 'dark', panel: 'rgb(42, 42, 42)', inputBorder: 'rgba(255, 255, 255, 0.1)' },
	])('keeps the $name order border stable from the first frame across menus', async theme => {
		const layouts = [
			{ kind: 'page' as const, withTabs: false },
			{ kind: 'card' as const, withTabs: false },
			{ kind: 'page' as const, withTabs: true },
			{ kind: 'card' as const, withTabs: true },
		];
		// Skip frame settling so the first sample observes the mounted directive's initial write.
		const fixture = await mountToolbar({ ...layouts[0], theme, settle: false });
		const results: { kind: string; withTabs: boolean; colors: string[]; animated: boolean }[] = [];
		for (const [index, layout] of layouts.entries()) {
			if (index > 0) await fixture.switchLayout(layout.kind, layout.withTabs);
			const input = fixture.host.querySelector<HTMLElement>('[data-testid="controls"] [tabindex="-1"]')!;
			const colors = new Set<string>();
			let animated = false;
			const sample = () => {
				colors.add(getComputedStyle(input).borderTopColor);
				animated ||= input.getAnimations().some(animation => animation instanceof CSSTransition && animation.transitionProperty.startsWith('border-'));
			};
			const startedAt = performance.now();
			sample();
			do {
				await nextFrame();
				sample();
			} while (performance.now() - startedAt < 150);
			results.push({ ...layout, colors: [...colors], animated });
		}
		expect(results).toEqual(layouts.map(layout => ({ ...layout, colors: [theme.inputBorder], animated: false })));
	});

	test.each([undefined, 64])('keeps desktop rows equally tall with shared height %s', async height => {
		const expectedHeight = height ?? 50;
		for (const options of [
			{ kind: 'page' as const, controls: false },
			{ kind: 'page' as const, withTabs: false },
			{ kind: 'page' as const, withTabs: true },
			{ kind: 'card' as const, withTabs: false },
			{ kind: 'card' as const, withTabs: true },
		]) {
			const fixture = await mountToolbar({ ...options, height });
			expect(fixture.row.getBoundingClientRect().height).toBeCloseTo(expectedHeight, 1);
			expect(fixture.root.getBoundingClientRect().height).toBeCloseTo(expectedHeight, 1);
			if (options.kind === 'page') {
				const title = page.elementLocator(fixture.host).getByText('收藏', { exact: true });
				await expect.element(title).toBeVisible();
			}
			assertActionsVisible(fixture.host, fixture.root);
		}
	});

	test.each(['page', 'card'] as const)('preserves %s tab changes and real control actions', async kind => {
		const fixture = await mountToolbar({ kind, withTabs: true });
		const view = page.elementLocator(fixture.host);
		await view.getByRole('button', { name: '我的', exact: true }).click();
		expect(fixture.tab.value).toBe('mine');
		await view.getByRole('button', { name: '刷新', exact: true }).click();
		expect(fixture.paginator.reload).toHaveBeenCalledTimes(1);
		await view.getByRole('button', { name: '搜索', exact: true }).click();
		expect(vi.mocked(os.popup).mock.lastCall?.[1]).toMatchObject({ title: '搜索' });
		await view.getByRole('button', { name: '筛选', exact: true }).click();
		await expect.element(view.getByText('筛选选项', { exact: true })).toBeVisible();
		await view.getByRole('button', { name: '筛选', exact: true }).click();
		await page.elementLocator(fixture.control!.querySelector<HTMLElement>('[tabindex="0"]')!).click();
		const menu = vi.mocked(os.popupMenu).mock.lastCall![0];
		const oldest = menu.find(item => typeof item === 'object' && item != null && 'text' in item && item.text === '最早发布');
		if (typeof oldest !== 'object' || oldest == null || !('action' in oldest) || typeof oldest.action !== 'function') {
			throw new Error('Missing oldest-first menu action');
		}
		oldest.action(new PointerEvent('click'));
		await nextFrame();
		expect(fixture.paginator.order.value).toBe('oldest');
		expect(fixture.paginator.initialDirection).toBe('newer');
		expect(fixture.paginator.reload).toHaveBeenCalledTimes(2);
		await expect.element(view.getByText('最早发布', { exact: true })).toBeVisible();
		if (kind === 'page') {
			await view.getByRole('button', { name: '新建', exact: true }).click();
			expect(fixture.create).toHaveBeenCalledTimes(1);
			await expect.element(view.getByText('收藏', { exact: true })).toBeVisible();
		}
	});

	test.each([
		{ kind: 'page' as const, withTabs: false },
		{ kind: 'page' as const, withTabs: true },
		{ kind: 'card' as const, withTabs: false },
		{ kind: 'card' as const, withTabs: true },
	])('wraps narrow $kind rows without hiding controls (tabs: $withTabs)', async options => {
		await page.viewport(280, 900);
		const fixture = await mountToolbar(options);
		assertActionsVisible(fixture.host, fixture.root);
		expect(fixture.root.getBoundingClientRect().height).toBeGreaterThan(50);
		const view = page.elementLocator(fixture.host);
		await view.getByRole('button', { name: '刷新', exact: true }).click();
		expect(fixture.paginator.reload).toHaveBeenCalledTimes(1);
		await view.getByRole('button', { name: '日期: 2026-09-23', exact: true }).click();
		expect(vi.mocked(os.popup).mock.lastCall?.[1]).toMatchObject({ title: '日期' });
		if (options.withTabs) {
			await view.getByRole('button', { name: '我的', exact: true }).click();
			expect(fixture.tab.value).toBe('mine');
		}
		if (options.kind === 'page') {
			await expect.element(view.getByText('收藏', { exact: true })).toBeVisible();
			await view.getByRole('button', { name: '新建', exact: true }).click();
			expect(fixture.create).toHaveBeenCalledTimes(1);
		}
		await page.viewport(1000, 900);
		await expect.poll(() => fixture.root.getBoundingClientRect().height).toBe(50);
		await nextFrame();
		assertActionsVisible(fixture.host, fixture.root);
	});
});
