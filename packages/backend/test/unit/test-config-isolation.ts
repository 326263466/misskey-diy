/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ legacy: false, testConfig: true, database: 'test-isolated', reads: [] as string[] }));
vi.mock('node:fs', async importOriginal => {
	const actual = await importOriginal<typeof import('node:fs')>();
	return {
		...actual,
		existsSync: (path: string) => {
			if (path.endsWith('._config_.json')) return fixture.legacy;
			if (path.endsWith('.config.test.json')) return fixture.testConfig;
			return actual.existsSync(path);
		},
		readFileSync: (path: string, ...args: unknown[]) => {
			if (!path.includes('misskey-config-isolation-') && (path.endsWith('.config.test.json') || path.endsWith('._config_.json') || path.endsWith('.config.json'))) {
				fixture.reads.push(path);
				return JSON.stringify({ url: 'http://localhost:61812', db: { db: path.endsWith('.config.json') ? 'development' : fixture.database }, redis: {} });
			}
			return Reflect.apply(actual.readFileSync, actual, [path, ...args]);
		},
	};
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
	fixture.legacy = false;
	fixture.testConfig = true;
	fixture.database = 'test-isolated';
	fixture.reads = [];
});

describe('test configuration isolation', () => {
	test('test runtime never reads the development configuration', async () => {
		vi.stubEnv('NODE_ENV', 'test');
		const { loadConfig } = await import('@/config.js');
		expect(loadConfig().db.db).toBe('test-isolated');
		expect(fixture.reads.every(path => path.endsWith('.config.test.json'))).toBe(true);
	});

	test('missing test configuration fails closed instead of falling back to development', async () => {
		vi.stubEnv('NODE_ENV', 'test');
		fixture.testConfig = false;
		const { loadConfig } = await import('@/config.js');
		expect(() => loadConfig()).toThrow('Compiled configuration file not found');
		expect(fixture.reads).toEqual([]);
	});

	test('legacy federation configuration retains precedence', async () => {
		vi.stubEnv('NODE_ENV', 'test');
		fixture.legacy = true;
		const { loadConfig } = await import('@/config.js');
		expect(loadConfig().db.db).toBe('test-isolated');
		expect(fixture.reads.every(path => path.endsWith('._config_.json'))).toBe(true);
	});

	test('ordinary runtime retains its existing configuration path', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const { loadConfig } = await import('@/config.js');
		expect(loadConfig().db.db).toBe('development');
	});

	test.each(['misskey', 'latest'])('database reset refuses %s before opening a connection', async database => {
		vi.stubEnv('NODE_ENV', 'test');
		fixture.database = database;
		const { initTestDb } = await import('../utils.js');
		await expect(initTestDb()).rejects.toThrow('not explicitly named for testing');
	});

	test('SDK and test compilers write separate files even when run one after another', () => {
		const root = mkdtempSync(join(tmpdir(), 'misskey-config-isolation-'));
		try {
			const scripts = join(root, 'packages/backend/scripts');
			mkdirSync(scripts, { recursive: true });
			mkdirSync(join(root, '.config'));
			copyFileSync(resolve('scripts/compile_config.js'), join(scripts, 'compile_config.mjs'));
			symlinkSync(resolve('../../node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
			writeFileSync(join(root, '.config/test.yml'), 'db:\n  db: test-isolated\n');
			writeFileSync(join(root, '.config/default.yml'), 'db:\n  db: development\n');
			const run = (mode: string) => execFileSync(process.execPath, [join(scripts, 'compile_config.mjs')], {
				env: { ...process.env, NODE_ENV: mode, MISSKEY_CONFIG_YML: '' }, stdio: 'pipe',
			});
			run('test');
			const isolated = readFileSync(join(root, 'built/.config.test.json'), 'utf8');
			run('production');
			expect(readFileSync(join(root, 'built/.config.test.json'), 'utf8')).toBe(isolated);
			expect(JSON.parse(readFileSync(join(root, 'built/.config.json'), 'utf8')).db.db).toBe('development');
		} finally {
			// root 由 mkdtemp 创建并保存在固定变量中，删除范围不经过用户输入。
			rmSync(root, { recursive: true, force: true });
		}
	});
});
