/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 为本地开发环境写入覆盖各功能的演示数据。全部经由 API 写入，以执行与真实操作相同的业务校验。
// 用法：先启动 `pnpm dev`，再运行 `pnpm --filter backend seed:demo`；加 `--force` 可重跑已完成的部分。
// 自定义表情和头像框来自本地素材，需先运行 `pnpm --filter backend import:assets`，见 import-local-assets.mjs。

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const pg = require('pg');
const bcrypt = require('bcryptjs');

const PASSWORD = '66666666';
const MARKER_SCOPE = ['seedDemo'];
const force = process.argv.includes('--force');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const config = yaml.load(readFileSync(resolve(root, '.config/default.yml'), 'utf8'));
const baseUrl = String(config.url).replace(/\/$/, '');

// 只允许写入本机实例，避免误把演示账号和固定密码写进线上环境。
const { hostname } = new URL(baseUrl);
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) {
	console.error(`拒绝运行：${baseUrl} 不是本机地址。`);
	process.exit(1);
}

const stats = { ok: 0, skipped: 0, failed: 0 };

class ApiError extends Error {
	constructor(endpoint, status, body) {
		super(`${endpoint} ${status} ${body?.error?.code ?? ''} ${body?.error?.message ?? ''}`.trim());
		this.code = body?.error?.code;
	}
}

