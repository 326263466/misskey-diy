/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App } from 'vue';
import type * as Misskey from 'misskey-js';
import '@/style.scss';
import MkNoteHeader from '@/components/MkNoteHeader.vue';

vi.mock('@/filters/user.js', () => ({ userPage: () => '/@admin' }));
vi.mock('@/filters/note.js', () => ({ notePage: () => '/notes/note' }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { author: '作者', _profile: { company: '公司', jobTitle: '职位' } } } }));

let app: App | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
	app?.unmount();
	host?.remove();
});

test.each([
	{ width: 580, dark: false },
	{ width: 300, dark: true },
])('professional note metadata occupies one secondary row at $width (dark: $dark)', async ({ width, dark }) => {
	await page.viewport(width + 40, 720);
	host = document.createElement('div');
	host.style.cssText = `width:${width}px;margin:20px auto;font:16px/1.5 sans-serif;--MI_THEME-fg:${dark ? '#e2e6e9' : '#444'};--MI_THEME-panel:${dark ? '#282f32' : '#fff'};--MI_THEME-fgTransparentWeak:${dark ? '#9aa8ac' : '#87919b'};color:var(--MI_THEME-fg);`;
	document.body.append(host);
	const fields = [
		{},
		{ company: '示例科技' },
		{ jobTitle: '产品设计师' },
		{ company: '示例科技', jobTitle: '产品设计师' },
		{ company: '这是一家名字很长的科技与产品设计公司', jobTitle: '用户体验与产品设计负责人' },
	];
	app = createApp({
		render: () => h('div', { style: 'display:grid;grid-template-columns:minmax(0,1fr);gap:12px;' }, fields.map(work => h('article', {
			style: 'padding:16px;background:var(--MI_THEME-panel);border-radius:12px;',
		}, [
			h('div', { style: 'display:flex;gap:12px;align-items:flex-start' }, [
				h('div', { style: 'flex:none;width:40px;height:40px;border-radius:50%;background:#87919b;color:white;display:grid;place-items:center;' }, 'A'),
				h('div', { style: 'flex:1;min-width:0;' }, [
					h(MkNoteHeader, { note: {
						id: 'note', visibility: 'public', createdAt: new Date().toISOString(),
						user: { id: 'admin', name: 'admin', username: 'admin', host: null, ...work },
					} as Misskey.entities.Note }),
					h('p', { style: 'margin:3px 0 0' }, '测试图片、音乐、视频'),
				]),
			]),
		]))),
	});
	app.component('MkA', defineComponent({ setup: (_props, { slots }) => () => h('a', slots.default?.()) }));
	app.component('MkUserName', { render: () => h('span', 'admin') });
	app.component('MkAcct', { render: () => h('span', '@admin') });
	app.component('MkTime', { render: () => h('time', '3分钟前') });
	app.directive('user-preview', () => {});
	app.directive('tooltip', () => {});
	app.mount(host);
	await nextTick();
	await document.fonts.ready;
	const headers = Array.from(host.querySelectorAll('header'));
	const baseHeight = headers[0].getBoundingClientRect().height;
	expect(headers[0].lastElementChild!.textContent).toBe('3分钟前');
	for (const header of headers) {
		expect(header.children).toHaveLength(2);
		const primary = header.firstElementChild!.getBoundingClientRect();
		const secondary = header.lastElementChild as HTMLElement;
		const bounds = secondary.getBoundingClientRect();
		expect(bounds.top).toBeGreaterThanOrEqual(primary.bottom);
		expect(bounds.height).toBeLessThan(21);
		expect(Math.abs(bounds.left - primary.left)).toBeLessThan(1);
		expect(Math.abs(header.getBoundingClientRect().height - baseHeight)).toBeLessThan(1);
		expect(secondary.scrollWidth).toBe(secondary.clientWidth);
		const time = secondary.querySelector('time')!;
		expect(time.getBoundingClientRect().right).toBeLessThanOrEqual(bounds.right + 1);
		expect(time.parentElement!.scrollWidth).toBe(time.parentElement!.clientWidth);
		for (const value of secondary.querySelectorAll<HTMLElement>('[title]')) {
			expect(value.getBoundingClientRect().width).toBeGreaterThan(0);
			expect(getComputedStyle(value).textOverflow).toBe('ellipsis');
		}
	}
	expect(host.scrollWidth).toBe(host.clientWidth);
	await page.screenshot({ element: host, path: `../e2e/artifacts/component-browser/user-work-${width}.png` });
});
