/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, beforeEach, describe, test, vi } from 'vitest';
import type { Theme } from '@@/js/theme.js';
import { compile, getBuiltinThemes } from '@@/js/theme.js';
import lightTheme from '@@/themes/_light.json5';
import darkTheme from '@@/themes/_dark.json5';
import miLight from '@@/themes/l-light.json5';

vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			_theme: {
				alreadyInstalled: 'already installed',
				invalid: 'invalid',
			},
		},
	},
	updateI18n: vi.fn(),
}));

vi.mock('@/os.js', () => ({
	alert: vi.fn(),
}));

const cloneTheme = <T>(value: T): T => structuredClone(value);

const createTheme = (base: 'light' | 'dark', options: {
	id: string;
	name: string;
	accent: string;
	bg: string;
	fg: string;
}): Theme => {
	const builtin = base === 'dark' ? darkTheme : lightTheme;

	return {
		id: options.id,
		name: options.name,
		author: 'tester',
		base,
		props: {
			...cloneTheme(builtin.props),
			accent: options.accent,
			bg: options.bg,
			fg: options.fg,
		},
	};
};

const primaryTheme = createTheme('light', {
	id: 'primary-theme',
	name: 'Primary Theme',
	accent: '#224488',
	bg: '#faf7f2',
	fg: '#1a1a1a',
});

const previewTheme = createTheme('dark', {
	id: 'preview-theme',
	name: 'Preview Theme',
	accent: '#55aa33',
	bg: '#101820',
	fg: '#f4f4f4',
});

const replacementTheme = createTheme('dark', {
	id: 'replacement-theme',
	name: 'Replacement Theme',
	accent: '#bb5500',
	bg: '#18110f',
	fg: '#f6e7df',
});

const loadThemeModule = async () => {
	vi.resetModules();
	return await import('@/theme.js');
};

const resetDocument = () => {
	window.localStorage.clear();
	document.head.innerHTML = '<meta name="theme-color" content="#000000">';
	document.documentElement.className = '';
	document.documentElement.removeAttribute('data-color-scheme');
	document.documentElement.style.cssText = '';
	Reflect.deleteProperty(document, 'startViewTransition');
	Object.defineProperty(document, 'visibilityState', {
		configurable: true,
		value: 'visible',
	});
};

