/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import WidgetTrends from '@/widgets/WidgetTrends.vue';
import { mergeTrendsWithCache, saveTrendsCache } from '@/utility/trends-cache.js';

const mocks = vi.hoisted(() => {
	vi.stubGlobal('_LANGS_', []);
	vi.stubGlobal('_VERSION_', 'test');
	vi.stubGlobal('_DEV_', true);
	return { api: vi.fn(), navigate: vi.fn(), storage: new Map<string, string>(), now: Date.UTC(2026, 8, 29, 4), setTime: vi.fn<(value: number) => void>() };
});

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApiGet: mocks.api }));
vi.mock('@/widgets/widget.js', () => ({ useWidgetPropsManager: () => ({ widgetProps: { showHeader: true }, configure: vi.fn() }) }));
vi.mock('tinycolor2', () => ({ default: () => ({ toRgbString: () => 'rgb(134, 179, 0)' }) }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: {
	getItem: (key: string) => mocks.storage.get(key) ?? null,
	setItem: (key: string, value: string) => mocks.storage.set(key, value),
	removeItem: (key: string) => mocks.storage.delete(key),
} }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/os.js', () => ({ popup: vi.fn() }));
vi.mock('@/theme.js', () => ({ themeManager: { on: vi.fn(), off: vi.fn(), currentCompiledTheme: { accent: '#86b300' } } }));
vi.mock('@/composables/use-lowres-time.js', () => {
	const time = ref(mocks.now);
	mocks.setTime.mockImplementation(value => { time.value = value; });
	return { useLowresTime: () => time };
});
vi.mock('@/i18n.js', () => ({ i18n: {
	ts: { _widgets: { trends: '趋势' }, _widgetOptions: { showHeader: '显示标题' }, showMore: '显示更多' },
	tsx: { nUsersMentioned: ({ n }: { n: number }) => `${n}人投稿` },
} }));

const sampleStats = [
	{ tag: '功能测试', usersCount: 1, chart: [0, 0, 0, 0, 1] },
	{ tag: '频道', usersCount: 0, chart: [0, 0, 0, 0, 0] },
];
let app: App | undefined;
let host: HTMLElement | undefined;
let originalStyle = '';

async function settle(): Promise<void> {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
}

async function mount(dark = false): Promise<HTMLElement> {
	await page.viewport(dark ? 352 : 1200, 700);
	document.documentElement.style.cssText = `font-size:14px;--MI_THEME-bg:${dark ? '#202327' : '#f2f3f5'};--MI_THEME-panel:${dark ? '#2b2f35' : '#fff'};--MI_THEME-fg:${dark ? '#d4d9e1' : '#555'};--MI_THEME-panelHeaderBg:var(--MI_THEME-panel);--MI_THEME-panelHeaderFg:var(--MI_THEME-fg);--MI_THEME-divider:${dark ? '#ffffff20' : '#00000015'};--MI_THEME-accent:#86b300;--MI_THEME-link:#528bcc;--MI_THEME-focus:#86b300;`;
	host = document.createElement('div');
	host.style.cssText = `width:${dark ? 320 : 328}px;margin:16px;container-type:inline-size;color:var(--MI_THEME-fg);`;
	document.body.append(host);
	app = createApp({ render: () => h(WidgetTrends, { widget: { id: 'trends-browser', data: { showHeader: true } } }) });
	app.component('MkA', defineComponent({
		props: { to: { type: String, required: true } },
		setup: (props, { slots }) => () => h('a', {
			href: props.to,
			onClick: (event: MouseEvent) => {
				event.preventDefault();
				mocks.navigate(props.to);
			},
		}, slots.default?.()),
	}));
	app.component('MkLoading', { render: () => h('span', { role: 'status' }, '加载中') });
	app.mount(host);
	await document.fonts.ready;
	await settle();
	await settle();
	return host;
}

function assertLayout(element: HTMLElement): void {
	const header = element.querySelector('header')!;
	const title = header.firstElementChild!;
	const icon = title.querySelector('.ti-hash')!.getBoundingClientRect();
	const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
	let text: Node | null = null;
	while (walker.nextNode()) {
		if (walker.currentNode.textContent?.trim() === '趋势') text = walker.currentNode;
	}
	expect(text).not.toBeNull();
	const range = document.createRange();
	range.selectNodeContents(text!);
	const textBox = range.getBoundingClientRect();
	const headerBox = header.getBoundingClientRect();
	const center = (headerBox.top + headerBox.bottom) / 2;
	expect(Math.abs((icon.top + icon.bottom) / 2 - center)).toBeLessThanOrEqual(1);
	expect(Math.abs((textBox.top + textBox.bottom) / 2 - center)).toBeLessThanOrEqual(2);
	expect(header.nextElementSibling!.getBoundingClientRect().height).toBe(314);
	expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth + 1);
	const topic = element.querySelector('.tagName');
	if (topic) {
		const headingSize = parseFloat(getComputedStyle(header.querySelector('.heading')!).fontSize);
		expect(headingSize).toBeGreaterThan(parseFloat(getComputedStyle(topic).fontSize));
	}
}

beforeEach(() => {
	originalStyle = document.documentElement.style.cssText;
	vi.clearAllMocks();
	mocks.storage.clear();
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(mocks.now);
	mocks.setTime(mocks.now);
	mocks.api.mockResolvedValue(sampleStats);
});

