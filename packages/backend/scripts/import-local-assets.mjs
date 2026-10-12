/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 把本地素材目录中的自定义表情和头像框导入本机实例，已存在的同名素材会跳过。
// 用法：pnpm --filter backend import:assets -- --emojis=D:/表情 --decorations=D:/头像装饰
// 表情目录需包含 meta.json（Misskey 表情导出格式），头像框目录需包含 manifest.json。

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const pg = require('pg');

const args = Object.fromEntries(process.argv.slice(2).filter(arg => arg.startsWith('--')).map(arg => {
	const [key, ...value] = arg.slice(2).split('=');
	return [key, value.join('=')];
}));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const config = yaml.load(readFileSync(resolve(root, '.config/default.yml'), 'utf8'));
const baseUrl = String(config.url).replace(/\/$/, '');

if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(baseUrl).hostname)) {
	console.error(`拒绝运行：${baseUrl} 不是本机地址。`);
	process.exit(1);
}
if (!args.emojis && !args.decorations) {
	console.error('请至少指定 --emojis=<目录> 或 --decorations=<目录>。');
	process.exit(1);
}

const MIME = { '.png': 'image/png', '.apng': 'image/apng', '.gif': 'image/gif', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.avif': 'image/avif' };
const stats = { added: 0, skipped: 0, failed: 0 };

async function api(endpoint, params, token) {
	const res = await fetch(`${baseUrl}/api/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...params, i: token }) });
	const text = await res.text();
	const body = text ? JSON.parse(text) : null;
	if (!res.ok) throw new Error(`${endpoint} ${res.status} ${body?.error?.code ?? ''}`);
	return body;
}

async function upload(token, path, name, folderId) {
	const form = new FormData();
	form.append('i', token);
	form.append('name', name);
	if (folderId) form.append('folderId', folderId);
	form.append('file', new Blob([readFileSync(path)], { type: MIME[extname(path).toLowerCase()] ?? 'application/octet-stream' }), name);
	const res = await fetch(`${baseUrl}/api/drive/files/create`, { method: 'POST', body: form });
	const body = await res.json();
	if (!res.ok) throw new Error(`drive/files/create ${res.status} ${body?.error?.code ?? ''}`);
	return body;
}

async function folder(token, name) {
	const found = await api('drive/folders/find', { name, parentId: null }, token);
	return found[0] ?? await api('drive/folders/create', { name }, token);
}

// 控制并发，避免大批量上传压垮本地开发服务器。
async function runPool(items, size, worker) {
	let index = 0;
	await Promise.all(Array.from({ length: size }, async () => {
		while (index < items.length) {
			const item = items[index++];
			await worker(item);
		}
	}));
}

async function importEmojis(db, token, dir) {
	const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
	const existing = new Set((await db.query('select name from emoji where host is null')).rows.map(row => row.name));
	const items = meta.emojis.filter(item => item.downloaded !== false && !existing.has(item.emoji.name));
	stats.skipped += meta.emojis.length - items.length;
	console.log(`• 表情：共 ${meta.emojis.length} 个，待导入 ${items.length} 个`);
	const target = await folder(token, '自定义表情');
	await runPool(items, 4, async ({ fileName, emoji }) => {
		try {
			const file = await upload(token, join(dir, fileName), fileName, target.id);
			await api('admin/emoji/add', {
				name: emoji.name, fileId: file.id, category: emoji.category ?? null, aliases: emoji.aliases ?? [],
				license: emoji.license ?? null, isSensitive: emoji.isSensitive ?? false, localOnly: emoji.localOnly ?? false,
			}, token);
			stats.added++;
		} catch (error) {
			stats.failed++;
			console.warn(`  ✗ ${emoji.name}: ${error.message}`);
		}
	});
}

// 源数据没有分类，按名称中的系列名归类，便于在头像框列表中查找。
function decorationCategory(name) {
	const series = name.replace(/^key-/, '').replace(/[-\s]*\d+$/, '');
	if (/^kook$/i.test(series)) return 'KOOK';
	if (series.startsWith('霸王色')) return '霸王色';
	return { 环: '光环', 脸: '表情', 喵: '猫咪', 穿戴: '穿戴', 头顶: '头顶', 彩虹: '彩虹', 剑: '武器', 手脚: '手脚', 旋律: '音符' }[series] ?? '其他';
}

async function importDecorations(db, token, dir) {
	const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')).filter(item => item.downloaded !== false && !item.error);
	const counts = new Map();
	for (const item of manifest) counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
	// 源数据中有同名头像框，追加来源 ID 区分，重跑时也能按名称识别已导入的项目。
	const items = manifest.map(item => ({ ...item, importName: counts.get(item.name) > 1 ? `${item.name}（${item.id}）` : item.name }));
	const existing = new Set((await db.query('select name from avatar_decoration')).rows.map(row => row.name));
	const pending = items.filter(item => !existing.has(item.importName));
	stats.skipped += items.length - pending.length;
	console.log(`• 头像框：共 ${items.length} 个，待导入 ${pending.length} 个`);
	const target = await folder(token, '头像框');
	await runPool(pending, 4, async (item) => {
		try {
			const file = await upload(token, join(dir, item.fileName), item.fileName, target.id);
			await api('admin/avatar-decorations/create', {
				name: item.importName, description: item.description ?? '', url: file.url, category: decorationCategory(item.name),
				roleIdsThatCanBeUsedThisDecoration: [],
			}, token);
			stats.added++;
		} catch (error) {
			stats.failed++;
			console.warn(`  ✗ ${item.importName}: ${error.message}`);
		}
	});
}

const db = new pg.Client({ host: config.db.host, port: config.db.port, database: config.db.db, user: config.db.user, password: config.db.pass });
await db.connect();
try {
	const admin = (await db.query('select u.token from "user" u join meta m on m."rootUserId" = u.id limit 1')).rows[0];
	if (!admin?.token) throw new Error('未找到管理员账号，请先完成实例初始化。');
	await fetch(`${baseUrl}/api/meta`, { method: 'POST' }).catch(() => {
		throw new Error(`无法连接 ${baseUrl}，请先运行 pnpm dev。`);
	});
	if (args.emojis) await importEmojis(db, admin.token, args.emojis);
	if (args.decorations) await importDecorations(db, admin.token, args.decorations);
	console.log(`\n完成：导入 ${stats.added}，跳过 ${stats.skipped}，失败 ${stats.failed}`);
} finally {
	await db.end();
}
