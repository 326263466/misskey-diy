/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.scss';
import WelcomeTimeline from '@/pages/welcome.timeline.vue';
import MkMfm from '@/components/global/MkMfm.js';

const api = vi.hoisted(() => {
	vi.stubGlobal('_LANGS_', []);
	vi.stubGlobal('_VERSION_', 'test');
	vi.stubGlobal('_DEV_', false);
	return { featured: vi.fn(), recent: vi.fn() };
});
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApiGet: api.featured, misskeyApi: api.recent }));
vi.mock('misskey-js', () => ({}));
vi.mock('@@/js/config.js', () => ({ host: 'localhost' }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { dataSaver: { code: false }, advancedMfm: false, animatedMfm: false } } }));
vi.mock('@/i18n.js', () => ({ i18n: {
	ts: {
		code: 'Code', clickToShow: 'Click to show', showLess: 'Collapse', copy: 'Copy', _share: { copied: 'Copied' },
		_cw: { contentShown: 'Content shown', contentHidden: 'Content hidden', showContent: 'Show content', hideContent: 'Hide content' },
	},
	tsx: { _cw: { chars: ({ count }: { count: number }) => `${count} characters` } },
} }));
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: vi.fn() }));
vi.mock('@/components/MkMediaList.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkReactionsViewer.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPoll.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkUrl.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkTime.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkLink.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkMention.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkEmoji.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkCustomEmoji.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));

const fixtures: { app: App; host: HTMLElement }[] = [];
const longCode = 'a_long_unbroken_code_line_'.repeat(20);

afterEach(() => {
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
	vi.restoreAllMocks();
});

async function mountTimeline(width: number, cw = false) {
	api.featured.mockResolvedValue([]);
	api.recent.mockResolvedValue([longCode, 'short'].map((code, index) => ({
		id: String(index), text: `\`\`\`\n${code}\n\`\`\``, cw: cw && index === 0 ? 'Warning' : null, files: [], reactionCount: 0,
		user: { id: 'author', name: 'Author', username: 'author', host: null, isCat: false },
	})));
	const host = document.createElement('div');
	host.style.cssText = `width:${width}px;background:var(--MI_THEME-bg);color:var(--MI_THEME-fg);`;
	host.style.cssText += '--MI_THEME-bg:#f3f4f6;--MI_THEME-panel:#fff;--MI_THEME-fg:#364152;--MI_THEME-codeBlockBg:#282c34;--MI_THEME-codeBlockFg:#abb2bf;--MI_THEME-error:#ec4137;--MI_THEME-warn:#ecb637;--MI_THEME-success:#86b300;';
	document.body.append(host);
	const app = createApp({ render: () => h(WelcomeTimeline, { style: 'height:260px;' }) });
	// 使用真实 MFM、代码块和欢迎页卡片，验证纵向 flex 中的宽度约束。
	// eslint-disable-next-line vue/multi-word-component-names
	app.component('Mfm', MkMfm);
	app.component('MkA', { render: () => null });
	app.mount(host);
	fixtures.push({ app, host });
	await expect.poll(() => host.querySelectorAll('pre').length).toBeGreaterThanOrEqual(2);
	await document.fonts.ready;
	for (const animation of host.getAnimations({ subtree: true })) {
		animation.pause();
		animation.currentTime = 0;
	}
	return host;
}

describe('welcome timeline code blocks', () => {
	test.each([
		{ width: 240, cw: false }, { width: 320, cw: false }, { width: 500, cw: false }, { width: 240, cw: true },
	])('keeps long-code actions inside a $width px column (CW: $cw)', async ({ width, cw }) => {
		const host = await mountTimeline(width, cw);
		if (cw) {
			await page.elementLocator(host.querySelector<HTMLElement>('._panel')!).getByRole('button', { name: 'Show content' }).click();
			await nextTick();
		}
		const pre = host.querySelector('pre')!;
		const block = pre.closest<HTMLElement>('[data-note-interactive]')!;
		const panel = block.closest<HTMLElement>('._panel')!;
		const copy = block.querySelector<HTMLElement>('[aria-label="Copy"]')!;
		const toggle = block.querySelector<HTMLElement>('[aria-label="Collapse"]')!;
		const bounds = host.getBoundingClientRect();
		expect(panel.getBoundingClientRect().left).toBeGreaterThanOrEqual(bounds.left);
		expect(panel.getBoundingClientRect().right).toBeLessThanOrEqual(bounds.right);
		for (const button of [copy, toggle]) {
			const rect = button.getBoundingClientRect();
			expect(rect.right).toBeLessThanOrEqual(bounds.right);
			expect(button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))).toBe(true);
		}
		expect(getComputedStyle(pre).whiteSpace).toBe('pre');
		expect(pre.scrollWidth).toBeGreaterThan(pre.clientWidth);
		const copyLeft = copy.getBoundingClientRect().left;
		pre.scrollLeft = pre.scrollWidth;
		expect(pre.scrollLeft).toBeGreaterThan(0);
		expect(copy.getBoundingClientRect().left).toBe(copyLeft);
		const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
		await page.elementLocator(copy).click();
		expect(writeText).toHaveBeenCalledWith(longCode);
		await expect.element(page.elementLocator(copy)).toHaveAccessibleName('Copied');
		const expandedWidth = panel.getBoundingClientRect().width;
		const expandedHeight = panel.getBoundingClientRect().height;
		await page.elementLocator(toggle).click();
		await nextTick();
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(panel.getBoundingClientRect().width).toBeCloseTo(expandedWidth, 1);
		expect(panel.getBoundingClientRect().height).toBeLessThan(expandedHeight);
		if (width === 500) {
			host.style.width = '320px';
			expect(panel.getBoundingClientRect().width).toBeCloseTo(320, 1);
			host.style.width = '500px';
			expect(panel.getBoundingClientRect().width).toBeCloseTo(expandedWidth, 1);
			await page.screenshot({ element: host, path: '../e2e/artifacts/component-browser/welcome-code-collapsed.png' });
		}
		await page.elementLocator(toggle).click();
		await nextTick();
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		if (width === 500) {
			const shortPanel = host.querySelectorAll<HTMLElement>('._panel')[1];
			const shortWidth = shortPanel.getBoundingClientRect().width;
			expect(shortWidth).toBeLessThan(width);
			expect(shortPanel.getBoundingClientRect().right).toBeCloseTo(bounds.right, 0);
			const shortToggle = shortPanel.querySelector<HTMLElement>('[aria-expanded]')!;
			for (let index = 0; index < 4; index++) {
				await page.elementLocator(shortToggle).click();
				await nextTick();
				expect(shortPanel.getBoundingClientRect().width).toBeCloseTo(shortWidth, 1);
			}
			await page.screenshot({ element: host, path: '../e2e/artifacts/component-browser/welcome-code-actions.png' });
		}
	});
});