afterEach(async () => {
	app?.unmount();
	host?.remove();
	app = undefined;
	host = undefined;
	document.documentElement.style.cssText = originalStyle;
	vi.useRealTimers();
	await settle();
});

test.each([false, true])('centers the heading and preserves fixed height and zero-count rows (dark: %s)', async dark => {
	const element = await mount(dark);
	await expect.poll(() => element.querySelectorAll('a[href^="/tags/"]').length).toBe(2);
	assertLayout(element);
	expect(element.textContent).toContain('0人投稿');
	expect(element.querySelectorAll('svg')).toHaveLength(2);
	const row = element.querySelector<HTMLAnchorElement>('a[href^="/tags/"]')!;
	const rowBox = row.getBoundingClientRect();
	for (const target of [row.querySelector('p')!, row.querySelector('svg')!]) {
		const box = target.getBoundingClientRect();
		await page.elementLocator(row).click({ position: { x: box.left - rowBox.left + box.width / 2, y: box.top - rowBox.top + box.height / 2 } });
		expect(mocks.navigate).toHaveBeenLastCalledWith('/tags/' + encodeURIComponent('功能测试'));
	}
	await page.elementLocator(row).click({ position: { x: 8, y: 8 } });
	expect(mocks.navigate).toHaveBeenCalledTimes(3);
	if (!dark) await page.screenshot({ element, path: '../e2e/artifacts/component-browser/trends-fixed-live.png' });
});

test.each([0, 1, 5])('keeps the same body height with %s available topics', async count => {
	mocks.api.mockResolvedValue(Array.from({ length: count }, (_, i) => ({ ...sampleStats[0], tag: `topic-${i}` })));
	const element = await mount();
	await expect.poll(() => element.querySelectorAll('a[href^="/tags/"]').length).toBe(count);
	assertLayout(element);
	expect(element.querySelector('a[href="/explore"]')).toBeNull();
	if (count === 0) await page.screenshot({ element, path: '../e2e/artifacts/component-browser/trends-fixed-empty.png' });
});

test('appends distinct old topics after the current ranking without changing row presentation', async () => {
	const old = ['旧话题A', '频道', '旧话题B', '旧话题C', '旧话题D'].map(tag => ({ ...sampleStats[0], tag }));
	saveTrendsCache(mergeTrendsWithCache(old, null, mocks.now - 3600000));
	const element = await mount(true);
	await expect.poll(() => Array.from(element.querySelectorAll('a[href^="/tags/"]')).map(a => a.querySelector('.tagName')?.textContent)).toEqual(['#功能测试', '#频道', '#旧话题A', '#旧话题B', '#旧话题C']);
	assertLayout(element);
	expect(element.querySelectorAll('svg')).toHaveLength(5);
	expect(element.querySelector('header')!.textContent).toBe('趋势');
	await page.screenshot({ element, path: '../e2e/artifacts/component-browser/trends-fixed-backfill.png' });
});

test('retains old topics when time passes without new trends', async () => {
	saveTrendsCache(mergeTrendsWithCache(sampleStats, null, mocks.now - 365 * 24 * 60 * 60 * 1000));
	mocks.api.mockResolvedValue([]);
	const element = await mount();
	await expect.poll(() => element.querySelectorAll('a[href^="/tags/"]').length).toBe(2);
	mocks.setTime(mocks.now + 1000);
	await settle();
	expect(element.querySelectorAll('a[href^="/tags/"]')).toHaveLength(2);
	assertLayout(element);
});

test('shows a delayed first response immediately before the next clock tick', async () => {
	const response = Promise.withResolvers<typeof sampleStats>();
	mocks.api.mockReturnValue(response.promise);
	const element = await mount();
	expect(element.querySelector('[role="status"]')).not.toBeNull();
	vi.setSystemTime(mocks.now + 1_000);
	response.resolve(sampleStats);
	await expect.poll(() => element.querySelectorAll('a[href^="/tags/"]').length).toBe(2);
	expect(element.querySelector('[role="status"]')).toBeNull();
	assertLayout(element);
	await page.screenshot({ element, path: '../e2e/artifacts/component-browser/trends-delayed-response.png' });
});

test('keeps refreshed topics visible and restores them immediately after remounting', async () => {
	saveTrendsCache(mergeTrendsWithCache(sampleStats, null, mocks.now - 60_000));
	const response = Promise.withResolvers<typeof sampleStats>();
	mocks.api.mockReturnValue(response.promise);
	const element = await mount();
	expect(element.querySelectorAll('a[href^="/tags/"]')).toHaveLength(2);
	vi.setSystemTime(mocks.now + 1_000);
	response.resolve(sampleStats);
	await settle();
	expect(element.querySelectorAll('a[href^="/tags/"]')).toHaveLength(2);
	app!.unmount();
	host!.remove();
	mocks.api.mockReturnValue(new Promise(() => {}));
	const refreshed = await mount(true);
	expect(refreshed.querySelectorAll('a[href^="/tags/"]')).toHaveLength(2);
	expect(refreshed.querySelector('[role="status"]')).toBeNull();
	assertLayout(refreshed);
	await page.screenshot({ element: refreshed, path: '../e2e/artifacts/component-browser/trends-refresh-cached.png' });
});
