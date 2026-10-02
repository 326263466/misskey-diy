/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, expect, test, vi } from 'vitest';
import locales from 'i18n';

beforeEach(() => vi.resetModules());

test.each(['zh-CN', 'en-US'] as const)('loads the admin search index with real %s translations', async language => {
	const { updateI18n } = await import('@/i18n.js');
	updateI18n(locales[language]);
	const { searchIndexes } = await import('search-index:admin');
	expect(searchIndexes.length).toBeGreaterThan(0);
	for (const item of searchIndexes) {
		expect(typeof item.label).toBe('string');
		for (const text of item.texts) expect(typeof text).toBe('string');
	}
	expect(searchIndexes.some(item => item.label === locales[language]._serverSettings.openGuestAccess)).toBe(true);
});
