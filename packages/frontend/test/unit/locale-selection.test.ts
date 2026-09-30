/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, test, vi } from 'vitest';

const languageCases: { saved: string | null; browser: string; browsers?: string[]; expected: string }[] = [
	{ saved: null, browser: 'ja-JP', expected: 'ja-JP' },
	{ saved: null, browser: 'en-US', expected: 'en-US' },
	{ saved: null, browser: 'zh-CN', expected: 'zh-CN' },
	{ saved: null, browser: 'zh-TW', expected: 'zh-TW' },
	{ saved: null, browser: 'fr-FR', expected: 'fr-FR' },
	{ saved: null, browser: 'fr', expected: 'fr-FR' },
	{ saved: null, browser: 'fr-CA', expected: 'fr-FR' },
	{ saved: null, browser: 'zh', expected: 'zh-CN' },
	{ saved: null, browser: 'zh-HK', expected: 'zh-TW' },
	{ saved: null, browser: 'zh-MO', expected: 'zh-TW' },
	{ saved: null, browser: 'zh-Hant', expected: 'zh-TW' },
	{ saved: null, browser: 'zh-Hant-CN', expected: 'zh-TW' },
	{ saved: null, browser: 'zh-Hans-HK', expected: 'zh-CN' },
	{ saved: null, browser: 'zh-SG', expected: 'zh-CN' },
	{ saved: null, browser: 'ZH-tW', expected: 'zh-TW' },
	{ saved: null, browser: 'fr-FR-u-ca-gregory', expected: 'fr-FR' },
	{ saved: null, browser: 'zh-TW-u-ca-chinese', expected: 'zh-TW' },
	{ saved: null, browser: 'sq-AL', browsers: ['sq-AL', 'fr-CA', 'en-US'], expected: 'fr-FR' },
	{ saved: null, browser: 'fr-CA', browsers: ['fr-CA', 'ja-JP'], expected: 'fr-FR' },
	{ saved: null, browser: 'zh-Hant', browsers: ['zh-Hant', 'en-US'], expected: 'zh-TW' },
	{ saved: null, browser: 'en-US', browsers: ['en-US', 'fr-FR'], expected: 'en-US' },
	{ saved: null, browser: 'en--US', browsers: ['en--US', 'fr-FR'], expected: 'fr-FR' },
	{ saved: null, browser: 'sq-AL', browsers: ['sq-AL', 'kk-KZ'], expected: 'en-US' },
	{ saved: null, browser: 'fr-CA', browsers: [], expected: 'fr-FR' },
	{ saved: null, browser: 'unsupported', expected: 'en-US' },
	{ saved: 'invalid', browser: 'ja-JP', expected: 'ja-JP' },
	{ saved: 'invalid', browser: 'unsupported', expected: 'en-US' },
	{ saved: 'ja-JP', browser: 'zh-CN', expected: 'ja-JP' },
	{ saved: 'en-US', browser: 'zh-CN', expected: 'en-US' },
	{ saved: 'zh-TW', browser: 'zh-CN', expected: 'zh-TW' },
	{ saved: 'fr-FR', browser: 'zh-CN', expected: 'fr-FR' },
	{ saved: 'zh-TW', browser: 'zh-HK', expected: 'zh-TW' },
	{ saved: 'zh-CN', browser: 'zh-HK', browsers: ['zh-HK', 'en-US'], expected: 'zh-CN' },
	{ saved: 'en-US', browser: 'fr-CA', browsers: ['fr-CA', 'ja-JP'], expected: 'en-US' },
];

afterEach(() => {
	localStorage.removeItem('lang');
	vi.restoreAllMocks();
});

describe.each([
	['main client', '../../public/loader/boot.js'],
	['embedded client', '../../../frontend-embed/public/loader/boot.js'],
])('%s initial language', (_name, bootPath) => {
	describe.each([
		{ name: 'Intl.Locale supported', intl: Intl },
		{ name: 'Intl.Locale unavailable', intl: {} },
	])('$name', ({ intl }) => {
		test.each(languageCases)('uses $expected with saved=$saved and browser=$browser and preferences=$browsers', async ({ saved, browser, browsers, expected }) => {
			const storedValues = new Map<string, string>();
			if (saved != null) storedValues.set('lang', saved);
			const storage = {
				getItem: (key: string) => storedValues.get(key) ?? null,
				setItem: (key: string, value: string) => storedValues.set(key, value),
			};
			const location = { search: '' };
			const source = readFileSync(path.resolve(import.meta.dirname, bootPath), 'utf8');
			await runInNewContext(source, {
				LANGS: ['en-US', 'fr-FR', 'ja-JP', 'zh-CN', 'zh-TW'],
				localStorage: storage,
				navigator: { language: browser, languages: browsers },
				Intl: intl,
				location,
				URLSearchParams,
				document: { readyState: 'loading' },
				window: { addEventListener: vi.fn(), location },
			});
			expect(storedValues.get('lang')).toBe(expected);
		});
	});
});

describe('shared client language', () => {
	test.each([
		{ saved: null, expected: 'en-US' },
		{ saved: 'invalid', expected: 'en-US' },
		{ saved: 'ja-JP', expected: 'ja-JP' },
		{ saved: 'en-US', expected: 'en-US' },
		{ saved: 'zh-CN', expected: 'zh-CN' },
		{ saved: 'zh-TW', expected: 'zh-TW' },
		{ saved: 'fr-FR', expected: 'fr-FR' },
	])('uses $expected with saved=$saved', async ({ saved, expected }) => {
		if (saved == null) {
			localStorage.removeItem('lang');
		} else {
			localStorage.setItem('lang', saved);
		}
		vi.resetModules();
		const { lang } = await import('@@/js/config.js');
		expect(lang).toBe(expected);
	});
});