describe('derived theme colors', () => {
	test.each(['light', 'dark'] as const)('derives %s colors without changing the input', base => {
		const theme = createTheme(base, { id: 'derived', name: 'Derived', accent: '#808080', bg: '#ffffff', fg: base === 'dark' ? '#ffffff' : '#000000' });
		const original = cloneTheme(theme);
		const colors = compile(theme);
		const channel = base === 'dark' ? '255, 255, 255' : '0, 0, 0';
		assert.strictEqual(colors.fgTransparent, `rgba(${channel}, ${base === 'dark' ? 0.85 : 0.75})`);
		assert.strictEqual(colors.fgTransparentWeak, `rgba(${channel}, ${base === 'dark' ? 0.7 : 0.5})`);
		assert.strictEqual(colors.fgTransparentVeryWeak, `rgba(${channel}, ${base === 'dark' ? 0.55 : 0.3})`);
		assert.strictEqual(colors.accentHover, 'rgb(141, 141, 141)');
		assert.strictEqual(colors.accentActive, 'rgb(115, 115, 115)');
		assert.strictEqual(colors.chartAccent, 'rgb(128, 128, 128)');
		assert.deepStrictEqual(theme, original);
	});

	test('explicit expressions override defaults and can reference other derived colors', () => {
		const theme = cloneTheme(primaryTheme);
		theme.props.fgTransparentWeak = '#123456';
		theme.props.accentHover = '@accentActive';
		theme.props.chartAccent = '@link';
		theme.props.badge = '@fgTransparent';
		const colors = compile(theme);
		assert.strictEqual(colors.fgTransparentWeak, 'rgb(18, 52, 86)');
		assert.strictEqual(colors.accentHover, colors.accentActive);
		assert.strictEqual(colors.chartAccent, colors.link);
		assert.strictEqual(colors.badge, colors.fgTransparent);
	});

	test('derived references retain cycle detection and partial themes remain compilable', () => {
		const theme = cloneTheme(primaryTheme);
		theme.props.accent = '@accentHover';
		assert.throws(() => compile(theme), /circular references/);
		assert.deepStrictEqual(compile({ ...primaryTheme, props: { bg: '#fff' } }), { bg: 'rgb(255, 255, 255)' });
	});

	test('all built-in themes compile the six derived fields', async () => {
		for (const theme of await getBuiltinThemes()) {
			const base = theme.base === 'dark' ? darkTheme : lightTheme;
			const colors = compile({ ...theme, props: { ...base.props, ...theme.props } });
			for (const key of ['fgTransparent', 'fgTransparentWeak', 'fgTransparentVeryWeak', 'accentHover', 'accentActive', 'chartAccent']) {
				assert.match(colors[key], /^rgba?\(/, `${theme.name}: ${key}`);
			}
		}
	});
});

describe('ThemeManager', () => {
	beforeEach(() => {
		resetDocument();
	});

	afterEach(() => {
		window.localStorage.clear();
	});

	test('applies Mi Light overrides and replaces them with derived colors when switching themes', async () => {
		const { themeManager } = await loadThemeModule();
		themeManager.updateTheme(miLight);
		const style = document.documentElement.style;
		assert.strictEqual(style.getPropertyValue('--MI_THEME-accent'), 'rgb(30, 128, 255)');
		assert.strictEqual(style.getPropertyValue('--MI_THEME-accentHover'), 'rgb(17, 113, 238)');
		assert.strictEqual(style.getPropertyValue('--MI_THEME-accentActive'), 'rgb(0, 96, 221)');
		assert.strictEqual(style.getPropertyValue('--MI_THEME-fgTransparentWeak'), 'rgb(138, 145, 159)');
		assert.strictEqual(style.getPropertyValue('--MI_THEME-divider'), 'rgb(228, 230, 235)');
		themeManager.updateTheme(replacementTheme);
		assert.strictEqual(style.getPropertyValue('--MI_THEME-accentHover'), compile(replacementTheme).accentHover);
		assert.strictEqual(style.getPropertyValue('--MI_THEME-fgTransparentWeak'), 'rgba(246, 231, 223, 0.7)');
	});

	test('通常テーマ適用後のプレビューは現在テーマのみを切り替え、キャッシュは保持する', async () => {
		const { themeManager, isPreviewMode } = await loadThemeModule();

		themeManager.updateTheme(primaryTheme);
		const cachedTheme = window.localStorage.getItem('theme');
		const cachedThemeId = window.localStorage.getItem('themeId');

		themeManager.previewTheme(previewTheme);

		assert.strictEqual(themeManager.theme?.id, primaryTheme.id);
		assert.strictEqual(themeManager.currentTheme?.id, previewTheme.id);
		assert.strictEqual(themeManager.currentThemeId, previewTheme.id);
		assert.strictEqual(themeManager.isPreviewMode, true);
		assert.strictEqual(isPreviewMode.value, true);
		assert.strictEqual(document.documentElement.dataset.colorScheme, 'dark');
		assert.strictEqual(document.documentElement.style.getPropertyValue('--MI_THEME-accent'), themeManager.currentCompiledTheme?.accent);
		assert.strictEqual(window.localStorage.getItem('theme'), cachedTheme);
		assert.strictEqual(window.localStorage.getItem('themeId'), cachedThemeId);
	});

	test('プレビュー解除で元のテーマと DOM 状態が復元される', async () => {
		const { themeManager, isPreviewMode } = await loadThemeModule();

		themeManager.updateTheme(primaryTheme);
		const originalCompiledThemeColor = themeManager.currentCompiledTheme?.htmlThemeColor;

		themeManager.previewTheme(previewTheme);
		const previewCompiledThemeColor = themeManager.currentCompiledTheme?.htmlThemeColor;
		assert.strictEqual(themeManager.currentTheme?.id, previewTheme.id);
		assert.notStrictEqual(previewCompiledThemeColor, originalCompiledThemeColor);

		themeManager.clearPreview();

		assert.strictEqual(themeManager.theme?.id, primaryTheme.id);
		assert.strictEqual(themeManager.currentTheme?.id, primaryTheme.id);
		assert.strictEqual(themeManager.currentCompiledTheme?.htmlThemeColor, originalCompiledThemeColor);
		assert.strictEqual(themeManager.isPreviewMode, false);
		assert.strictEqual(isPreviewMode.value, false);
		assert.strictEqual(document.documentElement.dataset.colorScheme, 'light');
		assert.strictEqual(document.documentElement.style.getPropertyValue('--MI_THEME-accent'), themeManager.currentCompiledTheme?.accent);
		assert.strictEqual(document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content'), originalCompiledThemeColor);
		assert.strictEqual(window.localStorage.getItem('themeId'), primaryTheme.id);
	});

	test('プレビュー中に通常テーマを更新するとプレビューを抜けて新しい通常テーマが適用される', async () => {
		const { themeManager, isPreviewMode } = await loadThemeModule();

		themeManager.updateTheme(primaryTheme);
		themeManager.previewTheme(previewTheme);
		themeManager.updateTheme(replacementTheme);

		assert.strictEqual(themeManager.theme?.id, replacementTheme.id);
		assert.strictEqual(themeManager.currentTheme?.id, replacementTheme.id);
		assert.strictEqual(themeManager.isPreviewMode, false);
		assert.strictEqual(isPreviewMode.value, false);
		assert.strictEqual(document.documentElement.dataset.colorScheme, 'dark');
		assert.strictEqual(document.documentElement.style.getPropertyValue('--MI_THEME-accent'), themeManager.currentCompiledTheme?.accent);
		assert.strictEqual(window.localStorage.getItem('themeId'), replacementTheme.id);
	});

	test('themeChanging と themeChanged はプレビュー適用と復帰のたびに発火する', async () => {
		const { themeManager } = await loadThemeModule();
		const events: string[] = [];

		themeManager.on('themeChanging', () => {
			events.push('themeChanging');
		});
		themeManager.on('themeChanged', () => {
			events.push('themeChanged');
		});

		themeManager.updateTheme(primaryTheme);
		themeManager.previewTheme(previewTheme);
		themeManager.clearPreview();

		assert.deepStrictEqual(events, [
			'themeChanging',
			'themeChanged',
			'themeChanging',
			'themeChanged',
			'themeChanging',
			'themeChanged',
		]);
	});
});
