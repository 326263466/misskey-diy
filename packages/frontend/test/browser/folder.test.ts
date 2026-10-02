/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, vShow, withDirectives } from 'vue';
import type { App } from 'vue';
import MkFolder from '@/components/MkFolder.vue';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import MkCondensedLine from '@/components/global/MkCondensedLine.vue';
import MkTl from '@/components/MkTl.vue';
import MkTabs from '@/components/MkTabs.vue';

vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: true } } }));
vi.mock('@/os.js', () => ({ pageFolderTeleportCount: { value: 0 }, popup: vi.fn() }));
vi.mock('@/theme.js', () => ({ themeManager: { on: vi.fn(), off: vi.fn(), currentCompiledTheme: { panel: 'transparent' } } }));
vi.mock('@/utility/get-bg-color.js', () => ({ getBgColor: () => null }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/components/MkFolderPage.vue', () => ({ default: {} }));
vi.mock('@/utility/id.js', () => ({ genId: () => 'folder-test-tabs' }));

const fixtures: { app: App; host: HTMLElement }[] = [];

async function nextFrame() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

async function mountFolder({ withHeaderAndFooter = true } = {}) {
	const host = document.createElement('div');
	host.style.cssText = 'width:600px;margin:40px;';
	document.body.append(host);
	const app = createApp({
		render: () => h(MkFolder, { defaultOpen: true, withSpacer: false }, {
			label: () => 'Jobs',
			...(withHeaderAndFooter ? {
				header: () => h('div', { 'data-testid': 'tabs', style: 'height:40px' }, 'All / Latest / Completed'),
				footer: () => h('div', { style: 'height:30px;' }, 'Refresh'),
			} : {}),
			default: () => h('div', { 'data-testid': 'content', style: 'height:100px;margin:20px 0;' }, 'Search'),
		}),
	});
	app.component('MkStickyContainer', MkStickyContainer);
	app.component('MkCondensedLine', defineComponent({ render() { return h('div', this.$slots.default?.()); } }));
	app.mount(host);
	fixtures.push({ app, host });
	await nextFrame();
	await nextFrame();
	const button = host.querySelector<HTMLButtonElement>('[data-testid="folder-header"]')!;
	const tabs = host.querySelector<HTMLElement>('[data-testid="tabs"]')!;
	const content = host.querySelector<HTMLElement>('[data-testid="content"]')!;
	return { host, button, tabs, content };
}

async function mountJobList(rowCount: number, defaultOpen = true) {
	const host = document.createElement('div');
	host.style.cssText = 'width:800px;height:500px;overflow-y:scroll;overflow-x:hidden;';
	document.body.append(host);
	const app = createApp({
		render: () => h(MkStickyContainer, {}, {
			header: () => h('div', { style: 'height:60px' }, 'Queue'),
			default: () => [
				h('div', { style: 'height:240px' }, 'Overview'),
				h(MkFolder, { defaultOpen, withSpacer: false }, {
					label: () => 'Jobs',
					header: () => h(MkTabs, { 'data-testid': 'tabs', tab: 'all', tabs: [{ key: 'all', title: 'All' }, { key: 'latest', title: 'Latest' }] }),
					default: () => h('div', { style: 'padding:22px' }, [
						h('div', { 'data-testid': 'search', style: 'height:40px;margin-bottom:16px' }, 'Search'),
						h(MkTl, { events: Array.from({ length: rowCount }, (_, i) => ({ id: String(i), timestamp: i * 10000, data: i })) }, {
							right: ({ event }: { event: number }) => h(MkFolder, { style: 'margin:4px 0;', 'data-row': event }, {
								label: () => 'Repeat checkExpiredMutings',
								suffix: () => '5 minutes ago',
								default: () => h('div', { style: 'height:200px' }, 'Job details'),
							}),
						}),
					]),
					footer: () => h('div', { 'data-testid': 'footer', style: 'height:40px' }, 'Refresh'),
				}),
			],
		}),
	});
	app.component('MkStickyContainer', MkStickyContainer);
	app.component('MkCondensedLine', MkCondensedLine);
	app.directive('tooltip', {});
	app.mount(host);
	fixtures.push({ app, host });
	await nextFrame();
	await nextFrame();
	return { host, button: host.querySelector<HTMLButtonElement>('[data-testid="folder-header"]')! };
}

afterEach(() => {
	vi.restoreAllMocks();
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
});

describe('folder transitions in a real browser', () => {
	test('opens a long job list for the first time without shifting its rows', async () => {
		const { host, button } = await mountJobList(100, false);
		expect(host.querySelector('[data-row]')).toBeNull();
		button.click();
		await nextFrame();
		await nextFrame();
		const row = host.querySelector('[data-row]')!;
		const rowTop = row.getBoundingClientRect().top;
		const startedAt = performance.now();
		do {
			await nextFrame();
			expect(row.getBoundingClientRect().top).toBeCloseTo(rowTop, 1);
		} while (performance.now() - startedAt < 400);
		expect(host.querySelectorAll('[data-row]')).toHaveLength(100);
	});

	test('preserves pinned tab offsets when reopening a scrolled job list', async () => {
		const { host, button } = await mountJobList(100);
		host.scrollTop = 270;
		await nextFrame();
		const tabs = host.querySelector('[data-testid="tabs"]')!;
		const tabsOffset = () => tabs.getBoundingClientRect().top - button.getBoundingClientRect().bottom;
		const expectedOffset = tabsOffset();
		expect(button.getBoundingClientRect().top - host.getBoundingClientRect().top).toBe(60);
		button.click();
		await expect.poll(() => host.querySelector('[aria-hidden="true"]')?.getBoundingClientRect().height).toBe(0);
		button.click();
		await nextFrame();
		const startedAt = performance.now();
		do {
			await nextFrame();
			expect(tabsOffset()).toBeCloseTo(expectedOffset, 1);
		} while (performance.now() - startedAt < 400);
	});

	test('keeps a long nested job list stable when reopened', async () => {
		const { host, button } = await mountJobList(100);
		const stickyBodies = Array.from(host.querySelectorAll('[data-row] [data-sticky-container-header-height]'));
		const headerHeights = () => stickyBodies.map(body => body.getAttribute('data-sticky-container-header-height'));
		const visibleHeaderHeights = headerHeights();
		const rowTop = host.querySelector('[data-row]')!.getBoundingClientRect().top;
		const searchTop = host.querySelector('[data-testid="search"]')!.getBoundingClientRect().top;
		button.click();
		await expect.poll(() => host.querySelector('[aria-hidden="true"]')?.getBoundingClientRect().height).toBe(0);
		await new Promise(resolve => setTimeout(resolve, 200));
		expect(headerHeights()).toEqual(visibleHeaderHeights);
		button.click();
		await nextFrame();
		const startedAt = performance.now();
		do {
			await nextFrame();
			expect(host.querySelector('[data-row]')!.getBoundingClientRect().top).toBeCloseTo(rowTop, 1);
			expect(host.querySelector('[data-testid="search"]')!.getBoundingClientRect().top).toBeCloseTo(searchTop, 1);
			expect(headerHeights()).toEqual(visibleHeaderHeights);
		} while (performance.now() - startedAt < 500);
	});
	test('keeps the tabs and content in place throughout expansion', async () => {
		const { host, button, tabs, content } = await mountFolder();
		const expandedHeight = host.getBoundingClientRect().height;
		const tabsOffset = () => tabs.getBoundingClientRect().top - button.getBoundingClientRect().bottom;
		const contentOffset = () => content.getBoundingClientRect().top - button.getBoundingClientRect().bottom;
		const expectedTabsOffset = tabsOffset();
		const expectedContentOffset = contentOffset();
		button.click();
		await expect.poll(() => host.querySelector('[aria-hidden="true"]')?.getBoundingClientRect().height).toBe(0);
		button.click();
		await nextFrame();
		const samples: { tabs: number; content: number }[] = [];
		const startedAt = performance.now();
		do {
			await nextFrame();
			samples.push({ tabs: tabsOffset(), content: contentOffset() });
		} while (performance.now() - startedAt < 400);
		expect(samples.length).toBeGreaterThan(2);
		for (const sample of samples) {
			expect(sample.tabs).toBeCloseTo(expectedTabsOffset, 1);
			expect(sample.content).toBeCloseTo(expectedContentOffset, 1);
		}
		expect(host.getBoundingClientRect().height).toBeCloseTo(expandedHeight, 1);
	});

	test.each([false, true])('contains content margins during expansion (JS height fallback: %s)', async (fallback) => {
		if (fallback) {
			const supports = CSS.supports.bind(CSS);
			vi.spyOn(CSS, 'supports').mockImplementation((property: string, value?: string) => {
				if (property === 'interpolate-size') return false;
				return value === undefined ? supports(property) : supports(property, value);
			});
		}
		const { host, button, content } = await mountFolder({ withHeaderAndFooter: false });
		const contentOffset = () => content.getBoundingClientRect().top - button.getBoundingClientRect().bottom;
		const bodyHeight = () => host.getBoundingClientRect().height - button.getBoundingClientRect().height;
		expect(contentOffset()).toBe(20);
		expect(bodyHeight()).toBe(140);
		button.click();
		await expect.poll(bodyHeight).toBe(0);
		button.click();
		await nextFrame();
		const startedAt = performance.now();
		do {
			await nextFrame();
			expect(contentOffset()).toBe(20);
			expect(bodyHeight()).toBeLessThanOrEqual(140);
		} while (performance.now() - startedAt < 400);
		expect(bodyHeight()).toBe(140);
	});
});

test('updates nested sticky offsets after resizing, hiding and removing headers and footers', async () => {
	const host = document.createElement('div');
	document.body.append(host);
	const visible = ref(true);
	const parentHeader = ref(40);
	const parentFooter = ref(20);
	const childHeader = ref(30);
	const childFooter = ref(10);
	const app = createApp({
		render: () => h(MkStickyContainer, {}, {
			header: () => h('div', { style: { height: `${parentHeader.value}px` } }),
			footer: () => h('div', { style: { height: `${parentFooter.value}px` } }),
			default: () => withDirectives(h(MkStickyContainer, { 'data-testid': 'nested' }, {
				header: () => childHeader.value ? h('div', { style: { height: `${childHeader.value}px` } }) : null,
				footer: () => childFooter.value ? h('div', { style: { height: `${childFooter.value}px` } }) : null,
				default: () => h('div', { 'data-testid': 'offsets', style: 'height:100px' }),
			}), [[vShow, visible.value]]),
		}),
	});
	app.mount(host);
	fixtures.push({ app, host });
	const marker = host.querySelector<HTMLElement>('[data-testid="offsets"]')!;
	const offsets = () => {
		const style = getComputedStyle(marker);
		return [style.getPropertyValue('--MI-stickyTop').trim(), style.getPropertyValue('--MI-stickyBottom').trim()];
	};
	await expect.poll(offsets).toEqual(['70px', '30px']);
	visible.value = false;
	await nextFrame();
	await nextFrame();
	parentHeader.value = 60;
	parentFooter.value = 40;
	await expect.poll(offsets).toEqual(['90px', '50px']);
	childHeader.value = 50;
	childFooter.value = 20;
	visible.value = true;
	await expect.poll(offsets).toEqual(['110px', '60px']);
	childHeader.value = 0;
	childFooter.value = 0;
	await expect.poll(offsets).toEqual(['60px', '40px']);
});
