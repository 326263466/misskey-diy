/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App } from 'vue';
import type * as Misskey from 'misskey-js';
import '@/style.scss';
import MkNoteHeader from '@/components/MkNoteHeader.vue';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import PageWithHeader from '@/components/global/PageWithHeader.vue';

vi.mock('@/preferences.js', () => ({ prefer: { s: {} } }));
vi.mock('@/filters/user.js', () => ({ userPage: () => '/@author' }));
vi.mock('@/filters/note.js', () => ({ notePage: () => '/notes/note' }));
vi.mock('@/components/MkSwiper.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ setup: (_props, { slots }) => () => h('div', slots.default?.()) }) };
});
vi.mock('@/router.js', () => ({ useRouter: () => ({ useListener: () => {} }) }));
vi.mock('@/composables/use-scroll-position-keeper.js', () => ({ useScrollPositionKeeper: () => {} }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { close: 'Close', done: 'Done', author: 'Author', _profile: { company: 'Company', jobTitle: 'Job title' } } } }));

const fixtures: { app: App; host: HTMLElement }[] = [];

function mount(render: () => ReturnType<typeof h>, style = '') {
	const host = document.createElement('div');
	host.style.cssText = `--MI-cardRadius:16px;--MI_THEME-panel:white;--MI_THEME-bg:#eee;--MI_THEME-windowHeader:white;--MI_THEME-divider:#aaa;${style}`;
	document.body.append(host);
	const app = createApp({ render });
	app.component('MkStickyContainer', MkStickyContainer);
	app.component('MkPageHeader', { render: () => h('header', { style: 'height:50px;background:white;border-radius:16px' }, 'Header') });
	app.component('MkA', defineComponent({ setup: (_props, { slots }) => () => h('a', slots.default?.()) }));
	app.component('MkUserName', { render: () => h('span', 'Author name') });
	app.component('MkAcct', { render: () => h('span', 'author') });
	app.component('MkTime', { render: () => h('span', '10 minutes ago') });
	app.directive('user-preview', () => {});
	app.directive('tooltip', () => {});
	app.mount(host);
	fixtures.push({ app, host });
	return host;
}

async function settle() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

afterEach(() => {
	for (const { app, host } of fixtures.splice(0)) { app.unmount(); host.remove(); }
});

test.each([
	{ work: { jobTitle: 'Engineer' }, badges: false },
	{ work: { company: 'Example' }, badges: true },
])('work and time have equally spaced separators (work: $work, badges: $badges)', async ({ work, badges }) => {
	const note = { id: 'note', visibility: 'public', createdAt: new Date().toISOString(), user: {
		id: 'author', name: 'Author name', username: 'author', host: null, isBot: badges, ...work,
	} } as Misskey.entities.Note;
	const host = mount(() => h(MkNoteHeader, { note, showAuthorBadge: badges }));
	await settle();
	expect(host.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(1);
	const separator = host.querySelector<HTMLElement>('span[aria-hidden="true"]')!;
	const previous = separator.previousElementSibling!.getBoundingClientRect();
	const current = separator.getBoundingClientRect();
	const following = separator.nextElementSibling!.getBoundingClientRect();
	expect(current.width).toBeGreaterThan(0);
	expect(current.left - previous.right).toBeCloseTo(following.left - current.right, 1);
	expect(current.left - previous.right).toBeGreaterThan(0);
});

test.each([false, true])('without work, the second row contains only time and no separator (badges: %s)', async badges => {
	const note = { id: 'note', visibility: 'public', createdAt: new Date().toISOString(), user: {
		id: 'author', name: 'Author name', username: 'author', host: null, isBot: badges,
	} } as Misskey.entities.Note;
	const host = mount(() => h(MkNoteHeader, { note, showAuthorBadge: badges }));
	await settle();
	const header = host.querySelector('header')!;
	expect(header.children).toHaveLength(2);
	expect(header.lastElementChild!.textContent).toBe('10 minutes ago');
	expect(header.lastElementChild!.children).toHaveLength(1);
	expect(host.querySelector('span[aria-hidden="true"]')).toBeNull();
});

test('scrolling notes cannot fill the rounded corners of the page header', async () => {
	const host = mount(() => h(PageWithHeader, {}, { default: () => h('article', { style: 'height:1600px;background:red' }, 'Note') }), 'height:360px;width:340px;margin:24px;');
	await settle();
	const scrollport = host.firstElementChild as HTMLElement;
	const bounds = scrollport.getBoundingClientRect();
	for (const top of [0, 260, 0]) {
		scrollport.scrollTop = top;
		await settle();
		expect(getComputedStyle(scrollport).borderTopLeftRadius).toBe('16px');
		const corner = document.elementFromPoint(bounds.left + 1, bounds.top + 1);
		expect(corner === scrollport || (corner != null && scrollport.contains(corner))).toBe(false);
		const center = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + 5);
		expect(scrollport.contains(center)).toBe(true);
	}
});