async function api(endpoint, params = {}, token) {
	const res = await fetch(`${baseUrl}/api/${endpoint}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(token ? { ...params, i: token } : params),
	});
	const text = await res.text();
	const body = text ? JSON.parse(text) : null;
	if (!res.ok) throw new ApiError(endpoint, res.status, body);
	return body;
}

// 单个步骤失败只记录，不中断其余数据的写入。
async function step(label, fn) {
	try {
		const result = await fn();
		stats.ok++;
		return result;
	} catch (error) {
		stats.failed++;
		console.warn(`  ✗ ${label}: ${error.message}`);
		return null;
	}
}

// 由固定字符串生成 UUID，重跑时资金类接口按幂等键返回原结果，不会重复扣款。
function requestId(key) {
	const hex = createHash('sha256').update(`seed-demo:${key}`).digest('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(8 + (parseInt(hex[16], 16) % 4)).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc32(buffer) {
	let c = 0xffffffff;
	for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([length, body, crc]);
}

function hexToRgb(hex) {
	const value = parseInt(hex.replace('#', ''), 16);
	return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

// 生成渐变配斜纹的 PNG，用作头像、横幅、封面和商品图，无需额外依赖。
function makePng(width, height, from, to) {
	const [r1, g1, b1] = hexToRgb(from);
	const [r2, g2, b2] = hexToRgb(to);
	const raw = Buffer.alloc((width * 3 + 1) * height);
	for (let y = 0; y < height; y++) {
		const row = y * (width * 3 + 1);
		raw[row] = 0;
		for (let x = 0; x < width; x++) {
			const t = (x / width + y / height) / 2;
			const stripe = Math.floor((x + y) / 24) % 2 === 0 ? 1 : 0.92;
			const offset = row + 1 + x * 3;
			raw[offset] = Math.round((r1 + (r2 - r1) * t) * stripe);
			raw[offset + 1] = Math.round((g1 + (g2 - g1) * t) * stripe);
			raw[offset + 2] = Math.round((b1 + (b2 - b1) * t) * stripe);
		}
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header.set([8, 2, 0, 0, 0], 8);
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		pngChunk('IHDR', header),
		pngChunk('IDAT', deflateSync(raw)),
		pngChunk('IEND', Buffer.alloc(0)),
	]);
}

async function upload(token, name, png) {
	const form = new FormData();
	form.append('i', token);
	form.append('name', name);
	form.append('file', new Blob([png], { type: 'image/png' }), name);
	const res = await fetch(`${baseUrl}/api/drive/files/create`, { method: 'POST', body: form });
	const body = await res.json();
	if (!res.ok) throw new ApiError('drive/files/create', res.status, body);
	return body;
}

function daysAgo(days) {
	const date = new Date(Date.now() - days * 86400000);
	return date.toISOString().slice(0, 10);
}

const ACCOUNTS = [
	{ key: 'main', username: '66666666', name: '测试账号', colors: ['#3b82f6', '#22d3ee'], location: '杭州', description: '用于体验全部功能的测试账号，密码同用户名。\n喜欢摄影、读书和折腾前端。' },
	{ key: 'writer', username: 'demo_writer', name: '林溪 · 写作者', colors: ['#f97316', '#facc15'], location: '成都', description: '写长文，也写短句。关注效率工具、写作方法和城市漫游。' },
	{ key: 'dev', username: 'demo_dev', name: '周一 · 前端开发', colors: ['#10b981', '#3b82f6'], location: '深圳', description: 'Vue / TypeScript 开发者，偶尔分享踩坑记录。' },
	{ key: 'designer', username: 'demo_designer', name: '阿梨 · 视觉设计', colors: ['#ec4899', '#8b5cf6'], location: '上海', description: '做界面和插画，喜欢一切有秩序感的东西。' },
	{ key: 'mod', username: 'demo_mod', name: '老陈 · 社区管理员', colors: ['#64748b', '#0ea5e9'], location: '北京', description: '负责社区治理与反馈处理，有问题欢迎私信。' },
	{ key: 'newbie', username: 'demo_newbie', name: '小满 · 新人', colors: ['#84cc16', '#14b8a6'], location: '广州', description: '刚来报到，请多指教。' },
	{ key: 'private', username: 'demo_private', name: '晚星 · 私密账号', colors: ['#1e293b', '#a855f7'], location: '南京', description: '关注需要我同意，用于测试关注申请。' },
	{ key: 'seller', username: 'shop_demo_seller', existing: true },
	{ key: 'buyer', username: 'shop_demo_buyer', existing: true },
];

async function openDatabase() {
	const client = new pg.Client({ host: config.db.host, port: config.db.port, database: config.db.db, user: config.db.user, password: config.db.pass });
	await client.connect();
	return client;
}

async function prepareAccounts(db) {
	const meta = await db.query('select "rootUserId" from meta limit 1');
	const rootUserId = meta.rows[0]?.rootUserId;
	if (!rootUserId) throw new Error('实例尚未初始化管理员账号，请先在浏览器中完成初始设置。');
	// 管理员账号保留原密码，只读取其令牌调用管理接口。
	const admin = (await db.query('select id, username, token from "user" where id = $1', [rootUserId])).rows[0];
	const accounts = { admin: { id: admin.id, username: admin.username, token: admin.token } };

	for (const account of ACCOUNTS) {
		const found = (await db.query('select id, token from "user" where "usernameLower" = $1 and host is null', [account.username.toLowerCase()])).rows[0];
		if (found) {
			// 已存在的演示账号统一改为演示密码，便于直接登录。
			const hash = await bcrypt.hash(PASSWORD, await bcrypt.genSalt(8));
			await db.query('update user_profile set password = $1 where "userId" = $2', [hash, found.id]);
			accounts[account.key] = { ...account, id: found.id, token: found.token };
			stats.skipped++;
			continue;
		}
		if (account.existing) {
			console.warn(`  - 未找到 ${account.username}，跳过`);
			continue;
		}
		const created = await api('admin/accounts/create', { username: account.username, password: PASSWORD }, admin.token).catch(async (error) => {
			// 账号已写入但返回资料时出错的情况下，直接使用库里的账号。
			const saved = (await db.query('select id, token from "user" where "usernameLower" = $1 and host is null', [account.username.toLowerCase()])).rows[0];
			if (!saved) throw error;
			console.warn(`  ! ${account.username} 创建接口报错（${error.message}），账号已存在，继续使用`);
			return saved;
		});
		accounts[account.key] = { ...account, id: created.id, token: created.token };
		stats.ok++;
		console.log(`  + 创建账号 ${account.username}`);
	}
	return accounts;
}

// 已完成的分组记录在管理员的注册表里，重跑时跳过，避免重复发帖。
async function runSection(accounts, name, fn) {
	const key = `section_${name}`;
	if (!force) {
		const done = await api('i/registry/get', { key, scope: MARKER_SCOPE }, accounts.admin.token).catch(() => null);
		if (done) {
			console.log(`• ${name}：已写入过，跳过（--force 可重跑）`);
			stats.skipped++;
			return;
		}
	}
	console.log(`• ${name}`);
	await fn();
	await api('i/registry/set', { key, value: new Date().toISOString(), scope: MARKER_SCOPE }, accounts.admin.token);
}

// 重跑或数据已存在时这些错误视为已完成。
const ALREADY = new Set(['ALREADY_FOLLOWING', 'ALREADY_REACTED', 'ALREADY_FAVORITED', 'ALREADY_LIKED', 'ALREADY_CLIPPED', 'ALREADY_ADDED', 'ALREADY_VOTED', 'ALREADY_ASSIGNED', 'ALREADY_CLAIMED', 'ALREADY_CHECKED_IN', 'ALREADY_EXISTS', 'NAME_ALREADY_EXISTS', 'ALREADY_PROMOTED', 'ALREADY_MEMBER', 'ALREADY_JOINED']);

async function act(label, fn) {
	try {
		const result = await fn();
		stats.ok++;
		return result;
	} catch (error) {
		if (error instanceof ApiError && (ALREADY.has(error.code) || /^ALREADY_/.test(error.code ?? ''))) {
			stats.skipped++;
			return null;
		}
		stats.failed++;
		console.warn(`  ✗ ${label}: ${error.message}`);
		return null;
	}
}

const demoKeys = ['main', 'writer', 'dev', 'designer', 'mod', 'newbie', 'seller', 'buyer'];

async function seedProfiles(a) {
	for (const key of demoKeys) {
		const user = a[key];
		if (!user) continue;
		const profile = { chatScope: 'everyone' };
		if (!user.existing) {
			const avatar = await step(`${key} 头像`, () => upload(user.token, `${user.username}-avatar.png`, makePng(256, 256, user.colors[0], user.colors[1])));
			const banner = await step(`${key} 横幅`, () => upload(user.token, `${user.username}-banner.png`, makePng(960, 320, user.colors[1], user.colors[0])));
			Object.assign(profile, {
				name: user.name, description: user.description, location: user.location,
				avatarId: avatar?.id ?? undefined, bannerId: banner?.id ?? undefined,
				fields: [{ name: '所在城市', value: user.location }, { name: '兴趣', value: user.description.split(/[。，\n]/)[0] }],
			});
		}
		await step(`${key} 资料`, () => api('i/update', profile, user.token));
	}
}

async function seedFollows(a) {
	const users = demoKeys.map(key => a[key]).filter(Boolean);
	for (const follower of users) {
		for (const followee of [...users, a.admin]) {
			if (follower.id === followee.id) continue;
			await act(`${follower.username} 关注 ${followee.username}`, () => api('following/create', { userId: followee.id }, follower.token));
		}
	}
	for (const key of ['main', 'writer', 'mod']) await act(`管理员关注 ${key}`, () => api('following/create', { userId: a[key].id }, a.admin.token));
}

async function seedRoles(a, db) {
	const existing = (await db.query('select id from role where name = $1', ['【演示】社区管理员'])).rows[0];
	const role = existing ?? await step('创建管理员角色', () => api('admin/roles/create', {
		name: '【演示】社区管理员', description: '演示用社区管理员角色，可处理举报和反馈。', color: '#0ea5e9', iconUrl: null,
		target: 'manual', condFormula: {}, isPublic: true, isModerator: true, isAdministrator: false, asBadge: true,
		canEditMembersByModerator: false, displayOrder: 10, policies: {},
	}, a.admin.token));
	if (role) await act('分配管理员角色', () => api('admin/roles/assign', { roleId: role.id, userId: a.mod.id }, a.admin.token));
	const creator = (await db.query('select id from role where name = $1', ['【演示】普通创作者'])).rows[0];
	if (creator) for (const key of ['writer', 'designer']) await act(`分配创作者角色 ${key}`, () => api('admin/roles/assign', { roleId: creator.id, userId: a[key].id }, a.admin.token));
	for (const name of ['技术', '生活', '开发', '前端', '设计', '随笔', '开源', '效率', 'vue', 'typescript']) {
		await act(`文章标签 ${name}`, () => api('admin/article-tags/update', { action: 'create', name }, a.admin.token));
	}
}

async function seedChannels(a) {
	const channels = [
		{ owner: 'dev', name: '【演示】前端技术', description: '讨论 Vue、TypeScript、构建工具与性能优化。', color: '#10b981' },
		{ owner: 'designer', name: '【演示】设计灵感', description: '分享界面、插画、配色和排版灵感。', color: '#ec4899' },
		{ owner: 'mod', name: '【演示】新人报到', description: '新人自我介绍、使用问题都可以在这里问。', color: '#f59e0b' },
	];
	for (const channel of channels) {
		const owner = a[channel.owner];
		const banner = await step(`${channel.name} 横幅`, () => upload(owner.token, `${channel.owner}-channel.png`, makePng(960, 320, channel.color, '#1e293b')));
		const created = await step(`频道 ${channel.name}`, () => api('channels/create', { name: channel.name, description: channel.description, color: channel.color, bannerId: banner?.id ?? null }, owner.token));
		if (!created) continue;
		for (const key of demoKeys) {
			if (key === channel.owner || !a[key]) continue;
			await act('关注频道', () => api('channels/follow', { channelId: created.id }, a[key].token));
		}
		await act('收藏频道', () => api('channels/favorite', { channelId: created.id }, a.main.token));
	}
}

async function post(a, key, params) {
	const res = await step(`${key} 发帖`, () => api('notes/create', params, a[key].token));
	return res?.createdNote ?? null;
}

async function seedNotes(a, db) {
	const channelIds = Object.fromEntries((await db.query('select id, name from channel where name like $1', ['【演示】%'])).rows.map(row => [row.name, row.id]));
	const n = {};
	n.hello = await post(a, 'main', { text: '大家好，我是测试账号 👋\n这个账号用来体验全部功能：发帖、文章、聊天、钱包、集市、签到都可以试试。 #新人报到 #简直了' });
	n.poll = await post(a, 'main', { text: '周末大家一般怎么安排？ #周末', poll: { choices: ['宅家看书', '出门徒步', '写代码', '和朋友聚餐'], multiple: false, expiredAfter: 7 * 86400000 } });
	n.photo = await post(a, 'main', { text: '今天的晚霞很好看，随手拍一张。#摄影 #日常' });
	n.writer1 = await post(a, 'writer', { text: '写作最难的不是开头，而是删掉自己很喜欢但没用的段落。\n\n最近在练习“一段只讲一件事”。#写作 #效率' });
	n.writer2 = await post(a, 'writer', { text: '推荐一个记笔记的小习惯：每天睡前花五分钟，写下今天最有收获的一件事。坚持一个月会很有感觉。#效率 #生活' });
	n.dev1 = await post(a, 'dev', { text: 'Vue 3.5 的 useTemplateRef 真香，再也不用和同名 ref 打架了。\n\n```ts\nconst input = useTemplateRef<HTMLInputElement>(\'input\');\nonMounted(() => input.value?.focus());\n```\n#vue #前端', channelId: channelIds['【演示】前端技术'] });
	n.dev2 = await post(a, 'dev', { text: '踩坑记录：CSS 的 `overflow: clip` 不会创建滚动容器，所以 `position: sticky` 在里面依然能吸顶。#css #前端' });
	n.design1 = await post(a, 'designer', { text: '配色小技巧：先定一个主色，其他颜色都从它的明度和饱和度里变化出来，界面会更统一。#设计 #配色', channelId: channelIds['【演示】设计灵感'] });
	n.mod1 = await post(a, 'mod', { text: '【社区公告】发帖请遵守社区守则，不要发布广告和引战内容。遇到问题可以在“反馈”页面提交，我们会尽快处理。#社区治理' });
	n.newbie1 = await post(a, 'newbie', { text: '第一次来，请问大家文章和帖子有什么区别呀？', channelId: channelIds['【演示】新人报到'] });
	n.cw = await post(a, 'writer', { cw: '剧透警告：《长夜》结局', text: '结局主角其实一直在原地，所谓的旅程全是回忆。看完很久没缓过来。#读书' });
	n.home = await post(a, 'main', { visibility: 'home', text: '这条只在首页时间线可见，用来测试可见范围。' });
	n.followers = await post(a, 'designer', { visibility: 'followers', text: '仅关注者可见：下周会放出一套新的图标草稿，先给大家预告一下。' });

	// 回复串和转发
	if (n.newbie1) {
		const r1 = await post(a, 'mod', { replyId: n.newbie1.id, text: '欢迎！帖子适合短内容和即时交流，文章适合长文，有目录、分类和标签。' });
		const r2 = await post(a, 'writer', { replyId: n.newbie1.id, text: '可以先发几条帖子熟悉一下，写长内容时再用文章。' });
		if (r1) await post(a, 'newbie', { replyId: r1.id, text: '明白了，谢谢！' });
		if (r2) await post(a, 'main', { replyId: r2.id, text: '同意，文章的目录在右侧，很方便。' });
	}
	if (n.dev2) {
		const r = await post(a, 'designer', { replyId: n.dev2.id, text: '学到了，我之前一直以为 clip 和 hidden 是一样的。' });
		if (r) await post(a, 'dev', { replyId: r.id, text: '大部分时候效果一样，区别在于能不能被脚本滚动。' });
	}
	if (n.hello) for (const key of ['writer', 'dev', 'designer']) await post(a, key, { replyId: n.hello.id, text: ['欢迎欢迎！', '欢迎，有前端问题可以找我。', '欢迎～头像很好看'][['writer', 'dev', 'designer'].indexOf(key)] });
	if (n.writer2) await post(a, 'newbie', { renoteId: n.writer2.id });
	if (n.dev1) await post(a, 'main', { renoteId: n.dev1.id, text: '收藏一下，之后重构表单要用。' });
	if (n.design1) await post(a, 'dev', { renoteId: n.design1.id });

	// 点赞、表情回应、收藏、投票
	const interactions = [
		['hello', ['writer', 'dev', 'designer', 'mod', 'newbie'], ['👍', '🎉', '❤️', '👏', '😆']],
		['writer1', ['main', 'dev', 'designer'], ['👍', '💯', '❤️']],
		['writer2', ['main', 'newbie', 'mod'], ['🙏', '👍', '✨']],
		['dev1', ['main', 'designer', 'writer'], ['🔥', '👀', '👍']],
		['dev2', ['main', 'mod'], ['💡', '👍']],
		['design1', ['main', 'dev', 'writer', 'newbie'], ['🎨', '❤️', '✨', '👍']],
		['mod1', ['main', 'newbie'], ['👌', '🙏']],
		['newbie1', ['main', 'designer'], ['👋', '🤗']],
	];
	for (const [noteKey, users, reactions] of interactions) {
		const note = n[noteKey];
		if (!note) continue;
		for (const [index, key] of users.entries()) {
			await act('点赞', () => api('notes/likes/create', { noteId: note.id }, a[key].token));
			await act('回应', () => api('notes/reactions/create', { noteId: note.id, reaction: reactions[index] }, a[key].token));
		}
	}
	for (const [key, noteKey] of [['main', 'dev1'], ['main', 'writer2'], ['newbie', 'mod1'], ['dev', 'design1']]) {
		if (n[noteKey]) await act('收藏帖子', () => api('notes/favorites/create', { noteId: n[noteKey].id }, a[key].token));
	}
	if (n.poll) for (const [key, choice] of [['writer', 0], ['dev', 2], ['designer', 1], ['newbie', 0], ['mod', 3]]) {
		await act('投票', () => api('notes/polls/vote', { noteId: n.poll.id, choice }, a[key].token));
	}

	// 便签
	const clip = await step('创建便签', () => api('clips/create', { name: '值得反复看的帖子', description: '效率、前端和设计的好内容。', isPublic: true }, a.main.token));
	if (clip) for (const noteKey of ['writer2', 'dev1', 'dev2', 'design1']) {
		if (n[noteKey]) await act('加入便签', () => api('clips/add-note', { clipId: clip.id, noteId: n[noteKey].id }, a.main.token));
	}

	// 置顶推广
	if (n.mod1) await act('推广帖子', () => api('admin/promo/create', { noteId: n.mod1.id, expiresAt: Date.now() + 30 * 86400000 }, a.admin.token));
	if (n.hello) await act('置顶帖子', () => api('i/pin', { noteId: n.hello.id }, a.main.token));
	return n;
}

