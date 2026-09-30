/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { transform } from 'esbuild';
import { LocaleInliner } from '../../../frontend-builder/locale-inliner.js';
import { collectModifications } from '../../../frontend-builder/locale-inliner/collect-modifications.js';
import { blankLogger } from '../../../frontend-builder/logger.js';

afterEach(() => vi.restoreAllMocks());

describe('locale loading', () => {
	test('bypasses cached translations when opening the development client', async () => {
		const fetchedLocale = { _lang_: '简体中文', charts: '图表' };
		const fetch = vi.spyOn(window, 'fetch').mockResolvedValue(new Response(JSON.stringify(fetchedLocale)));
		vi.resetModules();
		const { locale } = await import('@@/js/locale.js');
		expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/assets\/locales\/.*\.json$/), { cache: 'no-store' });
		expect(locale).toEqual(fetchedLocale);
	});

	test('keeps the production locale fetch recognizable by the locale inliner', async () => {
		const source = readFileSync(path.resolve(import.meta.dirname, '../../../frontend-shared/js/locale.ts'), 'utf8');
		const { code } = await transform(source, { loader: 'ts', format: 'esm', define: { _DEV_: 'false' }, minifySyntax: true });
		const inliner = new LocaleInliner({
			outputDir: '.',
			scriptsDir: 'scripts',
			i18nFile: 'src/i18n.ts',
			manifest: { 'src/i18n.ts': { file: 'scripts/i18n.js' } },
			logger: blankLogger,
		});
		expect(code).not.toContain('no-store');
		expect(collectModifications(code, 'locale.js', blankLogger, inliner).filter(item => item.type === 'locale-json')).toHaveLength(1);
	});
});
