/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { promises as fsp } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const webfontDirectory = path.dirname(require.resolve('@tabler/icons-webfont/package.json'));
const requireWebfont = createRequire(path.join(webfontDirectory, 'package.json'));
const svgDirectory = path.dirname(path.dirname(requireWebfont.resolve('@tabler/icons/outline/heart.svg')));

export async function generateIconCss(): Promise<string> {
	// 使用同版本官方类名映射，包括别名；浏览器只接收 SVG，不加载字体。
	const css = await fsp.readFile(path.join(webfontDirectory, 'dist/tabler-icons.min.css'), 'utf-8');
	const aliases = new Map<string, string[]>();
	for (const match of css.matchAll(/\.(ti-[a-z0-9-]+)::?before\s*{\s*content:\s*["']\\([a-fA-F0-9]+)["'];?\s*}/g)) {
		const names = aliases.get(match[2]) ?? [];
		names.push(match[1]);
		aliases.set(match[2], names);
	}
	if (aliases.size === 0) throw new Error('Tabler icon class mapping is unavailable');

	const icons = new Map<string, string>();
	for (const style of ['outline', 'filled']) {
		for (const file of await fsp.readdir(path.join(svgDirectory, style))) {
			if (file.endsWith('.svg')) icons.set(`ti-${file.slice(0, -4)}${style === 'filled' ? '-filled' : ''}`, path.join(svgDirectory, style, file));
		}
	}
	const rules = await Promise.all([...aliases.values()].map(async names => {
		const name = names.find(candidate => icons.has(candidate));
		if (!name) throw new Error(`Tabler SVG is missing for ${names.join(', ')}`);
		const svg = await fsp.readFile(icons.get(name)!, 'utf-8');
		const image = encodeURIComponent(svg.replace(/\sclass="[^"]*"/, '').replace(/\s+/g, ' ').trim());
		return `${names.map(icon => `.${icon}::before`).join(',')} { background-color: currentColor; mask-image: url("data:image/svg+xml,${image}"); }`;
	}));
	return `/*! Tabler Icons 3.35.0 | MIT | https://github.com/tabler/tabler-icons/blob/master/LICENSE */\n${rules.join('\n')}\n`;
}

async function main() {
	const start = performance.now();
	const css = await generateIconCss();
	const packageDirectory = fileURLToPath(new URL('../', import.meta.url));
	const builtDirectory = path.resolve(packageDirectory, 'built');
	if (path.dirname(builtDirectory) !== path.resolve(packageDirectory)) throw new Error('Invalid icon output directory');
	await fsp.rm(builtDirectory, { recursive: true, force: true });
	await fsp.mkdir(builtDirectory);
	await fsp.writeFile(path.join(builtDirectory, 'tabler-icons.css'), css);
	console.log(`Generated Tabler SVG masks in ${Math.round(performance.now() - start)}ms`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch(error => { console.error(error); process.exit(1); });
}