const ARTICLES = [
	{
		author: 'writer', name: 'note-taking-system', title: '我的笔记系统：从混乱到可检索', category: 'thoughts', tags: ['效率', '随笔'], colors: ['#f97316', '#fde68a'],
		summary: '用三个文件夹和一个每日回顾，把零散的想法变成能找回来的知识。',
		body: '## 为什么需要笔记系统\n\n大多数笔记的问题不是写得少，而是**找不回来**。我花了两年时间，把笔记从十几个应用收拢到一个地方。\n\n## 三个文件夹\n\n### 收件箱\n\n所有临时想法先放这里，不分类、不整理。\n\n### 项目\n\n有明确截止时间的事情，每个项目一页。\n\n### 资料库\n\n长期有用的内容，按主题归档。\n\n## 每日回顾\n\n每天睡前花五分钟：\n\n1. 清空收件箱\n2. 把有用的内容移到项目或资料库\n3. 写下今天最有收获的一件事\n\n> 好的系统不是一次设计出来的，而是在使用中慢慢长出来的。\n\n## 常见问题\n\n### 标签要不要多用？\n\n少用。标签超过二十个以后，基本就不会再点了。\n\n### 要不要用双链？\n\n可以，但先把“能找到”做好，再考虑“能联想”。\n\n## 小结\n\n| 环节 | 频率 | 用时 |\n| --- | --- | --- |\n| 收集 | 随时 | 几秒 |\n| 整理 | 每天 | 5 分钟 |\n| 回顾 | 每周 | 30 分钟 |\n',
	},
	{
		author: 'dev', name: 'vue-composition-patterns', title: 'Vue 3 组合式函数的五个实用写法', category: 'technology', tags: ['vue', '前端', 'typescript'], colors: ['#10b981', '#1e3a8a'],
		summary: '整理在项目里反复用到的组合式函数写法：清理副作用、可取消请求、共享状态等。',
		body: '## 前言\n\n组合式函数（composable）让逻辑复用变得简单，但写不好也容易留下内存泄漏。下面是我在项目里反复用到的几种写法。\n\n## 1. 自动清理副作用\n\n```ts\nexport function useInterval(fn: () => void, ms: number) {\n  const id = window.setInterval(fn, ms);\n  onScopeDispose(() => window.clearInterval(id));\n}\n```\n\n## 2. 可取消的请求\n\n```ts\nwatch(id, async (value, _old, onCleanup) => {\n  const controller = new AbortController();\n  onCleanup(() => controller.abort());\n  data.value = await fetchItem(value, controller.signal);\n}, { immediate: true });\n```\n\n## 3. 模块级共享状态\n\n把 `ref` 放在函数外面，所有调用方共享同一份状态。适合“同一时间只展开一个”这类需求。\n\n## 4. 模板引用\n\n### 单个元素\n\n使用 `useTemplateRef`，类型更清晰。\n\n### 列表元素\n\n在 `v-for` 里用函数式 ref，自己维护 `Map`。\n\n## 5. 返回只读状态\n\n对外暴露 `readonly()` 包装后的状态，避免调用方随意修改。\n\n## 总结\n\n- 副作用一定要清理\n- 请求要能取消\n- 共享状态要有明确的归属\n',
	},
	{
		author: 'designer', name: 'design-tokens-intro', title: '设计令牌入门：让颜色和间距说同一种语言', category: 'resources', tags: ['设计', '前端'], colors: ['#ec4899', '#312e81'],
		summary: '用设计令牌统一颜色、字号和间距，减少设计稿和代码之间的偏差。',
		body: '## 什么是设计令牌\n\n设计令牌是把颜色、字号、间距这些**设计决策**存成变量，让设计稿和代码使用同一套名字。\n\n## 颜色\n\n### 主色与语义色\n\n先定主色，再定义 `success`、`warn`、`error` 等语义色。界面里只用语义名，不直接写色值。\n\n### 深色模式\n\n同一个令牌在不同主题下取不同的值，组件代码完全不用改。\n\n## 字号\n\n建议以 14px 为基准，按 1.15 左右的比例递增，层级不超过五级。\n\n## 间距\n\n使用 4 的倍数：4、8、12、16、24、32。\n\n## 落地步骤\n\n1. 盘点现有颜色和间距\n2. 合并相近的值\n3. 命名并写进变量\n4. 逐步替换硬编码\n\n> 少即是多：令牌越少，界面越统一。\n',
	},
];

