/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.resolve(scriptDir, '..');

const targetDirs = [
	'packages/frontend/src',
	'packages/frontend-embed/src',
	'packages/frontend-shared/themes',
];

// 分割线变量只允许在这两个文件里定义。
const definitionFiles = new Set([
	'packages/frontend/src/style.scss',
	'packages/frontend-embed/src/style.scss',
]);

const extensions = new Set(['.vue', '.ts', '.js', '.scss', '.css', '.json5']);
const exemptMarker = 'divider-exempt:';

function toPosixPath(filePath) {
	return filePath.split(path.sep).join('/');
}

/**
 * 检查单个文件的内容，返回违规列表。
 * 规则：
 * 1. 不得直接使用 var(--MI_THEME-divider)，应使用 var(--MI-divider) / var(--MI-dividerColor) / var(--MI-dividerWidth)。
 * 2. 不得在定义文件之外重新定义 --MI-divider / --MI-dividerColor / --MI-dividerWidth。
 * 3. 使用 var(--MI-dividerColor) 的声明里不得写死线宽，应使用 var(--MI-dividerWidth)。
 * 非分割线用途（控件描边、线程连接线等）在同一行加 `divider-exempt: <原因>` 注释豁免。
 */
export function checkDividerStyle(relativePath, content) {
	const isDefinitionFile = definitionFiles.has(relativePath);
	const errors = [];
	const lines = content.split(/\r?\n/);

	lines.forEach((line, index) => {
		const trimmed = line.trim();
		if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;
		if (line.includes(exemptMarker)) return;

		const report = (message) => errors.push({ file: relativePath, line: index + 1, message, source: trimmed });

		if (/--MI-divider(Width|Color)?\s*:/.test(line) && !isDefinitionFile) {
			report('不得在组件内重新定义分割线变量');
			return;
		}

		if (line.includes('var(--MI_THEME-divider)') && !(isDefinitionFile && /--MI-dividerColor\s*:/.test(line))) {
			report('直接使用了 var(--MI_THEME-divider)，请改用 var(--MI-divider) / var(--MI-dividerColor)');
			return;
		}

		for (const declaration of line.split(';')) {
			if (!declaration.includes('var(--MI-dividerColor)')) continue;
			const withoutVars = declaration.replace(/var\([^()]*(\([^()]*\))?[^()]*\)/g, '');
			if (/(^|[\s:(,-])\d*\.?\d+(px|em|rem)\b/.test(withoutVars)) {
				report('分割线声明写死了线宽，请改用 var(--MI-dividerWidth) 或 var(--MI-divider)');
				break;
			}
		}
	});

	return errors;
}

function* walk(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name === 'built') continue;
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(fullPath);
		else if (extensions.has(path.extname(entry.name))) yield fullPath;
	}
}

export function checkRepository(rootDir = defaultRootDir) {
	const errors = [];
	for (const dir of targetDirs) {
		const absoluteDir = path.join(rootDir, dir);
		if (!fs.existsSync(absoluteDir)) continue;
		for (const file of walk(absoluteDir)) {
			const relativePath = toPosixPath(path.relative(rootDir, file));
			errors.push(...checkDividerStyle(relativePath, fs.readFileSync(file, 'utf-8')));
		}
	}
	return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const errors = checkRepository();
	if (errors.length > 0) {
		for (const error of errors) {
			console.error(`${error.file}:${error.line}: ${error.message}\n    ${error.source}`);
		}
		console.error(`\n${errors.length} 处分割线样式不符合全局规范。分割线颜色和粗细只在 style.scss 的 --MI-divider* 变量中定义。`);
		process.exit(1);
	}
	console.log('Divider style check passed.');
}
