/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cdp, page } from 'vitest/browser';
import type { CDPSession } from '@vitest/browser-playwright';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import MkCode from '@/components/MkCode.vue';
import { shouldOpenNote } from '@/utility/note-card-click.js';
import '@/style.scss';
import 'virtual:tabler-icons.css';

const mocks = vi.hoisted(() => ({
	ready: Promise.resolve(),
	codeToHtml: vi.fn(),
	copy: vi.fn(),
	openNote: vi.fn(),
	success: vi.fn(),
	alert: vi.fn(),
	toast: vi.fn(),
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
vi.mock('@/os.js', () => ({ success: mocks.success, alert: mocks.alert, toast: mocks.toast }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { code: 'Code', clickToShow: 'Click to show', showLess: 'Collapse', copy: 'Copy', _share: { copied: 'Copied' }, copiedToClipboard: 'Copied to clipboard', somethingHappened: 'Something happened' } } }));

const fixtures: { app: App; host: HTMLElement }[] = [];
const code = JSON.stringify({
	os: 'Windows 11 or later',
	browser: 'Google Chrome',
	userAgent: 'a deliberately long user agent that remains unwrapped and fully copyable on a narrow device',
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

function mountCode(withOuterStyle: boolean, options: { code?: string; lang?: string; copyButton?: boolean } = {}) {
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
		const host = mountCode(withOuterStyle, {});
		await nextTick();
		const fallback = host.querySelector('pre')!;
		const viewport = fallback.parentElement!;
		const body = viewport.parentElement!;
		const root = host.querySelector<HTMLElement>('[data-note-interactive]')!;
		const contentHeight = (lineHeight: string) => code.split('\n').length * parseFloat(lineHeight) + 24;
		expect(fallback.textContent).toBe(code);
		expect(fallback.getBoundingClientRect().width).toBeGreaterThan(body.clientWidth);
		expect(getComputedStyle(body).overflow).toBe('clip');
		expect(getComputedStyle(viewport).overflow).toBe('visible');
		expect(getComputedStyle(fallback).overflow).toBe('visible');
		expect(body.getBoundingClientRect().right).toBeCloseTo(root.getBoundingClientRect().right, 1);
		expect(getComputedStyle(fallback).paddingTop).toBe(getComputedStyle(fallback).paddingBottom);
		expect(body.clientHeight).toBeCloseTo(contentHeight(getComputedStyle(fallback).lineHeight), 0);
		expect(getComputedStyle(body).paddingTop).toBe('12px');
		expect(getComputedStyle(body).paddingBottom).toBe('12px');
		expect(getComputedStyle(fallback).cursor).toBe('default');
		fallback.focus();
		expect(document.activeElement).toBe(fallback);
		const button = host.querySelector<HTMLButtonElement>('[aria-label="Copy"]')!;
		expect(button.getBoundingClientRect().bottom).toBeLessThanOrEqual(fallback.getBoundingClientRect().top);
		fallback.querySelector('code')!.click();
		expect(mocks.openNote).not.toHaveBeenCalled();
		body.scrollLeft = body.scrollWidth;
		expect(body.scrollLeft).toBe(0);
		body.scrollTop = body.scrollHeight;
		expect(body.scrollTop).toBe(0);
		body.scrollLeft = 0;
		body.scrollTop = 0;

		const initialHeight = host.getBoundingClientRect().height;
		const initialWidth = host.getBoundingClientRect().width;
		expect(mocks.codeToHtml).not.toHaveBeenCalled();
		button.click();
		expect(mocks.copy).toHaveBeenCalledWith(code);
		await nextTick();
		await expect.poll(() => button.textContent).toContain('Copied');
		expect(host.querySelectorAll('button')).toHaveLength(1);

		resolveHighlight();
		await expect.poll(() => host.querySelector('.shiki')?.textContent, { timeout: 10000 }).toBe(code);
		const highlighted = host.querySelector<HTMLElement>('.shiki')!;
		expect(highlighted.getBoundingClientRect().width).toBeGreaterThan(body.clientWidth);
		expect(getComputedStyle(highlighted).overflow).toBe('visible');
		expect(getComputedStyle(highlighted).paddingTop).toBe(getComputedStyle(highlighted).paddingBottom);
		expect(body.clientHeight).toBeCloseTo(contentHeight(getComputedStyle(highlighted).lineHeight), 0);
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

	test.each([1, 3, 5, 8])('expands all %i lines without internal vertical scrolling', async (lineCount) => {
		const plainCode = Array.from({ length: lineCount }, (_, index) => `line ${index + 1}`).join('\n');
		const host = mountCode(true, { code: plainCode, lang: '' });
		await nextTick();
		const pre = host.querySelector('pre')!;
		const viewport = pre.parentElement!;
		const body = viewport.parentElement!;
		const style = getComputedStyle(pre);
		expect(pre.textContent).toBe(plainCode);
		expect(body.getBoundingClientRect().height).toBeCloseTo(lineCount * parseFloat(style.lineHeight) + 24, 1);
		body.scrollTop = body.scrollHeight;
		expect(body.scrollTop).toBe(0);
		expect(getComputedStyle(body).overflow).toBe('clip');
		if (lineCount === 8) {
			host.style.height = '140px';
			host.style.overflowY = 'auto';
			const bounds = pre.getBoundingClientRect();
			const frame = window.frameElement!.getBoundingClientRect();
			await (cdp() as CDPSession).send('Input.dispatchMouseEvent', {
				type: 'mouseWheel',
				x: frame.left + (bounds.left + 20) * frame.width / window.innerWidth,
				y: frame.top + (bounds.top + 20) * frame.height / window.innerHeight,
				deltaX: 0,
				deltaY: 120,
			});
			await expect.poll(() => host.scrollTop).toBeGreaterThan(0);
			expect(body.scrollTop).toBe(0);
		}
	});

	test('shows plain code with copying disabled', async () => {
		const host = mountCode(true, { lang: '', copyButton: false });
		expect(host.querySelectorAll('button')).toHaveLength(0);
		await nextTick();
		expect(host.querySelector('pre')!.textContent).toBe(code);
		expect(mocks.codeToHtml).not.toHaveBeenCalled();
	});

	test('waits for the clipboard before reporting success', async () => {
		let finish!: () => void;
		mocks.copy.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
		const host = mountCode(true);
		host.querySelector<HTMLButtonElement>('[aria-label="Copy"]')!.click();
		await nextTick();
		expect(mocks.success).not.toHaveBeenCalled();
		finish();
		await expect.poll(() => host.querySelector('button')?.textContent).toContain('Copied');
	});

	test('reports copy failure through an error toast without changing the button', async () => {
		mocks.copy.mockRejectedValueOnce(new Error('Clipboard denied'));
		const host = mountCode(true);
		const button = host.querySelector<HTMLButtonElement>('[aria-label="Copy"]')!;
		button.click();
		await expect.poll(() => mocks.toast).toHaveBeenCalledWith('Something happened', 'error');
		expect(mocks.success).not.toHaveBeenCalled();
		expect(mocks.alert).not.toHaveBeenCalled();
		expect(host.querySelector('[aria-label="Copy"]')).not.toBeNull();
		expect(host.querySelector('[aria-label="Copied"]')).toBeNull();
	});
});