async function seedArticles(a) {
	const created = [];
	for (const article of ARTICLES) {
		const author = a[article.author];
		const cover = await step('文章封面', () => upload(author.token, `${article.name}.png`, makePng(1200, 630, article.colors[0], article.colors[1])));
		const page = await step(`文章 ${article.title}`, () => api('pages/create', {
			title: article.title, summary: article.summary, name: article.name, articleCategoryId: article.category, articleTags: article.tags,
			content: [{ id: 'body', type: 'markdown', text: article.body }], variables: [], script: '',
			alignCenter: false, hideTitleWhenPinned: false, font: 'sans-serif', eyeCatchingImageId: cover?.id ?? null,
		}, author.token));
		if (page) created.push({ ...article, id: page.id });
	}

	const comments = [
		[0, 'main', '收件箱这个思路很实用，我之前就是什么都想马上分类，结果越整理越乱。', [['writer', '对，先收集再整理，压力会小很多。', [['main', '今晚就试试每日回顾。']]], ['newbie', '请问用什么软件比较好？', [['writer', '软件不重要，纯文本文件夹也够用。']]]]],
		[0, 'dev', '表格总结得很清楚，收藏了。', []],
		[1, 'designer', '第三点“同一时间只展开一个”刚好是我们评论区的需求。', [['dev', '是的，就是用模块级 ref 实现的。', []]]],
		[1, 'main', '可取消请求那段代码救了我，之前切换太快会显示旧数据。', [['dev', '竞态问题很常见，记得配合 onCleanup。', []]]],
		[2, 'dev', '前端这边最喜欢设计师先定好令牌，写样式快很多。', [['designer', '下一篇写怎么在 Figma 里管理令牌。', []]]],
	];
	for (const [index, key, text, replies] of comments) {
		const article = created[index];
		if (!article) continue;
		const root = await step('文章评论', () => api('articles/comments/create', { articleId: article.id, text }, a[key].token));
		if (!root) continue;
		for (const [replyKey, replyText, children] of replies) {
			const reply = await step('评论回复', () => api('articles/comments/create', { articleId: article.id, text: replyText, replyId: root.id }, a[replyKey].token));
			if (reply) for (const [childKey, childText] of children) await step('楼中楼回复', () => api('articles/comments/create', { articleId: article.id, text: childText, replyId: reply.id }, a[childKey].token));
		}
	}

	for (const article of created) {
		for (const key of demoKeys) {
			if (key === article.author || !a[key]) continue;
			await act('文章点赞', () => api('articles/like', { articleId: article.id, liked: true }, a[key].token));
		}
		await act('文章收藏', () => api('articles/favorite', { articleId: article.id, favorited: true }, a.main.token));
	}
	// 文章打赏需要余额，放在钱包分组充值之后执行。
	return created;
}

async function dm(a, from, to, text, extra = {}) {
	return step(`${from} 私信 ${to}`, () => api('chat/messages/create-to-user', { toUserId: a[to].id, ...(text != null ? { text } : {}), ...extra }, a[from].token));
}

async function roomMessage(a, from, roomId, text, extra = {}) {
	return step(`${from} 群聊发言`, () => api('chat/messages/create-to-room', { toRoomId: roomId, ...(text != null ? { text } : {}), ...extra }, a[from].token));
}

async function seedChat(a) {
	const threads = [
		['main', 'writer', [
			['main', '你好，看了你那篇笔记系统的文章，很受启发！'],
			['writer', '谢谢～有什么问题随时问。'],
			['main', '收件箱多久清一次比较合适？'],
			['writer', '我是每天睡前，五分钟就够了。'],
			['main', '好的，我试试 🙏'],
		]],
		['main', 'dev', [
			['dev', '评论区回复框那个需求我看了，可以用模块级 ref 做。'],
			['main', '好，那同一时间只展开一个吧。'],
			['dev', '没问题，晚点提交。'],
		]],
		['newbie', 'mod', [
			['newbie', '请问怎么申请成为创作者？'],
			['mod', '多发几篇原创文章，我们会定期审核并授予创作者角色。'],
		]],
		['buyer', 'seller', [
			['buyer', '手账本还有现货吗？'],
			['seller', '有的，下单后三天内发货。'],
		]],
	];
	for (const [first, second, messages] of threads) {
		let previous = null;
		for (const [index, [from, text]] of messages.entries()) {
			const to = from === first ? second : first;
			const message = await dm(a, from, to, text, index === 2 && previous ? { replyId: previous.id, replyType: 'reply' } : {});
			if (message && index === 0) await act('私信回应', () => api('chat/messages/react', { messageId: message.id, reaction: '👍' }, a[to].token));
			previous = message ?? previous;
		}
	}
	await dm(a, 'designer', 'main', null, { pokeUserId: a.main.id });

	const avatar = await step('群头像', () => upload(a.main.token, 'room-avatar.png', makePng(256, 256, '#6366f1', '#06b6d4')));
	const room = await step('创建群聊', () => api('chat/rooms/create', {
		name: '【演示】功能体验群', description: '体验群聊、回应、红包和成员管理。', joinPolicy: 'public', avatarId: avatar?.id ?? null,
		initialUserIds: ['writer', 'dev', 'designer', 'newbie'].map(key => a[key].id),
	}, a.main.token));
	if (room) {
		const lines = [
			['main', '欢迎大家来到体验群 🎉'],
			['writer', '大家好！'],
			['dev', '这个群可以测试红包和消息回应。'],
			['designer', '我来发个表情 😆'],
			['newbie', '新人报到，请多关照～'],
		];
		for (const [from, text] of lines) {
			const message = await roomMessage(a, from, room.id, text);
			if (message && from === 'main') for (const key of ['writer', 'dev', 'designer']) await act('群消息回应', () => api('chat/messages/react', { messageId: message.id, reaction: '🎉' }, a[key].token));
		}
		await act('加入群聊', () => api('chat/rooms/join', { roomId: room.id }, a.mod.token));
	}

	const approval = await step('创建审核群', () => api('chat/rooms/create', { name: '【演示】设计评审组', description: '需要申请加入，用于测试入群审核。', joinPolicy: 'approval' }, a.designer.token));
	if (approval) {
		await act('申请入群', () => api('chat/rooms/requests/create', { roomId: approval.id, requestMessage: '想来学习设计评审。' }, a.newbie.token));
		await act('邀请入群', () => api('chat/rooms/invitations/create', { roomId: approval.id, userId: a.main.id }, a.designer.token));
	}
	return room;
}

