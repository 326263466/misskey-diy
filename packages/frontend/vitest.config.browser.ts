/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pluginVue from '@vitejs/plugin-vue';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import pluginJson5 from './lib/vite-plugin-json5.js';

export default defineConfig({
	plugins: [pluginVue(), pluginJson5(), {
		name: 'browser-test-emoji-assets',
		configureServer(server) {
			server.middlewares.use(async (request, response, next) => {
				const match = /^\/(twemoji|fluent-emoji)\/([0-9a-f-]+\.(svg|png))$/.exec(request.url ?? '');
				if (!match) return next();
				try {
					const asset = await readFile(new URL(`./node_modules/@misskey-dev/emoji-assets/built/${match[1]}/${match[2]}`, import.meta.url));
					response.setHeader('Content-Type', match[3] === 'svg' ? 'image/svg+xml' : 'image/png');
					response.end(asset);
				} catch {
					response.statusCode = 404;
					response.end();
				}
			});
		},
	}],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)).replaceAll('\\', '/'),
			'@@': fileURLToPath(new URL('../frontend-shared', import.meta.url)).replaceAll('\\', '/'),
			'/client-assets': fileURLToPath(new URL('./assets', import.meta.url)).replaceAll('\\', '/'),
		},
	},
	optimizeDeps: { noDiscovery: true, include: ['vue', 'qr-code-styling'] },
	test: {
		include: ['./test/browser/**/*.test.ts'],
		attachmentsDir: './test/e2e/artifacts/component-browser/attachments',
		browser: {
			enabled: true,
			headless: true,
			viewport: { width: 900, height: 700 },
			provider: playwright({
				contextOptions: { reducedMotion: process.env.VITEST_REDUCED_MOTION === 'reduce' ? 'reduce' : 'no-preference' },
				launchOptions: process.env.VITEST_BROWSER_CHANNEL ? { channel: process.env.VITEST_BROWSER_CHANNEL } : undefined,
			}),
			instances: [{ browser: 'chromium' }],
			screenshotDirectory: './test/e2e/artifacts/component-browser',
		},
	},
});
