/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import MkCode from '@/components/MkCode.vue';
import { shouldOpenNote } from '@/utility/note-card-click.js';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.scss';

const mocks = vi.hoisted(() => ({
	ready: Promise.resolve(),
	codeToHtml: vi.fn(),
	copy: vi.fn(),
	openNote: vi.fn(),
}));

vi.mock('@/utility/code-highlighter.js', () => ({
	getHighlighter: async () => {
		await mocks.ready;
		return { codeToHtml: mocks.codeToHtml };
	},
	getTheme: async (mode: string) => mode,
	loadCodeLanguage: async (language: string) => {
		await mocks.ready;
		return language;
	},
}));
vi.mock('@/store.js', () => ({ store: { r: { darkMode: ref(false) } } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { code: 'Code', clickToShow: 'Click to show', showLess: 'Collapse', copy: 'Copy', _share: { copied: 'Copied' }, retry: 'Retry', error: 'Error' } } }));

const fixtures: { app: App; host: HTMLElement }[] = [];
const code = JSON.stringify({
	os: 'Windows 11 or later',
	browser: 'Google Chrome',
	userAgent: 'a deliberately long user agent that requires a horizontal scrollbar on a narrow device',
	screenWidth: 1536,
	screenHeight: 703,
	viaGetHighEntropyValues: true,
}, null, 2);