async function seedWallet(a, db) {
	for (const key of demoKeys) {
		if (!a[key]) continue;
		await step(`充值 ${key}`, () => api('admin/wallet/adjust', { userId: a[key].id, amount: key === 'main' ? 5000 : 1000, requestId: requestId(`topup:${key}`), reason: '演示数据初始余额' }, a.admin.token));
	}

	const accepted = await step('转账（已收款）', () => api('transfers/create', { recipientId: a.writer.id, amount: 88, requestId: requestId('transfer:main-writer'), message: '请你喝咖啡 ☕' }, a.main.token));
	if (accepted?.id) await act('确认收款', () => api('transfers/accept', { transferId: accepted.id }, a.writer.token));
	await step('转账（待收款）', () => api('transfers/create', { recipientId: a.main.id, amount: 20, requestId: requestId('transfer:dev-main'), message: '上次的午饭钱' }, a.dev.token));
	await step('转账（待收款）', () => api('transfers/create', { recipientId: a.designer.id, amount: 66.66, requestId: requestId('transfer:main-designer'), message: '图标设计费' }, a.main.token));

	// 打赏帖子和文章，目标取最新的演示内容。
	const note = (await db.query('select id from note where "userId" = $1 and "replyId" is null and "renoteId" is null order by id desc limit 1', [a.writer.id])).rows[0];
	if (note) await step('打赏帖子', () => api('i/wallet/tip', { userId: a.writer.id, amount: 10, requestId: requestId('tip:note'), message: '写得真好', targetType: 'note', targetId: note.id }, a.main.token));
	for (const [index, page] of (await db.query('select id, "userId" from page where name = any($1)', [ARTICLES.map(article => article.name)])).rows.entries()) {
		const tipper = page.userId === a.main.id ? 'dev' : 'main';
		await step('打赏文章', () => api('i/wallet/tip', { userId: page.userId, amount: [20, 6.6, 8.8][index % 3], requestId: requestId(`tip:page:${page.id}`), message: '感谢分享', targetType: 'page', targetId: page.id }, a[tipper].token));
	}
	await step('打赏用户', () => api('tips/send', { userId: a.designer.id, amount: 5, requestId: requestId('tip:user'), message: '头像画得很好' }, a.newbie.token));
}

async function seedRedPackets(a, db) {
	const publicPacket = await step('公开红包', () => api('red-packets/create', { kind: 'group', audience: 'public', mode: 'random', totalCoins: 100, count: 5, message: '恭喜发财 大吉大利', coverId: 'lucky', requestId: requestId('rp:public') }, a.main.token));
	if (publicPacket) {
		const note = await post(a, 'main', { text: '发个红包庆祝一下体验群开张 🧧 #红包', redPacketId: publicPacket.id });
		if (note) for (const key of ['writer', 'dev', 'designer']) await act('领取公开红包', () => api('red-packets/claim', { redPacketId: publicPacket.id }, a[key].token));
	}
	const direct = await step('专属红包', () => api('red-packets/create', { kind: 'direct', audience: 'recipients', mode: 'equal', totalCoins: 52, count: 1, recipientIds: [a.writer.id], message: '谢谢你的笔记方法', coverId: 'classic', requestId: requestId('rp:direct') }, a.main.token));
	if (direct) await dm(a, 'main', 'writer', null, { redPacketId: direct.id });
	const room = (await db.query('select id from chat_room where name = $1 order by id desc limit 1', ['【演示】功能体验群'])).rows[0];
	if (room) {
		const roomPacket = await step('群红包', () => api('red-packets/create', { kind: 'group', audience: 'room', mode: 'random', totalCoins: 60, count: 4, roomId: room.id, message: '群红包，手慢无', coverId: 'sunset', requestId: requestId('rp:room') }, a.main.token));
		if (roomPacket) {
			await roomMessage(a, 'main', room.id, null, { redPacketId: roomPacket.id });
			for (const key of ['dev', 'newbie']) await act('领取群红包', () => api('red-packets/claim', { redPacketId: roomPacket.id }, a[key].token));
		}
		const secret = await step('口令红包', () => api('red-packets/create', { kind: 'group', audience: 'room', mode: 'random', totalCoins: 30, count: 3, roomId: room.id, password: '简直了', message: '口令：简直了', requestId: requestId('rp:password') }, a.writer.token));
		if (secret) await roomMessage(a, 'writer', room.id, null, { redPacketId: secret.id });
	}
}

async function seedCheckin(a) {
	for (const key of demoKeys) if (a[key]) await act(`${key} 签到`, () => api('i/checkin', {}, a[key].token));
	// 只有注册早于补签日期的账号能补签，新建账号补签失败属正常情况，静默跳过。
	for (const key of ['seller', 'buyer']) {
		if (!a[key]) continue;
		await act('发放补签卡', () => api('admin/checkin/grant-cards', { userId: a[key].id, amount: 2 }, a.admin.token));
		for (const days of [1, 2]) await api('i/checkin-makeup', { date: daysAgo(days) }, a[key].token).then(() => stats.ok++, () => stats.skipped++);
	}
	await act('补签卡', () => api('admin/checkin/grant-cards', { userId: a.main.id, amount: 1 }, a.admin.token));
	const code = await step('兑换码', () => api('admin/checkin/codes/create', { name: '【演示】新人福利', amount: 20, maxRedemptions: 100, expiresAt: new Date(Date.now() + 90 * 86400000).toISOString() }, a.admin.token));
	if (code) for (const key of ['main', 'newbie']) await act('使用兑换码', () => api('i/checkin-redeem', { code: code.code }, a[key].token));
}

const PRODUCTS = [
	{ seller: 'seller', name: '【演示】手工牛皮手账本', description: 'A5 尺寸，植鞣牛皮封面，内页 120 张道林纸。', type: 'physical', category: '手作', unit: '本', price: 128, stockLimit: 20, colors: ['#92400e', '#fbbf24'], deliveryText: '下单后三天内发货，请在订单备注中留下收货地址。' },
	{ seller: 'seller', name: '【演示】干花书签套装', description: '六枚装，每枚都是手工压制的真花。', type: 'physical', category: '手作', unit: '套', price: 36, stockLimit: 50, colors: ['#be185d', '#fde68a'], deliveryText: '包邮，下单后五天内发货。' },
	{ seller: 'seller', name: '【演示】手机壁纸合集', description: '十二张原创插画壁纸，适配主流机型。', type: 'virtual', category: '数字', unit: '份', price: 6, stockLimit: 0, colors: ['#0f766e', '#a5f3fc'], deliveryText: '下载地址：https://example.com/wallpapers （演示链接）' },
	{ seller: 'designer', name: '【演示】线性图标包 200 枚', description: '24px 网格、2px 描边，提供 SVG 与 Figma 源文件。', type: 'virtual', category: '设计素材', unit: '份', price: 49, stockLimit: 0, colors: ['#7c3aed', '#f9a8d4'], deliveryText: '源文件链接：https://example.com/icons （演示链接）' },
	{ seller: 'writer', name: '【演示】写作陪跑 · 一对一', description: '一次 60 分钟的线上写作辅导，帮你梳理结构和表达。', type: 'virtual', category: '服务', unit: '次', price: 199, stockLimit: 10, perUserLimit: 1, colors: ['#ea580c', '#fef3c7'], deliveryText: '购买后请私信预约时间。' },
];

