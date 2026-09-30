/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function runVerifier(locales: Record<string, unknown>, languages: string[] = []) {
	const fixture = mkdtempSync(join(tmpdir(), 'misskey-i18n-verify-'));
	try {
		mkdirSync(join(fixture, 'scripts'));
		mkdirSync(join(fixture, 'built'));
		writeFileSync(join(fixture, 'package.json'), JSON.stringify({ type: 'module' }));
		copyFileSync(new URL('./verify.ts', import.meta.url), join(fixture, 'scripts/verify.ts'));
		writeFileSync(join(fixture, 'built/index.js'), `export const locales = ${JSON.stringify(locales)};`);
		const result = spawnSync(process.execPath, [
			'--import', import.meta.resolve('tsx'),
			join(fixture, 'scripts/verify.ts'), ...languages,
		], { encoding: 'utf8', timeout: 30_000 });
		assert.ifError(result.error);
		assert.equal(result.signal, null, result.stderr);
		return {
			status: result.status,
			errors: result.stderr.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)),
		};
	} finally {
		rmSync(fixture, { recursive: true, force: true });
	}
}

test('loads the named locales export and checks every language by default', () => {
	const result = runVerifier({
		'ja-JP': { greeting: 'こんにちは {name}' },
		'en-US': { greeting: 'Hello {name}' },
		'zh-CN': { greeting: '你好' },
	});
	assert.equal(result.status, 1);
	assert.deepEqual(result.errors, [{ type: 'missing_parameter', lang: 'zh-CN', tree: 'greeting', data: { parameter: 'name' } }]);
});

test('reports missing and unexpected parameters in nested translations', () => {
	const result = runVerifier({
		'ja-JP': { greeting: { text: '{name}' } },
		'en-US': { greeting: { text: '{user}' } },
	});
	assert.equal(result.status, 1);
	assert.deepEqual(result.errors, [
		{ type: 'missing_parameter', lang: 'en-US', tree: 'greeting.text', data: { parameter: 'name' } },
		{ type: 'unexpected_parameter', lang: 'en-US', tree: 'greeting.text', data: { parameter: 'user' } },
	]);
});

test('rejects parameters added to text that has none in the source locale', () => {
	const result = runVerifier({
		'ja-JP': { greeting: 'こんにちは' },
		'en-US': { greeting: 'Hello {name}' },
	});
	assert.equal(result.status, 1);
	assert.deepEqual(result.errors, [{ type: 'unexpected_parameter', lang: 'en-US', tree: 'greeting', data: { parameter: 'name' } }]);
});

test('allows fallback text and repeated or reordered parameters', () => {
	const result = runVerifier({
		'ja-JP': { missing: '{fallback}', nested: { missing: '{fallback}', text: '{first} {last}' } },
		'en-US': { missing: '{fallback}', nested: { missing: '{fallback}', text: '{last} {first} {first}' } },
		'zh-CN': { missing: '{fallback}', nested: { missing: '{fallback}', text: '{first} {last}' } },
	});
	assert.equal(result.status, 0);
	assert.deepEqual(result.errors, []);
});

test('rejects keys still missing after applying the fallback chain', () => {
	const result = runVerifier({
		'ja-JP': { nested: { text: '{name}' } },
		'zh-CN': { nested: {} },
	}, ['zh-CN']);
	assert.equal(result.status, 1);
	assert.deepEqual(result.errors, [{ type: 'missing_key', lang: 'zh-CN', tree: 'nested.text', data: {} }]);
});

test('reports structural mismatches instead of skipping nested translations', () => {
	const result = runVerifier({
		'ja-JP': { nested: { text: '{name}' }, text: '{name}' },
		'en-US': { nested: '{name}', text: { nested: '{name}' } },
	});
	assert.equal(result.status, 1);
	assert.deepEqual(result.errors, [
		{ type: 'mismatched_type', lang: 'en-US', tree: 'nested', data: { expected: 'object', actual: 'string' } },
		{ type: 'mismatched_type', lang: 'en-US', tree: 'text', data: { expected: 'string', actual: 'object' } },
	]);
});

test('checks only explicitly requested languages', () => {
	const result = runVerifier({
		'ja-JP': { greeting: '{name}' },
		'en-US': { greeting: 'Hello {name}' },
		'zh-CN': { greeting: '你好' },
	}, ['en-US']);
	assert.equal(result.status, 0);
	assert.deepEqual(result.errors, []);
});

test('rejects unknown requested languages instead of silently doing no checks', () => {
	const result = runVerifier({ 'ja-JP': { greeting: '{name}' } }, ['en-XX']);
	assert.equal(result.status, 1);
	assert.deepEqual(result.errors, [{ type: 'unknown_language', lang: 'en-XX', tree: '', data: {} }]);
});
