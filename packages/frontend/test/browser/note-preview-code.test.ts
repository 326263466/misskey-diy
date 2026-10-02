/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { compile } from '@@/js/theme.js';
import lightBase from '@@/themes/_light.json5';
import lightTheme from '@@/themes/l-light.json5';
import type { App } from 'vue';
import type * as Misskey from 'misskey-js';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.scss';
import MkNotePreview from '@/components/MkNotePreview.vue';
import MkMfm from '@/components/global/MkMfm.js';

vi.mock('misskey-js', () => ({}));
vi.mock('@@/js/config.js', () => ({ host: 'localhost' }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { dataSaver: { code: false }, advancedMfm: false, animatedMfm: false } } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { code: 'Code', clickToShow: 'Click to show', showLess: 'Collapse', hashtags: 'Topics', copy: 'Copy', _share: { copied: 'Copied' } } } }));
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: vi.fn() }));
vi.mock('@/components/MkUserWork.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkCwButton.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkUrl.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkTime.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkLink.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkMention.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkEmoji.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkCustomEmoji.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));

const fixtures: { app: App; host: HTMLElement }[] = [];
const theme = compile({ ...lightBase, ...lightTheme, props: { ...lightBase.props, ...lightTheme.props } });

afterEach(() => {
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
});

async function mountPreview(code: string, width = 400) {
	const host = document.createElement('div');
	host.style.cssText = `width:${width}px;box-sizing:border-box;padding:20px;background:var(--MI_THEME-panel);color:var(--MI_THEME-fg);container-type:inline-size;`;
	for (const [key, value] of Object.entries(theme)) host.style.setProperty(`--MI_THEME-${key}`, value);
	document.body.append(host);
	const user = { id: 'author', name: 'Author', username: 'author', host: null, isCat: false } as Misskey.entities.User;
	const app = createApp({ render: () => h(MkNotePreview, {
		text: `\`\`\`\n${code}\n\`\`\``, files: [], useCw: false, cw: null, user,
	}) });
	app.component('MkAvatar', { render: () => h('div', { style: 'background:var(--MI_THEME-accentedBg);' }) });
	app.component('MkUserName', { render: () => h('span', 'Author') });
	// Match the application's global MFM registration while exercising its real renderer.
	// eslint-disable-next-line vue/multi-word-component-names
	app.component('Mfm', MkMfm);
	app.mount(host);
	fixtures.push({ app, host });
	await nextTick();
	await document.fonts.ready;
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	return host;
}

describe('note preview code blocks', () => {
	test('renders an unlabelled fenced block with a separate copy toolbar', async () => {
		const host = await mountPreview('dasdasdasdsad');
		const pre = host.querySelector('pre')!;
		const root = pre.closest<HTMLElement>('[data-note-interactive]')!;
		const button = root.querySelector('[aria-label="Copy"]')!;
		const style = getComputedStyle(pre);
		expect(pre.textContent).toBe('dasdasdasdsad');
		expect(style.whiteSpace).toBe('pre');
		expect(getComputedStyle(root).borderTopWidth).toBe('1px');
		expect(getComputedStyle(root).backgroundColor).toBe(theme.codeBlockBg);
		expect(style.paddingTop).toBe(style.paddingBottom);
		expect(pre.getBoundingClientRect().top).toBeGreaterThan(root.getBoundingClientRect().top);
		expect(button.getBoundingClientRect().bottom).toBeLessThanOrEqual(pre.getBoundingClientRect().top);
		await page.screenshot({ element: host, path: '../e2e/artifacts/component-browser/note-preview-code-plain.png' });
	});

	test('preserves newlines, blank lines, and indentation in the preview', async () => {
		const code = 'first line\n  indented line\n\n\tlast line';
		const host = await mountPreview(code);
		const pre = host.querySelector('pre')!;
		const style = getComputedStyle(pre);
		const expectedHeight = 4 * parseFloat(style.lineHeight);
		expect(pre.textContent).toBe(code);
		expect(pre.getBoundingClientRect().height).toBeCloseTo(expectedHeight, 0);
		pre.scrollTop = pre.scrollHeight;
		expect(pre.scrollTop).toBe(0);
		await page.screenshot({ element: host, path: '../e2e/artifacts/component-browser/note-preview-code-multiline.png' });
	});

	test('scrolls long lines without wrapping in narrow previews', async () => {
		const code = 'a_long_unbroken_code_line_'.repeat(8);
		const host = await mountPreview(code, 280);
		const pre = host.querySelector('pre')!;
		expect(pre.scrollWidth).toBeGreaterThan(pre.clientWidth);
		expect(getComputedStyle(pre).scrollbarWidth).toBe('none');
		pre.scrollLeft = pre.scrollWidth;
		expect(pre.scrollLeft).toBeGreaterThan(0);
		await page.screenshot({ element: host, path: '../e2e/artifacts/component-browser/note-preview-code-narrow-scrolled.png' });
		const bounds = pre.getBoundingClientRect();
		expect(pre.textContent).toBe(code);
		expect(host.scrollWidth).toBe(host.clientWidth);
		expect(bounds.right).toBeLessThanOrEqual(host.getBoundingClientRect().right);
	});
});
