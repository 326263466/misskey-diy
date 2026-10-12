/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { checkDividerStyle } from './check-divider-style.mjs';

const component = 'packages/frontend/src/components/MkFoo.vue';

test('allows the global divider variables', () => {
	assert.deepEqual(checkDividerStyle(component, [
		'border-top: var(--MI-divider);',
		'height: var(--MI-dividerWidth); background: var(--MI-dividerColor);',
		'box-shadow: inset 0 calc(-1 * var(--MI-dividerWidth)) var(--MI-dividerColor);',
		'<span style="height: 1em; width: var(--MI-dividerWidth); background: var(--MI-dividerColor);"></span>',
	].join('\n')), []);
});

test('rejects raw theme divider color', () => {
	const errors = checkDividerStyle(component, 'border-bottom: 1px solid var(--MI_THEME-divider);');
	assert.equal(errors.length, 1);
	assert.equal(errors[0].line, 1);
});

test('rejects hard-coded width with the divider color', () => {
	assert.equal(checkDividerStyle(component, 'border: 1px solid var(--MI-dividerColor);').length, 1);
	assert.equal(checkDividerStyle(component, 'box-shadow: inset 0 -0.5px var(--MI-dividerColor);').length, 1);
});

test('rejects redefining divider variables outside style.scss', () => {
	assert.equal(checkDividerStyle(component, '--MI-dividerWidth: 2px;').length, 1);
	assert.deepEqual(checkDividerStyle('packages/frontend/src/style.scss', [
		'--MI-dividerWidth: 0.8px;',
		'--MI-dividerColor: color-mix(in srgb, var(--MI_THEME-divider) 30%, transparent);',
		'--MI-divider: var(--MI-dividerWidth) solid var(--MI-dividerColor);',
	].join('\n')), []);
});

test('honors exemptions and comments', () => {
	assert.deepEqual(checkDividerStyle(component, [
		'border: solid 2px var(--MI_THEME-divider); /* divider-exempt: checkbox control outline */',
		'//border: solid 0.5px var(--MI_THEME-divider);',
	].join('\n')), []);
});