async function seedShop(a) {
	const products = [];
	for (const product of PRODUCTS) {
		const seller = a[product.seller];
		if (!seller) continue;
		const image = await step('商品图', () => upload(seller.token, `product-${products.length}.png`, makePng(800, 800, product.colors[0], product.colors[1])));
		const created = await step(`商品 ${product.name}`, () => api('products/create', {
			name: product.name, description: product.description, type: product.type, category: product.category,
			imageUrl: image?.url ?? '', unit: product.unit, price: product.price, perUserLimit: product.perUserLimit ?? 0,
			stockLimit: product.stockLimit, deliveryText: product.deliveryText, enabled: true, requestId: requestId(`product:${product.name}`),
		}, seller.token));
		if (created) products.push(created);
	}
	const orders = [['buyer', 0, 1], ['main', 0, 1], ['main', 2, 1], ['main', 3, 1], ['newbie', 1, 2], ['buyer', 4, 1]];
	for (const [buyer, index, quantity] of orders) {
		const product = products[index];
		if (!product || !a[buyer]) continue;
		await step(`${buyer} 下单`, () => api('orders/purchase', { productId: product.id, quantity, expectedPrice: product.price, expectedVersion: product.version, requestId: requestId(`order:${buyer}:${index}`) }, a[buyer].token));
	}
}

async function seedFeedback(a) {
	const items = [
		['main', 'bug', '聊天窗口最小化后标题被截断', '在聊天浮窗里点最小化，标题只显示一半，窗口很宽的时候也一样。', 'resolved', '已修复，最小化时只为关闭按钮留位置。'],
		['newbie', 'feature', '希望文章支持定时发布', '写好的文章想在固定时间发出，现在只能手动发布。', 'inProgress', '已列入计划，预计下个版本上线。'],
		['dev', 'feature', '代码块增加复制按钮', '文章里的代码块希望有一键复制。', 'open', null],
		['designer', 'other', '深色主题下部分图标对比度偏低', '侧边栏的灰色图标在深色背景上不太清楚。', 'closed', '感谢反馈，已在主题配色中调整。'],
	];
	for (const [key, category, title, description, status, response] of items) {
		const feedback = await step(`反馈 ${title}`, () => api('feedback/create', { title, description, category }, a[key].token));
		if (feedback && (status !== 'open' || response)) {
			await step('处理反馈', () => api('feedback/update', { feedbackId: feedback.id, status, ...(response ? { response } : {}) }, a.mod.token));
		}
	}
}

async function seedModeration(a) {
	await step('公告', () => api('admin/announcements/create', {
		title: '【演示】欢迎体验简直了', text: '所有演示账号的密码都是 66666666。\n可以用测试账号（66666666）体验发帖、文章、聊天、钱包、集市和签到。', imageUrl: null, icon: 'success', display: 'normal', forExistingUsers: true,
	}, a.admin.token));
	await step('横幅公告', () => api('admin/announcements/create', {
		title: '【演示】社区守则更新', text: '请勿发布广告和引战内容，违规内容将被处理。', imageUrl: null, icon: 'warning', display: 'banner', forExistingUsers: true,
	}, a.admin.token));
	const spam = await post(a, 'newbie', { text: '【演示举报用】加微信领取免费会员，限时三天！' });
	if (spam) await step('举报帖子', () => api('users/report-abuse', { userId: a.newbie.id, reportType: 'note', targetId: spam.id, reason: 'spam', comment: '演示数据：疑似广告内容。', requestId: randomUUID() }, a.main.token));
	await step('举报用户', () => api('users/report-abuse', { userId: a.newbie.id, reportType: 'user', reason: 'impersonation', comment: '演示数据：昵称疑似冒充官方。', requestId: randomUUID() }, a.writer.token));
}

async function seedGallery(a) {
	const palettes = [['#f472b6', '#fde68a'], ['#60a5fa', '#a7f3d0'], ['#a78bfa', '#fca5a5'], ['#34d399', '#1e3a8a']];
	const files = [];
	for (const [index, [from, to]] of palettes.entries()) {
		const file = await step('图集图片', () => upload(a.designer.token, `palette-${index + 1}.png`, makePng(1080, 1350, from, to)));
		if (file) files.push(file.id);
	}
	if (files.length === 0) return;
	const gallery = await step('图集', () => api('gallery/posts/create', { title: '配色练习 · 四季', description: '用渐变做的四组季节配色。', fileIds: files }, a.designer.token));
	// 图集点赞依赖 Redis 7 的 EXPIRE NX，旧版 Redis 会报 500，此时点赞记录已写入但计数未更新。
	if (gallery) for (const key of ['main', 'writer', 'dev']) await act('图集点赞（需 Redis 7+）', () => api('gallery/posts/like', { postId: gallery.id }, a[key].token));

	// AiScript 数组元素之间必须用逗号或换行分隔。
	await step('互动应用', () => api('flash/create', {
		title: '今日运势', summary: '每个人每天的运势都不一样。', permissions: [], visibility: 'public',
		script: '/// @ 1.2.1\nlet choices = ["大吉", "中吉", "小吉", "末吉", "凶"]\nlet random = Math:gen_rng(`{THIS_ID}{USER_ID}{Date:year()}{Date:month()}{Date:day()}`)\nlet chosen = choices[random(0, (choices.len - 1))]\nUi:render([\n\tUi:C:container({\n\t\talign: \'center\'\n\t\tchildren: [Ui:C:mfm({ text: `今日运势：**{chosen}**` })]\n\t})\n])\n',
	}, a.dev.token));
}

async function seedPersonal(a) {
	const list = await step('用户列表', () => api('users/lists/create', { name: '常看的创作者' }, a.main.token));
	if (list) for (const key of ['writer', 'dev', 'designer']) await act('加入列表', () => api('users/lists/push', { listId: list.id, userId: a[key].id }, a.main.token));
	await step('天线', () => api('antennas/create', {
		name: '前端动态', src: 'all', keywords: [['vue'], ['前端'], ['typescript']], excludeKeywords: [], users: [],
		caseSensitive: false, withReplies: false, withFile: false,
	}, a.main.token));
	if (list) await step('列表天线', () => api('antennas/create', {
		name: '创作者的长内容', src: 'list', userListId: list.id, keywords: [['效率'], ['设计'], ['写作']], excludeKeywords: [], users: [],
		caseSensitive: false, withReplies: false, withFile: false,
	}, a.main.token));
}

async function seedPrivateAccount(a) {
	const user = a.private;
	if (!user) return;
	const avatar = await step('私密账号头像', () => upload(user.token, `${user.username}-avatar.png`, makePng(256, 256, user.colors[0], user.colors[1])));
	await step('私密账号资料', () => api('i/update', { name: user.name, description: user.description, location: user.location, avatarId: avatar?.id ?? undefined, isLocked: true, autoAcceptFollowed: false }, user.token));
	await post(a, 'private', { visibility: 'followers', text: '只有通过关注申请的人才能看到这条。' });
	await act('私密账号关注主账号', () => api('following/create', { userId: a.main.id }, user.token));
	// 待处理的关注申请：主账号和新人各发一条，私密账号同意其中一条。
	for (const key of ['main', 'newbie', 'writer']) await act(`${key} 申请关注`, () => api('following/create', { userId: user.id }, a[key].token));
	await act('同意关注申请', () => api('following/requests/accept', { userId: a.writer.id }, user.token));
}

