/*
 * SPDX-FileCopyrightText: Project contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../../packages/frontend/node_modules/playwright/index.mjs';

const sourceDir = new URL('.', import.meta.url);
const outputDir = new URL('../', sourceDir);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
	viewport: { width: 1600, height: 1600 },
	deviceScaleFactor: 1,
});

await page.goto(`file://${fileURLToPath(new URL('./posters.html', sourceDir)).replaceAll('\\', '/')}`, {
	waitUntil: 'load',
});
await page.evaluate(async () => {
	await document.fonts.ready;
	await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
});
await page.waitForTimeout(800);

const posters = [
	['cover', '01-cover.png'],
	['timeline', '02-timeline.png'],
	['features', '03-features.png'],
	['journey', '04-operation-loop.png'],
	['delivery', '05-delivery.png'],
];

for (const [id, filename] of posters) {
	await page.locator(`#${id}`).screenshot({
		path: fileURLToPath(new URL(`./${filename}`, outputDir)),
		animations: 'disabled',
	});
}

await browser.close();
