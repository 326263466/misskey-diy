/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { getHighlighter, loadCodeLanguage } from '@/utility/code-highlighter.js';

describe('code highlighter language loading', () => {
	test('shares cold initialization and only loads the requested grammar', async () => {
		const first = getHighlighter();
		expect(getHighlighter()).toBe(first);
		const highlighter = await first;
		expect(highlighter.getLoadedLanguages()).toEqual([]);
		const loadLanguage = vi.spyOn(highlighter, 'loadLanguage');
		expect(await Promise.all([loadCodeLanguage('json'), loadCodeLanguage('json')])).toEqual(['json', 'json']);
		expect(loadLanguage).toHaveBeenCalledOnce();
		loadLanguage.mockRestore();
		expect(highlighter.getLoadedLanguages()).toContain('json');
		expect(highlighter.getLoadedLanguages()).not.toContain('javascript');
		expect(highlighter.getLoadedLanguages()).not.toContain('aiscript');
		expect(highlighter.codeToHtml('{ "answer": 42 }', { lang: 'json', theme: 'dark-plus' })).toContain('class="line"');
	});

	test('loads aliases and preserves the JavaScript fallback for unsupported languages', async () => {
		const languages = await Promise.all([loadCodeLanguage('js'), loadCodeLanguage('javascript'), loadCodeLanguage('unknown-language')]);
		expect(languages).toEqual(['javascript', 'javascript', 'javascript']);
		const highlighter = await getHighlighter();
		expect(highlighter.codeToHtml('const answer = 42;', { lang: 'js', theme: 'dark-plus' })).toContain('class="line"');
	});

	test.each(['aiscript', 'is', 'ais', 'AiScript'])('preserves the custom AiScript grammar for %s', async (language) => {
		expect(await loadCodeLanguage(language)).toBe('aiscript');
		const highlighter = await getHighlighter();
		expect(highlighter.codeToHtml('<: "hello"', { lang: 'aiscript', theme: 'dark-plus' })).toContain('class="line"');
	});
});
