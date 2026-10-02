/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';

const manifests = vi.hoisted(() => ({ main: true, embed: true }));

vi.mock('node:fs', () => ({
	existsSync: (path: string) => {
		const normalized = path.replaceAll('\\', '/');
		if (normalized.endsWith('_frontend_vite_/manifest.json')) return manifests.main;
		if (normalized.endsWith('_frontend_embed_vite_/manifest.json')) return manifests.embed;
		return true;
	},
	readFileSync: (path: string) => JSON.stringify(path.endsWith('meta.json')
		? { version: 'test' }
		: { url: 'http://localhost:3000', db: {}, redis: {} }),
}));

afterEach(() => vi.unstubAllEnvs());

describe('frontend asset mode', () => {
	test.each([
		[false, false], [true, false], [false, true], [true, true],
	])('keeps development on Vite with main=%s and embed=%s manifests', (main, embed) => {
		vi.stubEnv('NODE_ENV', 'development');
		Object.assign(manifests, { main, embed });
		expect(loadConfig()).toMatchObject({ frontendManifestExists: false, frontendEmbedManifestExists: false });
	});

	test.each([
		[false, false], [true, false], [false, true], [true, true],
	])('detects production manifests independently with main=%s and embed=%s', (main, embed) => {
		vi.stubEnv('NODE_ENV', 'production');
		Object.assign(manifests, { main, embed });
		expect(loadConfig()).toMatchObject({ frontendManifestExists: main, frontendEmbedManifestExists: embed });
	});
});