// 使用已导入的自定义表情（见 import-local-assets.mjs），没有表情时跳过。
async function seedEmojis(a, db) {
	// 优先选字母开头的可读名称；_u 开头的是中文名转义后的导入名，纯数字名称也不便识别。
	const names = (await db.query('select name from emoji where host is null order by name !~ $1, name limit 5', ['^[a-zA-Z]'])).rows.map(row => row.name);
	if (names.length < 3) {
		console.log('  - 尚未导入自定义表情，跳过（先运行 pnpm --filter backend import:assets）');
		return;
	}
	const note = await post(a, 'dev', { text: `自定义表情上线了 ${names.slice(0, 3).map(name => `:${name}:`).join(' ')} 快来试试 #自定义表情` });
	if (note) for (const [index, key] of ['main', 'writer', 'designer', 'newbie'].entries()) {
		await act('自定义表情回应', () => api('notes/reactions/create', { noteId: note.id, reaction: `:${names[index % names.length]}@.:` }, a[key].token));
	}
}

async function seedMediaNotes(a, db) {
	const folder = await step('网盘文件夹', () => api('drive/folders/create', { name: '摄影' }, a.main.token));
	await step('子文件夹', () => api('drive/folders/create', { name: '晚霞', parentId: folder?.id ?? null }, a.main.token));
	const photos = [];
	for (const [index, [from, to]] of [['#f97316', '#7c3aed'], ['#fb7185', '#1e3a8a'], ['#fde047', '#ea580c']].entries()) {
		const file = await step('照片', () => upload(a.main.token, `sunset-${index + 1}.png`, makePng(1280, 960, from, to)));
		if (file) {
			photos.push(file.id);
			if (folder) await step('移入文件夹', () => api('drive/files/update', { fileId: file.id, folderId: folder.id, comment: '傍晚六点半，在江边拍的。' }, a.main.token));
		}
	}
	if (photos.length) {
		const note = await post(a, 'main', { text: '三张晚霞，一张比一张红 🌇 #摄影', fileIds: photos });
		if (note) for (const key of ['writer', 'designer', 'newbie']) await act('点赞', () => api('notes/likes/create', { noteId: note.id }, a[key].token));
	}
	const sensitive = await step('敏感图片', () => upload(a.designer.token, 'sketch-wip.png', makePng(800, 800, '#0f172a', '#e11d48')));
	if (sensitive) {
		await step('标记敏感', () => api('drive/files/update', { fileId: sensitive.id, isSensitive: true }, a.designer.token));
		await post(a, 'designer', { cw: '未完成的草稿，含强烈配色', text: '草稿先发一张，别笑 😂', fileIds: [sensitive.id] });
	}

	await post(a, 'writer', { text: '@66666666 @demo_dev 新文章写好了，帮我看看结构是否清楚？' });
	await post(a, 'main', { visibility: 'specified', visibleUserIds: [a.writer.id], text: '@demo_writer 私下说一句：你上次推荐的书真的很好看。' });
	await post(a, 'mod', { text: '本周精选：@demo_writer 的笔记系统文章、@demo_designer 的配色练习。感谢大家的分享 🙏 #本周精选' });

	const channel = (await db.query('select id from channel where name = $1 order by id desc limit 1', ['【演示】前端技术'])).rows[0];
	if (channel) {
		const pinned = [];
		for (const text of ['【置顶】频道规则：只讨论前端相关话题，提问请附上复现步骤。', '【置顶】资源汇总：Vue 文档、MDN、TypeScript Handbook。']) {
			const note = await post(a, 'dev', { text, channelId: channel.id });
			if (note) pinned.push(note.id);
		}
		if (pinned.length) await step('频道置顶', () => api('channels/update', { channelId: channel.id, pinnedNoteIds: pinned }, a.dev.token));
	}

	await step('帖子草稿', () => api('notes/drafts/create', { text: '这是一条还没写完的草稿……', visibility: 'public' }, a.main.token));
	await step('定时帖子', () => api('notes/drafts/create', { text: '定时发布测试：这条会在明天早上九点发出。#定时发布', visibility: 'public', scheduledAt: Date.now() + 86400000, isActuallyScheduled: true }, a.main.token));
}

// 页面是由文本、章节、图片、嵌入帖子等内容块拼成的独立网页，和只有一个 Markdown 正文的文章不同。
async function seedPages(a, db) {
	const cover = await step('页面封面', () => upload(a.designer.token, 'portfolio-cover.png', makePng(1200, 630, '#8b5cf6', '#ec4899')));
	const work = await step('作品图', () => upload(a.designer.token, 'portfolio-work.png', makePng(1200, 800, '#ec4899', '#fbbf24')));
	const note = (await db.query('select id from note where "userId" = $1 and "replyId" is null and "renoteId" is null and visibility = $2 order by id limit 1', [a.designer.id, 'public'])).rows[0];
	const id = (name) => requestId(`page-block:${name}`).slice(0, 8);
	const portfolio = await step('作品集页面', () => api('pages/create', {
		title: '阿梨的作品集', name: 'portfolio', summary: '界面、插画和配色练习。', variables: [], script: '', alignCenter: true, hideTitleWhenPinned: false, font: 'sans-serif', eyeCatchingImageId: cover?.id ?? null,
		content: [
			{ id: id('intro'), type: 'text', text: '你好，我是阿梨，做界面设计和插画。这里收集了我最近的作品。' },
			{ id: id('works'), type: 'section', title: '近期作品', children: [
				{ id: id('work-text'), type: 'text', text: '**季节配色**：用渐变表达四季的情绪。' },
				...(work ? [{ id: id('work-image'), type: 'image', fileId: work.id }] : []),
			] },
			...(note ? [{ id: id('note'), type: 'section', title: '最近的想法', children: [{ id: id('note-embed'), type: 'note', detailed: false, note: note.id }] }] : []),
			{ id: id('contact'), type: 'section', title: '联系我', children: [{ id: id('contact-text'), type: 'text', text: '合作请私信 @demo_designer 。' }] },
		],
	}, a.designer.token));
	const event = await step('活动页面', () => api('pages/create', {
		title: '十月读书会 · 报名说明', name: 'reading-club-october', summary: '时间、地点和报名方式。', variables: [], script: '', alignCenter: false, hideTitleWhenPinned: false, font: 'serif', eyeCatchingImageId: null,
		content: [
			{ id: id('club-intro'), type: 'text', text: '本月共读《长夜》，欢迎所有喜欢读书的朋友参加。' },
			{ id: id('club-time'), type: 'section', title: '时间地点', children: [{ id: id('club-time-text'), type: 'text', text: '每周六下午三点，线上群聊“【演示】功能体验群”。' }] },
			{ id: id('club-join'), type: 'section', title: '报名方式', children: [{ id: id('club-join-text'), type: 'text', text: '在帖子下回复“报名”即可。' }] },
		],
	}, a.writer.token));
	for (const page of [portfolio, event]) {
		if (!page) continue;
		for (const key of ['main', 'dev', 'newbie']) await act('页面点赞', () => api('pages/like', { pageId: page.id }, a[key].token));
	}
}

async function seedPlays(a) {
	const plays = [
		['dev', '掷骰子', '点一下按钮，掷出 1～6 点。', 'var result = "点击下方按钮"\nUi:render([\n\tUi:C:container({\n\t\talign: \'center\'\n\t\tchildren: [\n\t\t\tUi:C:text({ text: result })\n\t\t\tUi:C:button({\n\t\t\t\ttext: "掷骰子"\n\t\t\t\tprimary: true\n\t\t\t\tonClick: @() {\n\t\t\t\t\tMk:dialog("结果", `你掷出了 {Math:rnd(1, 6)} 点`)\n\t\t\t\t}\n\t\t\t})\n\t\t]\n\t})\n])\n'],
		['writer', '今天读什么', '从书单里随机挑一本。', 'let books = ["《长夜》", "《城市漫游指南》", "《写作这回事》", "《设计心理学》"]\nUi:render([\n\tUi:C:button({\n\t\ttext: "帮我选一本"\n\t\tonClick: @() {\n\t\t\tMk:dialog("今天读", books[Math:rnd(0, (books.len - 1))])\n\t\t}\n\t})\n])\n'],
	];
	for (const [key, title, summary, body] of plays) {
		const play = await step(`互动应用 ${title}`, () => api('flash/create', { title, summary, permissions: [], visibility: 'public', script: `/// @ 1.2.1\n${body}` }, a[key].token));
		if (play) for (const liker of ['main', 'designer', 'newbie']) if (liker !== key) await act('互动应用点赞', () => api('flash/like', { flashId: play.id }, a[liker].token));
	}
}