afterEach(() => {
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
	vi.clearAllMocks();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function mountCode(withOuterStyle: boolean, options: { code?: string; forceShow?: boolean; lang?: string; copyButton?: boolean } = {}) {
	vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(mocks.copy);
	const host = document.createElement('div');
	host.style.cssText = 'width:240px;cursor:pointer;--MI_THEME-bg:#f3f4f6;--MI_THEME-divider:#dfe3e8;--MI_THEME-fg:#364152;--MI_THEME-fgTransparentWeak:#6b7280;--MI_THEME-fgHighlighted:#111827;--MI_THEME-buttonHoverBg:#e5e7eb;';
	host.style.cssText += '--MI_THEME-codeBlockBg:#282c34;--MI_THEME-codeBlockFg:#abb2bf;--MI_THEME-error:#ec4137;--MI_THEME-warn:#ecb637;--MI_THEME-success:#86b300;';
	host.dataset.noteCard = '';
	host.addEventListener('click', event => {
		if (shouldOpenNote(event, host)) mocks.openNote();
	});
	document.body.append(host);
	const app = createApp({ render: () => h(MkCode, { code, lang: 'json', withOuterStyle, ...options }) });
	app.mount(host);
	fixtures.push({ app, host });
	return host;
}

describe('code block cold loading', () => {
	test.each([true, false])('keeps the complete code and its dimensions while highlighting loads (outer style: %s)', async (withOuterStyle) => {
		let resolveHighlight: () => void = () => {};
		mocks.ready = new Promise<void>(resolve => { resolveHighlight = resolve; });
		mocks.codeToHtml.mockImplementation((value: string) => {
			const escaped = document.createElement('div');
			escaped.textContent = value;
			return `<pre class="shiki" tabindex="0"><code>${escaped.innerHTML}</code></pre>`;
		});
		const host = mountCode(withOuterStyle, { forceShow: true });
		await nextTick();
		const fallback = host.querySelector('pre')!;
		const viewport = fallback.parentElement!;
		expect(fallback.textContent).toBe(code);
		expect(fallback.scrollWidth).toBeGreaterThan(fallback.clientWidth);
		expect(getComputedStyle(viewport).scrollbarWidth).not.toBe('none');
		expect(getComputedStyle(viewport, '::-webkit-scrollbar').display).not.toBe('none');
		expect(getComputedStyle(fallback).paddingTop).toBe(getComputedStyle(fallback).paddingBottom);
		expect(viewport.getBoundingClientRect().height).toBeCloseTo(5 * parseFloat(getComputedStyle(fallback).lineHeight), 1);
		const body = viewport.parentElement!;
		expect(getComputedStyle(body).paddingTop).toBe('12px');
		expect(getComputedStyle(body).paddingBottom).toBe('12px');
		expect(getComputedStyle(fallback).cursor).toBe('default');
		fallback.focus();
		expect(document.activeElement).toBe(fallback);
		const button = host.querySelector<HTMLButtonElement>('[aria-label="Copy"]')!;
		expect(button.getBoundingClientRect().bottom).toBeLessThanOrEqual(fallback.getBoundingClientRect().top);
		fallback.querySelector('code')!.click();
		expect(mocks.openNote).not.toHaveBeenCalled();
		fallback.scrollLeft = fallback.scrollWidth;
		expect(fallback.scrollLeft).toBeGreaterThan(0);
		viewport.scrollTop = viewport.scrollHeight;
		expect(viewport.scrollTop).toBeGreaterThan(0);
		viewport.scrollTop = 0;
		const initialHeight = host.getBoundingClientRect().height;
		const initialWidth = host.getBoundingClientRect().width;
		expect(mocks.codeToHtml).not.toHaveBeenCalled();
		button.click();
		expect(mocks.copy).toHaveBeenCalledWith(code);
		await nextTick();
		await expect.poll(() => host.querySelector('[aria-label="Copied"]')?.textContent).toContain('Copied');
		expect(host.querySelectorAll('button')).toHaveLength(2);

		resolveHighlight();
		await expect.poll(() => host.querySelector('.shiki')?.textContent, { timeout: 10000 }).toBe(code);
		const highlighted = host.querySelector<HTMLElement>('.shiki')!;
		expect(highlighted.scrollWidth).toBeGreaterThan(highlighted.clientWidth);
		expect(getComputedStyle(highlighted).scrollbarWidth).toBe('none');
		expect(getComputedStyle(highlighted).paddingTop).toBe(getComputedStyle(highlighted).paddingBottom);
		expect(viewport.getBoundingClientRect().height).toBeCloseTo(5 * parseFloat(getComputedStyle(highlighted).lineHeight), 1);
		highlighted.focus();
		expect(document.activeElement).toBe(highlighted);
		expect(button.getBoundingClientRect().bottom).toBeLessThanOrEqual(highlighted.getBoundingClientRect().top);
		highlighted.querySelector('code')!.click();
		expect(mocks.openNote).not.toHaveBeenCalled();
		expect(host.getBoundingClientRect().height).toBeCloseTo(initialHeight, 1);
		expect(host.getBoundingClientRect().width).toBeCloseTo(initialWidth, 1);
		expect(mocks.codeToHtml).toHaveBeenCalledWith(code, expect.objectContaining({ lang: 'json' }));
		button.click();
		expect(mocks.copy).toHaveBeenLastCalledWith(code);
		if (withOuterStyle) {
			host.style.width = '600px';
			highlighted.blur();
			await nextTick();
			await page.screenshot({ element: host, path: '../e2e/artifacts/component-browser/code-block-expanded.png' });
		}
	}, 15000);

	test('starts expanded and only the icon toggles the code body', async () => {
		const host = mountCode(true);
		await nextTick();
		expect(host.querySelector('pre')?.textContent).toBe(code);
		const toggle = host.querySelector<HTMLButtonElement>('[aria-expanded]')!;
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		const root = host.querySelector<HTMLElement>('[data-note-interactive]')!;
		const header = root.firstElementChild as HTMLElement;
		const body = document.getElementById(toggle.getAttribute('aria-controls')!)!;
		header.click();
		await nextTick();
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(getComputedStyle(root).backgroundColor).not.toBe(getComputedStyle(body).backgroundColor);
		const arrow = toggle.querySelector('i')!.getBoundingClientRect();
		const dots = header.querySelector('span')!.getBoundingClientRect();
		expect(host.getBoundingClientRect().right - toggle.getBoundingClientRect().right).toBeCloseTo(dots.left - host.getBoundingClientRect().left, 0);
		expect(dots.top + dots.height / 2).toBeCloseTo(arrow.top + arrow.height / 2, 0);
		expect(getComputedStyle(toggle.querySelector('i')!).fontSize).toBe(getComputedStyle(host.querySelector('[aria-label="Copy"]')!).fontSize);
		host.style.width = '680px';
		await page.screenshot({ element: host, path: '../e2e/artifacts/component-browser/code-block-five-lines.png' });
		host.style.width = '240px';
		host.querySelector<HTMLButtonElement>('[aria-label="Copy"]')!.click();
		await nextTick();
		expect(mocks.copy).toHaveBeenCalledWith(code);
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		toggle.focus();
		await userEvent.keyboard('{Enter}');
		await nextTick();
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(body.getBoundingClientRect().height).toBe(0);
		expect(getComputedStyle(body).visibility).toBe('hidden');
		expect(body.inert).toBe(true);
		expect(body.getAttribute('aria-hidden')).toBe('true');
		expect(root.getBoundingClientRect().height).toBe(header.getBoundingClientRect().height);
		host.querySelector('pre')?.focus();
		expect(document.activeElement).toBe(toggle);
		toggle.click();
		await expect.poll(() => host.querySelector('pre')?.textContent).toBe(code);
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(body.inert).toBe(false);
		expect(getComputedStyle(host.querySelector('pre')!).whiteSpace).toBe('pre');
		expect(mocks.openNote).not.toHaveBeenCalled();
	});

	test.each([1, 3, 5, 8])('sizes %i lines naturally up to five visible lines', async (lineCount) => {
		const plainCode = Array.from({ length: lineCount }, (_, index) => `line ${index + 1}`).join('\n');
		const host = mountCode(true, { code: plainCode, lang: '' });
		await nextTick();
		const pre = host.querySelector('pre')!;
		const viewport = pre.parentElement!;
		const style = getComputedStyle(pre);
		expect(pre.textContent).toBe(plainCode);
		expect(viewport.getBoundingClientRect().height).toBeCloseTo(Math.min(lineCount, 5) * parseFloat(style.lineHeight), 1);
		viewport.scrollTop = viewport.scrollHeight;
		expect(viewport.scrollTop > 0).toBe(lineCount > 5);
		expect(getComputedStyle(viewport).overflowY).toBe('auto');
	});

	test('can expand plain code with copying disabled', async () => {
		const host = mountCode(true, { lang: '', copyButton: false });
		expect(host.querySelectorAll('button')).toHaveLength(1);
		await nextTick();
		expect(host.querySelector('pre')!.textContent).toBe(code);
		expect(mocks.codeToHtml).not.toHaveBeenCalled();
	});

	test('only shows copied after clipboard succeeds and allows retry after failure', async () => {
		let resolveCopy: () => void = () => {};
		mocks.copy.mockReturnValueOnce(new Promise<void>(resolve => { resolveCopy = resolve; }));
		const host = mountCode(true);
		const button = host.querySelector<HTMLButtonElement>('[aria-label="Copy"]')!;
		button.click();
		await nextTick();
		expect(button.textContent).not.toContain('Copied');
		resolveCopy();
		await expect.poll(() => button.textContent).toContain('Copied');
		mocks.copy.mockRejectedValueOnce(new Error('Clipboard denied'));
		button.click();
		await expect.poll(() => button.textContent).toContain('Retry');
		mocks.copy.mockResolvedValueOnce(undefined);
		button.click();
		await expect.poll(() => button.textContent).toContain('Copied');
	});

	test('restores copy three seconds after the latest successful copy', async () => {
		vi.useFakeTimers();
		mocks.copy.mockResolvedValue(undefined);
		const host = mountCode(true);
		const button = host.querySelector<HTMLButtonElement>('[aria-label="Copy"]')!;
		button.click();
		await vi.advanceTimersByTimeAsync(0);
		await nextTick();
		expect(button.getAttribute('aria-label')).toBe('Copied');
		await vi.advanceTimersByTimeAsync(2999);
		expect(button.getAttribute('aria-label')).toBe('Copied');
		button.click();
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(2999);
		expect(button.getAttribute('aria-label')).toBe('Copied');
		await vi.advanceTimersByTimeAsync(1);
		await nextTick();
		expect(button.getAttribute('aria-label')).toBe('Copy');
		expect(button.textContent).not.toContain('Copied');
	});
});
