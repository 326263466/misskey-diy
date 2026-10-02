/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { languages } from '../built/const.js';

test('Chinese search, wallet and red packet strings do not fall back to Japanese', async () => {
	const { locales, rawLocaleSources } = await import('../built/index.js');
	const source = rawLocaleSources!['zh-CN']!;

	function check(expected: Record<string, unknown>, actual: Record<string, unknown>) {
		for (const [key, value] of Object.entries(expected)) {
			if (typeof value === 'object' && value != null) {
				assert.ok(actual[key] && typeof actual[key] === 'object', key);
				check(value as Record<string, unknown>, actual[key] as Record<string, unknown>);
			} else {
				assert.equal(typeof actual[key], 'string', key);
				assert.doesNotMatch(actual[key] as string, /[\u3040-\u30ff]/u, key);
				assert.deepEqual((String(actual[key]).match(/\{\w+\}/g) ?? []).sort(), (String(value).match(/\{\w+\}/g) ?? []).sort(), key);
			}
		}
	}

	for (const section of ['_redPacket', '_wallet'] as const) {
		check(locales['ja-JP'][section], source[section] as Record<string, unknown>);
	}
	for (const key of ['resultsFor', 'sortByTime', 'sortByPopularity', 'sortOrder', 'popularityDescription', 'invalidDateRange'] as const) {
		check({ [key]: locales['ja-JP']._search[key] }, source._search as Record<string, unknown>);
	}
	assert.equal(locales['zh-CN']._search.resultsFor, '“{query}”的搜索结果');
	assert.equal(locales['zh-CN']._redPacket.defaultMessage, '恭喜发财，大吉大利');
});

test('prefers the selected language, its primary, English, then Chinese without Japanese fallback', async () => {
	const fixture = mkdtempSync(join(tmpdir(), 'misskey-i18n-fallback-'));
	try {
		mkdirSync(join(fixture, 'locales'));
		writeFileSync(join(fixture, 'package.json'), JSON.stringify({ type: 'module' }));
		copyFileSync(new URL('../built/const.js', import.meta.url), join(fixture, 'const.js'));
		const source = readFileSync(new URL('../built/index.js', import.meta.url), 'utf8');
		writeFileSync(join(fixture, 'index.js'), source.replace(/from (['"])js-yaml\1/g, `from ${JSON.stringify(import.meta.resolve('js-yaml'))}`));
		const translations: Record<string, Record<string, unknown>> = {
			'ja-JP': { shared: '日本語', chinese: '日本語', english: '日本語', japanese: '日本語', empty: '日本語', nested: { text: '日本語' } },
			'en-US': { shared: 'English', english: 'English', empty: 'English' },
			'zh-CN': { shared: '简体中文', chinese: '简体中文', empty: '简体中文', nested: { text: '简体中文' } },
			'zh-TW': { shared: '繁體中文', empty: '' },
			'fr-FR': { shared: 'Français' },
			'ja-KS': { shared: '関西弁' },
		};
		for (const lang of languages) {
			writeFileSync(join(fixture, 'locales', `${lang}.yml`), JSON.stringify({ __fallbackProbe: translations[lang] ?? {} }));
		}
		const { locales } = await import(pathToFileURL(join(fixture, 'index.js')).href);
		const probe = (lang: string) => locales[lang].__fallbackProbe;
		assert.equal(probe('zh-CN').shared, '简体中文');
		assert.equal(probe('zh-CN').english, 'English');
		assert.equal(probe('zh-CN').japanese, undefined);
		assert.equal(probe('zh-TW').shared, '繁體中文');
		assert.equal(probe('zh-TW').empty, '简体中文');
		assert.equal(probe('zh-TW').nested.text, '简体中文');
		assert.equal(probe('fr-FR').shared, 'Français');
		assert.equal(probe('fr-FR').chinese, '简体中文');
		assert.equal(probe('fr-FR').english, 'English');
		assert.equal(probe('fr-FR').empty, 'English');
		assert.equal(probe('fr-FR').nested.text, '简体中文');
		assert.equal(probe('en-US').shared, 'English');
		assert.equal(probe('en-US').chinese, '简体中文');
		assert.equal(probe('en-US').japanese, undefined);
		assert.equal(probe('ja-JP').chinese, '日本語');
		assert.equal(probe('ja-KS').shared, '関西弁');
		assert.equal(probe('ja-KS').chinese, '日本語');
	} finally {
		// Restrict recursive cleanup to this test's freshly created temporary folder.
		assert.ok(resolve(fixture).startsWith(`${resolve(tmpdir())}${sep}misskey-i18n-fallback-`));
		rmSync(fixture, { recursive: true, force: true });
	}
});

test('provides the widget picker source strings in every language', async () => {
	const { locales } = await import('../built/index.js');
	const source = locales['zh-CN']._widgetPicker;
	assert.equal(source.title, '添加小工具');
	assert.equal(Object.keys(source._descriptions).length, 32);
	for (const lang of languages) {
		const picker = locales[lang]._widgetPicker;
		assert.equal(typeof picker.title, 'string', lang);
		assert.equal(typeof picker.search, 'string', lang);
		assert.equal(typeof picker.empty, 'string', lang);
		for (const key of Object.keys(source._descriptions)) {
			assert.equal(typeof picker._descriptions[key as keyof typeof source._descriptions], 'string', `${lang}/${key}`);
		}
	}
});
