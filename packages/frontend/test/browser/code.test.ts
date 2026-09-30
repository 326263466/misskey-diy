/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import MkCode from '@/components/MkCode.vue';

const mocks = vi.hoisted(() => ({
	ready: Promise.resolve(),
	codeToHtml: vi.fn(),
	copy: vi.fn(),
	dataSaver: { code: false },
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
vi.mock('@/preferences.js', () => ({ prefer: { s: { dataSaver: mocks.dataSaver } } }));
vi.mock('@/store.js', () => ({ store: { r: { darkMode: ref(false) } } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { code: 'Code', clickToShow: 'Click to show' } } }));
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: mocks.copy }));

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
	mocks.dataSaver.code = false;
	vi.clearAllMocks();
});

function mountCode(withOuterStyle: boolean) {
	const host = document.createElement('div');
	host.style.width = '240px';
	document.body.append(host);
	const app = createApp({ render: () => h(MkCode, { code, lang: 'json', withOuterStyle }) });
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
			return `<pre class="shiki"><code>${escaped.innerHTML}</code></pre>`;
		});
		const host = mountCode(withOuterStyle);
		await nextTick();
		const fallback = host.querySelector('pre')!;
		expect(fallback.textContent).toBe(code);
		expect(fallback.scrollWidth).toBeGreaterThan(fallback.clientWidth);
		const initialHeight = host.getBoundingClientRect().height;
		const initialWidth = host.getBoundingClientRect().width;
		expect(mocks.codeToHtml).not.toHaveBeenCalled();
		host.querySelector('button')!.click();
		expect(mocks.copy).toHaveBeenCalledWith(code);

		resolveHighlight();
		await expect.poll(() => host.querySelector('.shiki')?.textContent, { timeout: 10000 }).toBe(code);
		expect(host.getBoundingClientRect().height).toBeCloseTo(initialHeight, 1);
		expect(host.getBoundingClientRect().width).toBeCloseTo(initialWidth, 1);
		expect(mocks.codeToHtml).toHaveBeenCalledWith(code, expect.objectContaining({ lang: 'json' }));
	}, 15000);

	test('still waits for user interaction when code data saving is enabled', async () => {
		mocks.dataSaver.code = true;
		const host = mountCode(true);
		expect(host.querySelector('pre')).toBeNull();
		expect(host.textContent).toContain('Click to show');
		expect(mocks.codeToHtml).not.toHaveBeenCalled();
	});
});
