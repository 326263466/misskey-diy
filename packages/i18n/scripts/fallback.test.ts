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

test('prefers the selected language, its primary, English, then Japanese', async () => {
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
		assert.equal(probe('zh-CN').japanese, '日本語');
		assert.equal(probe('zh-TW').shared, '繁體中文');
		assert.equal(probe('zh-TW').empty, '简体中文');
		assert.equal(probe('zh-TW').nested.text, '简体中文');
		assert.equal(probe('fr-FR').shared, 'Français');
		assert.equal(probe('fr-FR').chinese, '日本語');
		assert.equal(probe('fr-FR').english, 'English');
		assert.equal(probe('fr-FR').empty, 'English');
		assert.equal(probe('fr-FR').nested.text, '日本語');
		assert.equal(probe('en-US').shared, 'English');
		assert.equal(probe('en-US').chinese, '日本語');
		assert.equal(probe('en-US').japanese, '日本語');
		assert.equal(probe('ja-JP').chinese, '日本語');
		assert.equal(probe('ja-KS').shared, '関西弁');
		assert.equal(probe('ja-KS').chinese, '日本語');
	} finally {
		// Restrict recursive cleanup to this test's freshly created temporary folder.
		assert.ok(resolve(fixture).startsWith(`${resolve(tmpdir())}${sep}misskey-i18n-fallback-`));
		rmSync(fixture, { recursive: true, force: true });
	}
});