async function seedMoreGallery(a) {
	const files = [];
	for (const [index, [from, to]] of [['#0ea5e9', '#f0f9ff'], ['#16a34a', '#fef9c3'], ['#9333ea', '#fce7f3']].entries()) {
		const file = await step('旅行照片', () => upload(a.writer.token, `trip-${index + 1}.png`, makePng(1200, 900, from, to)));
		if (file) files.push(file.id);
	}
	if (files.length) await step('旅行图集', () => api('gallery/posts/create', { title: '成都三日 · 城市漫游', description: '宽窄巷子、人民公园和夜里的锦江。', fileIds: files }, a.writer.token));
	const sensitive = await step('敏感图集图片', () => upload(a.designer.token, 'figure-study.png', makePng(900, 1200, '#7f1d1d', '#fda4af')));
	if (sensitive) await step('敏感图集', () => api('gallery/posts/create', { title: '人体结构速写练习', description: '标记为敏感内容，用于测试遮挡显示。', fileIds: [sensitive.id], isSensitive: true }, a.designer.token));
}

async function seedExtras(a) {
	await step('文章云端草稿', () => api('articles/drafts/save', {
		draftId: 'seed-demo-draft', expectedRevision: 0, title: '（草稿）城市漫游的十个小技巧', summary: '还在写，先存一份草稿。',
		text: '## 出发前\n\n带一双舒服的鞋。\n\n## 路上\n\n（待补充）\n', name: 'city-walk-tips', articleCategoryId: 'thoughts', articleTags: ['生活'], articleId: null, coverId: null,
	}, a.writer.token));
	await step('邀请码', () => api('admin/invite/create', { count: 3, expiresAt: null }, a.admin.token));
	const clip = await step('公开便签', () => api('clips/create', { name: '新人必看', description: '社区规则和使用说明。', isPublic: true }, a.mod.token));
	if (clip) for (const key of ['main', 'newbie']) await act('收藏便签', () => api('clips/favorite', { clipId: clip.id }, a[key].token));
	for (const name of ['profileFilled', 'tutorialCompleted', 'viewInstanceChart', 'iLoveMisskey']) {
		await act(`成就 ${name}`, () => api('i/claim-achievement', { name }, a.main.token));
	}
}

async function seedProfileExtras(a, db) {
	// 头像框必须是带透明区域的环形图片，使用已导入的素材，不自行生成。
	const decorations = (await db.query('select id from avatar_decoration order by category = $1 desc, name limit 3', ['光环'])).rows;
	for (const [index, key] of ['main', 'writer', 'designer'].entries()) {
		if (decorations[index]) await step(`佩戴头像框 ${key}`, () => api('i/update', { avatarDecorations: [{ id: decorations[index].id }] }, a[key].token));
	}

	const portfolio = (await db.query('select id from page where "userId" = $1 and name = $2', [a.designer.id, 'portfolio'])).rows[0];
	if (portfolio) await step('置顶页面', () => api('i/update', { pinnedPageId: portfolio.id }, a.designer.token));
	for (const [key, birthday] of [['main', '1996-10-12'], ['writer', '1993-04-21'], ['dev', '1998-12-03']]) {
		await step(`生日 ${key}`, () => api('i/update', { birthday }, a[key].token));
	}

	await step('用户备注', () => api('users/update-memo', { userId: a.writer.id, memo: '笔记系统文章的作者，写作方面可以请教。' }, a.main.token));
	await step('用户备注', () => api('users/update-memo', { userId: a.dev.id, memo: '前端问题找他。' }, a.main.token));
	await act('静音用户', () => api('mute/create', { userId: a.newbie.id, expiresAt: Date.now() + 7 * 86400000 }, a.private.token));
	await act('屏蔽转发', () => api('renote-mute/create', { userId: a.newbie.id }, a.dev.token));
	const list = (await db.query('select id from user_list where "userId" = $1 order by id desc limit 1', [a.main.id])).rows[0];
	if (list) {
		await step('公开用户列表', () => api('users/lists/update', { listId: list.id, isPublic: true }, a.main.token));
		await act('收藏用户列表', () => api('users/lists/favorite', { listId: list.id }, a.writer.token));
	}

	const now = Date.now();
	const adImage = await step('广告图片', () => upload(a.admin.token, 'ad-shop.png', makePng(728, 90, '#0ea5e9', '#22c55e')));
	if (adImage) await step('广告', () => api('admin/ad/create', {
		url: `${baseUrl}/shop`, memo: '【演示】集市推广', place: 'horizontal', priority: 'middle', ratio: 1,
		startsAt: now, expiresAt: now + 30 * 86400000, imageUrl: adImage.url, dayOfWeek: 0,
	}, a.admin.token));

	// 合成游戏的成绩只用于排行榜展示，种子需要是近 5 小时内的时间戳。
	for (const [key, score] of [['main', 3280], ['dev', 4120], ['newbie', 960]]) {
		await step(`合成游戏成绩 ${key}`, () => api('bubble-game/register', { score, seed: String(Date.now() - 60000), logs: [], gameMode: 'normal', gameVersion: 3 }, a[key].token));
	}
}

async function main() {
	await api('meta', {}).catch(() => {
		console.error(`无法连接 ${baseUrl}，请先运行 pnpm dev。`);
		process.exit(1);
	});
	const db = await openDatabase();
	try {
		console.log('• 账号');
		const a = await prepareAccounts(db);
		await runSection(a, 'profiles', () => seedProfiles(a));
		await runSection(a, 'follows', () => seedFollows(a));
		await runSection(a, 'roles', () => seedRoles(a, db));
		await runSection(a, 'channels', () => seedChannels(a));
		await runSection(a, 'notes', () => seedNotes(a, db));
		await runSection(a, 'articles', () => seedArticles(a));
		await runSection(a, 'chat', () => seedChat(a));
		await runSection(a, 'wallet', () => seedWallet(a, db));
		await runSection(a, 'redPackets', () => seedRedPackets(a, db));
		await runSection(a, 'checkin', () => seedCheckin(a));
		await runSection(a, 'shop', () => seedShop(a));
		await runSection(a, 'feedback', () => seedFeedback(a));
		await runSection(a, 'moderation', () => seedModeration(a));
		await runSection(a, 'gallery', () => seedGallery(a));
		await runSection(a, 'personal', () => seedPersonal(a));
		await runSection(a, 'privateAccount', () => seedPrivateAccount(a));
		await runSection(a, 'emojis', () => seedEmojis(a, db));
		await runSection(a, 'mediaNotes', () => seedMediaNotes(a, db));
		await runSection(a, 'pages', () => seedPages(a, db));
		await runSection(a, 'plays', () => seedPlays(a));
		await runSection(a, 'moreGallery', () => seedMoreGallery(a));
		await runSection(a, 'extras', () => seedExtras(a));
		await runSection(a, 'profileExtras', () => seedProfileExtras(a, db));
		console.log(`\n完成：成功 ${stats.ok}，跳过 ${stats.skipped}，失败 ${stats.failed}`);
		console.log(`演示账号（密码均为 ${PASSWORD}）：${ACCOUNTS.filter(account => a[account.key]).map(account => account.username).join('、')}`);
	} finally {
		await db.end();
	}
}

await main();
