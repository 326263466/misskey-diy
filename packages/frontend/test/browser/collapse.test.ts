/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import MkContainer from '@/components/MkContainer.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkFolder from '@/components/MkFolder.vue';
import PageEditorContainer from '@/pages/page-editor/page-editor.container.vue';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import { prefer } from '@/preferences.js';

vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: true } } }));
vi.mock('@/os.js', () => ({ pageFolderTeleportCount: { value: 0 }, popup: vi.fn() }));
vi.mock('@/theme.js', () => ({ themeManager: { currentCompiledTheme: { panel: 'transparent' }, on: vi.fn(), off: vi.fn() } }));
vi.mock('@/utility/get-bg-color.js', () => ({ getBgColor: () => null }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/components/MkFolderPage.vue', () => ({ default: {} }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItem: () => null, setItem: vi.fn() } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { showMore: 'Show more' } } }));

type CollapseKind = 'folder' | 'container' | 'section' | 'page-editor';

const kinds = ['folder', 'container', 'section', 'page-editor'] as const;
const fixtures: { app: App; host: HTMLElement }[] = [];

async function nextFrame() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

function wait(milliseconds: number) {
	return new Promise<void>(resolve => window.setTimeout(resolve, milliseconds));
}

async function mountCollapse(kind: CollapseKind, { expanded = false, height = 240, maxHeight, scrollable = false }: {
	expanded?: boolean;
	height?: number;
	maxHeight?: number;
	scrollable?: boolean;
} = {}) {
	const host = document.createElement('div');
	host.style.cssText = 'width:600px;margin:20px;';
	document.body.append(host);
	const contentHeight = ref(height);
	const content = () => h('div', { 'data-testid': 'collapse-content', style: { height: `${contentHeight.value}px` } }, 'Loaded content');
	const label = () => 'Details';
	const app = createApp({
		render: () => {
			if (kind === 'folder') {
				return h(MkFolder, { defaultOpen: expanded, withSpacer: false, maxHeight }, { label, default: content });
			}
			if (kind === 'container') {
				return h(MkContainer, { expanded, foldable: true, maxHeight, scrollable, style: scrollable ? 'height:200px' : undefined }, { header: label, default: content });
			}
			if (kind === 'page-editor') {
				return h(PageEditorContainer, { expanded, removable: false, style: 'border:0' }, { header: label, default: content });
			}
			return h(MkFoldableSection, { expanded }, { header: label, default: content });
		},
	});
	app.component('MkStickyContainer', MkStickyContainer);
	app.component('MkCondensedLine', defineComponent({ setup: (_, { slots }) => () => h('span', slots.default?.()) }));
	app.mount(host);
	fixtures.push({ app, host });
	await nextFrame();
	const root = host.firstElementChild as HTMLElement;
	const toggle = root.querySelector<HTMLButtonElement>('button')!;
	const header = kind === 'folder' ? toggle : root.querySelector<HTMLElement>('header')!;
	return {
		host, root, toggle, contentHeight,
		bodyHeight: () => root.getBoundingClientRect().height - header.getBoundingClientRect().height,
		content: () => host.querySelector<HTMLElement>('[data-testid="collapse-content"]'),
	};
}

beforeEach(() => {
	prefer.s.animation = true;
});

afterEach(() => {
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
});

describe.each(kinds)('%s expansion in a real browser', kind => {
	test('keeps the content width and position fixed while revealing it vertically', async () => {
		const fixture = await mountCollapse(kind, { expanded: true });
		const content = fixture.content()!;
		const full = content.getBoundingClientRect();
		for (const expanding of [false, true]) {
			fixture.toggle.click();
			await wait(100);
			const bounds = content.getBoundingClientRect();
			expect(fixture.bodyHeight()).toBeGreaterThan(0);
			expect(fixture.bodyHeight()).toBeLessThan(240);
			expect(bounds.left).toBe(full.left);
			expect(bounds.right).toBe(full.right);
			expect(bounds.top).toBe(full.top);
			expect(getComputedStyle(content).transform).toBe('none');
			await expect.poll(fixture.bodyHeight).toBeCloseTo(expanding ? 240 : 0, 1);
		}
	});

	test('follows content that grows during its first opening and preserves it for reopening', async () => {
		const fixture = await mountCollapse(kind, { height: 40 });
		if (kind === 'folder') expect(fixture.content()).toBeNull();
		fixture.toggle.click();
		await wait(100);
		const content = fixture.content();
		expect(content).not.toBeNull();
		fixture.contentHeight.value = 240;
		await wait(120);
		expect(fixture.bodyHeight()).toBeGreaterThan(80);
		expect(fixture.bodyHeight()).toBeLessThanOrEqual(240.1);
		await expect.poll(fixture.bodyHeight).toBeCloseTo(240, 1);
		fixture.toggle.click();
		await expect.poll(fixture.bodyHeight).toBe(0);
		expect(fixture.content()).toBe(content);
		fixture.toggle.click();
		await wait(120);
		expect(fixture.bodyHeight()).toBeGreaterThan(0);
		expect(fixture.bodyHeight()).toBeLessThan(240);
		await expect.poll(fixture.bodyHeight).toBeCloseTo(240, 1);
	});

	test('returns toward the full height when a closing animation is reversed', async () => {
		const fixture = await mountCollapse(kind, { expanded: true });
		expect(fixture.bodyHeight()).toBeCloseTo(240, 1);
		fixture.toggle.click();
		await wait(100);
		const interruptedHeight = fixture.bodyHeight();
		expect(interruptedHeight).toBeGreaterThan(10);
		expect(interruptedHeight).toBeLessThan(230);
		fixture.toggle.click();
		await wait(120);
		expect(fixture.bodyHeight()).toBeGreaterThan(interruptedHeight + 10);
		expect(fixture.bodyHeight()).toBeLessThanOrEqual(240.1);
		await expect.poll(fixture.bodyHeight).toBeCloseTo(240, 1);
	});

	test('opens and closes without a height transition when animations are disabled', async () => {
		prefer.s.animation = false;
		const fixture = await mountCollapse(kind);
		fixture.toggle.click();
		await nextFrame();
		await nextFrame();
		expect(fixture.bodyHeight()).toBeCloseTo(240, 1);
		fixture.toggle.click();
		await nextFrame();
		await nextFrame();
		// Vue completes zero-duration leaves on subsequent animation frames.
		await expect.poll(fixture.bodyHeight, { timeout: 150, interval: 5 }).toBe(0);
	});
});

test('reopens all container content after Show more has removed the height limit', async () => {
	const fixture = await mountCollapse('container', { expanded: true, height: 440, maxHeight: 120 });
	await expect.poll(fixture.bodyHeight).toBeCloseTo(120, 1);
	const showMore = Array.from(fixture.root.querySelectorAll('button')).find(button => button.textContent?.includes('Show more'))!;
	showMore.click();
	await expect.poll(fixture.bodyHeight).toBeCloseTo(440, 1);
	fixture.toggle.click();
	await expect.poll(fixture.bodyHeight).toBe(0);
	fixture.toggle.click();
	await wait(170);
	expect(fixture.bodyHeight()).toBeGreaterThan(150);
	await expect.poll(fixture.bodyHeight).toBeCloseTo(440, 1);
});

test('keeps long content scrollable inside a container with a fixed height', async () => {
	const fixture = await mountCollapse('container', { expanded: true, height: 440, scrollable: true });
	const scrollArea = Array.from(fixture.root.querySelectorAll<HTMLElement>('div')).find(element => getComputedStyle(element).overflowY === 'auto')!;
	expect(scrollArea).toBeDefined();
	expect(scrollArea.scrollHeight).toBeGreaterThan(scrollArea.clientHeight);
	scrollArea.scrollTop = 100;
	expect(scrollArea.scrollTop).toBe(100);
});

test('keeps a height-limited folder scrollable after reopening', async () => {
	const fixture = await mountCollapse('folder', { expanded: true, height: 440, maxHeight: 120 });
	expect(fixture.bodyHeight()).toBeCloseTo(120, 1);
	fixture.toggle.click();
	await expect.poll(fixture.bodyHeight).toBe(0);
	fixture.toggle.click();
	await expect.poll(fixture.bodyHeight).toBeCloseTo(120, 1);
	const scrollArea = Array.from(fixture.root.querySelectorAll<HTMLElement>('div')).find(element => getComputedStyle(element).overflowY === 'auto')!;
	await expect.poll(() => scrollArea.scrollHeight).toBe(440);
	scrollArea.scrollTop = 100;
	expect(scrollArea.scrollTop).toBe(100);
});
