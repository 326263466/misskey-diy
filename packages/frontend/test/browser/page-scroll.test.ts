/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, defineComponent, h, KeepAlive, nextTick, ref } from 'vue';
import type { App } from 'vue';
import PageWithHeader from '@/components/global/PageWithHeader.vue';

const mocks = vi.hoisted(() => ({ listeners: new Map<string, Set<() => void>>() }));
vi.mock('@/router.js', () => ({ useRouter: () => ({
	useListener: (event: string, callback: () => void) => {
		const callbacks = mocks.listeners.get(event) ?? new Set();
		callbacks.add(callback);
		mocks.listeners.set(event, callbacks);
	},
}) }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { showPageTabBarBottom: false, enableHorizontalSwipe: false } } }));

const fixtures: { app: App; host: HTMLElement }[] = [];

async function frame() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

async function mount() {
	const host = document.createElement('div');
	document.body.append(host);
	const menu = ref('home');
	const tab = ref('recommended');
	const app = createApp({ render: () => h(KeepAlive, {}, () => h(PageWithHeader, {
		key: menu.value, tab: tab.value, swipable: false,
		style: 'height:400px;overflow-y:auto;',
	}, () => h('div', Array.from({ length: 40 }, (_, index) => h('article', {
		'data-scroll-anchor': `${index}`, style: 'height:80px;',
	}, `${menu.value} ${index}`))))),
	});
	app.component('MkStickyContainer', defineComponent({ setup: (_props, { slots }) => () => h('div', [slots.header?.(), slots.default?.(), slots.footer?.()]) }));
	app.component('MkPageHeader', { render: () => h('header', { style: 'height:40px;' }) });
	app.mount(host);
	fixtures.push({ app, host });
	await frame();
	const root = () => host.querySelector<HTMLElement>('[data-popup-boundary]')!;
	return { menu, tab, root };
}

async function expectStaysAtTop(el: HTMLElement) {
	const positions: number[] = [];
	const until = performance.now() + 180;
	do {
		await frame();
		positions.push(el.scrollTop);
	} while (performance.now() < until);
	expect(positions.every(top => top === 0)).toBe(true);
}

afterEach(() => {
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
	mocks.listeners.clear();
});

test.each([1440, 390])('菜单切换和缓存页重新显示在 %ipx 下从首帧开始停在顶部', async width => {
	await page.viewport(width, 800);
	const { menu, root } = await mount();
	root().scrollTop = 700;
	root().dispatchEvent(new Event('scroll'));
	root().dispatchEvent(new PointerEvent('pointerdown'));
	menu.value = 'timeline';
	await frame();
	root().scrollTop = 300;
	menu.value = 'home';
	await nextTick();
	await expectStaysAtTop(root());
});

test('页内标签和复用页面的菜单切换立即回到顶部', async () => {
	const { tab, root } = await mount();
	root().scrollTop = 500;
	tab.value = 'following';
	await nextTick();
	await expectStaysAtTop(root());
	root().scrollTop = 600;
	for (const callback of mocks.listeners.get('change') ?? []) callback();
	expect(root().scrollTop).toBe(0);
	await expectStaysAtTop(root());
});
