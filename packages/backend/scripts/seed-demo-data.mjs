/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 为本地开发环境写入覆盖主要功能的社区数据。全部经由 API 写入，以执行与真实操作相同的业务校验。
// 用法：先启动 `pnpm dev`，再运行 `pnpm --filter backend seed:demo`；加 `--reset` 可重建这套社区数据。
// 自定义表情和头像框来自本地素材，需先运行 `pnpm --filter backend import:assets`，见 import-local-assets.mjs。

import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const pg = require('pg');
const Redis = require('ioredis');
const bcrypt = require('bcryptjs');
const WebSocket = require('ws');
const Reversi = require('misskey-reversi');

const PASSWORD = '66666666';
const SEED_VERSION = '2026-10-community-21';
const MARKER_SCOPE = ['seedCommunity'];
const LEGACY_SCOPE = ['seedDemo'];
const FEATURED_EPOCH = new Date('2023-01-01T00:00:00Z').getTime();
const FEATURED_GLOBAL_WINDOW = 3 * 86400000;
const FEATURED_USER_WINDOW = 7 * 86400000;
const force = process.argv.includes('--force') || process.argv.includes('--reset');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const avatarAsset = key => pathToFileURL(resolve(root, 'packages/backend/scripts/seed-assets/avatars', `${key}.jpg`)).href;
const adAsset = name => pathToFileURL(resolve(root, 'packages/backend/scripts/seed-assets/ads', name)).href;
const config = yaml.load(readFileSync(resolve(root, '.config/default.yml'), 'utf8'));
const baseUrl = String(config.url).replace(/\/$/, '');
const baseUrlObject = new URL(baseUrl);
const redisKeyPrefix = `${config.redis.prefix ?? baseUrlObject.host}:`;

// 只允许写入本机实例，避免误把固定密码账号写进线上环境。
const { hostname } = baseUrlObject;
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

async function expectApiError(endpoint, params, token, expectedCode) {
	try {
		await api(endpoint, params, token);
	} catch (error) {
		if (error instanceof ApiError && error.code === expectedCode) return;
		throw error;
	}
	throw new Error(`${endpoint} 未按预期返回 ${expectedCode}`);
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
	const hex = createHash('sha256').update(`community-seed:${key}`).digest('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(8 + (parseInt(hex[16], 16) % 4)).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function signinFlow(username, userAgent) {
	const response = await fetch(`${baseUrl}/api/signin-flow`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'user-agent': userAgent,
		},
		body: JSON.stringify({ username, password: PASSWORD }),
	});
	const text = await response.text();
	const body = text ? JSON.parse(text) : null;
	if (!response.ok || body?.finished !== true) {
		throw new Error(`signin-flow ${response.status} ${body?.error?.code ?? ''}`.trim());
	}
	return body;
}

async function waitUntil(predicate, timeout, label, interval = 60) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeout) {
		if (await predicate()) return;
		await sleep(interval);
	}
	throw new Error(label);
}

const websocketBaseUrl = new URL('/streaming', baseUrl);
websocketBaseUrl.protocol = websocketBaseUrl.protocol === 'https:' ? 'wss:' : 'ws:';

async function openReversiSocket(token, gameId) {
	const url = new URL(websocketBaseUrl);
	url.searchParams.set('i', token);
	const socket = new WebSocket(url);
	const messages = [];

	await new Promise((resolve, reject) => {
		socket.once('open', resolve);
		socket.once('error', reject);
	});

	socket.on('message', data => {
		try {
			messages.push(JSON.parse(data.toString()));
		} catch {
			// 忽略不是 JSON 的心跳或调试消息。
		}
	});

	const id = `seed-${randomUUID()}`;
	socket.send(JSON.stringify({
		type: 'connect',
		body: { id, channel: 'reversiGame', params: { gameId }, pong: true },
	}));
	await waitUntil(
		() => messages.some(message => message.type === 'connected' && message.body?.id === id),
		5000,
		'五子棋频道连接超时',
	);

	return {
		send(type, body) {
			socket.send(JSON.stringify({ type: 'channel', body: { id, type, body } }));
		},
		close() {
			socket.close();
		},
	};
}

async function getReversiState(gameId, token) {
	return await api('reversi/show-game', { gameId }, token);
}

async function createReversiGame(a, firstKey, secondKey) {
	const first = a[firstKey];
	const second = a[secondKey];
	if (!first || !second) return null;

	// 清理上一轮可能留下的临时邀请，避免拿到未开始甚至已经结束的旧对局。
	await api('reversi/cancel-match', { userId: second.id }, first.token).catch(() => {});
	await api('reversi/cancel-match', { userId: first.id }, second.token).catch(() => {});
	const invitation = await step(`五子棋邀请 ${firstKey} → ${secondKey}`, () => api('reversi/match', {
		userId: second.id, multiple: true,
	}, first.token));
	if (invitation != null) throw new Error('五子棋邀请意外返回了已有对局');

	return await step(`五子棋配对 ${firstKey} / ${secondKey}`, () => api('reversi/match', {
		userId: first.id, multiple: true,
	}, second.token));
}

async function startReversiGame(a, firstKey, secondKey) {
	const game = await createReversiGame(a, firstKey, secondKey);
	if (!game) return null;

	const first = a[firstKey];
	const second = a[secondKey];
	const sockets = new Map();
	try {
		sockets.set(firstKey, await openReversiSocket(first.token, game.id));
		sockets.set(secondKey, await openReversiSocket(second.token, game.id));

		const user1Key = game.user1Id === first.id ? firstKey : secondKey;
		const user2Key = game.user2Id === first.id ? firstKey : secondKey;
		for (const [key, readyKey] of [[user1Key, 'user1Ready'], [user2Key, 'user2Ready']]) {
			sockets.get(key).send('ready', true);
			await waitUntil(async () => {
				const state = await getReversiState(game.id, first.token);
				return state[readyKey] === true;
			}, 3000, `五子棋准备状态超时（${key}）`);
			// gameReady 会先写入 Redis 缓存，留一点时间避免两次准备请求互相覆盖。
			await sleep(250);
		}

		let state = await getReversiState(game.id, first.token);
		await waitUntil(async () => {
			state = await getReversiState(game.id, first.token);
			return state.isStarted === true;
		}, 10000, '五子棋开局超时');

		return { game: state, sockets, first, second };
	} catch (error) {
		for (const socket of sockets.values()) socket.close();
		throw error;
	}
}

function reversiMoveScore(pos, width, height) {
	const x = pos % width;
	const y = Math.floor(pos / width);
	const corner = (x === 0 || x === width - 1) && (y === 0 || y === height - 1);
	const edge = x === 0 || x === width - 1 || y === 0 || y === height - 1;
	const nearCorner = (x === 1 || x === width - 2) && (y === 1 || y === height - 2);
	return corner ? 0 : edge ? 1 : nearCorner ? 3 : 2;
}

function getReversiEngine(state) {
	return Reversi.Serializer.restoreGame({
		map: state.map,
		isLlotheo: state.isLlotheo,
		canPutEverywhere: state.canPutEverywhere,
		loopedBoard: state.loopedBoard,
		logs: state.logs,
	});
}

async function playReversiMoves(a, state, sockets, maxMoves) {
	let current = state;
	const engine = getReversiEngine(current);
	const width = current.map[0]?.length ?? 0;
	const height = current.map.length;

	for (let turn = 0; turn < maxMoves && !current.isEnded; turn++) {
		if (engine.turn == null || engine.isEnded) break;
		const legal = [...Array(width * height).keys()]
			.filter(pos => engine.canPut(engine.turn, pos))
			.sort((left, right) => reversiMoveScore(left, width, height) - reversiMoveScore(right, width, height));
		if (legal.length === 0) break;

		const pos = legal[0];
		const color = engine.turn;
		const userId = color
			? (current.black === 1 ? current.user1Id : current.user2Id)
			: (current.black === 2 ? current.user1Id : current.user2Id);
		const key = Object.keys(a).find(candidate => a[candidate]?.id === userId);
		if (!key || !sockets.has(key)) break;

		const previousLogCount = current.logs?.length ?? 0;
		sockets.get(key).send('putStone', { pos, id: randomUUID() });
		await waitUntil(async () => {
			current = await getReversiState(current.id, a.main.token);
			return (current.logs?.length ?? 0) > previousLogCount || current.isEnded;
		}, 3000, '五子棋落子同步超时');
		engine.putStone(pos);

		if (current.isEnded) break;
	}

	if (!current.isEnded) {
		await waitUntil(async () => {
			current = await getReversiState(current.id, a.main.token);
			return current.isEnded;
		}, 2000, '五子棋结束状态同步超时').catch(() => {});
	}
	return current;
}

async function seedReversi(a) {
	const completed = await startReversiGame(a, 'main', 'dev');
	if (completed) {
		try {
			const state = await playReversiMoves(a, completed.game, completed.sockets, 80);
			if (!state.isEnded) throw new Error('五子棋完成局在 80 手内仍未结束');
			console.log(`  - 五子棋完成一局：${state.logs.length} 手，${state.winnerId ? '已获胜方' : '和棋'}`);
		} finally {
			for (const socket of completed.sockets.values()) socket.close();
		}
	}

	const active = await startReversiGame(a, 'writer', 'travel');
	if (active) {
		try {
			const state = await playReversiMoves(a, active.game, active.sockets, 8);
			if (state.isEnded) throw new Error('五子棋进行中对局意外结束');
			console.log(`  - 五子棋进行中：${state.logs.length} 手`);
		} finally {
			for (const socket of active.sockets.values()) socket.close();
		}
	}
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

// 网络图片不可用时生成稳定的占位图，保证脚本仍能完成本地数据初始化。
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

const assetCache = new Map();

function unsplash(id, width, height, options = '') {
	const crop = options.includes('faces') ? '&crop=faces' : '';
	return `https://images.unsplash.com/${id}?fm=jpg&fit=crop${crop}&w=${width}&h=${height}&q=84`;
}

async function downloadImage(url) {
	if (url.startsWith('file:')) {
		const buffer = readFileSync(fileURLToPath(url));
		if (buffer.length === 0) throw new Error('invalid local image size: 0');
		return { buffer, contentType: 'image/jpeg' };
	}

	let lastError;
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const res = await fetch(url, {
				headers: { accept: 'image/jpeg,image/png;q=0.9,*/*;q=0.5', 'user-agent': 'MisskeyCommunitySeed/1.0' },
				signal: AbortSignal.timeout(30_000),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const contentType = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
			if (!contentType.startsWith('image/')) throw new Error(`unexpected content type: ${contentType}`);
			const buffer = Buffer.from(await res.arrayBuffer());
			if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) throw new Error(`invalid image size: ${buffer.length}`);
			return { buffer, contentType };
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError;
}

async function uploadAsset(token, cacheKey, name, url, fallbackColors, folderId = null) {
	if (assetCache.has(cacheKey)) return assetCache.get(cacheKey);
	let image;
	try {
		image = await downloadImage(url);
	} catch (error) {
		if (url.startsWith('file:')) throw error;
		console.warn(`  ! 图片下载失败，使用本地占位图 ${name}: ${error.message}`);
		image = { buffer: makePng(960, 640, fallbackColors[0], fallbackColors[1]), contentType: 'image/png' };
	}
	const form = new FormData();
	form.append('i', token);
	form.append('name', name);
	if (folderId) form.append('folderId', folderId);
	form.append('file', new Blob([image.buffer], { type: image.contentType }), name);
	const res = await fetch(`${baseUrl}/api/drive/files/create`, { method: 'POST', body: form });
	const body = await res.json();
	if (!res.ok) throw new ApiError('drive/files/create', res.status, body);
	assetCache.set(cacheKey, body);
	return body;
}

function daysAgo(days) {
	const date = new Date(Date.now() - days * 86400000);
	return date.toISOString().slice(0, 10);
}

const ACCOUNTS = [
	{
		key: 'main', username: 'linzhixia', name: '夏夏', location: '杭州', birthday: '1996-10-12',
		description: '在杭州做内容编辑，最近一直在跑菜市场和小店采访。\n工作之外喜欢沿河走路，拍照时经常忘记回消息。',
		company: '自由职业', jobTitle: '内容编辑', followedMessage: '谢谢关注。小店采访和散步路线会慢慢发，不一定日更。',
		fields: [{ name: '坐标', value: '杭州' }, { name: '最近在做', value: '菜市场人物采访' }, { name: '家里', value: '橘猫团子，十一斤' }],
		profileTags: ['城市散步', '摄影', '生活'],
		avatarUrl: avatarAsset('main'),
		bannerUrl: unsplash('photo-1495474472287-4d71bcdd2085', 1600, 500),
		colors: ['#d97706', '#0f766e'],
	},
	{
		key: 'writer', username: 'shenyan_writes', name: '老沈', location: '成都', birthday: '1993-04-21',
		description: '写城市和普通人的故事，偶尔接采访和编辑。\n卡稿的时候会去楼下走两圈，回来再删。',
		company: '自由职业', jobTitle: '撰稿人', followedMessage: '谢谢关注。新文章一般先发在这里，催稿请温柔一点。',
		fields: [{ name: '坐标', value: '成都' }, { name: '在写', value: '小城书店和店主' }, { name: '手边书', value: '一本翻旧了的短篇集' }],
		profileTags: ['写作', '阅读', '城市'],
		avatarUrl: avatarAsset('writer'),
		bannerUrl: unsplash('photo-1455390582262-044cdead277a', 1600, 500),
		colors: ['#9a3412', '#facc15'],
	},
	{
		key: 'dev', username: 'zhouyi_dev', name: '周亦', location: '深圳', birthday: '1998-12-03',
		description: '深圳写前端，主要做后台和表单。\n周末修旧相机，修不好就先摆在书架上。',
		company: '南山一家小公司', jobTitle: '前端开发', followedMessage: '谢谢关注。项目问题和摄影话题都欢迎聊。',
		fields: [{ name: '坐标', value: '深圳' }, { name: '工作日', value: 'Vue / TypeScript' }, { name: '周末', value: '拆相机，偶尔修得好' }],
		profileTags: ['前端', 'Vue', '摄影'],
		avatarUrl: avatarAsset('dev'),
		bannerUrl: unsplash('photo-1498050108023-c5249f4df085', 1600, 500),
		colors: ['#047857', '#1d4ed8'],
	},
	{
		key: 'designer', username: 'ali_studio', name: '阿梨', location: '上海', birthday: '1995-07-18',
		description: '独立设计，接品牌和界面。\n最近在画一组城市小图，比预想中慢很多。',
		company: '阿梨工作室', jobTitle: '视觉设计师', followedMessage: '谢谢关注。合作请直接说来意、排期和预算。',
		fields: [{ name: '坐标', value: '上海' }, { name: '方向', value: '品牌 / 界面' }, { name: '正在做', value: '城市图标草稿' }],
		profileTags: ['设计', '排版', '插画'],
		avatarUrl: avatarAsset('designer'),
		bannerUrl: unsplash('photo-1545235617-9465d2a55698', 1600, 500),
		colors: ['#be185d', '#312e81'],
	},
	{
		key: 'mod', username: 'chenyu_bj', name: '陈屿', location: '北京', birthday: '1991-02-09',
		description: '在北京做产品，晚上有空时会处理社区反馈。\n我不是客服，但看到具体问题会尽量回。',
		company: '一家做企业软件的小公司', jobTitle: '产品经理', followedMessage: '谢谢关注。反馈请尽量带上页面和操作步骤。',
		fields: [{ name: '坐标', value: '北京' }, { name: '在社区', value: '反馈整理 / 新朋友引导' }, { name: '最近读', value: '城市史，读得很慢' }],
		profileTags: ['社区共建', '阅读'],
		avatarUrl: avatarAsset('mod'),
		bannerUrl: unsplash('photo-1519608487953-e999c86e7455', 1600, 500),
		colors: ['#475569', '#0e7490'],
	},
	{
		key: 'newbie', username: 'xiaoman_0520', name: '小满还在上课', location: '广州', birthday: '2005-05-20',
		description: '广州读大二，新闻专业。\n刚学摄影，正在用借来的相机拍校园，也在攒钱买自己的第一支镜头。',
		company: '广州一所大学', jobTitle: '新闻学学生', followedMessage: '谢谢关注。我还在学怎么拍，会慢慢发。',
		fields: [{ name: '坐标', value: '广州' }, { name: '专业', value: '新闻学' }, { name: '正在练习', value: '校园和街头摄影' }],
		profileTags: ['校园', '摄影', '新朋友'],
		avatarUrl: avatarAsset('newbie'),
		bannerUrl: unsplash('photo-1516321318423-f06f85e504b3', 1600, 500),
		colors: ['#4d7c0f', '#0f766e'],
	},
	{
		key: 'private', username: 'nightbus_wanxing', name: '小晚', location: '南京', birthday: '1994-09-11', isLocked: true,
		description: '拍照，偶尔接约拍。这里主要放没发到别处的照片。\n关注申请会看，但不一定马上通过。',
		company: '自由职业', jobTitle: '摄影师', followedMessage: '谢谢你愿意等我确认，我会认真看每一条申请。',
		fields: [{ name: '坐标', value: '南京' }, { name: '在拍', value: '雨天和夜班公交' }, { name: '相机', value: '用了六年，掉漆了' }],
		profileTags: ['摄影', '夜间', '南京'],
		avatarUrl: avatarAsset('private'),
		bannerUrl: unsplash('photo-1519692933481-e162a57d6721', 1600, 500),
		colors: ['#334155', '#7e22ce'],
	},
	{
		key: 'seller', username: 'mumu_studio', name: '木木手作', location: '景德镇', birthday: '1992-03-16',
		description: '在景德镇做陶瓷，工作室只有我和一台旧拉坯机。\n杯子大多周三开窑，发货不算快，急用请先问。',
		company: '木木陶瓷工作室', jobTitle: '陶艺作者', followedMessage: '谢谢喜欢。每件都会尽量包好，但手作做不到一模一样。',
		fields: [{ name: '坐标', value: '景德镇' }, { name: '工作室', value: '木木，两个人两张桌子' }, { name: '开窑', value: '通常周三，偶尔拖一天' }],
		profileTags: ['手作', '陶瓷', '器物'],
		avatarUrl: avatarAsset('seller'),
		bannerUrl: unsplash('photo-1452860606245-08befc0ff44b', 1600, 500),
		colors: ['#92400e', '#d6d3d1'],
	},
	{
		key: 'buyer', username: 'juzi_hz', name: '橘子', location: '杭州', birthday: '1997-11-02',
		description: '杭州做生活方式编辑，爱逛旧货市场。\n家里不大，所以现在买东西会慢一点，也会多问几句。',
		company: '一本生活方式杂志', jobTitle: '编辑', followedMessage: '谢谢关注。这里主要记真正用过一阵子的东西。',
		fields: [{ name: '坐标', value: '杭州' }, { name: '常逛', value: '旧货市场 / 茶器摊' }, { name: '最近在学', value: '手冲，还是冲不稳' }],
		profileTags: ['生活', '茶器', '整理'],
		avatarUrl: avatarAsset('buyer'),
		bannerUrl: unsplash('photo-1544787219-7f47ccb76574', 1600, 500),
		colors: ['#c2410c', '#0f766e'],
	},
	{
		key: 'travel', username: 'anran_onroad', name: '安然在路上', location: '成都', birthday: '1990-06-08',
		description: '常跑成都和昆明之间，拍山，也拍早上吃面的人。\n路线写得比照片慢，催更可能没用。',
		company: '自由职业', jobTitle: '摄影师 / 旅行作者', followedMessage: '谢谢同行。新路线整理完会先发在这里。',
		fields: [{ name: '常驻', value: '成都 / 昆明' }, { name: '在拍', value: '西南小城和慢车' }, { name: '常用胶卷', value: '400 度负片，经常过期' }],
		profileTags: ['旅行', '摄影', '城市'],
		avatarUrl: avatarAsset('travel'),
		bannerUrl: unsplash('photo-1464822759023-fed622ff2c3b', 1600, 500),
		colors: ['#0369a1', '#065f46'],
	},
	{
		key: 'kitchen', username: 'qiaoqiao_cooks', name: '乔乔下班做饭', location: '苏州', birthday: '1994-08-25',
		description: '苏州上班，下班做饭。\n食谱都是自己反复做过的版本，失败太多的就不写了。',
		company: '普通上班族', jobTitle: '下班后做饭', followedMessage: '谢谢关注。做饭不用赶，能坐下来吃完就好。',
		fields: [{ name: '坐标', value: '苏州' }, { name: '常做', value: '番茄炖牛腩 / 青菜汤' }, { name: '厨房', value: '六平米，两个人转身会撞' }],
		profileTags: ['厨房', '早餐', '食谱'],
		avatarUrl: avatarAsset('kitchen'),
		bannerUrl: unsplash('photo-1504674900247-0877df9cc836', 1600, 500),
		colors: ['#b45309', '#166534'],
	},
	{
		key: 'books', username: 'keke_books', name: '可可值班', location: '武汉', birthday: '1998-01-29',
		description: '武汉一家小书店店员，读得杂。\n短评比长文多，不喜欢会直说，可能会因此省下你几十块。',
		company: '江边一家小书店', jobTitle: '店员', followedMessage: '谢谢关注。欢迎来书店坐坐，但不保证有座位。',
		fields: [{ name: '坐标', value: '武汉' }, { name: '最近读', value: '城市史 / 短篇小说' }, { name: '手边', value: '一支快没水的笔' }],
		profileTags: ['阅读', '书店', '书影音'],
		avatarUrl: avatarAsset('books'),
		bannerUrl: unsplash('photo-1524995997946-a1c2e315a42f', 1600, 500),
		colors: ['#7c2d12', '#1e3a8a'],
	},
];

const LEGACY_USERNAMES = [
	'66666666', 'demo_writer', 'demo_dev', 'demo_designer', 'demo_mod', 'demo_newbie',
	'demo_private', 'shop_demo_seller', 'shop_demo_buyer', '123456',
	'shen_yan', 'chenyu_community', 'xiaoman_2026', 'wanxing_photo',
	'mumu_ceramics', 'juzi_life', 'anran_travel', 'qiaoqiao_kitchen',
];
const SEED_USERNAMES = ACCOUNTS.map(account => account.username.toLowerCase());
const LEGACY_ROLE_NAMES = ['【演示】社区管理员', '【演示】普通创作者', '【演示】体验用户'];
const LEGACY_CHANNEL_NAMES = ['【演示】读书与旅行', '【演示】前端技术', '【演示】设计灵感', '【演示】手作交流', '【演示】新人报到'];
const LEGACY_ANNOUNCEMENT_TITLES = ['【演示】欢迎体验简直了', '【演示】社区守则更新'];
const MANAGED_ROLE_NAMES = [...LEGACY_ROLE_NAMES, '社区共建者', '原创作者', '手作店主'];
const MANAGED_ANNOUNCEMENT_TITLES = [...LEGACY_ANNOUNCEMENT_TITLES, '十一月共读开始报名', '本周六夜间维护'];
const MANAGED_AD_MEMOS = [
	'周末手作市集：陶瓷、织物与私人书单',
	'十一月社区共读：《看不见的城市》',
	'周六城市散步：8 公里，不赶路',
	'十分钟早餐研究所：坐下来吃完，再出门',
];
const MANAGED_ADMIN_FILES = [
	'ad-shop.png',
	'community-market-ad.jpg',
	'riverside-bookstore.jpg',
	'weekend-handmade-market.png',
	'november-reading-club.png',
	'saturday-city-walk.png',
	'weekday-breakfast.png',
	'community-builders-room.png',
];
const MANAGED_REDEMPTION_CODE_NAMES = ['秋季共读签到礼'];
const MANAGED_APP_NAMES = ['城市散步路线助手'];
const COMMUNITY_WEBHOOK_NAME = '社区周报归档';
const MODERATION_WEBHOOK_NAME = '社区治理事件归档';
const MODERATION_RECIPIENT_NAME = '治理事件归档';
const COMMUNITY_WEBHOOK_URL = 'http://127.0.0.1:8787/misskey/note-archive';
const MODERATION_WEBHOOK_URL = 'http://127.0.0.1:8787/misskey/moderation-events';

async function openDatabase() {
	const client = new pg.Client({ host: config.db.host, port: config.db.port, database: config.db.db, user: config.db.user, password: config.db.pass });
	await client.connect();
	return client;
}

async function openRedis() {
	const client = new Redis({
		host: config.redis.host,
		port: config.redis.port,
		username: config.redis.username,
		password: config.redis.pass,
		db: config.redis.db ?? 0,
	});
	await client.ping();
	return client;
}

function featuredWindow(windowRange) {
	return Math.floor((Date.now() - FEATURED_EPOCH) / windowRange);
}

async function removeManagedFeaturedEntries(redis, noteIds) {
	if (noteIds.length === 0) return 0;
	const patterns = [
		`${redisKeyPrefix}featuredGlobalNotesRanking:*`,
		`${redisKeyPrefix}featuredInChannelNotesRanking:*`,
		`${redisKeyPrefix}featuredPerUserNotesRanking:*`,
	];
	let removed = 0;
	for (const pattern of patterns) {
		const keys = await redis.keys(pattern);
		for (const key of keys) {
			for (let offset = 0; offset < noteIds.length; offset += 500) {
				removed += await redis.zrem(key, ...noteIds.slice(offset, offset + 500));
			}
		}
	}
	return removed;
}

async function ensureFeaturedEntries(redis, notes) {
	const globalWindow = featuredWindow(FEATURED_GLOBAL_WINDOW);
	const userWindow = featuredWindow(FEATURED_USER_WINDOW);
	const pipeline = redis.pipeline();
	let count = 0;

	for (const note of notes) {
		if (!note || note.visibility !== 'public' || note.replyId != null || note.renoteId != null) continue;
		const targets = [
			[`${redisKeyPrefix}featuredGlobalNotesRanking:${globalWindow}`, FEATURED_GLOBAL_WINDOW],
			[`${redisKeyPrefix}featuredPerUserNotesRanking:${note.userId}:${userWindow}`, FEATURED_USER_WINDOW],
		];
		const channelId = note.channelId ?? note.channel?.id;
		if (channelId) {
			targets.push([`${redisKeyPrefix}featuredInChannelNotesRanking:${channelId}:${globalWindow}`, FEATURED_GLOBAL_WINDOW]);
		}
		for (const [key, window] of targets) {
			pipeline.zincrby(key, 5, note.id);
			pipeline.expire(key, (window * 3) / 1000, 'NX');
		}
		count++;
	}

	if (count > 0) {
		const results = await pipeline.exec();
		const error = results?.find(([err]) => err != null)?.[0];
		if (error) throw error;
	}
	return count;
}

async function cleanupOrphanNotificationStreams(db, redis) {
	const keys = await redis.keys(`${redisKeyPrefix}notificationTimeline:*`);
	const ids = [...new Set(keys.map(key => key.match(/notificationTimeline:([^:]+)$/)?.[1]).filter(Boolean))];
	if (ids.length === 0) return 0;

	const existingIds = new Set((await db.query(
		'select id from "user" where id = any($1::varchar[])',
		[ids],
	)).rows.map(row => row.id));
	const orphanIds = ids.filter(id => !existingIds.has(id));
	if (orphanIds.length > 0) {
		await redis.del(...orphanIds.flatMap(id => [
			`${redisKeyPrefix}notificationTimeline:${id}`,
			`${redisKeyPrefix}latestReadNotification:${id}`,
		]));
	}
	return orphanIds.length;
}

const DRIVE_REFERENCE_QUERY = `
	select
		f.id,
		f."userId",
		f.md5,
		f.name,
		(
			(select count(*) from "user" u where u."avatarId" = f.id or u."bannerId" = f.id) +
			(select count(*) from channel c where c."bannerId" = f.id) +
			(select count(*) from chat_room r where r."avatarId" = f.id) +
			(select count(*) from chat_message m where m."fileId" = f.id) +
			(select count(*) from messaging_message m where m."fileId" = f.id) +
			(select count(*) from page p where p."eyeCatchingImageId" = f.id) +
			(select count(*) from note n where f.id = any(n."fileIds")) +
			(select count(*) from note_draft n where f.id = any(n."fileIds")) +
			(select count(*) from article_comment c where f.id = any(c."fileIds")) +
			(select count(*) from feedback c where f.id = any(c."fileIds") or f.id = any(c."responseFileIds")) +
			(select count(*) from gallery_post p where f.id = any(p."fileIds")) +
			(select count(*) from red_packet p where p."coverFileId" = f.id or p."coverId" = f.id) +
			(select count(*) from ad a where a."imageUrl" = f.url)
		)::int as references
	from drive_file f
	where f."userId" = any($1::varchar[]) and f.md5 is not null
`;

async function findUnreferencedDuplicateDriveFiles(db, userIds) {
	const rows = (await db.query(DRIVE_REFERENCE_QUERY, [userIds])).rows;
	const groups = new Map();
	for (const row of rows) {
		const key = `${row.userId}:${row.md5}`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(row);
	}
	return [...groups.values()]
		.filter(group => group.length > 1 && group.filter(file => file.references === 0).length > 1)
		.flatMap(group => group);
}

async function cleanupDuplicateDriveFiles(a, db) {
	await step('清理重复网盘文件', async () => {
		const accountIds = [...new Set(Object.values(a).map(account => account.id))];
		const rows = await findUnreferencedDuplicateDriveFiles(db, accountIds);
		const groups = new Map();
		for (const row of rows) {
			const key = `${row.userId}:${row.md5}`;
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key).push(row);
		}

		let deleted = 0;
		for (const group of groups.values()) {
			const canonical = group.find(file => file.references > 0) ?? group.toSorted((left, right) => left.id.localeCompare(right.id))[0];
			for (const file of group) {
				if (file.id === canonical.id || file.references > 0) continue;
				const owner = Object.values(a).find(account => account.id === file.userId);
				await api('drive/files/delete', { fileId: file.id }, owner?.token ?? a.admin.token).catch(error => {
					if (error instanceof ApiError && error.code === 'NO_SUCH_FILE') return;
					throw error;
				});
				deleted++;
			}
		}

		await waitUntil(async () => (await findUnreferencedDuplicateDriveFiles(db, accountIds)).length === 0, 5000, '重复网盘文件清理未完成');
		if (deleted > 0) console.log(`  - 删除 ${deleted} 个无引用的同账号重复文件`);
		return deleted;
	});
}

async function prepareAdmin(db) {
	const meta = await db.query('select "rootUserId" from meta limit 1');
	const rootUserId = meta.rows[0]?.rootUserId;
	if (!rootUserId) throw new Error('实例尚未初始化管理员账号，请先在浏览器中完成初始设置。');
	const admin = (await db.query('select id, username, token from "user" where id = $1', [rootUserId])).rows[0];
	if (!admin?.token) throw new Error('管理员访问令牌不存在，请重新登录管理员账号。');
	return { id: admin.id, username: admin.username, token: admin.token };
}

async function getRegistryValue(db, admin, key) {
	const row = (await db.query('select value from registry_item where "userId" = $1 and key = $2 and scope @> $3::varchar[] limit 1', [
		admin.id, key, MARKER_SCOPE,
	])).rows[0];
	return row?.value;
}

async function resetManagedData(db, admin, redis) {
	const users = (await db.query(
		'select id, username from "user" where "usernameLower" = any($1::varchar[])',
		[[...new Set([...LEGACY_USERNAMES, ...SEED_USERNAMES])]],
	)).rows;
	const ids = users.map(user => user.id).filter(id => id !== admin.id);

	await db.query('begin');
	try {
		const products = (await db.query(
			`select id from product
			where "sellerId" = any($1::varchar[])
				or name like any($2::varchar[])
				or ("sellerId" = $3 and (name ~* $4 or description ~* $4))`,
			[ids, ['【演示】%'], admin.id, '(测试|演示|模板)'],
		)).rows.map(row => row.id);
		const redPackets = (await db.query(
			'select id from red_packet where "userId" = any($1::varchar[]) or "userId" = $2',
			[ids, admin.id],
		)).rows.map(row => row.id);

		await db.query('delete from "order" where "buyerId" = any($1::varchar[]) or "sellerId" = any($1::varchar[]) or "productId" = any($2::varchar[])', [ids, products]);
		await db.query('delete from product_image where "userId" = any($1::varchar[]) or "productId" = any($2::varchar[])', [ids, products]);
		await db.query('delete from product where id = any($1::varchar[])', [products]);
		await db.query('delete from tip where "senderId" = any($1::varchar[]) or "recipientId" = any($1::varchar[])', [ids]);
		await db.query('delete from chat_message where "redPacketId" = any($1::varchar[])', [redPackets]);
		await db.query('delete from red_packet where id = any($1::varchar[])', [redPackets]);
		const seedChatRooms = (await db.query(
			'select count(*)::int as count from chat_room where "ownerId" = any($1::varchar[])',
			[ids],
		)).rows[0].count;
		const adminChatRooms = await db.query('delete from chat_room where "ownerId" = $1', [admin.id]);
		await db.query('delete from abuse_user_report where "reporterId" = any($1::varchar[]) or "targetUserId" = any($1::varchar[]) or "assigneeId" = any($1::varchar[])', [ids]);
		await db.query('delete from channel where "userId" = any($1::varchar[]) or name = any($2::varchar[])', [ids, LEGACY_CHANNEL_NAMES]);
		await db.query('delete from announcement where "userId" = any($1::varchar[]) or title = any($2::varchar[])', [ids, MANAGED_ANNOUNCEMENT_TITLES]);
		await db.query('delete from role where name = any($1::varchar[])', [MANAGED_ROLE_NAMES]);
		await db.query('delete from benefit_redemption_code where name like $1 or name = any($2::varchar[])', ['【演示】%', MANAGED_REDEMPTION_CODE_NAMES]);
		await db.query('delete from ad where memo like $1 or memo = any($2::varchar[])', ['%集市推广%', MANAGED_AD_MEMOS]);
		await db.query('delete from drive_file where "userId" = any($1::varchar[]) or ("userId" = $2 and name = any($3::varchar[]))', [
			ids, admin.id, MANAGED_ADMIN_FILES,
		]);
		// 旧版本留下的管理员内容不属于社区记录，重建时一并换成新的真实内容。
		const adminChats = await db.query('delete from chat_message where "fromUserId" = $1 or "toUserId" = $1', [admin.id]);
		const adminPlays = await db.query('delete from flash where "userId" = $1', [admin.id]);
		const adminGalleries = await db.query('delete from gallery_post where "userId" = $1', [admin.id]);
		await db.query('delete from bubble_game_record where "userId" = $1', [admin.id]);
		await db.query('delete from registry_item where "userId" = $1 and scope @> $2::varchar[]', [
			admin.id, ['dropAndFusionGame'],
		]);
		const managedNotes = (await db.query(
			'select id, "userId" from note where "userId" = any($1::varchar[]) or "userId" = $2',
			[ids, admin.id],
		)).rows;
		const adminNotes = managedNotes.filter(note => note.userId === admin.id);
		await db.query('delete from note where "userId" = $1', [admin.id]);
		await db.query('delete from "user" where id = any($1::varchar[])', [ids]);
		await db.query('delete from app where name = any($1::varchar[])', [MANAGED_APP_NAMES]);
		await db.query('delete from used_username where username = any($1::varchar[])', [
			[...new Set([...LEGACY_USERNAMES, ...SEED_USERNAMES])],
		]);
		await db.query('delete from registry_item where scope && $1::varchar[] or scope && $2::varchar[]', [MARKER_SCOPE, LEGACY_SCOPE]);

		// 级联删除不会回填反规范化计数，重新计算本机用户的公开统计。
		await db.query(`
			update "user" u set
				"followersCount" = (select count(*)::int from following f where f."followeeId" = u.id),
				"followingCount" = (select count(*)::int from following f where f."followerId" = u.id),
				"notesCount" = (select count(*)::int from note n where n."userId" = u.id)
			where u.host is null
		`);
		await db.query('commit');
		const removedRankingEntries = await removeManagedFeaturedEntries(redis, managedNotes.map(note => note.id));
		const orphanNotificationStreams = await cleanupOrphanNotificationStreams(db, redis);
		console.log(`• 已清理旧社区数据：${users.length} 个账号，${products.length} 件商品，${redPackets.length} 个红包，${adminChatRooms.rowCount + seedChatRooms} 个旧群聊，${adminNotes.length} 条旧帖，${adminChats.rowCount} 条旧私信，${adminPlays.rowCount} 个旧互动应用，${adminGalleries.rowCount} 个旧图集`);
		if (removedRankingEntries > 0) console.log(`• 已清理 ${removedRankingEntries} 条旧精选排序记录`);
		if (orphanNotificationStreams > 0) console.log(`• 已清理 ${orphanNotificationStreams} 个失效用户的通知流`);
	} catch (error) {
		await db.query('rollback');
		throw error;
	}
}

async function prepareAccounts(db, admin) {
	const accounts = { admin };
	const hash = await bcrypt.hash(PASSWORD, 10);

	for (const account of ACCOUNTS) {
		const found = (await db.query('select id, token from "user" where "usernameLower" = $1 and host is null', [account.username.toLowerCase()])).rows[0];
		if (found) {
			await db.query('update user_profile set password = $1 where "userId" = $2', [hash, found.id]);
			accounts[account.key] = { ...account, id: found.id, token: found.token };
			stats.skipped++;
			continue;
		}
		const created = await api('admin/accounts/create', { username: account.username, password: PASSWORD }, admin.token).catch(async (error) => {
			const saved = (await db.query('select id, token from "user" where "usernameLower" = $1 and host is null', [account.username.toLowerCase()])).rows[0];
			if (!saved) throw error;
			console.warn(`  ! ${account.username} 创建接口报错（${error.message}），账号已存在，继续使用`);
			return saved;
		});
		accounts[account.key] = { ...account, id: created.id, token: created.token };
		stats.ok++;
		console.log(`  + 创建账号 ${account.username}`);
	}
	await db.query('update user_profile set password = $1 where "userId" = any($2::varchar[])', [
		hash, ACCOUNTS.map(account => accounts[account.key]?.id).filter(Boolean),
	]);
	await db.query('update user_profile set password = $1 where "userId" = $2', [hash, admin.id]);
	return accounts;
}

async function hasManagedSeedData(db, admin) {
	const row = (await db.query(`
		select exists(
			select 1 from "user"
			where "usernameLower" = any($1::varchar[]) and id <> $2
		) or exists(
			select 1 from registry_item
			where "userId" = $2 and (scope && $3::varchar[] or scope && $4::varchar[])
		) as exists
	`, [[...new Set([...LEGACY_USERNAMES, ...SEED_USERNAMES])], admin.id, MARKER_SCOPE, LEGACY_SCOPE])).rows[0]?.exists;
	return row === true;
}

// 已完成的分组记录在管理员的注册表里，重跑时跳过，避免重复发帖。
async function runSection(accounts, name, fn) {
	const key = `section_${name}`;
	if (!force) {
		const done = await api('i/registry/get', { key, scope: MARKER_SCOPE }, accounts.admin.token).catch(() => null);
		if (done) {
			console.log(`• ${name}：已写入过，跳过（--reset 可重建）`);
			stats.skipped++;
			return;
		}
	}
	console.log(`• ${name}`);
	const result = await fn();
	await api('i/registry/set', { key, value: new Date().toISOString(), scope: MARKER_SCOPE }, accounts.admin.token);
	return result;
}

// 重跑或数据已存在时这些错误视为已完成。
const ALREADY = new Set(['ALREADY_FOLLOWING', 'ALREADY_REACTED', 'ALREADY_FAVORITED', 'ALREADY_LIKED', 'ALREADY_CLIPPED', 'ALREADY_ADDED', 'ALREADY_VOTED', 'ALREADY_ASSIGNED', 'ALREADY_CLAIMED', 'ALREADY_CHECKED_IN', 'ALREADY_EXISTS', 'NAME_ALREADY_EXISTS', 'ALREADY_PROMOTED', 'ALREADY_MEMBER', 'ALREADY_JOINED', 'ALREADY_MUTING', 'ALREADY_MUTING_CHANNEL', 'ARTICLE_TAG_ALREADY_EXISTS', 'REPORT_ALREADY_RESOLVED']);

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

const communityKeys = ACCOUNTS.map(account => account.key);

const PROFILE_PREFERENCES = {
	main: {
		followingVisibility: 'public',
		followersVisibility: 'public',
		notificationRecieveConfig: {
			note: { type: 'following' },
			renote: { type: 'followingOrFollower' },
			reaction: { type: 'followingOrFollower' },
		},
	},
	writer: {
		customStatus: { icon: 'book', text: '赶稿中' },
		onlineStatusOverride: 'busy',
		onlineStatusAutoReplies: { busy: '正在赶稿，编辑和约稿消息会晚一点回复。' },
		followingVisibility: 'followers',
		followersVisibility: 'public',
		chatScope: 'mutual',
		hardMutedWords: [['洗稿', '代写']],
		notificationRecieveConfig: {
			note: { type: 'mutualFollow' },
			quote: { type: 'mutualFollow' },
			reaction: { type: 'mutualFollow' },
		},
	},
	dev: {
		customStatus: { icon: 'code', text: '修 Bug' },
		onlineStatusOverride: 'away',
		onlineStatusAutoReplies: { away: '在开会或写代码，看到会统一回复。紧急问题请附最小复现。' },
		followingVisibility: 'public',
		followersVisibility: 'followers',
		chatScope: 'followers',
		mutedWords: [['加微信', '引流', '兼职刷单']],
		publicReactions: false,
	},
	designer: {
		customStatus: { icon: 'focus', text: '画图中' },
		onlineStatusOverride: 'doNotDisturb',
		onlineStatusAutoReplies: { doNotDisturb: '正在集中画图，消息会在休息时回复。' },
		followingVisibility: 'followers',
		followersVisibility: 'followers',
		chatScope: 'mutual',
		notificationRecieveConfig: {
			note: { type: 'mutualFollow' },
			reaction: { type: 'mutualFollow' },
		},
	},
	mod: {
		chatScope: 'everyone',
		notificationRecieveConfig: {
			follow: { type: 'all' },
			receiveFollowRequest: { type: 'all' },
			chatRoomInvitationReceived: { type: 'all' },
			roleAssigned: { type: 'all' },
		},
	},
	newbie: {
		followingVisibility: 'followers',
		followersVisibility: 'public',
		chatScope: 'followers',
		mutedWords: [['代练', '刷粉', '低价出号']],
	},
	private: {
		hideOnlineStatus: true,
		onlineStatusOverride: 'invisible',
		followingVisibility: 'private',
		followersVisibility: 'private',
		chatScope: 'mutual',
		isExplorable: false,
		noCrawle: true,
		preventAiLearning: true,
		autoSensitive: true,
	},
	seller: {
		customStatus: { icon: 'briefcase', text: '开窑中' },
		onlineStatusOverride: 'away',
		onlineStatusAutoReplies: { away: '正在工作室修坯，发货和定制问题会按顺序回复。' },
		followingVisibility: 'public',
		followersVisibility: 'public',
		chatScope: 'everyone',
	},
	buyer: {
		followingVisibility: 'followers',
		followersVisibility: 'public',
		chatScope: 'following',
		notificationRecieveConfig: {
			renote: { type: 'mutualFollow' },
			quote: { type: 'mutualFollow' },
		},
	},
	travel: {
		customStatus: { icon: 'plane', text: '在路上' },
		onlineStatusOverride: 'away',
		onlineStatusAutoReplies: { away: '在外拍摄，信号不稳定，回来后会看消息。' },
		followingVisibility: 'public',
		followersVisibility: 'public',
		chatScope: 'mutual',
	},
	kitchen: {
		customStatus: { icon: 'food', text: '做饭中' },
		onlineStatusOverride: 'busy',
		onlineStatusAutoReplies: { busy: '正在厨房，手上都是面粉，晚点回复。' },
		followingVisibility: 'public',
		followersVisibility: 'followers',
		chatScope: 'everyone',
	},
	books: {
		customStatus: { icon: 'book', text: '读书中' },
		onlineStatusOverride: 'away',
		onlineStatusAutoReplies: { away: '在书店值班，空闲时会回复消息。' },
		followingVisibility: 'followers',
		followersVisibility: 'public',
		chatScope: 'mutual',
		mutedWords: [['盗版书', '代购']],
		notificationRecieveConfig: {
			note: { type: 'mutualFollow' },
			reaction: { type: 'mutualFollow' },
		},
	},
};

async function seedProfiles(a) {
	for (const key of communityKeys) {
		const user = a[key];
		if (!user) continue;
		const avatar = await step(`${key} 头像`, () => uploadAsset(
			user.token, `avatar:${key}`, `${user.username}-avatar.jpg`, user.avatarUrl, user.colors,
		));
		const banner = await step(`${key} 横幅`, () => uploadAsset(
			user.token, `banner:${key}`, `${user.username}-banner.jpg`, user.bannerUrl, [user.colors[1], user.colors[0]],
		));
		const profile = {
			name: user.name,
			description: user.description,
			location: user.location,
			birthday: user.birthday,
			company: user.company,
			jobTitle: user.jobTitle,
			fields: user.fields,
			followedMessage: user.followedMessage,
			lang: 'zh-CN',
			chatScope: 'everyone',
			autoAcceptFollowed: user.isLocked !== true,
			isLocked: user.isLocked === true,
			avatarId: avatar?.id ?? undefined,
			bannerId: banner?.id ?? undefined,
		};
		await step(`${key} 资料`, () => api('i/update', profile, user.token));
		const preferences = PROFILE_PREFERENCES[key];
		if (preferences) await step(`${key} 隐私与通知设置`, () => api('i/update', preferences, user.token));
	}
}

const FOLLOW_GRAPH = {
	main: ['writer', 'dev', 'designer', 'mod', 'travel', 'books', 'kitchen', 'buyer', 'seller', 'newbie'],
	writer: ['main', 'books', 'travel', 'kitchen', 'dev'],
	dev: ['main', 'designer', 'writer', 'mod', 'travel'],
	designer: ['main', 'dev', 'writer', 'travel', 'seller', 'buyer'],
	mod: ['main', 'dev', 'writer', 'newbie', 'books'],
	newbie: ['main', 'writer', 'dev', 'books', 'kitchen', 'travel'],
	private: ['main', 'writer', 'travel'],
	seller: ['buyer', 'designer', 'kitchen', 'main'],
	buyer: ['main', 'seller', 'kitchen', 'books', 'travel', 'designer'],
	travel: ['main', 'writer', 'designer', 'books', 'kitchen', 'newbie'],
	kitchen: ['main', 'writer', 'buyer', 'books', 'seller'],
	books: ['main', 'writer', 'travel', 'kitchen', 'mod', 'newbie'],
};

async function seedFollows(a) {
	for (const [followerKey, followeeKeys] of Object.entries(FOLLOW_GRAPH)) {
		const follower = a[followerKey];
		if (!follower) continue;
		for (const followeeKey of followeeKeys) {
			const followee = a[followeeKey];
			if (!followee || followee.id === follower.id) continue;
			await act(`${follower.username} 关注 ${followee.username}`, () => api('following/create', { userId: followee.id }, follower.token));
		}
	}
	await act('主账号申请关注晚星', () => api('following/create', { userId: a.private.id }, a.main.token));
	await act('通过主账号关注申请', () => api('following/requests/accept', { userId: a.main.id }, a.private.token));
	for (const key of ['newbie', 'kitchen']) {
		await act(`${key} 关注申请`, () => api('following/create', { userId: a.private.id }, a[key].token));
	}
	for (const key of ['writer', 'dev', 'designer', 'travel', 'books', 'mod']) {
		await act(`管理员关注 ${key}`, () => api('following/create', { userId: a[key].id }, a.admin.token));
	}
}

async function seedAdminPresence(a) {
	await step('管理员资料', () => api('i/update', {
		name: '李不白',
		description: '平时在这里维护社区，偶尔记点散步和书。\n遇到使用问题请写清页面和操作步骤，举报也尽量带上下文，不用客气。',
		location: '北京',
		lang: 'zh-CN',
		chatScope: 'everyone',
		fields: [{ name: '负责', value: '社区维护，主要看反馈' }, { name: '最近读', value: '断断续续在读城市史' }],
	}, a.admin.token));

	const feedbackNote = await post(a, 'admin', {
		text: '把上周反馈重新看了一遍，六条里有三条都是找不到发布入口。\n这周先改入口和说明，不加新功能。改完会找原来提问题的人再看一次。#社区共建',
	});
	await post(a, 'admin', {
		text: '今晚会整理一遍社区备份和图片存储。正常浏览不受影响，如果你刚好在编辑长文章，记得先存一下草稿。#社区公告',
	});
	const readingNote = await post(a, 'admin', {
		text: '上周沿河边走了很久，最后在一家旧书店停住。老板没有急着推荐书，只问我最近为什么睡不好。\n买到什么反而记不清了，倒是这句话一直想着。#阅读 #城市散步',
	});
	const riversidePhoto = await step('管理员图集照片', () => uploadAsset(
		a.admin.token, 'admin:gallery:riverside-bookstore', 'riverside-bookstore.jpg',
		unsplash('photo-1524995997946-a1c2e315a42f', 1080, 1350), ['#7c2d12', '#1e3a8a'],
	));
	if (riversidePhoto) {
		const gallery = await step('管理员图集', () => api('gallery/posts/create', {
			title: '河边旧书店的下午',
			description: '没找到想买的书，坐了半小时。快关门时老板把“今日营业”的木牌收进来，我顺手拍了一张。',
			fileIds: [riversidePhoto.id],
		}, a.admin.token));
		if (gallery) for (const key of ['main', 'writer', 'books', 'designer']) {
			await act('管理员图集点赞（需 Redis 7+）', () => api('gallery/posts/like', { postId: gallery.id }, a[key].token));
		}
	}

	if (feedbackNote) {
		const writerReply = await post(a, 'writer', {
			replyId: feedbackNote.id,
			text: '按场景整理比单纯收集意见有用。需要帮忙补充写作者这边的使用路径，可以随时叫我。',
		});
		if (writerReply) {
			await post(a, 'admin', {
				replyId: writerReply.id,
				text: '好，我先把文章编辑和草稿恢复这两段整理出来，有遗漏再补充。',
			});
		}
	}
	if (readingNote) {
		await post(a, 'main', {
			replyId: readingNote.id,
			text: '旧书店老板那句话很打动我。下次路过也想去坐一会儿。',
		});
	}

	for (const [note, reactions] of [
		[feedbackNote, [['main', '🙌'], ['writer', '👍'], ['mod', '💡'], ['newbie', '❤️']]],
		[readingNote, [['main', '📚'], ['designer', '❤️'], ['travel', '🌙'], ['kitchen', '👏']]],
	]) {
		if (!note) continue;
		for (const [key, reaction] of reactions) {
			await act('管理员帖子点赞', () => api('notes/likes/create', { noteId: note.id }, a[key].token));
			await act('管理员帖子回应', () => api('notes/reactions/create', { noteId: note.id, reaction }, a[key].token));
		}
	}
}

async function seedInstanceSettings(a) {
	await step('社区发现页置顶用户', () => api('admin/update-meta', {
		pinnedUsers: ['linzhixia', 'shenyan_writes', 'ali_studio'],
		serverRules: [
			'尊重不同的生活经验，讨论事情时尽量对事不对人。',
			'发布他人照片、聊天记录或采访内容前，先征得当事人同意。',
			'转载和引用请注明来源，不确定出处时先说明。',
			'集市商品和付费服务要写清交付方式、时间与退款约定。',
			'发现骚扰、冒充或疑似诈骗时保留证据，并通过举报说明情况。',
		],
	}, a.admin.token));
}

async function seedRoles(a, db) {
	const existing = (await db.query('select id from role where name = $1', ['社区共建者'])).rows[0];
	const role = existing ?? await step('创建社区共建者角色', () => api('admin/roles/create', {
		name: '社区共建者', description: '参与新朋友引导、活动组织和反馈整理。', color: '#0ea5e9', iconUrl: null,
		target: 'manual', condFormula: {}, isPublic: true, isModerator: true, isAdministrator: false, asBadge: true,
		canEditMembersByModerator: false, displayOrder: 10, policies: {},
	}, a.admin.token));
	if (role) await act('分配社区共建者角色', () => api('admin/roles/assign', { roleId: role.id, userId: a.mod.id }, a.admin.token));
	const creator = (await db.query('select id from role where name = $1', ['原创作者'])).rows[0] ?? await step('创建原创作者角色', () => api('admin/roles/create', {
		name: '原创作者', description: '持续分享原创文章、摄影和设计作品。', color: '#d97706', iconUrl: null,
		target: 'manual', condFormula: {}, isPublic: true, isModerator: false, isAdministrator: false, asBadge: true,
		canEditMembersByModerator: false, displayOrder: 8, policies: {},
	}, a.admin.token));
	if (creator) for (const key of ['writer', 'designer', 'travel', 'books', 'kitchen']) {
		await act(`分配原创作者角色 ${key}`, () => api('admin/roles/assign', { roleId: creator.id, userId: a[key].id }, a.admin.token));
	}
	const maker = (await db.query('select id from role where name = $1', ['手作店主'])).rows[0] ?? await step('创建手作店主角色', () => api('admin/roles/create', {
		name: '手作店主', description: '在集市发布原创手作和设计作品。', color: '#b45309', iconUrl: null,
		target: 'manual', condFormula: {}, isPublic: true, isModerator: false, isAdministrator: false, asBadge: true,
		canEditMembersByModerator: false, displayOrder: 6, policies: {},
	}, a.admin.token));
	if (maker) await act('分配手作店主角色', () => api('admin/roles/assign', { roleId: maker.id, userId: a.seller.id }, a.admin.token));
	for (const name of ['技术', '生活', '开发', '前端', '设计', '随笔', '开源', '效率', '摄影', '阅读', '城市', '手作', '厨房', '书影音', 'vue', 'typescript', '旅行', '排版']) {
		await act(`文章标签 ${name}`, () => api('admin/article-tags/update', { action: 'create', name }, a.admin.token));
	}
}

async function seedChannels(a) {
	const channels = [
		{
			owner: 'main', name: '城市散步', description: '菜市场、旧街、下班后的河岸。记录城市里值得慢慢走的路。', color: '#0f766e',
			imageUrl: unsplash('photo-1519608487953-e999c86e7455', 1600, 500),
			followers: ['writer', 'designer', 'travel', 'newbie', 'buyer', 'books'],
		},
		{
			owner: 'dev', name: '前端手记', description: 'Vue、TypeScript、构建工具和那些踩过之后才明白的坑。', color: '#047857',
			imageUrl: unsplash('photo-1498050108023-c5249f4df085', 1600, 500),
			followers: ['main', 'designer', 'writer', 'mod', 'newbie'],
		},
		{
			owner: 'designer', name: '视觉与排版', description: '配色、字体、版式和作品复盘。欢迎带着具体问题来讨论。', color: '#be185d',
			imageUrl: unsplash('photo-1545235617-9465d2a55698', 1600, 500),
			followers: ['main', 'dev', 'writer', 'travel', 'buyer'],
		},
		{
			owner: 'writer', name: '书影音客厅', description: '读书、电影和音乐。可以写短评，也可以认真写一篇长文。', color: '#9a3412',
			imageUrl: unsplash('photo-1524995997946-a1c2e315a42f', 1600, 500),
			followers: ['main', 'books', 'kitchen', 'mod', 'newbie', 'travel'],
		},
		{
			owner: 'seller', name: '手作与器物', description: '陶瓷、木作、织物，以及双手做东西的过程。', color: '#92400e',
			imageUrl: unsplash('photo-1452860606245-08befc0ff44b', 1600, 500),
			followers: ['main', 'buyer', 'designer', 'kitchen', 'newbie'],
		},
		{
			owner: 'kitchen', name: '厨房小事', description: '家常菜、早餐和一个人也要好好吃饭的日常。', color: '#15803d',
			imageUrl: unsplash('photo-1504674900247-0877df9cc836', 1600, 500),
			followers: ['main', 'writer', 'buyer', 'books', 'seller'],
		},
		{
			owner: 'mod', name: '新朋友请进', description: '第一次发帖、功能介绍和使用问题都可以在这里问。', color: '#b45309',
			imageUrl: unsplash('photo-1516321318423-f06f85e504b3', 1600, 500),
			followers: ['main', 'newbie', 'writer', 'books', 'kitchen'],
		},
	];
	const channelIds = {};
	for (const channel of channels) {
		const owner = a[channel.owner];
		const banner = await step(`${channel.name} 横幅`, () => uploadAsset(
			owner.token, `channel:${channel.name}`, `channel-${channel.owner}.jpg`, channel.imageUrl, [channel.color, '#1e293b'],
		));
		const created = await step(`频道 ${channel.name}`, () => api('channels/create', { name: channel.name, description: channel.description, color: channel.color, bannerId: banner?.id ?? null }, owner.token));
		if (!created) continue;
		channelIds[channel.name] = created.id;
		for (const key of channel.followers) {
			if (key === channel.owner || !a[key]) continue;
			await act('关注频道', () => api('channels/follow', { channelId: created.id }, a[key].token));
		}
		for (const key of [channel.owner, channel.followers[0]].filter(Boolean)) {
			await act('收藏频道', () => api('channels/favorite', { channelId: created.id }, a[key].token));
		}
	}
	return channelIds;
}

async function seedRelationships(a, db) {
	const frontendChannel = (await db.query('select id from channel where name = $1 limit 1', ['前端手记'])).rows[0];
	if (frontendChannel) {
		await act('静音前端频道', () => api('channels/mute/create', {
			channelId: frontendChannel.id,
		}, a.newbie.token));
	}

	// 保留原帖和关注关系，只是少看店主反复转发商品动态。
	await act('减少店主转帖', () => api('renote-mute/create', {
		userId: a.seller.id,
	}, a.buyer.token));
	// 主账号这周在集中整理采访稿，暂时静音店主的日常动态。
	await act('暂时静音店主', () => api('mute/create', {
		userId: a.seller.id,
		expiresAt: Date.now() + 7 * 86400000,
	}, a.main.token));
}

async function post(a, key, params) {
	const res = await step(`${key} 发帖`, () => api('notes/create', params, a[key].token));
	return res?.createdNote ?? null;
}

async function seedNotes(a, db) {
	const channelNames = ['城市散步', '前端手记', '视觉与排版', '书影音客厅', '手作与器物', '厨房小事', '新朋友请进'];
	const channelIds = Object.fromEntries((await db.query('select id, name from channel where name = any($1::varchar[])', [channelNames])).rows.map(row => [row.name, row.id]));
	const assets = {};
	const media = [
		['market', 'main', 'market-morning.jpg', unsplash('photo-1488459716781-31db52582fe9', 1280, 960), ['#b45309', '#166534']],
		['sunset', 'main', 'river-sunset.jpg', unsplash('photo-1495616811223-4d98c6e9c869', 1280, 960), ['#c2410c', '#4c1d95']],
		['desk', 'main', 'work-desk.jpg', unsplash('photo-1497215728101-856f4ea42174', 1280, 960), ['#78716c', '#0f766e']],
		['cafe', 'writer', 'cafe-window.jpg', unsplash('photo-1495474472287-4d71bcdd2085', 1280, 960), ['#92400e', '#f59e0b']],
		['notebook', 'writer', 'writing-notebook.jpg', unsplash('photo-1455390582262-044cdead277a', 1280, 960), ['#7c2d12', '#e7e5e4']],
		['code', 'dev', 'weekly-code.jpg', unsplash('photo-1515879218367-8466d910aaa4', 1280, 800), ['#065f46', '#1e3a8a']],
		['camera', 'dev', 'film-camera.jpg', unsplash('photo-1516035069371-29a1b244cc32', 1280, 960), ['#334155', '#b45309']],
		['palette', 'designer', 'color-study.jpg', unsplash('photo-1545235617-9465d2a55698', 1280, 960), ['#be185d', '#1e1b4b']],
		['sketch', 'designer', 'daily-sketch.jpg', unsplash('photo-1513364776144-60967b0f800f', 1280, 960), ['#9d174d', '#f59e0b']],
		['campus', 'newbie', 'campus-autumn.jpg', unsplash('photo-1516321318423-f06f85e504b3', 1280, 960), ['#4d7c0f', '#d97706']],
		['rain', 'private', 'rain-window.jpg', unsplash('photo-1519692933481-e162a57d6721', 1280, 960), ['#334155', '#6b21a8']],
		['pottery', 'seller', 'new-cups.jpg', unsplash('photo-1610701596007-11502861dcfa', 1280, 960), ['#92400e', '#e7e5e4']],
		['tea', 'buyer', 'tea-table.jpg', unsplash('photo-1544787219-7f47ccb76574', 1280, 960), ['#9a3412', '#e7e5e4']],
		['mountain', 'travel', 'morning-mountain.jpg', unsplash('photo-1464822759023-fed622ff2c3b', 1280, 960), ['#0369a1', '#0f172a']],
		['breakfast', 'kitchen', 'weekend-breakfast.jpg', unsplash('photo-1533777324565-a040eb52facd', 1280, 960), ['#b45309', '#fde68a']],
		['bookstore', 'books', 'bookstore-corner.jpg', unsplash('photo-1524995997946-a1c2e315a42f', 1280, 960), ['#7c2d12', '#1e3a8a']],
		['home', 'buyer', 'quiet-home.jpg', unsplash('photo-1484101403633-562f891dc89a', 1280, 960), ['#78716c', '#0f766e']],
	];
	for (const [key, owner, name, url, colors] of media) {
		assets[key] = await step(`${key} 配图`, () => uploadAsset(a[owner].token, `note:${key}`, name, url, colors));
	}
	const files = (...keys) => keys.map(key => assets[key]?.id).filter(Boolean);
	const n = {};

	n.mainMarket = await post(a, 'main', {
		text: '周六七点去菜市场，卖花的阿姨把最后一束小雏菊塞给我，说放窗边能开一周。\n回家路上又买了葱油饼，早饭白做了。#城市散步 #生活',
		fileIds: files('market'),
		channelId: channelIds['城市散步'],
	});
	n.mainPhone = await post(a, 'main', {
		text: '试了三天把手机扔在玄关充电。第一天看了十几页书，第二天在沙发缝里找到手机，第三天干脆忘了这回事。\n方法可能有用，执行的人不太行。',
	});
	n.mainWeekendPoll = await post(a, 'main', {
		text: '如果周六下午完全属于自己，你最想怎么过？#周末',
		poll: { choices: ['去公园坐一下午', '逛菜市场和书店', '在家做饭看电影', '骑车去没去过的街区'], multiple: false, expiredAfter: 5 * 86400000 },
	});
	n.mainSunset = await post(a, 'main', {
		text: '本来只打算走到桥就回，结果在江边站到天全黑。\n手机拍出来全是噪点，眼睛看见的比照片好看。#摄影 #日常',
		fileIds: files('sunset'),
	});
	n.mainDesk = await post(a, 'main', {
		text: '收拾桌面，翻出两张过期优惠券和一张去年的电影票。真正天天用的东西没几样，剩下的全在占地方。\n先塞进抽屉，明天再决定扔不扔。',
		fileIds: files('desk'),
	});
	n.mainHomeOnly = await post(a, 'main', {
		text: '明天去上海看一个字体展，想顺便逛两家旧书店。\n这条就留在首页，回来再整理成文章。',
		visibility: 'home',
	});
	n.mainSpecified = await post(a, 'main', {
		text: '@shenyan_writes 你上次说的那本《城市与狗》我终于读完了。最想聊的是结尾，等你忙完这阵子我们约个咖啡。',
		visibility: 'specified',
		visibleUserIds: [a.writer.id],
	});
	n.mainPlansPoll = await post(a, 'main', {
		text: '如果这周末留半天给朋友，你们通常会怎么约？可以多选，想看看大家真实的习惯。#周末 #生活',
		poll: {
			choices: ['找家小店坐着聊天', '一起去逛展或书店', '买菜回家做饭', '公园散步遛弯', '各带一本书安静待着'],
			multiple: true,
			expiredAfter: 6 * 86400000,
		},
	});

	n.writerDelete = await post(a, 'writer', {
		text: '删了九百字。删的时候很心疼，删完再看，确实早该删。\n今天先到这里，我去楼下走一圈。#写作',
	});
	n.writerBook = await post(a, 'writer', {
		text: '“城市不会泄露自己的过去，只会把它像手纹一样藏起来。”\n晚上重读《看不见的城市》，还是会在同一页停下来。#阅读 #城市',
		channelId: channelIds['书影音客厅'],
	});
	n.writerCafe = await post(a, 'writer', {
		text: '在咖啡馆坐了两个小时，稿子推进两百字。\n隔壁桌从相亲聊到房价，我听得比写得多。明天还是回家写。#写作',
		fileIds: files('cafe'),
	});
	n.writerQuestion = await post(a, 'writer', {
		text: '想问问大家：有没有哪本书，是你每隔几年都会重新读一遍的？\n我最近想把重读的书整理成一个短书单。#阅读',
		channelId: channelIds['书影音客厅'],
	});
	n.writerSpoiler = await post(a, 'writer', {
		cw: '《长夜》结尾剧透',
		text: '看到最后才明白，主角根本没离开那座城。前面所有“出发”都是他给自己编的路线。\n合上书以后有点生气，又觉得作者是对的。#阅读',
	});
	n.writerReadingClub = await post(a, 'writer', {
		text: '十一月共读先定《看不见的城市》。周日晚八点线上聊，没读完也能来。\n报名页明晚补，今天实在不想再改字了。#书影音',
	});

	n.devClip = await post(a, 'dev', {
		text: '今天又遇到一个很典型的 CSS 问题：`overflow: clip` 不会创建滚动容器，所以里面写 `position: sticky` 依然能吸顶。\n做展开面板时挺有用，记一下。#前端 #CSS',
		channelId: channelIds['前端手记'],
	});
	n.devRef = await post(a, 'dev', {
		text: '把表单逻辑抽成组合式函数，第一版调用时要多传三个开关，看着比原来还复杂。\n下午又拆回去一半。抽象这件事，写顺了才算数。#Vue #TypeScript',
	});
	n.devPoll = await post(a, 'dev', {
		text: '新项目你们会优先选哪套构建工具？想听听真实项目里的取舍。#前端',
		poll: { choices: ['Vite', 'Rsbuild', 'Rspack', '还是看团队习惯'], multiple: false, expiredAfter: 7 * 86400000 },
	});
	n.devCamera = await post(a, 'dev', {
		text: '周末拆胶片机清灰，装回去多出一颗螺丝。快门倒是不粘了，先当作没看见。\n有人认识深圳修老相机靠谱的店吗？#摄影',
		fileIds: files('camera'),
	});
	n.devCode = await post(a, 'dev', {
		text: '周五下午没排会，关掉消息清了一周的小问题。\n修完七条，新增三条，净进度四条。已经比上周强。#工作记录',
		fileIds: files('code'),
	});

	n.designPalette = await post(a, 'designer', {
		text: '给一篇桂花主题的稿子试了三组颜色，最后留下灰绿、砖红和很浅的米色。\n第一版像奶茶广告，重做以后才安静下来。#设计 #配色',
		fileIds: files('palette'),
		channelId: channelIds['视觉与排版'],
	});
	n.designSketch = await post(a, 'designer', {
		text: '第 97 张。今天画的是地铁上睡着的人，包还夹在胳膊底下。\n画快了比例有点歪，但神态比昨天那张好。#插画 #日常',
		fileIds: files('sketch'),
	});
	n.designType = await post(a, 'designer', {
		text: '把一篇长文的正文从 16 调到 17，行高也加了一点。别的地方没动。\n客户问是不是换了字体。没有，只是终于能读下去了。#设计 #排版',
	});
	n.designFollowers = await post(a, 'designer', {
		text: '关注者可见：下周会先放出一套“城市漫游”图标的草稿，想先收集几轮使用反馈，再决定最终线条粗细。',
		visibility: 'followers',
	});
	n.designFeedback = await post(a, 'designer', {
		text: '最近用夜间的深色界面，发现几个次要按钮的灰和背景贴得太近。\n已经整理成反馈，细节不一定影响使用，但看久了确实有点累。#界面设计',
	});

	n.modHello = await post(a, 'mod', {
		text: '给第一次来的朋友：先用帖子记点日常就行，不用一上来就写完整文章。\n遇到问题别急着删号，把页面和操作步骤写在反馈里，我们会看。#新朋友 #社区',
		channelId: channelIds['新朋友请进'],
	});
	n.modDigest = await post(a, 'mod', {
		text: '这周看得比较久的三篇：\n@shenyan_writes 的周记方法、@ali_studio 的排版节奏，还有 @anran_onroad 的清晨照片。\n周末快乐，终于可以晚点看消息了。#每周精选',
	});
	n.modFeedback = await post(a, 'mod', {
		text: '这周的反馈里，有三条都在说同一件事：文章编辑到一半切出去，回来找不到刚才的位置。\n我先去复现，能稳定出现的再整理进本周清单。#社区共建',
	});

	n.newbieIntro = await post(a, 'newbie', {
		text: '第一次发帖。想问文章和帖子到底怎么分？\n我最近在做一个校园采访，素材很散，不知道先发帖还是直接憋一篇长的。#新朋友',
		channelId: channelIds['新朋友请进'],
	});
	n.newbieCampus = await post(a, 'newbie', {
		text: '下课去操场，梧桐叶落了一地。第一次带借来的相机认真拍，蹲太久站起来差点晕。\n拍了一百多张，能看的可能不到十张。#校园 #摄影',
		fileIds: files('campus'),
	});
	n.newbiePoll = await post(a, 'newbie', {
		text: '早餐只能选一样，你会选什么？最近起床越来越困难，需要一点灵感。#早餐',
		poll: { choices: ['豆浆油条', '肠粉', '面包咖啡', '一碗热粥'], multiple: false, expiredAfter: 4 * 86400000 },
	});

	n.privateRain = await post(a, 'private', {
		text: '雨停以后从公交站走回家，路边积水反光很好看。拍完鞋也湿透了。\n只留一张。',
		fileIds: files('rain'),
		visibility: 'followers',
	});
	n.privateNightBus = await post(a, 'private', {
		text: '末班车上有人抱着一束花，有人拿电脑包当枕头。\n想拍一组“下班以后”，但还没想好怎么开口问陌生人。先自己拍着。',
		visibility: 'followers',
	});

	n.sellerCups = await post(a, 'seller', {
		text: '今天开窑，十二只白瓷杯活了九只。两只杯口歪，一只釉面缩了点，留着自己用。\n成的九只已经上架，杯口弧度和照片里不会完全一样。#手作 #陶瓷',
		fileIds: files('pottery'),
		channelId: channelIds['手作与器物'],
	});
	n.sellerPacking = await post(a, 'seller', {
		text: '下午包了十二个订单，腰快断了。\n最怕的是同一批杯子颜色有深有浅，备注里写“要和图上一模一样”的朋友，真的很难保证。已经在详情里补了说明。#工作室日常',
	});
	n.sellerOrder = await post(a, 'seller', {
		text: '新的一批窑变釉小碟出窑，灰蓝多，铁锈红少。\n有两只底部有针孔大的釉坑，不影响用，我会单独标出来便宜出。介意的别拍。#集市',
	});

	n.buyerTea = await post(a, 'buyer', {
		text: '周末把茶桌收了，只留两只杯子和一个旧木托盘。\n以前摆一排杯子，最后天天用的还是那两个。剩下的装箱，眼不见心不烦。#生活 #茶器',
		fileIds: files('tea'),
	});
	n.buyerHome = await post(a, 'buyer', {
		text: '搬进来两年，最满意的还是一把差点没买的旧椅子。坐着不软，但窝着看书刚好。\n当时嫌它不好看，现在家里别的椅子都像临时凑数的。#生活',
		fileIds: files('home'),
	});
	n.buyerDesk = await post(a, 'buyer', {
		text: '清桌面清到一半，开始给每样东西想“以后可能会用到”的理由。\n最后只扔了一盒坏掉的充电线和三支不出水的笔，但桌面看着确实舒服多了。',
	});

	n.travelMountain = await post(a, 'travel', {
		text: '五点半从镇上出发，走到山腰正好看见第一束光落在屋脊上。\n拍完才发现鞋穿错了，下坡脚疼一路。照片应该还行。#旅行 #摄影',
		fileIds: files('mountain'),
		channelId: channelIds['城市散步'],
	});
	n.travelTrain = await post(a, 'travel', {
		text: '成都到昆明，十二个小时。带了短篇集，实际只看了两页，大部分时间都在看窗外。\n记了七个没下车的小站名，有两个已经在地图上找不到了。#旅行',
	});
	n.travelQuestion = await post(a, 'travel', {
		text: '想整理一份“适合一个人走两天”的城市名单，不要打卡景点，只要早饭好吃、街道能慢慢走。\n你们会推荐哪里？#旅行',
	});

	n.kitchenBreakfast = await post(a, 'kitchen', {
		text: '今天的早餐：烤吐司、煎蛋、半个番茄，还有昨晚剩的南瓜汤。\n吐司烤糊了一角，刮掉继续吃。提前十分钟起床是真的有用，虽然我还是差点迟到。#早餐 #厨房',
		fileIds: files('breakfast'),
		channelId: channelIds['厨房小事'],
	});
	n.kitchenNoodles = await post(a, 'kitchen', {
		text: '番茄牛腩我一般用两个番茄，一个炒成酱，一个出锅前放。牛腩焯水以后别用凉水冲，不然炖不烂。\n昨天盐放多了，今天这锅刚好。#食谱',
	});
	n.kitchenPoll = await post(a, 'kitchen', {
		text: '今晚不知道做什么，帮我选一个吧。#晚饭',
		poll: { choices: ['番茄炖牛腩', '香菇鸡饭', '青菜豆腐汤', '剩菜炒饭'], multiple: false, expiredAfter: 2 * 86400000 },
	});
	n.kitchenRoutine = await post(a, 'kitchen', {
		text: '先翻冰箱再写采购清单，结果还是买了两把青菜，因为另一把被压在最底下没看见。\n你们家冰箱也会自动长青菜吗？#厨房 #生活',
	});

	n.booksBookstore = await post(a, 'books', {
		text: '书店角落来了一只猫，在诗集上睡了两个小时。客人经过都放轻脚步。\n我本来想提醒它下面是刚到的书，看了半天还是算了。#书店日常',
		fileIds: files('bookstore'),
		channelId: channelIds['书影音客厅'],
	});
	n.booksRecommend = await post(a, 'books', {
		text: '最近读到一本短篇集，四五篇都喜欢，最后一篇没看懂。\n不想硬夸，准备写清楚哪篇好、哪篇让我出戏。作者应该不会介意。#阅读',
	});
	n.booksQuote = await post(a, 'books', {
		text: '今天小黑板本来想写新书推荐，最后只写了四个字：“这本好读。”\n老板路过说太像敷衍。可有的书就是好读啊。#书店日常',
	});

	// 自然的回复串和引用
	if (n.newbieIntro) {
		const modReply = await post(a, 'mod', {
			replyId: n.newbieIntro.id,
			text: '先发帖子。校园采访可以先发提纲和几段记录，素材成形了再整理文章。',
		});
		const writerReply = await post(a, 'writer', {
			replyId: n.newbieIntro.id,
			text: '我也建议先发帖。别一开始就按成稿要求自己，不然很容易写两段就卡住。',
		});
		if (modReply) await post(a, 'newbie', { replyId: modReply.id, text: '好，我先把提纲发出来。现在只有四个问题，应该不会被笑。' });
		if (writerReply) await post(a, 'main', { replyId: writerReply.id, text: '不会。提纲发出来大家才好帮你补问题。' });
		await act('静音介绍帖讨论', () => api('notes/thread-muting/create', { noteId: n.newbieIntro.id }, a.mod.token));
	}
	if (n.devClip) {
		const designReply = await post(a, 'designer', {
			replyId: n.devClip.id,
			text: '这个刚好能用在评论区的展开区域，记下了。',
		});
		if (designReply) await post(a, 'dev', { replyId: designReply.id, text: '对，不过外层不要同时加 `overflow: hidden`，不然还是会裁掉。' });
	}
	if (n.writerQuestion) {
		const bookReply = await post(a, 'books', {
			replyId: n.writerQuestion.id,
			text: '《夜航西飞》。每隔两年翻一次，还是会在一两个地方停下来。',
		});
		const kitchenReply = await post(a, 'kitchen', {
			replyId: n.writerQuestion.id,
			text: '《雅舍谈吃》。我主要是重读的时候会饿。',
		});
		if (bookReply) await post(a, 'writer', { replyId: bookReply.id, text: '这本我也重读过。第一次只觉得远，第二次开始注意她怎么写分别。' });
		if (kitchenReply) await post(a, 'books', { replyId: kitchenReply.id, text: '这本适合睡前翻两页，不适合饿的时候看。' });
	}
	if (n.designFeedback) {
		const devReply = await post(a, 'dev', {
			replyId: n.designFeedback.id,
			text: '方便的话把页面和主题发我，我看看是变量值还是组件自己的颜色。',
		});
		if (devReply) await post(a, 'designer', { replyId: devReply.id, text: '发你私信了，截图和浏览器信息都在。' });
	}
	if (n.travelQuestion) {
		const mainReply = await post(a, 'main', {
			replyId: n.travelQuestion.id,
			text: '推荐绍兴。早上去仓桥直街附近吃面，下午沿河走，景点可以一个都不去。',
		});
		const bookReply = await post(a, 'books', {
			replyId: n.travelQuestion.id,
			text: '泉州也不错，街边小店和旧建筑都适合慢慢看。',
		});
		if (mainReply) await post(a, 'travel', { replyId: mainReply.id, text: '记下了，正好还没去过绍兴。你说的面馆有名字吗？' });
		if (bookReply) await post(a, 'newbie', { replyId: bookReply.id, text: '泉州在小红书上收藏了很久，看来可以认真计划一下了。' });
	}
	const deepReplies = [];
	if (n.kitchenRoutine) {
		let parent = n.kitchenRoutine;
		const chain = [
			['main', '我会先想这周一定做哪两顿，剩下按保质期排。想吃的菜反而经常轮不上。'],
			['writer', '我试过先列想吃的，结果绿叶菜全烂在冰箱里。'],
			['dev', '我家贴便签在冰箱门上，做完划掉。问题是经常找不到笔。'],
			['newbie', '宿舍冰箱只有一层，估计一次只能买两天的菜。'],
			['buyer', '一个人住别囤叶菜，真的吃不完。土豆洋葱倒是能放。'],
			['travel', '我会当天做两份，第二天带走一份。不是勤快，是晚上不想再决定吃什么。'],
			['kitchen', '对，少做一次决定就少点一次外卖。'],
		];
		for (const [key, text] of chain) {
			const reply = await post(a, key, { replyId: parent.id, text });
			if (!reply) break;
			deepReplies.push(reply);
			parent = reply;
		}
		const booksBranch = await post(a, 'books', {
			replyId: deepReplies[4]?.id ?? n.kitchenRoutine.id,
			text: '我会把快坏的菜记在手机里，但经常连备忘录也忘。现在改成放在冰箱最外面。',
		});
		if (booksBranch) deepReplies.push(booksBranch);
		const designerBranch = await post(a, 'designer', {
			replyId: n.kitchenRoutine.id,
			text: '我做两份的时候总忍不住把第一份吃完，第二份又不够。',
		});
		if (designerBranch) {
			deepReplies.push(designerBranch);
			const sellerReply = await post(a, 'seller', {
				replyId: designerBranch.id,
				text: '做饭量很难估。我在工作室干脆用固定的碗量米，至少不会差太多。',
			});
			if (sellerReply) deepReplies.push(sellerReply);
		}
	}
	if (n.mainWeekendPoll) {
		for (const [key, choice] of [['writer', 0], ['dev', 1], ['designer', 2], ['newbie', 1], ['kitchen', 2], ['books', 1], ['buyer', 1]]) {
			await act('周末投票', () => api('notes/polls/vote', { noteId: n.mainWeekendPoll.id, choice }, a[key].token));
		}
	}
	if (n.mainPlansPoll) {
		const votes = [
			['writer', [0, 1]],
			['dev', [0, 4]],
			['designer', [1, 3]],
			['newbie', [0, 2, 3]],
			['kitchen', [2, 3]],
			['books', [1, 4]],
			['buyer', [0, 1, 2]],
			['travel', [3, 4]],
		];
		for (const [key, choices] of votes) {
			for (const choice of choices) {
				await act('周末朋友计划多选投票', () => api('notes/polls/vote', { noteId: n.mainPlansPoll.id, choice }, a[key].token));
			}
		}
	}
	if (n.devPoll) for (const [key, choice] of [['writer', 0], ['designer', 0], ['mod', 3], ['newbie', 3], ['travel', 0]]) {
		await act('构建工具投票', () => api('notes/polls/vote', { noteId: n.devPoll.id, choice }, a[key].token));
	}
	if (n.kitchenPoll) for (const [key, choice] of [['main', 0], ['writer', 2], ['buyer', 1], ['seller', 0], ['books', 1], ['newbie', 0]]) {
		await act('晚餐投票', () => api('notes/polls/vote', { noteId: n.kitchenPoll.id, choice }, a[key].token));
	}
	if (n.newbiePoll) for (const [key, choice] of [['main', 1], ['writer', 3], ['dev', 2], ['designer', 2], ['kitchen', 3]]) {
		await act('早餐投票', () => api('notes/polls/vote', { noteId: n.newbiePoll.id, choice }, a[key].token));
	}

	if (n.writerBook) await post(a, 'books', { renoteId: n.writerBook.id, text: '这本书最适合在陌生城市里读，读着读着就会开始重新看自己住的地方。' });
	if (n.devClip) await post(a, 'main', { renoteId: n.devClip.id, text: '做展开面板时刚好遇到，先记下来。' });
	if (n.designPalette) await post(a, 'dev', { renoteId: n.designPalette.id, text: '这组颜色放到深色界面里应该也很稳。' });
	if (n.sellerCups) await post(a, 'buyer', { renoteId: n.sellerCups.id, text: '上个月买的那只已经每天都在用了，握起来很舒服。' });
	if (n.travelTrain) await post(a, 'books', { renoteId: n.travelTrain.id, text: '坐慢车最适合带一本短篇集，窗外的风景会把句子拉长。' });
	if (n.kitchenBreakfast) await post(a, 'main', { renoteId: n.kitchenBreakfast.id, text: '提前十分钟这个建议很实在，明早试试。' });
	if (n.booksRecommend) await post(a, 'writer', { renoteId: n.booksRecommend.id, text: '等你书评，最近正想找一些不急着给答案的小说。' });

	const interactions = [
		['mainMarket', ['writer', 'designer', 'buyer', 'kitchen'], ['🌼', '❤️', '🫶', '👏']],
		['mainSunset', ['writer', 'designer', 'travel', 'newbie'], ['🌇', '❤️', '📷', '✨']],
		['mainPhone', ['writer', 'dev', 'mod', 'books'], ['👍', '💡', '🙌', '🌙']],
		['writerDelete', ['main', 'dev', 'designer', 'books'], ['✍️', '💯', '👍', '❤️']],
		['writerCafe', ['main', 'designer', 'travel'], ['☕', '❤️', '👏']],
		['writerQuestion', ['main', 'books', 'kitchen', 'newbie'], ['📚', '👍', '💡', '🙋']],
		['writerSpoiler', ['main', 'books', 'travel'], ['😮', '❤️', '🥲']],
		['devClip', ['main', 'designer', 'writer', 'mod'], ['💡', '🙏', '🔥', '👍']],
		['devCamera', ['main', 'travel', 'designer'], ['📷', '🔧', '👏']],
		['designPalette', ['main', 'dev', 'writer', 'buyer'], ['🎨', '❤️', '✨', '🍂']],
		['designSketch', ['main', 'writer', 'newbie'], ['🖌️', '❤️', '👏']],
		['modHello', ['main', 'writer', 'newbie', 'books', 'kitchen'], ['👋', '🙌', '❤️', '✨', '👍']],
		['modDigest', ['writer', 'designer', 'travel', 'books'], ['🙏', '❤️', '👍', '🌟']],
		['newbieIntro', ['main', 'writer', 'mod', 'designer'], ['👋', '🙌', '🌱', '❤️']],
		['newbieCampus', ['main', 'writer', 'designer', 'travel'], ['🍂', '📷', '❤️', '👏']],
		['privateRain', ['main'], ['🌧️']],
		['privateNightBus', ['main'], ['📷']],
		['sellerCups', ['buyer', 'designer', 'kitchen', 'main'], ['🏺', '❤️', '👏', '✨']],
		['buyerTea', ['main', 'kitchen', 'seller', 'books'], ['🍵', '❤️', '👍', '✨']],
		['travelMountain', ['main', 'writer', 'designer', 'books'], ['🌄', '📷', '❤️', '👏']],
		['kitchenBreakfast', ['main', 'writer', 'buyer', 'seller'], ['🍳', '❤️', '😋', '👏']],
		['booksBookstore', ['main', 'writer', 'kitchen', 'newbie'], ['📚', '🐈', '❤️', '☕']],
		['mainPlansPoll', ['writer', 'designer', 'newbie', 'travel'], ['🙋', '❤️', '👍', '☕']],
		['kitchenRoutine', ['main', 'writer', 'newbie', 'buyer', 'travel'], ['💡', '❤️', '👍', '🥬', '🙌']],
	];
	for (const [noteKey, users, reactions] of interactions) {
		const note = n[noteKey];
		if (!note) continue;
		for (const [index, key] of users.entries()) {
			await act('点赞', () => api('notes/likes/create', { noteId: note.id }, a[key].token));
			await act('回应', () => api('notes/reactions/create', { noteId: note.id, reaction: reactions[index] }, a[key].token));
		}
	}
	for (const [index, note] of deepReplies.entries()) {
		const authorKey = communityKeys.find(key => a[key]?.id === note.userId);
		const candidates = ['main', 'writer', 'dev', 'designer', 'newbie', 'travel', 'books', 'kitchen'].filter(key => key !== authorKey);
		for (const [offset, key] of candidates.slice(0, 1 + (index % 3)).entries()) {
			await act('楼中楼点赞', () => api('notes/likes/create', { noteId: note.id }, a[key].token));
			await act('楼中楼回应', () => api('notes/reactions/create', {
				noteId: note.id, reaction: ['👍', '❤️', '💡'][(index + offset) % 3],
			}, a[key].token));
		}
	}
	for (const [key, noteKey] of [
		['main', 'writerCafe'], ['main', 'devClip'], ['main', 'booksRecommend'],
		['writer', 'mainSunset'], ['writer', 'designerPalette'], ['dev', 'mainPhone'],
		['designer', 'writerQuestion'], ['newbie', 'modHello'], ['books', 'writerQuestion'],
		['buyer', 'sellerCups'], ['kitchen', 'newbiePoll'], ['travel', 'mainSunset'],
	]) {
		if (n[noteKey]) await act('收藏帖子', () => api('notes/favorites/create', { noteId: n[noteKey].id }, a[key].token));
	}

	const weekendClip = await step('创建便签 周末慢慢过', () => api('clips/create', {
		name: '周末慢慢过', description: '散步、做饭、读几页书，给周末留一点空白。', isPublic: true,
	}, a.main.token));
	if (weekendClip) for (const noteKey of ['mainMarket', 'mainSunset', 'kitchenBreakfast', 'travelMountain']) {
		if (n[noteKey]) await act('加入便签', () => api('clips/add-note', { clipId: weekendClip.id, noteId: n[noteKey].id }, a.main.token));
	}
	const readingClip = await step('创建便签 最近在读', () => api('clips/create', {
		name: '最近在读', description: '书店、短篇集和那些想重读的书。', isPublic: true,
	}, a.books.token));
	if (readingClip) for (const noteKey of ['writerBook', 'writerQuestion', 'booksBookstore', 'booksRecommend']) {
		if (n[noteKey]) await act('加入便签', () => api('clips/add-note', { clipId: readingClip.id, noteId: n[noteKey].id }, a.books.token));
	}
	if (readingClip) for (const key of ['main', 'writer', 'kitchen']) {
		await act('收藏便签', () => api('clips/favorite', { clipId: readingClip.id }, a[key].token));
	}

	if (n.modHello) {
		await act('推广社区指南', () => api('admin/promo/create', { noteId: n.modHello.id, expiresAt: Date.now() + 30 * 86400000 }, a.admin.token));
		for (const key of ['main', 'newbie', 'writer']) {
			await act('阅读社区指南', () => api('promo/read', { noteId: n.modHello.id }, a[key].token));
		}
	}
	if (n.mainMarket) await act('置顶帖子', () => api('i/pin', { noteId: n.mainMarket.id }, a.main.token));
	if (n.writerQuestion) await act('置顶帖子', () => api('i/pin', { noteId: n.writerQuestion.id }, a.writer.token));
	return n;
}

async function seedDiscovery(a, db) {
	// 先选出普通公开帖子，保证纯转发来自日常内容，而不是刚发出的投票。
	const shareSourceKeys = ['writer', 'designer', 'newbie', 'books', 'travel'];
	const shareRows = (await db.query(`
		select id, "userId"
		from note
		where "userId" = any($1::varchar[])
			and visibility = 'public'
			and "replyId" is null
			and "renoteId" is null
			and "channelId" is null
			and "deletedBy" is null
			and cw is null
		order by id desc
	`, [shareSourceKeys.map(key => a[key].id)])).rows;
	const shareTarget = new Map();
	for (const row of shareRows) {
		if (!shareTarget.has(row.userId)) shareTarget.set(row.userId, row.id);
	}

	const polls = [
		{
			key: 'writerReadingPoll',
			author: 'writer',
			text: '最近在整理重读书单，发现通勤路上还是短篇最容易读进去。长篇需要一整块安静的时间，我反而总在周末才敢翻开。你们最近更常读哪种？#阅读 #书影音',
			poll: { choices: ['短篇小说', '长篇', '散文随笔', '诗集'], multiple: false, expiredAfter: 10 * 86400000 },
			votes: { main: [0], dev: [0], books: [0], travel: [3], kitchen: [1] },
		},
		{
			key: 'devReviewPoll',
			author: 'dev',
			text: '接了一个三年前的项目，今天第一次评审。同事习惯先把页面完整跑起来，我更想先看测试和这次改动碰了哪些边界。两种顺序都行，但关注点很不一样。#前端 #代码评审',
			poll: { choices: ['先把项目跑起来', '先读测试和改动', '先看需求文档', '直接结对走一遍'], multiple: false, expiredAfter: 7 * 86400000 },
			votes: { main: [1], mod: [1], newbie: [3], travel: [1] },
		},
		{
			key: 'designerPaperPoll',
			author: 'designer',
			text: '选名片纸时遇到一个很小的问题：米白纤维纸摸起来很喜欢，可印小字会发虚；纯白卡纸清楚，又少了点温度。给工作室用，你们会怎么取舍？#设计 #排版',
			poll: { choices: ['先选手感，字可以少一点', '信息清楚更重要', '两种纸各印一版', '再找别的样品'], multiple: false, expiredAfter: 9 * 86400000 },
			votes: { main: [0], dev: [1], mod: [3], buyer: [0], books: [2] },
		},
		{
			key: 'modEntryPoll',
			author: 'mod',
			text: '整理这一周的新朋友反馈，大家提到最多的是“想找回以前聊过的帖子”。如果先加一个入口，你更希望它出现在哪里？#社区共建',
			poll: { choices: ['个人主页的收藏', '通知里按对话归组', '时间线顶部入口', '搜索页的最近浏览'], multiple: false, expiredAfter: 8 * 86400000 },
			votes: { main: [1], newbie: [0], books: [1], travel: [3], kitchen: [0], dev: [1] },
		},
		{
			key: 'newbieSnackPoll',
			author: 'newbie',
			text: '下午四点总是饿，食堂还没开，附近便利店又很容易买多。想问大家学生时代有哪些便宜、顶饱、还能在教室悄悄吃的加餐？#校园 #生活',
			poll: { choices: ['饭团', '烤红薯', '面包和牛奶', '坚果加水果'], multiple: false, expiredAfter: 6 * 86400000 },
			votes: { writer: [2], dev: [0], kitchen: [1], buyer: [3], travel: [0] },
		},
		{
			key: 'buyerSideTablePoll',
			author: 'buyer',
			text: '家里空间不大，最近在挑一张沙发边的小桌。带轮子移动方便，但很容易越堆越满；带抽屉能收东西，又怕最后什么都不想扔。真正用过的人会怎么选？#生活 #家居',
			poll: { choices: ['带轮子的小推车', '带抽屉的边桌', '很轻的折叠桌', '不买，先留空'], multiple: false, expiredAfter: 7 * 86400000 },
			votes: { designer: [1], kitchen: [3], seller: [0], travel: [1] },
		},
		{
			key: 'travelStayPoll',
			author: 'travel',
			text: '山里订住处又碰到熟悉的取舍：有窗景的房间在半山腰，晚上回去要走二十分钟；镇中心方便，窗外却是停车场。住两晚的话，你会选哪边？#旅行',
			poll: { choices: ['窗景更重要', '位置方便更重要', '看当天天气', '只住一晚就走'], multiple: false, expiredAfter: 11 * 86400000 },
			votes: { writer: [2], books: [0], newbie: [1], kitchen: [2] },
		},
		{
			key: 'kitchenGroceryPoll',
			author: 'kitchen',
			text: '一个人做饭最难的不是做法，是买菜份量。买少了总怕不够，买多了最后一半进冰箱、一半忘掉。你们更常怎么处理？#厨房 #生活',
			poll: { choices: ['按一周菜单买菜', '当天买当天吃', '一次做好两顿', '半成品和冷冻搭配'], multiple: true, expiredAfter: 8 * 86400000 },
			votes: { designer: [3], buyer: [2], books: [3], newbie: [1], seller: [0] },
		},
		{
			key: 'booksWindDownPoll',
			author: 'books',
			text: '书店晚班结束以后，我会留十分钟翻几页不需要做笔记的书。最近想找一本能把脑子慢慢放下来的，你们通常读小说、散文还是诗集？#阅读 #书店',
			poll: { choices: ['小说', '散文', '诗', '漫画或图文'], multiple: false, expiredAfter: 10 * 86400000 },
			votes: { writer: [1], designer: [1], travel: [0], kitchen: [1], seller: [0] },
		},
		{
			key: 'sellerDishPoll',
			author: 'seller',
			text: '想做一批日常用的小碟子，尺寸先定在 12 厘米左右。酱油碟、点心碟和放首饰都能用，但用途一多，釉色和边缘就得克制一点。你们挑小碟子最在意什么？#手作 #陶瓷',
			poll: { choices: ['大小顺手', '釉色好看', '能进洗碗机', '边缘好端'], multiple: false, expiredAfter: 9 * 86400000 },
			votes: { buyer: [2], designer: [1], kitchen: [2], mod: [1], books: [0] },
		},
		{
			key: 'mainAutumnMeetupPoll',
			author: 'main',
			text: '想在这个月底约一次线下散步，从湖边走到旧书店，中途找个地方喝茶。大家哪个时间更方便？#城市散步 #周末',
			poll: { choices: ['周六上午', '周六下午', '周日上午', '周日下午'], multiple: false, expiredAfter: 30 * 86400000 },
			votes: { writer: [0], dev: [1], designer: [2], newbie: [0], books: [3], travel: [2], kitchen: [1] },
		},
	];

	const created = {};
	for (const spec of polls) {
		created[spec.key] = await post(a, spec.author, { text: spec.text, poll: spec.poll });
	}
	for (const spec of polls) {
		const note = created[spec.key];
		if (!note) continue;
		for (const [key, choices] of Object.entries(spec.votes)) {
			for (const choice of choices) {
				await act('发现页投票', () => api('notes/polls/vote', { noteId: note.id, choice }, a[key].token));
			}
		}
	}
	if (created.mainAutumnMeetupPoll) {
		await step('结束历史投票', () => db.query('update poll set "expiresAt" = $1 where "noteId" = $2', [
			new Date(Date.now() - 2 * 86400000),
			created.mainAutumnMeetupPoll.id,
		]));
	}

	if (created.designerPaperPoll) {
		const paperReply = await post(a, 'dev', {
			replyId: created.designerPaperPoll.id,
			text: '我们之前印小字也踩过纤维纸的坑。后来把背面留白加大一点，信息反而更清楚。',
		});
		if (paperReply) {
			await post(a, 'designer', {
				replyId: paperReply.id,
				text: '这个思路可以，我下周让印厂先打两种克重的样。',
			});
		}
	}
	if (created.travelStayPoll) {
		const stayReply = await post(a, 'newbie', {
			replyId: created.travelStayPoll.id,
			text: '如果白天走得很累，我可能会选镇上。晚上还要走山路，安全感比窗景重要。',
		});
		if (stayReply) {
			await post(a, 'travel', {
				replyId: stayReply.id,
				text: '对，这次路线本来就不轻松。我先订镇上的房间，早起再走上去等光。',
			});
		}
	}
	if (created.kitchenGroceryPoll) {
		await post(a, 'books', {
			replyId: created.kitchenGroceryPoll.id,
			text: '我最近开始把一半青菜焯水冻起来，忙的时候不用临时决定吃什么。',
		});
	}

	const interactions = [
		['writerReadingPoll', [['main', '📚'], ['designer', '❤️'], ['books', '🙌'], ['kitchen', '☕']]],
		['devReviewPoll', [['main', '💡'], ['designer', '👍'], ['mod', '🙌']]],
		['designerPaperPoll', [['main', '✨'], ['writer', '❤️'], ['buyer', '👏']]],
		['modEntryPoll', [['main', '🙋'], ['newbie', '👍'], ['books', '💡'], ['travel', '❤️']]],
		['newbieSnackPoll', [['main', '😋'], ['kitchen', '🍠'], ['writer', '☕']]],
		['buyerSideTablePoll', [['main', '💡'], ['designer', '❤️'], ['seller', '👍']]],
		['travelStayPoll', [['main', '🌄'], ['writer', '❤️'], ['newbie', '📷'], ['kitchen', '👍']]],
		['kitchenGroceryPoll', [['main', '🥬'], ['buyer', '💡'], ['books', '👍']]],
		['booksWindDownPoll', [['main', '📚'], ['writer', '🌙'], ['travel', '❤️'], ['kitchen', '☕']]],
		['sellerDishPoll', [['main', '🏺'], ['buyer', '❤️'], ['designer', '👏']]],
		['mainAutumnMeetupPoll', [['writer', '🙋'], ['designer', '❤️'], ['newbie', '👋'], ['travel', '📷']]],
	];
	for (const [noteKey, reactions] of interactions) {
		const note = created[noteKey];
		if (!note) continue;
		for (const [key, reaction] of reactions) {
			await act('投票帖点赞', () => api('notes/likes/create', { noteId: note.id }, a[key].token));
			await act('投票帖回应', () => api('notes/reactions/create', { noteId: note.id, reaction }, a[key].token));
		}
	}

	for (const [renoterKey, targetKey] of [
		['mod', 'writer'],
		['books', 'designer'],
		['kitchen', 'newbie'],
		['travel', 'books'],
		['buyer', 'travel'],
	]) {
		const targetId = shareTarget.get(a[targetKey].id);
		if (targetId) await post(a, renoterKey, { renoteId: targetId });
	}
}

const ARTICLES = [
	{
		author: 'writer', name: 'note-taking-system', title: '用了半年，我把笔记系统又拆掉了一半', category: 'thoughts', tags: ['效率', '随笔'], colors: ['#f97316', '#fde68a'],
		summary: '从十几个文件夹减到三个入口，也删掉了那些看起来很完整、实际坚持不了两天的规则。',
		body: String.raw`去年十月，我花了整整一个周末整理笔记。应用换了两个，文件夹建了十几层，还给每一类内容配了颜色。两个月后，找一个采访对象说过的话，还是得靠搜索关键词。

问题不是工具不够好，是我当初把“整理”当成了另一份工作。

## 现在只剩三个入口

### 00-inbox

所有临时记录先扔进来。微信里发给自己的句子、路上拍到的招牌、编辑发来的问题，都在这里。它经常很乱，有时一周都不清。

### 10-now

正在写、正在采访、正在等回复的内容。每个文件夹只对应一件两周内会继续推进的事。项目结束后，有用的部分才挪进存档。

### 90-archive

旧稿、资料和已经结束的采访。这里不追求漂亮，只要求文件名里能看出一件事：这是谁、在哪里、大概什么时候。

## 我删掉的规则

我试过每天睡前清空收件箱。坚持了十一天，第十二天晚上在外面吃饭，回家已经十二点，从那以后就再也没清过。

后来改成周日晚上收拾二十分钟，忙的时候直接跳过。收件箱不清空也不会出事，真正要交稿的那件事，总有办法浮上来。

我还试过每篇笔记必须写摘要。结果摘要越写越像公文，连“楼下新开的面馆有点咸”都要总结出三条要点。现在只有超过两千字的资料才写摘要。

## 一个很普通的下午

上周找半年前一次菜市场采访，本以为要翻很久。最后在 **90-archive/2026/03-market-interview** 里找到了录音和两张摊位照片。

文件名很土，文件夹也不优雅，但三分钟就找到了。对我来说，这已经比任何复杂的方法有用。

如果你现在也想整理，先别做分类。把最常找的那三样东西放顺手，其他的等真的碍事再处理。`,
	},
	{
		author: 'dev', name: 'vue-composition-patterns', title: '接回旧项目第三天，我删掉了刚写好的组合式函数', category: 'technology', tags: ['vue', '前端', 'typescript'], colors: ['#10b981', '#1e3a8a'],
		summary: '一个表单复用案例，以及为什么“看起来能复用”不等于真的应该抽出来。',
		body: String.raw`本周接了一个停了三年没动过的后台项目。第一次拉分支、装依赖、跑页面，前后花了大概四十分钟，其中一半时间在找一个已经下线的内部源。

页面终于起来以后，我下意识想把几处相似的地址表单抽成一个 composable。三个页面都用省市选择、详细地址和邮编，字段看起来几乎一样。

## 第一版抽象

我写了一个 **useAddressForm**，把状态、校验和提交都包进去。为了让三个页面共用，它需要接收这些参数：

    const form = useAddressForm({
      requiredFields,
      postalCodePattern,
      provinceLabel,
      allowManualCity,
      onSubmit,
    });

写完以后，调用处确实短了。但页面 A 要把省份当成一个文本输入，页面 B 需要异步加载城市列表，页面 C 的历史数据里根本没有邮编。

于是我又加了两个开关和一个转换函数。

## 什么时候知道抽错了

我把 composable 发到评审里，同事问了一句：“如果调用方还得解释五个差异，它们真的是一件事吗？”

这句话很不好听，但很准确。三个页面共享的只是字段名字，交互和数据结构并不是同一套。我最后留下了一个很小的 **usePostalCodeValidation**，其余逻辑退回各自页面。

原来那版函数删掉以后，三个页面各自多出十几行，但没有一个地方需要先读五个参数才知道发生了什么。

## 又踩到的一个小坑

旧项目里还有一个更实际的问题。切换页面时，上一次请求有时会晚回来，把新表单的城市覆盖成旧值。

最后用的是 **watch** 自带的清理函数：

    watch(provinceId, async (value, _old, onCleanup) => {
      const controller = new AbortController();
      onCleanup(() => controller.abort());
      cities.value = await fetchCities(value, controller.signal);
    }, { immediate: true });

这不是什么新写法，但在旧代码里补上以后，那个偶尔串城市的 bug 终于不再出现。

现在我对“复用”的判断简单了一点：如果两个调用处需要向同一个函数解释自己为什么不一样，先用重复代码把差异看清楚。`,
	},
	{
		author: 'designer', name: 'design-tokens-intro', title: '一张名片打了三次样，我最后砍掉一半设计变量', category: 'resources', tags: ['设计', '前端'], colors: ['#ec4899', '#312e81'],
		summary: '从纸张、油墨和一枚小字号开始，重新理解设计变量为什么要少。',
		body: String.raw`九月接了一个小工作室的视觉更新，第一件交付物是名片。听上去简单，结果打了三次样才过关。

第一版在屏幕上很干净：两组字体、四级字号、五种灰、一个橙色点缀。发去印厂以后，问题一个接一个。

## 小字不是屏幕上的小字

名片背面的地址用了九号字，在屏幕上足够清楚，印到米白纤维纸上以后却有一点发虚。纤维把细笔画吃掉了。

我没有继续换更细的字体，而是先把地址拆成两行，删掉不必要的信息，再把字号提上去。版面上空了一点，反而更容易读。

## 变量不是越多越专业

做变量时很容易给每个差别都起名字：正文灰、辅助灰、边框灰、弱化文字灰、说明文字灰。项目切到第二个页面，已经没人记得两个灰之间到底怎么选。

最后只保留：

- 正文颜色
- 次要文字
- 分割线
- 页面背景
- 品牌强调色

其他颜色都从这几个值里调，不再单独命名。层级没有变少，但选择时不用先猜。

## 打样暴露的两个细节

橙色在屏幕上很亮，印到纸上偏红。我们把油墨比例调低了一点，没有改变量名。变量描述的是用途，不是某台显示器显示出来的固定色值。

另一件事是留白。原来的名片把信息塞得很满，打样放在桌上，看起来比屏幕上局促得多。最终删掉一句业务介绍，把边距加宽两毫米，整张才松下来。

## 我现在怎么建变量

先从一个真实页面开始，不先做一整套大全。遇到第二次相同用途，再把它提出来；只有一次使用、而且以后也不太会复用的值，暂时留在组件里。

变量少一点，设计稿不会更粗糙，讨论反而更容易落到具体页面上。`,
	},
	{
		author: 'travel', name: 'slow-train-southwest', title: '成都到昆明：我记住了七个没下车的小站',
		category: 'thoughts', tags: ['旅行', '摄影', '城市'], colors: ['#0369a1', '#064e3b'],
		coverUrl: unsplash('photo-1464822759023-fed622ff2c3b', 1200, 630),
		summary: '十二个小时、两次晚点和一碗没吃上的站台面。没有打卡清单，只有一路记下来的名字。',
		body: String.raw`我买的是早上七点出头从成都出发的慢车。原本计划六点起床，结果前晚收相机收到一点，第二天差点没赶上车。

上车以后发现靠窗的位置在另一侧，太阳一直晒着。对面的大哥把窗帘拉了一半，说“都一样看”。后来证明他说得对，真正有山的时候已经过了中午。

## 第一段几乎都在睡

成都出去以后雾很重，窗外只有近处一排树和偶尔闪过的厂房。我本来想读完一本短篇集，看了两页就睡着了。

醒来时列车停在一个很小的站，站台上只有卖煮玉米的小车。停了四分钟，我没下去。后来看时刻表，那个站叫白果还是白河，记下的字太潦草，已经认不出来。

## 山出现以后

下午两点左右，远处的山才真正靠过来。云压得很低，有一段铁路沿着河走，手机信号断断续续。

我拍了十几张胶卷，也拿手机拍了几段视频。回看时最喜欢的不是山，是旁边村子一栋贴了白瓷砖的房子，二楼阳台上晾着一排红衣服。

## 七个没下车的站

我在便签上记了七个站名：

1. 白果（也可能是白河）
2. 元谋附近一个没有雨棚的小站
3. 名字里带“甸”的站
4. 站台正在修、广播听不清的站
5. 有人抱着一箱鸡上车的站
6. 停了两分钟却没有一个人上下的站
7. 天黑前最后一个能看见山的站

不完整，也没法拿来当攻略。以后会不会专门回去，我不知道。

## 没吃上的那碗面

车上盒饭卖得很快，我去得晚，只剩面包。到昆明前本来想在站台买一碗面，列车又临时改停另一个站台，什么也没买到。

晚上九点多到昆明，第一件事是在地铁口吃了一碗小锅米线。没有拍照，太饿了。

这趟车谈不上多浪漫，坐久了腰疼，厕所也一直排队。但我确实记住了山从远处靠过来的那一小段，和那些没能下去看看的名字。`,
	},
	{
		author: 'books', name: 'reread-invisible-cities', title: '重读《看不见的城市》，我想到的是小区门口',
		category: 'thoughts', tags: ['阅读', '城市', '随笔'], colors: ['#7c2d12', '#1e3a8a'],
		coverUrl: unsplash('photo-1524995997946-a1c2e315a42f', 1200, 630),
		summary: '第三次读，我没再记那些奇观，反而总想到每天经过却从没认真写下的地方。',
		body: String.raw`第一次读这本书是在大学图书馆，记住的是悬在空中的桥、由管道组成的城市，还有那些名字很长的章节。当时觉得这是一本关于远方的书。

第二次读在去昆明之前，车上看了一半，最后记住的是“旅行的时候，你会发现自己没有看到的东西”。

这次是值完书店晚班回家，在床头重新翻开。读了三天，每天两三章，很多段落还是不懂。

## 先想到的是一块地砖

书里写城市由记忆、欲望和符号组成。我脑子里冒出来的却是小区门口那块松动的地砖。下雨踩上去会溅一脚水，物业修了两次，还是那样。

早上卖糯米饭的阿姨会把小推车停在它旁边，提醒熟客“这块别踩”。这算不算城市的一部分？至少它比商场里新换的灯牌更常出现在我的生活里。

## 描述总在删掉东西

如果有人问我武汉怎么样，我可能会说“夏天很热，江边风大，热干面很多”。说完就知道不对，但这已经是最省事的回答。

书里的人不断描述城市，听起来越精确，城市反而越像另一个东西。也许不是描述不够，而是任何一句概括都要删掉太多细节。

## 我试着写了三条

如果只能写三个地方介绍自己住的城市，我写下：

1. 书店后门那条总有人晒被子的巷子；
2. 江边晚上十点还开着的烧烤摊；
3. 下雨时会积水、但每次都能绕过去的人行道。

写完觉得很不“城市宣传”，但比“历史文化名城”更像我真的看见过的地方。

## 读不懂也没关系

这本书我可能还会再读。下一次也许在别的城市，注意到的会是完全不同的东西。现在不懂的部分，先留着。

适合在通勤路上一天读一章，不适合做读书笔记时非要提炼主题。`,
	},
	{
		author: 'seller', name: 'cup-from-clay', title: '开窑以后，一只杯子还要过几道关',
		category: 'resources', tags: ['手作', '生活'], colors: ['#92400e', '#d6d3d1'],
		coverUrl: unsplash('photo-1610701596007-11502861dcfa', 1200, 630),
		summary: '开窑只是把形状定下来。修口沿、试水、挑瑕疵，最后能不能发货又是另一回事。',
		body: String.raw`上周三开窑，下午两点半揭的盖。站在窑边的时候大家都不说话，先听有没有很清脆的裂声。

这一窑放了十八只杯子，最后有十三只能进下一轮。两只杯口歪，一只底部粘了棚板，另外两只釉面起泡。听起来损耗很高，但已经比上一窑好。

## 先修口沿

刚出窑的杯口会有很细的毛刺，摸起来不明显，喝水时能感觉到。要用细砂纸蘸水慢慢磨，不能图快。

磨完以后我会在光下转一圈，再用手指沿杯口摸一遍。指甲比眼睛更容易发现小缺口。

## 试水比拍照重要

杯子拍照好看，不能说明它好用。我通常会装满水放半小时，看杯底和釉面有没有渗。

有一只白瓷杯外侧看不出来，杯底却慢慢洇出一圈深色。它只能留下，不能卖。我们家现在已经有一排“有点问题但自己用挺好”的杯子。

## 挑瑕疵

手作不要求完全一样，但裂纹、针孔和明显变形要写清楚。每只发货前会拍正面、杯口和底部，能接受的再发。

有些买家更喜欢颜色深一点，有些看到流釉会以为是脏。照片只能解决一部分问题，剩下的只能尽量说在前面。

## 包装完才算完成

最后一轮是清洗、晾干、称重和包装。杯口用纸包两层，外层盒子留出空隙，不然路上磕一下就可能裂。

昨天包到第十一个订单，发现前面有一只杯子的底款印歪了。又拆开重拍给客人确认，对方说没关系，才继续发。

一只杯子离开工作室之前，要经过的事情没有照片里安静。开窑是最响的一天，后面这些零碎活才是大部分时间。`,
	},
	{
		author: 'kitchen', name: 'weekday-breakfast', title: '连续做了三周早饭后，我停掉了一周菜单',
		category: 'thoughts', tags: ['生活', '厨房'], colors: ['#b45309', '#166534'],
		coverUrl: unsplash('photo-1533777324565-a040eb52facd', 1200, 630),
		summary: '菜单本身没错，错在我把每天吃什么都变成了必须按时完成的任务。',
		body: String.raw`九月我做过一次三周早餐计划。周日晚上写好 A、B、C 三套轮换，冰箱里按盒子贴标签，连哪一天用哪根香蕉都排好了。

第一周执行得很好。第二周周三加班到九点，回家还要洗菜、煮燕麦，站在厨房里突然很烦。第三周开始把隔夜燕麦拖到早上做，最后在便利店买了三次包子。

## 计划最先崩掉的地方

不是起床时间，也不是食材不够，是每天下班以后的选择。

周日晚上，我以为自己知道周三会有力气做饭。可实际到周三，只想把鞋踢掉，坐在沙发上十分钟不动。那一晚再看到写着“切香蕉、称坚果”的便签，就很像另一份工作。

## 现在冰箱里有什么

我不再按天安排，只准备几种能互相替换的东西：

- 周末煮一锅杂粮饭，分成三盒；
- 冷冻面包，不提前解冻；
- 洗好的青菜，但只洗够两天；
- 鸡蛋和原味酸奶；
- 一根黄瓜或几颗番茄；
- 冰箱冷冻层常备一小袋饺子。

早上起来看时间和心情，再决定吃什么。面包加蛋最快，前一晚有剩饭就做饭团，什么都不想做就带酸奶出门。

## 还是会有糊掉的吐司

上周四的吐司又烤糊了一角。我刮掉继续吃，没有因为计划失败重新做一盘。

以前总觉得仪式感要靠完整的一套流程撑起来，现在更在意吃完以后有没有时间洗杯子。能坚持的早餐，通常都不太好看。

如果这周只做一件事，我会建议先缩短清洗步骤。平底锅换成小锅，盘子少用一个，比早起二十分钟更容易坚持。`,
	},
	{
		author: 'mod', name: 'new-friends-guide', title: '第一次发帖以后，我先学会了怎么回一句',
		category: 'thoughts', tags: ['生活', '随笔'], colors: ['#475569', '#0e7490'],
		coverUrl: unsplash('photo-1516321318423-f06f85e504b3', 1200, 630),
		summary: '从“大家好”卡了半小时，到后来能在一条感兴趣的帖子下留两句真实的话。',
		body: String.raw`刚开始做社区维护时，我以为新朋友最需要的是功能说明。后来翻反馈才发现，很多人卡住的不是按钮在哪里，而是第一条帖子写什么。

这件事我自己也经历过。

## 第一次发帖删了四次

第一次发帖，我先写了一段自我介绍：职业、兴趣、来这里的期待，还加了三行表情符号。读了两遍觉得像简历，全删了。

最后发出去的是一句：“想问问大家，周末在家都做什么？”

有七个人回复。有人说睡觉，有人说带孩子，有人贴了一张刚烤好的面包。那条帖子没有让我立刻认识谁，但至少下一次看到这些名字时，不再完全陌生。

## 回复别人比介绍自己容易

如果不知道发什么，可以先从回复开始。看到有人问一本书、一张照片或一个很小的使用问题，写下自己真实碰到过的情况。

不必每次都写很长。“我也遇到过，当时是在手机上”“这个办法我试过，第二天会散架”都够用。最怕的是为了显得热情，回一句和内容没有关系的“支持”。

## 被不回复也很正常

我也有几条很认真地回复了别人，最后没有收到回应。以前会反复点开看，后来发现对方可能只是没上线，或者那条讨论已经过去了。

社区里的注意力很分散，没有回复不等于被讨厌。

## 现在的新朋友引导

我们把“第一次发帖”的提示改得很短：写一件最近发生的事，或者问一个具体问题。真不知道写什么，可以先看两天，不必急着留下第一条。

遇到私信只发“在吗”、连续追问或者让人不舒服的交流，可以停止回复、静音或屏蔽。举报的时候写清发生了什么，不需要先证明自己足够委屈。

一个地方能不能待下去，往往不是看它多热闹，而是看你有没有几次被认真接住。慢一点没关系。`,
	},
	{
		author: 'buyer', name: 'home-with-less', title: '腾出玄关那把椅子以后，家里先变好的不是收纳',
		category: 'thoughts', tags: ['生活'], colors: ['#78716c', '#0f766e'],
		coverUrl: unsplash('photo-1484101403633-562f891dc89a', 1200, 630),
		summary: '没有先买收纳盒，只是把三件每天都顺手放下的东西挪回了该去的地方。',
		body: String.raw`玄关有一把木椅，本来坐着换鞋。后来慢慢地，包放在上面，快递放在上面，穿过一次的外套也放在上面。真正坐它的次数一周不到两次。

我先买过两个收纳盒，放在椅子底下，情况没有变好。盒子空了，椅子还是满的。

## 先看东西从哪里来

蹲在门口看了两天才发现，外套之所以落在椅子上，是因为柜门被雨伞挡住，挂进去要挪两下。快递没拆，是因为拆纸箱的剪刀在厨房。

我把雨伞挪到门后的小桶里，柜门终于能正常打开。又在鞋柜上放了一只旧木盘，钥匙、门卡和小剪子都放里面。

这些东西没有藏起来，但都有了顺手的位置。椅子三天以后第一次空了出来。

## 收纳盒不是第一步

我以前很喜欢先去买盒子。盒子会让乱糟糟的东西看起来整齐，可如果一件东西每天都要经过三道动作才能放回去，过两天还是会回到椅子上。

现在更愿意先追踪一件东西一天的路线：进门放哪、什么时候用、用完能不能顺手放回去。路线顺了，再考虑装进什么。

## 没有变成样板间

玄关现在还是会堆东西。下雨天两把伞滴着水，快递多了也放不下。只是至少不会再全部堆到那把椅子上。

那把木椅重新用来换鞋。坐垫有点旧，我没有换。坐着系鞋带的时候，脚边还有一小袋准备扔掉的纸箱。

整理没有让家一下子变得很空。它只是让我少花几分钟找钥匙，也少了一次在椅子上翻外套。`,
	},
	{
		author: 'designer', name: 'color-and-tone', title: '给深色界面调色时，我先关掉了色板',
		category: 'resources', tags: ['设计', '排版'], colors: ['#9d174d', '#1e1b4b'],
		coverUrl: unsplash('photo-1513364776144-60967b0f800f', 1200, 630),
		summary: '深色模式做了一周，最后的问题不是主色，而是页面里所有东西都差不多亮。',
		body: String.raw`上周给一个阅读产品做深色模式。第一版很快：把白色背景换成深灰，把黑色文字换成浅灰，主色保留，截图发给同事，评价是“挺像深色版”。

上线前的真机检查才发现，晚上看十分钟就开始累。

## 不是颜色太黑

我把页面截成灰度图，问题一下子清楚了。标题、正文、按钮边框和时间戳几乎都在同一个亮度区间。白天看不出，晚上屏幕一暗，所有东西都在一起往前挤。

于是先关掉色板，只调明度：

- 正文保持最亮；
- 标题不再额外提亮，只靠字号和留白区分；
- 次要信息降到正文亮度的六成左右；
- 分割线再低一点，但不能低到消失；
- 主按钮只保留一个高光。

灰度关系顺了以后，再把颜色放回来，原来的洋红显得太抢。最后换成了偏灰的红，只在主要操作上出现。

## 阴影在深色背景里几乎没用

浅色模式里，卡片靠阴影就能浮起来。深色背景里阴影吃掉以后，边界变得很糊。

我改成了很轻的边框，再加一点背景明度差。两者都不过分，但组件之间终于是分开的。

## 图片也得重新看

产品里有不少用户上传的照片，有的背景很亮。深色模式里图片边缘会闪得厉害。最后给图片容器加了一点很轻的底色，也在加载时保留了占位，不再出现一块白闪。

## 色板最后才回来

这版做完，设计文件里的颜色其实比原来少。真正花时间的是在真实内容里来回看：一段长文字、一个空状态、一张过曝的照片和一条错误提示。

深色模式不是把颜色反过来。它更像重新安排一间晚上的屋子，哪些灯开着、哪些只留一点亮，都要重新决定。`,
	},
];

const ARTICLE_COVERS = [
	unsplash('photo-1455390582262-044cdead277a', 1200, 630),
	unsplash('photo-1515879218367-8466d910aaa4', 1200, 630),
	unsplash('photo-1545235617-9465d2a55698', 1200, 630),
	unsplash('photo-1464822759023-fed622ff2c3b', 1200, 630),
	unsplash('photo-1524995997946-a1c2e315a42f', 1200, 630),
	unsplash('photo-1610701596007-11502861dcfa', 1200, 630),
	unsplash('photo-1533777324565-a040eb52facd', 1200, 630),
	unsplash('photo-1516321318423-f06f85e504b3', 1200, 630),
	unsplash('photo-1484101403633-562f891dc89a', 1200, 630),
	unsplash('photo-1513364776144-60967b0f800f', 1200, 630),
];

async function seedArticles(a) {
	const created = [];
	for (const [index, article] of ARTICLES.entries()) {
		const author = a[article.author];
		const cover = await step('文章封面', () => uploadAsset(
			author.token, `article-cover:${article.name}`, `${article.name}.jpg`, article.coverUrl ?? ARTICLE_COVERS[index], article.colors,
		));
		const page = await step(`文章 ${article.title}`, () => api('pages/create', {
			title: article.title, summary: article.summary, name: article.name, articleCategoryId: article.category, articleTags: article.tags,
			content: [{ id: 'body', type: 'markdown', text: article.body }], variables: [], script: '',
			alignCenter: false, hideTitleWhenPinned: false, font: 'sans-serif', eyeCatchingImageId: cover?.id ?? null,
		}, author.token));
		if (page) created.push({ ...article, id: page.id });
	}

	const heavyComments = [
		['main', '“周日收拾二十分钟”比每天清空靠谱。我试过每天清，第三天下班太晚直接放弃了。'],
		['dev', '我最大的问题是文件名。以前的会议记录全叫“新建文档”，现在想搜也不知道搜什么。'],
		['designer', '三个入口够我用了。以前文件夹分太细，每次保存前都要先决定放哪，反而更拖延。'],
		['mod', '项目拖了两个月还没结束的话，你会继续放在 now 里吗？我手上这种半死不活的事情特别多。'],
		['newbie', '想问一下这是用什么工具做的？还是直接用系统文件夹？看起来不太像专门的笔记软件。'],
		['travel', '我在路上也只记纯文本，日期和地点写在第一行。回来以后能不能归档看心情。'],
		['kitchen', '我也有收件箱，最后都会变成“以后再整理”箱。看到你说一周不清也可以，稍微放心了。'],
		['books', '资料库你会按人物、主题还是年份分？书店的零碎资料一多，我经常三种都想用。'],
		['seller', '工作室也是这样。订单、配方和失败记录分开以后，文件名越土越好找，反而不需要多漂亮。'],
		['buyer', '菜市场那个例子很有用。真正会搜的往往就是人名和地名，不是什么抽象主题。'],
		['writer', '回复一下：工具换过几次，现在就用文件管理器。遇到拖很久的项目会单独加一个“等回复”，不硬塞进存档。'],
		['main', '“整理当成另一份工作”太准确了。我搭系统花的时间经常比用系统多。'],
		['dev', '为什么只有长资料才写摘要？采访内容过两周也会忘，不写摘要以后还能找回来吗？'],
		['designer', '我的做法不是写摘要，是在每篇开头写三行：谁说的、当时在做什么、为什么记。比正式摘要好坚持。'],
		['mod', '文件名里写清谁、哪里、什么时候，处理社区反馈也能用。我们现在就缺这个。'],
		['newbie', '纸质笔记和电子笔记会同时用吗？我上课记纸的，回头又懒得整理进电脑。'],
		['travel', '照片也可以先当收件箱，全部按日期扔进去，回来只给真的会看的加地点。'],
		['kitchen', '把待办从笔记里拆出去以后，确实没那么焦虑了。工作和生活混在一个收件箱里很乱。'],
		['books', '我也短暂用过双链，最后维护链接比写内容认真。现在普通资料只留搜索能找到的关键词。'],
		['seller', '失败记录最好写清温度、釉和摆放位置。只写“这次又裂了”，过几个月完全不知道原因。'],
		['buyer', '我以前每天写工作总结，后来只剩复制粘贴。现在只在出问题时记一条，反而会回看。'],
		['writer', '纸质做临时记录，电子负责长期保存。两种都留，但不会要求每一页都进系统。'],
		['main', '看完先把自己的下载文件夹清了一遍，已经找到三份重复的采访录音。'],
		['dev', '工具少一点，确实不容易把时间花在整理工具上。'],
		['books', '这篇没有给一套完整方法，反而让人愿意试。很多时候能坚持一半就不错了。'],
		['kitchen', '今晚准备按你说的，只收拾最常找的三样东西，不重做整个文件夹。'],
	];
	const commentRecords = [];
	const heavyArticle = created[0];
	if (heavyArticle) {
		for (const [key, text] of heavyComments) {
			const comment = await step('文章评论', () => api('articles/comments/create', { articleId: heavyArticle.id, text }, a[key].token));
			if (comment) commentRecords.push({ ...comment, authorKey: key });
		}

		const thread = {};
		const replyTree = [
			['r1', commentRecords[1]?.id, 'writer', '我现在的文件名至少会写日期和对象，比如 2026-03-18-菜市场王姐。搜时间或人名都能找到。'],
			['r2', 'r1', 'dev', '那同一件事聊了三次怎么分？我会开始加 v2、最终版、真的最终版，然后彻底乱掉。'],
			['r3', 'r2', 'books', '可以只按日期排，内容全放同一个文件里。会议和采访本来就是连续的，不一定要每次新建。'],
			['r4', 'r3', 'newbie', '原来还能这样。我一直以为一个文件就代表一次见面。'],
			['r5', 'r4', 'writer', '看情况。短问题可以追加，正式采访我会分开，免得后面删改时找不到原话。'],
			['r6', 'r2', 'kitchen', '我做饭记录会按菜名建一个文件，每次失败都往后面加，过一阵再看很清楚。'],
			['r7', 'r1', 'main', '日期加对象这个方法简单，我今晚先改最近的十个文件。'],
			['r8', commentRecords[1]?.id, 'designer', '如果项目结束了，你还会把这些文件改名吗？'],
			['r9', 'r3', 'travel', '不会全改，只在真的找不到时补关键词。维护文件名也会变成负担。'],
			['r10', 'r6', 'dev', '失败记录还能看出问题是不是重复出现，这点比代码提交记录直观。'],
			['r11', 'r10', 'books', '我也会在资料里留一句来源，隔很久至少知道当时从哪里看到的。'],
			['r12', 'r5', 'newbie', '那我先从短问题和正式采访分开开始，不再建一堆空文件夹。'],
			['r13', commentRecords[1]?.id, 'buyer', '我试过把收件箱限定在二十条以内，超过就先删最旧的一条。'],
			['r14', 'r13', 'seller', '数量上限比时间提醒直观，工作室的待处理盒也可以这样。'],
			['r15', 'r10', 'mod', '社区资料也适合留来源。只留结论，过几个月完全想不起当时在讨论什么。'],
			['r16', 'r15', 'writer', '来源和当时的问题都要留，不然只剩一个孤零零的链接。'],
			['r17', 'r16', 'kitchen', '我会把当时的疑问一起写进去，后来解决没有也能回看。'],
			['r18', commentRecords[1]?.id, 'main', '看完这串回复，先去把我那七个“最终版”改了。'],
		];
		for (const [replyKey, parentId, key, text] of replyTree) {
			const resolvedParent = thread[parentId] ?? parentId;
			if (!resolvedParent) continue;
			const reply = await step('楼中楼回复', () => api('articles/comments/create', {
				articleId: heavyArticle.id, text, replyId: resolvedParent,
			}, a[key].token));
			if (reply) {
				thread[replyKey] = reply.id;
				commentRecords.push({ ...reply, authorKey: key });
			}
		}

		// 父评论删除后仍保留可见回复，用于覆盖评论墓碑和回复计数。
		const removedParent = await step('待删除父评论', () => api('articles/comments/create', {
			articleId: heavyArticle.id,
			text: '我之前把所有资料都按年份分了文件夹，后来发现跨年份的项目反而更难找。',
		}, a.buyer.token));
		const remainingReply = removedParent ? await step('保留的子回复', () => api('articles/comments/create', {
			articleId: heavyArticle.id,
			replyId: removedParent.id,
			text: '这个经历很有用。后来你改成按项目归档了吗？',
		}, a.main.token)) : null;
		const remainingNestedReply = remainingReply ? await step('保留的深层回复', () => api('articles/comments/create', {
			articleId: heavyArticle.id,
			replyId: remainingReply.id,
			text: '改成“项目加主题”两层以后好多了，项目结束再移进资料库。',
		}, a.buyer.token)) : null;
		if (remainingReply) commentRecords.push({ ...remainingReply, authorKey: 'main' });
		if (remainingNestedReply) commentRecords.push({ ...remainingNestedReply, authorKey: 'buyer' });
		if (removedParent) {
			const deleted = await step('删除父评论（保留楼中楼）', () => api('articles/comments/delete', {
				commentId: removedParent.id,
			}, a.buyer.token));
			if (deleted) console.log('  - 已生成保留子回复的评论墓碑');
		}
	}

	const extraComments = [
		[1, 'designer', '五个参数那里太具体了。我们以前也把一个上传组件抽得很通用，最后调用方每个页面都在解释自己不一样。'],
		[1, 'main', '“先用重复代码把差异看清楚”这个说法比“复用一切”靠谱多了。'],
		[1, 'writer', '虽然不写前端，但第三段让我想到编辑流程。两个栏目看起来一样，真写起来要求完全不同。'],
		[2, 'dev', '打三次样还能继续改，客户没跑已经不错了。纸张吸墨这点屏幕里真的模拟不出来。'],
		[2, 'buyer', '加宽两毫米这个细节很真实。名片拿到手里，最先感受到的其实不是颜色。'],
		[2, 'books', '“变量描述用途，不是某台显示器的固定色值”值得记一下。'],
		[3, 'main', '没吃到站台面这一点比任何攻略都真实。我上次也是饿到下车先找米线。'],
		[3, 'newbie', '慢车上充电插座多吗？想带相机，但怕拍一路没电。'],
		[3, 'travel', '我坐的那趟插座不多，硬卧车厢能找到两个。充电宝更稳，记得别放行李架最里面。'],
		[4, 'writer', '那块松动的地砖比很多城市宣传片都具体，读完一下能站到那个路口。'],
		[4, 'designer', '用三个地方介绍城市，这个练习拿来做品牌可能也会比抽象形容词有效。'],
		[4, 'main', '我会选住过的小区门口、常去的菜市场，还有一条每次都会走错的巷子。'],
		[5, 'buyer', '发货前把正面、杯口和底部都拍一遍，这个做法让人放心，也省得收到以后扯皮。'],
		[5, 'kitchen', '看到“一排有点问题但自己用挺好”的杯子，突然想起我家也有三个歪碗。'],
		[5, 'designer', '手作的差异不是问题，关键是提前说清哪些差异不影响用、哪些算瑕疵。'],
		[6, 'main', '小锅洗起来省事这条太重要了，早餐能不能坚持很多时候取决于吃完谁洗碗。'],
		[6, 'newbie', '宿舍只有微波炉的话，鸡蛋能做什么？最近不想每天吃面包。'],
		[6, 'kitchen', '可以把鸡蛋打散加一点水和盐，微波炉中小火分段加热，每次停一下搅一搅，别一次转太久。'],
		[7, 'newbie', '“想不出第一条就先看两天”比逼新人马上发帖友好多了。'],
		[7, 'books', '看到一条认真回复最后没人理，确实会反复点开。后来想想对方可能根本没在线。'],
		[7, 'writer', '社区里最舒服的关系通常不是互关来的，是同一件小事下面聊出来的。'],
		[8, 'designer', '先找钥匙和外套的动线，比先买收纳盒聪明。我以前买过四个盒子，最后全拿来装盒子。'],
		[8, 'kitchen', '“空着不是浪费”这句没用上，但椅子终于能坐了这个结果很实在。'],
		[9, 'dev', '把页面截成灰度图这招很好，开会时比争“这个灰够不够亮”直观多了。'],
		[9, 'main', '一页只留一个高光，做封面和文章配图也一样。全都抢眼最后就没有重点。'],
	];
	for (const [articleIndex, key, text] of extraComments) {
		const article = created[articleIndex];
		if (!article) continue;
		const comment = await step('文章评论', () => api('articles/comments/create', { articleId: article.id, text }, a[key].token));
		if (comment) commentRecords.push({ ...comment, authorKey: key });
	}

	const commentImage = await step('评论配图', () => uploadAsset(
		a.designer.token, 'comment:color-study', 'comment-color-study.jpg',
		unsplash('photo-1541701494587-cb58502866ab', 1200, 800), ['#be185d', '#1e1b4b'],
	));
	const lightReplyThreads = [
		['vue-composition-patterns', 'designer', [
			['dev', '补充一个我们踩过的坑：封装以后如果调用方还要传三个开关，通常说明边界还没找对。'],
			['writer', '这个判断放在编辑流程里也成立。一个模板每次都要解释一遍，就不算真正的模板。'],
		]],
		['design-tokens-intro', 'buyer', [
			['designer', '“变量描述用途”这条想抄进团队规范。我们现在同一个灰出现在四个组件里，名字全不一样。'],
		]],
		['slow-train-southwest', 'newbie', [
			['travel', '我那趟硬卧有两个插座，不同车底不一样。充电宝还是带上，别塞进行李架最里面。'],
			['newbie', '明白，我带一块备用电池，也不打算一路都拍。上次出门就是拍到一半没电。'],
		]],
		['reread-invisible-cities', 'writer', [
			['books', '菜市场、江风和旧书店这三个细节已经够具体了。城市不是被概括出来的，而是被这些重复经过的地方记住的。'],
		]],
		['cup-from-clay', 'buyer', [
			['seller', '开窑只是把形状定下来，后面还要修口沿、试水和看釉面。真正能放心交付，往往还要再等几天。'],
		]],
		['weekday-breakfast', 'newbie', [
			['kitchen', '宿舍版可以只用酸奶、燕麦和一根香蕉，前一晚拌好放冰箱，早上撒坚果就能吃。'],
		]],
		['new-friends-guide', 'newbie', [
			['mod', '补充一句：不用把第一次发帖想成“正式亮相”。写清楚今天发生了什么、为什么想分享，就已经很好了。'],
			['newbie', '谢谢。我之前总想把第一条写得特别完整，结果一直没发出来。'],
		]],
		['home-with-less', 'designer', [
			['buyer', '我照着“先动线再收纳”重新摆了玄关，第一周确实少了很多来回走的路。'],
			['kitchen', '厨房也一样，常用锅具放到伸手就能拿到的地方以后，台面反而更容易保持空。'],
		]],
		['color-and-tone', 'dev', [
			['designer', '我补了一张同一组颜色的实际使用对比。深色背景里，边缘和阴影要比主色更有层次，不能只把亮度整体拉低。', [commentImage?.id].filter(Boolean)],
		]],
	];
	for (const [articleName, rootKey, replies] of lightReplyThreads) {
		const article = created.find(candidate => candidate.name === articleName);
		const root = commentRecords.find(comment => comment.articleId === article?.id && comment.authorKey === rootKey);
		if (!article || !root) continue;
		let parentId = root.id;
		for (const [key, text, fileIds] of replies) {
			const reply = await step('楼中楼回复', () => api('articles/comments/create', {
				articleId: article.id, text, replyId: parentId, ...(fileIds?.length ? { fileIds } : {}),
			}, a[key].token));
			if (!reply) continue;
			parentId = reply.id;
			commentRecords.push({ ...reply, authorKey: key });
		}
	}

	const likePools = [
		['main', 'dev', 'designer', 'mod', 'books', 'travel', 'kitchen'],
		['main', 'designer', 'writer', 'mod', 'newbie', 'travel'],
		['main', 'dev', 'writer', 'newbie', 'buyer', 'books'],
		['main', 'writer', 'designer', 'books', 'newbie'],
		['main', 'writer', 'designer', 'mod', 'travel'],
		['buyer', 'designer', 'kitchen', 'main', 'books'],
		['main', 'writer', 'buyer', 'seller', 'newbie'],
		['main', 'writer', 'dev', 'newbie', 'books'],
		['main', 'designer', 'kitchen', 'seller', 'travel'],
		['main', 'dev', 'writer', 'buyer', 'mod'],
	];
	for (const [index, article] of created.entries()) {
		for (const key of likePools[index % likePools.length]) {
			if (key === article.author || !a[key]) continue;
			await act('文章点赞', () => api('articles/like', { articleId: article.id, liked: true }, a[key].token));
		}
		const favoriteUsers = [a.main, a.writer, a.books].filter(user => user && user.id !== a[article.author].id).slice(0, 2);
		for (const user of favoriteUsers) {
			await act('文章收藏', () => api('articles/favorite', { articleId: article.id, favorited: true }, user.token));
		}
	}

	for (const [index, comment] of commentRecords.entries()) {
		if (index % 4 === 0) continue;
		const candidates = ['main', 'writer', 'dev', 'designer', 'mod', 'newbie', 'travel', 'books'].filter(key => key !== comment.authorKey);
		const likers = Array.from({ length: 1 + (index % 3) }, (_, offset) => candidates[(index + offset) % candidates.length]);
		for (const key of likers) {
			await act('评论点赞', () => api('articles/comments/like', { commentId: comment.id, liked: true }, a[key].token));
		}
	}
	return created;
}

async function seedViews(a, db) {
	const viewerKeys = ['admin', ...communityKeys];
	const notes = (await db.query(`
		select n.id, n."userId"
		from note n
		join "user" u on u.id = n."userId"
		where u.host is null
			and u.username = any($1::varchar[])
			and n.visibility = 'public'
			and n."renoteId" is null
		order by n.id desc
	`, [[...SEED_USERNAMES, a.admin.username.toLowerCase()]])).rows;

	// 按账号活跃度抽样阅读，让阅读数有自然差异，同时保证每篇公开帖子至少被一人看到。
	const readRates = {
		admin: 38, main: 72, writer: 58, dev: 48, designer: 45, mod: 65, newbie: 34,
		seller: 28, buyer: 54, travel: 39, kitchen: 44, books: 61, private: 16,
	};
	const bucket = value => Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 8), 16) % 100;
	const readsByViewer = new Map(viewerKeys.map(key => [key, []]));
	for (const note of notes) {
		const candidates = viewerKeys.filter(key => a[key].id !== note.userId);
		let readers = candidates.filter(key => bucket(`note-view:${note.id}:${key}`) < readRates[key]);
		if (readers.length === 0 && candidates.length > 0) {
			readers = [candidates[bucket(`note-view-fallback:${note.id}`) % candidates.length]];
		}
		for (const key of readers) readsByViewer.get(key).push(note.id);
	}

	for (const key of viewerKeys) {
		const noteIds = readsByViewer.get(key);
		for (let offset = 0; offset < noteIds.length; offset += 50) {
			const chunk = noteIds.slice(offset, offset + 50);
			await act(`浏览 ${a[key].name} 的帖子时间线`, () => api('notes/views', { noteIds: chunk }, a[key].token));
		}
	}

	const articles = (await db.query(`
		select id, "userId"
		from page
		where "articleCategoryId" is not null
		order by id
	`)).rows;
	for (const article of articles) {
		const candidates = viewerKeys.filter(key => a[key].id !== article.userId);
		const readers = candidates
			.filter(key => bucket(`article-view:${article.id}:${key}`) < 68)
			.sort((left, right) => bucket(`article-order:${article.id}:${left}`) - bucket(`article-order:${article.id}:${right}`));
		for (const key of candidates) {
			if (readers.length >= 3) break;
			if (!readers.includes(key)) readers.push(key);
		}
		for (const key of readers) {
			await act('阅读文章', () => api('articles/show', { articleId: article.id }, a[key].token));
		}
	}
}

async function dm(a, from, to, text, extra = {}) {
	return step(`${from} 私信 ${to}`, () => api('chat/messages/create-to-user', { toUserId: a[to].id, ...(text != null ? { text } : {}), ...extra }, a[from].token));
}

async function roomMessage(a, from, roomId, text, extra = {}) {
	return step(`${from} 群聊发言`, () => api('chat/messages/create-to-room', { toRoomId: roomId, ...(text != null ? { text } : {}), ...extra }, a[from].token));
}

async function seedChat(a, db) {
	const threads = [
		['main', 'writer', [
			['main', '你上次说的那家旧书店，是在玉林路旁边吗？地图上搜到两个同名的。'],
			['writer', '对，拐进小巷以后右手边。下午人少，靠窗那张桌子写东西挺舒服。'],
			['main', '周六下午去坐一会儿。你那天在吗？'],
			['writer', '不在，上午要去医院复查。老板在的话可以问他要那本自己装订的短篇集。'],
			['main', '行，找不到就给你发照片。'],
		]],
		['main', 'dev', [
			['dev', '你发的页面看了，展开时横向滚动条会闪一下，应该是宽度差了 1px。'],
			['main', '我这边也是，只有内容刚好到边界时出现。手机上反而正常。'],
			['dev', '先看外层的 padding 和边框有没有算进去，别给内部再补 margin。'],
			['main', '好，我下午改一版，链接还发你。'],
		]],
		['newbie', 'mod', [
			['newbie', '请问关注申请一直没通过，可以撤回重新发吗？'],
			['mod', '可以，在关注请求页面取消就好。也可以先看看对方的简介，再补一句申请说明。'],
			['newbie', '找到了，谢谢你。'],
		]],
		['buyer', 'seller', [
			['buyer', '白瓷杯还有杯口稍微收一点的吗？现在这只喝手冲有点敞。'],
			['seller', '有，今天刚修完一批坯，周五开窑。可以先给你留一只，但釉色没法指定。'],
			['buyer', '可以，容量大概多少？太大会喝不完。'],
			['seller', '约 220 毫升。开窑以后我拍正面和杯口给你，不合适就算，不用先付。'],
		]],
		['books', 'writer', [
			['books', '下周的共读页面要放参考书吗？还是只留主书就够。'],
			['writer', '先放两本吧，太多大家会以为都要读。'],
			['books', '那我加《看不见的城市》和一本城市史，明天把链接补上。'],
		]],
		['travel', 'main', [
			['travel', '绍兴那家面馆叫“河沿面馆”，早上七点开，九点以后基本只剩面汤了。'],
			['main', '收到，下个月可能去。店在仓桥直街哪一头？'],
			['travel', '我记不清门牌，等会儿翻一下旧照片，找到了把定位发你。'],
		]],
		['admin', 'mod', [
			['mod', '这周反馈按页面分好了。目录展开一条、图片上传一条，另外两条都是找不到发布入口。'],
			['admin', '我先看会影响发布的。入口问题别再单独加弹窗了，塞进新朋友指南试试。'],
			['mod', '行。周六维护公告要现在发吗？'],
			['admin', '今天发吧，说明清楚会短暂不能传图就行，别写成长篇通知。'],
		]],
	];
	for (const [first, second, messages] of threads) {
		let previous = null;
		for (const [index, [from, text]] of messages.entries()) {
			const to = from === first ? second : first;
			const message = await dm(a, from, to, text, index === 2 && previous ? { replyId: previous.id, replyType: 'reply' } : {});
			if (message && first === 'main' && second === 'writer' && index === 1) {
				await step('修正私信措辞', () => api('chat/messages/update', {
					messageId: message.id,
					text: '对，拐进小巷以后右手边。下午人少，靠窗那张桌子写东西特别舒服。',
				}, a[from].token));
			}
			if (message && index === 0) await act('私信回应', () => api('chat/messages/react', { messageId: message.id, reaction: '👍' }, a[to].token));
			previous = message ?? previous;
		}
	}
	await dm(a, 'designer', 'main', null, { pokeUserId: a.main.id });
	const chatBreakfast = await step('聊天早餐照片', () => uploadAsset(
		a.kitchen.token, 'chat:weekday-breakfast', 'weekday-breakfast-chat.jpg',
		unsplash('photo-1533777324565-a040eb52facd', 1280, 960), ['#b45309', '#fde68a'],
	));
	if (chatBreakfast) {
		await dm(a, 'kitchen', 'main', '今早试了提前烤吐司，真的比平时从容一点。给你看看。', { fileId: chatBreakfast.id });
	}

	const avatar = await step('群头像', () => uploadAsset(
		a.main.token, 'room:weekend-walk', 'weekend-walk-room.jpg', unsplash('photo-1500530855697-b586d89ba3ee', 512, 512), ['#0f766e', '#d97706'],
	));
	const room = await step('创建群聊', () => api('chat/rooms/create', {
		name: '周末散步小组', description: '交换路线、天气和路上遇到的小店。', joinPolicy: 'public', avatarId: avatar?.id ?? null,
		initialUserIds: ['writer', 'travel', 'newbie', 'kitchen'].map(key => a[key].id),
	}, a.main.token));
	if (room) {
		const lines = [
			['main', '周末散步群先拉起来了。路线别只发定位，最好写清楚怎么坐车。'],
			['travel', '那我先发绍兴，全程八公里，中间能坐两次。'],
			['writer', '这周有人想去龙井吗？天气预报说阴，但别信太早。'],
			['kitchen', '阴天可以。我知道一家能喝热米酒的小店，就在村口。'],
			['newbie', '我能跟吗？走得慢会不会拖大家。'],
			['writer', '不会，本来就有人会停下来拍照。周六九点地铁站见。'],
			['main', '我带相机，谁走不动了就原地拍银杏。'],
			['travel', '迟到的人买水，这个先定了。'],
			['kitchen', '我带几个司康，可能有点硬，路上别嫌弃。'],
			['newbie', '那我记路线，正好练一下采访。'],
		];
		for (const [from, text] of lines) {
			const message = await roomMessage(a, from, room.id, text);
			if (message && from === 'main') for (const key of ['writer', 'travel', 'kitchen']) {
				await act('群消息回应', () => api('chat/messages/react', { messageId: message.id, reaction: '👋' }, a[key].token));
			}
		}
		if (chatBreakfast) {
			await roomMessage(a, 'kitchen', room.id, '周六可以带一点这个，路上饿了分着吃。', { fileId: chatBreakfast.id });
		}
		await act('加入群聊', () => api('chat/rooms/join', { roomId: room.id }, a.mod.token));
		await step('设置散步群管理员', () => api('chat/rooms/members/update', {
			roomId: room.id, userId: a.writer.id, role: 'administrator',
		}, a.main.token));
		await step('更新散步群公告', () => api('chat/rooms/update', {
			roomId: room.id,
			announcement: '周六九点地铁站 A 口集合，路线约八公里。带水，下雨改走博物馆线。',
		}, a.writer.token));
	}

	const approvalAvatar = await step('编辑会群头像', () => uploadAsset(
		a.travel.token, 'room:city-observation-editorial', 'city-observation-room.jpg',
		unsplash('photo-1500530855697-b586d89ba3ee', 512, 512), ['#0369a1', '#065f46'],
	));
	const approval = await step('创建审核群', () => api('chat/rooms/create', {
		name: '城市观察编辑会', description: '一起整理路线、采访和照片，成员加入需要确认。', joinPolicy: 'approval',
		avatarId: approvalAvatar?.id ?? null,
	}, a.travel.token));
	if (approval) {
		await step('更新编辑会公告', () => api('chat/rooms/update', {
			roomId: approval.id,
			announcement: '申请时请简短写明想参与的选题，以及能承担的采访、摄影或整理工作。',
		}, a.travel.token));
		await act('申请入群', () => api('chat/rooms/requests/create', { roomId: approval.id, requestMessage: '想参与下一次城市观察的采访和拍照。' }, a.newbie.token));
		await act('申请入群', () => api('chat/rooms/requests/create', {
			roomId: approval.id, requestMessage: '我住在成都，周末可以协助整理路线和现场记录。',
		}, a.kitchen.token));
		const requests = (await db.query(
			'select id, "userId", "isRequest" from chat_room_invitation where "roomId" = $1',
			[approval.id],
		)).rows;
		const kitchenRequest = requests.find(request => request.userId === a.kitchen.id && request.isRequest);
		if (kitchenRequest) {
			await act('通过入群申请', () => api('chat/rooms/requests/answer', {
				roomId: approval.id, requestId: kitchenRequest.id, approve: true,
			}, a.travel.token));
		}
		const kitchenApproved = (await db.query(
			'select 1 from chat_room_membership where "roomId" = $1 and "userId" = $2',
			[approval.id, a.kitchen.id],
		)).rows.length > 0;

		const mainInvitation = await act('邀请主账号入群', () => api('chat/rooms/invitations/create', {
			roomId: approval.id, userId: a.main.id,
		}, a.travel.token));
		await act('邀请设计师入群', () => api('chat/rooms/invitations/create', {
			roomId: approval.id, userId: a.designer.id,
		}, a.travel.token));
		if (mainInvitation) await act('接受群邀请', () => api('chat/rooms/join', { roomId: approval.id }, a.main.token));
		await roomMessage(a, 'travel', approval.id, '主账号和乔乔都进来了。下周三晚上先碰一次选题。');
		if (kitchenApproved) await roomMessage(a, 'kitchen', approval.id, '好，我先把之前拍过的菜市场照片整理一份。');
	}

	const readingAvatar = await step('书影音群头像', () => uploadAsset(
		a.writer.token, 'room:reading-living-room', 'reading-living-room.jpg',
		unsplash('photo-1507842217343-583bb7270b66', 512, 512), ['#7c2d12', '#1e3a8a'],
	));
	const readingRoom = await step('创建书影音客厅群聊', () => api('chat/rooms/create', {
		name: '书影音客厅',
		description: '约读、交换书单，也聊最近看完的电影和纪录片。讨论不赶进度，没读完也能来。',
		joinPolicy: 'approval',
		avatarId: readingAvatar?.id ?? null,
		initialUserIds: ['books', 'main', 'kitchen', 'travel', 'mod'].map(key => a[key].id),
	}, a.writer.token));
	if (readingRoom) {
		await step('更新书影音群公告', () => api('chat/rooms/update', {
			roomId: readingRoom.id,
			announcement: '第一次共读在周日晚八点。可以只聊一个段落，也可以安静旁听；讨论结束后我会把纪要放到页面里。',
		}, a.writer.token));

		const readingIntro = await roomMessage(a, 'writer', readingRoom.id, '今晚八点先碰一下共读时间，大家不用提前准备完整发言。');
		const readingBooks = await roomMessage(a, 'books', readingRoom.id, '我把书里写城市和记忆的段落折了几页，晚点拍给大家。');
		await roomMessage(a, 'main', readingRoom.id, '我可能迟到十分钟，下班路上买点吃的就回来。');
		const readingKitchenQuestion = await roomMessage(a, 'kitchen', readingRoom.id, '报名页里说在群里讨论，是语音还是打字？我晚上在厨房，戴耳机不太方便。');
		if (readingKitchenQuestion) {
			await roomMessage(a, 'writer', readingRoom.id, '打字就行，想发语音也可以。我最后会把重点整理出来，不用一直盯着。', {
				replyId: readingKitchenQuestion.id,
				replyType: 'quote',
			});
		}
		const readingTravel = await roomMessage(
			a,
			'travel',
			readingRoom.id,
			'我在夜车上，信号可能会断。先把那句“记忆中的形象一旦被词语固定住，就会消失”记下来。',
		);
		const readingMod = await roomMessage(a, 'mod', readingRoom.id, '讨论完要不要留一份公开纪要？新来的人不用翻几百条消息。');
		if (readingMod) {
			await roomMessage(a, 'writer', readingRoom.id, '会留，我整理完发到「书影音客厅」频道，群里的原话不公开。', {
				replyId: readingMod.id,
				replyType: 'reply',
			});
		}

		await act('申请加入书影音客厅', () => api('chat/rooms/requests/create', {
			roomId: readingRoom.id,
			requestMessage: '只读了两章，想先旁听。平时在学校做采访，对城市记忆这个主题很感兴趣。',
		}, a.newbie.token));
		const readingRequests = (await db.query(
			'select id, "userId" from chat_room_invitation where "roomId" = $1 and "isRequest" = true and "ignored" = false',
			[readingRoom.id],
		)).rows;
		const newbieReadingRequest = readingRequests.find(request => request.userId === a.newbie.id);
		if (newbieReadingRequest) {
			await act('通过书影音客厅申请', () => api('chat/rooms/requests/answer', {
				roomId: readingRoom.id,
				requestId: newbieReadingRequest.id,
				approve: true,
			}, a.writer.token));
		}
		const newbieReadingJoined = (await db.query(
			'select 1 from chat_room_membership where "roomId" = $1 and "userId" = $2',
			[readingRoom.id, a.newbie.id],
		)).rows.length > 0;
		if (newbieReadingJoined) {
			const newbieReadingMessage = await roomMessage(
				a,
				'newbie',
				readingRoom.id,
				'大家好，我只读到第二章。如果理解偏了可以直接说，我会记下来。',
			);
			if (newbieReadingMessage) {
				await roomMessage(a, 'books', readingRoom.id, '没关系，共读不是考试。先说说哪一段让你停下来了。', {
					replyId: newbieReadingMessage.id,
					replyType: 'reply',
				});
			}
		}
		await act('邀请周亦加入书影音客厅', () => api('chat/rooms/invitations/create', {
			roomId: readingRoom.id,
			userId: a.dev.id,
		}, a.writer.token));
		await step('设置书影音群管理员', () => api('chat/rooms/members/update', {
			roomId: readingRoom.id,
			userId: a.books.id,
			role: 'administrator',
			nickname: '可可（书店）',
		}, a.writer.token));
		for (const [key, message, reaction] of [
			['main', readingIntro, '📚'],
			['kitchen', readingBooks, '☕'],
			['travel', readingBooks, '❤️'],
			['main', readingTravel, '🚆'],
			['books', readingMod, '🙌'],
		]) {
			if (message) await act('书影音群消息回应', () => api('chat/messages/react', {
				messageId: message.id,
				reaction,
			}, a[key].token));
		}
		await step('设置书影音群免打扰', () => api('chat/conversations/update', {
			roomId: readingRoom.id,
			notificationMode: 'silent',
		}, a.kitchen.token));
	}

	const frontendDemo = await step('前端夜校演示图', () => uploadAsset(
		a.dev.token, 'room:frontend-night-school', 'frontend-scroll-demo.jpg',
		unsplash('photo-1461749280684-dccba630e2f6', 1280, 960), ['#047857', '#1d4ed8'],
	));
	const frontendRoom = await step('创建前端夜校群聊', () => api('chat/rooms/create', {
		name: '前端夜校',
		description: '每周挑一个小问题做现场拆解。可以带自己的复现，也可以只来听。',
		joinPolicy: 'public',
		avatarId: frontendDemo?.id ?? null,
		initialUserIds: ['main', 'designer', 'mod'].map(key => a[key].id),
	}, a.dev.token));
	if (frontendRoom) {
		await step('更新前端夜校公告', () => api('chat/rooms/update', {
			roomId: frontendRoom.id,
			announcement: '本周主题：滚动边界和加载占位。请把最小复现、浏览器版本和出现时的页面位置一起发出来。',
		}, a.dev.token));

		const frontendIntro = await roomMessage(a, 'dev', frontendRoom.id, '这周只讲一个东西：列表滚到边界时为什么会抖。先讲复现，再看代码。');
		const frontendQuestion = await roomMessage(a, 'main', frontendRoom.id, '上次那个横向滚动条的问题也能一起看吗？只在内容刚好顶到边界时出现。');
		if (frontendQuestion) {
			await roomMessage(a, 'dev', frontendRoom.id, '可以。把出现前后的截图和窗口宽度带上，没有最小复现的话我现场拼一个。', {
				replyId: frontendQuestion.id,
				replyType: 'quote',
			});
		}
		await roomMessage(a, 'designer', frontendRoom.id, '我更关心加载中的空状态，别一进来整页往下跳。上次改完还是闪了一下。');
		const frontendDemoMessage = frontendDemo
			? await roomMessage(a, 'dev', frontendRoom.id, '演示文件先传上来了，两个页面，不用起后端也能打开。', {
				fileId: frontendDemo.id,
			})
			: null;
		if (frontendDemoMessage) {
			await step('修正前端夜校演示说明', () => api('chat/messages/update', {
				messageId: frontendDemoMessage.id,
				text: '演示文件先传上来了，两个页面，不用起后端，直接用浏览器打开。',
			}, a.dev.token));
		}

		await act('加入前端夜校', () => api('chat/rooms/join', {
			roomId: frontendRoom.id,
		}, a.newbie.token));
		const newbieFrontendJoined = (await db.query(
			'select 1 from chat_room_membership where "roomId" = $1 and "userId" = $2',
			[frontendRoom.id, a.newbie.id],
		)).rows.length > 0;
		if (newbieFrontendJoined) {
			const newbieFrontendMessage = await roomMessage(
				a,
				'newbie',
				frontendRoom.id,
				'我刚进来，前面没听到。可以从最开始再讲一遍吗？',
			);
			if (newbieFrontendMessage) {
				await roomMessage(a, 'main', frontendRoom.id, '等下会发整理稿，你先看演示文件里的第二页，问题就出在那个占位元素。', {
					replyId: newbieFrontendMessage.id,
					replyType: 'reply',
				});
			}
		}
		const frontendMod = await roomMessage(a, 'mod', frontendRoom.id, '如果整理成帖子，可以放到「前端手记」频道，我帮你置顶一天。');
		if (frontendMod) {
			await roomMessage(a, 'dev', frontendRoom.id, '好，今晚回去写，先把例子简化到能复制进 CodePen 的程度。', {
				replyId: frontendMod.id,
				replyType: 'reply',
			});
		}
		await step('设置前端夜校管理员', () => api('chat/rooms/members/update', {
			roomId: frontendRoom.id,
			userId: a.main.id,
			role: 'administrator',
			nickname: '夏夏',
		}, a.dev.token));
		for (const [key, message, reaction] of [
			['main', frontendIntro, '💡'],
			['designer', frontendQuestion, '👀'],
			['mod', frontendDemoMessage, '🙌'],
			['newbie', frontendMod, '👍'],
		]) {
			if (message) await act('前端夜校消息回应', () => api('chat/messages/react', {
				messageId: message.id,
				reaction,
			}, a[key].token));
		}
	}

	const craftRoomAvatar = await step('器物群头像', () => uploadAsset(
		a.seller.token, 'room:craft-and-objects', 'craft-room.jpg',
		unsplash('photo-1610701596007-11502861dcfa', 512, 512), ['#92400e', '#e7e5e4'],
	));
	const craftRoom = await step('创建器物与手作交流群聊', () => api('chat/rooms/create', {
		name: '器物与手作交流',
		description: '只聊真正用过的手作器物、养护和小批量制作，不发代购和广告。',
		joinPolicy: 'invitation',
		avatarId: craftRoomAvatar?.id ?? null,
		initialUserIds: ['designer', 'buyer', 'kitchen'].map(key => a[key].id),
	}, a.seller.token));
	if (craftRoom) {
		await step('更新器物群公告', () => api('chat/rooms/update', {
			roomId: craftRoom.id,
			announcement: '工作室开放日为十一月第一个周六下午两点。地址只在群内发，最多六人，带自己常用的杯子来也可以。',
		}, a.seller.token));

		const craftIntro = await roomMessage(a, 'seller', craftRoom.id, '开放日地址先发群里：地铁到陶溪川站，出站走八分钟，门口有一棵很高的樟树。');
		const craftBuyerQuestion = await roomMessage(a, 'buyer', craftRoom.id, '我带来那只杯底圈足比较窄的白瓷杯。放湿桌布上总容易倒，是正常磨损还是做得有问题？');
		if (craftBuyerQuestion) {
			await roomMessage(a, 'seller', craftRoom.id, '圈足没问题，应该是烧成时收缩不均。带来我给你磨一下底，不收费。', {
				replyId: craftBuyerQuestion.id,
				replyType: 'reply',
			});
		}
		await roomMessage(a, 'designer', craftRoom.id, '我想拍几张不同釉色在自然光下的照片，做页面时用。会避开其他客人的脸。');
		await roomMessage(a, 'seller', craftRoom.id, '可以，下午四点光斜进来最好看。别开闪光灯，釉面会反成一块白。');
		const craftTravelQuestion = await roomMessage(a, 'kitchen', craftRoom.id, '我从苏州过来，周日下午到。附近有安静的住处吗？');
		if (craftTravelQuestion) {
			await roomMessage(a, 'buyer', craftRoom.id, '住新厂附近方便，晚上还能逛市集。我给你发一个我去过的民宿，不是广告。', {
				replyId: craftTravelQuestion.id,
				replyType: 'quote',
			});
		}
		if (craftRoomAvatar) {
			await roomMessage(a, 'seller', craftRoom.id, '这是上一窑的杯子，右边那只就是杯口有月牙釉的。', {
				fileId: craftRoomAvatar.id,
			});
		}
		await step('设置器物群管理员', () => api('chat/rooms/members/update', {
			roomId: craftRoom.id,
			userId: a.buyer.id,
			role: 'administrator',
			nickname: '橘子',
		}, a.seller.token));
		for (const [key, message, reaction] of [
			['buyer', craftIntro, '🏺'],
			['designer', craftBuyerQuestion, '👀'],
			['seller', craftTravelQuestion, '🙋'],
		]) {
			if (message) await act('器物群消息回应', () => api('chat/messages/react', {
				messageId: message.id,
				reaction,
			}, a[key].token));
		}
	}

	const breakfastRoom = await step('创建早餐研究所群聊', () => api('chat/rooms/create', {
		name: '早餐研究所',
		description: '记录能在上班前吃完的早餐，也交换失败经验和省时间的做法。',
		joinPolicy: 'approval',
		avatarId: chatBreakfast?.id ?? null,
		initialUserIds: ['main', 'buyer', 'books', 'seller'].map(key => a[key].id),
	}, a.kitchen.token));
	if (breakfastRoom) {
		await step('更新早餐群公告', () => api('chat/rooms/update', {
			roomId: breakfastRoom.id,
			announcement: '本周主题：十分钟以内能坐下吃完的早餐。请写清楚准备时间和最容易失败的一步。',
		}, a.kitchen.token));

		const breakfastIntro = await roomMessage(a, 'kitchen', breakfastRoom.id, '这周主题是“十分钟以内能坐下吃完”，不要求拍照好看，也不接受只喝一杯咖啡。');
		await roomMessage(a, 'buyer', breakfastRoom.id, '我提名前一晚泡好的燕麦，早上加酸奶和橘子。准备两分钟，吃完大概五分钟。');
		const breakfastMain = await roomMessage(a, 'main', breakfastRoom.id, '烤吐司加煎蛋。吐司从冷冻室直接拿出来烤，早上不用等解冻。');
		const breakfastBooks = await roomMessage(a, 'books', breakfastRoom.id, '我只会煮鸡蛋，算吗？书店早班前一般是鸡蛋加一杯豆浆。');
		await roomMessage(a, 'seller', breakfastRoom.id, '工作室早上冷，带保温杯装粥最实用。前一晚煮好，早上到点了再开盖。');
		await act('申请加入早餐研究所', () => api('chat/rooms/requests/create', {
			roomId: breakfastRoom.id,
			requestMessage: '成都早上通常吃面，想看看大家怎么把早餐压缩到十分钟，也分享两家我常去的面馆。',
		}, a.travel.token));
		const breakfastRequests = (await db.query(
			'select id, "userId" from chat_room_invitation where "roomId" = $1 and "isRequest" = true and "ignored" = false',
			[breakfastRoom.id],
		)).rows;
		const travelBreakfastRequest = breakfastRequests.find(request => request.userId === a.travel.id);
		if (travelBreakfastRequest) {
			await act('通过早餐研究所申请', () => api('chat/rooms/requests/answer', {
				roomId: breakfastRoom.id,
				requestId: travelBreakfastRequest.id,
				approve: true,
			}, a.kitchen.token));
		}
		const travelBreakfastJoined = (await db.query(
			'select 1 from chat_room_membership where "roomId" = $1 and "userId" = $2',
			[breakfastRoom.id, a.travel.id],
		)).rows.length > 0;
		if (travelBreakfastJoined) {
			const breakfastTravel = await roomMessage(
				a,
				'travel',
				breakfastRoom.id,
				'我在成都，早上一碗素椒杂酱面，坐下到吃完八分钟。汤面不算的话，我可以改成锅盔夹蛋。',
			);
			if (breakfastTravel) {
				await roomMessage(a, 'kitchen', breakfastRoom.id, '汤面当然算，重点是能坐下来。锅盔那版也发一下，我想知道会不会掉渣。', {
					replyId: breakfastTravel.id,
					replyType: 'quote',
				});
			}
		}
		if (breakfastMain) {
			await step('修正早餐群里的时间', () => api('chat/messages/update', {
				messageId: breakfastMain.id,
				text: '烤吐司加煎蛋。吐司从冷冻室直接拿出来烤，整体六分钟，洗碗另算。',
			}, a.main.token));
		}
		if (chatBreakfast) {
			await roomMessage(a, 'kitchen', breakfastRoom.id, '这张是提前烤好的吐司，早上复烤两分钟就行。', {
				fileId: chatBreakfast.id,
			});
		}
		await step('设置早餐群管理员', () => api('chat/rooms/members/update', {
			roomId: breakfastRoom.id,
			userId: a.buyer.id,
			role: 'administrator',
			nickname: '橘子',
		}, a.kitchen.token));
		for (const [key, message, reaction] of [
			['main', breakfastIntro, '🍳'],
			['books', breakfastIntro, '🥚'],
			['kitchen', breakfastBooks, '🙌'],
			['buyer', breakfastMain, '❤️'],
		]) {
			if (message) await act('早餐群消息回应', () => api('chat/messages/react', {
				messageId: message.id,
				reaction,
			}, a[key].token));
		}
		await step('设置早餐群免打扰', () => api('chat/conversations/update', {
			roomId: breakfastRoom.id,
			notificationMode: 'silent',
		}, a.main.token));
	}

	for (const [targetRoom, inviterKey, label] of [
		[room, null, '周末散步小组'],
		[approval, 'travel', '城市观察编辑会'],
		[readingRoom, 'writer', '书影音客厅'],
		[frontendRoom, null, '前端夜校'],
		[craftRoom, 'seller', '器物与手作交流'],
		[breakfastRoom, 'kitchen', '早餐研究所'],
	]) {
		if (!targetRoom) continue;
		if (inviterKey) {
			const invitation = await step(`邀请管理员加入${label}`, () => api('chat/rooms/invitations/create', {
				roomId: targetRoom.id,
				userId: a.admin.id,
			}, a[inviterKey].token));
			if (!invitation) continue;
		}
		await act(`管理员加入${label}`, () => api('chat/rooms/join', {
			roomId: targetRoom.id,
		}, a.admin.token));
	}

	await step('设置私信提醒', () => api('chat/conversations/update', {
		userId: a.writer.id, notificationMode: 'assistant', unread: true,
	}, a.main.token));
	if (room) {
		await step('设置群聊免打扰', () => api('chat/conversations/update', {
			roomId: room.id, notificationMode: 'silent',
		}, a.travel.token));
	}
	return room;
}

async function seedAdminRoom(a, db) {
	const roomName = '社区共建室';
	let room = (await db.query(
		'select id from chat_room where "ownerId" = $1 and name = $2 order by id desc limit 1',
		[a.admin.id, roomName],
	)).rows[0];
	const avatar = await step('共建室头像', () => uploadAsset(
		a.admin.token,
		'room:community-builders',
		'community-builders-room.png',
		adAsset('community-builders-room.png'),
		['#17443e', '#d9ef74'],
	));
	if (!room) {
		room = await step('创建管理员群聊', () => api('chat/rooms/create', {
			name: roomName,
			description: '讨论社区规则、活动排期和反馈收尾。申请时请写明想参与的具体事项。',
			joinPolicy: 'approval',
			avatarId: avatar?.id ?? null,
			initialUserIds: ['mod', 'main'].map(key => a[key].id),
		}, a.admin.token));
	}
	if (!room) return null;

	await step('更新共建室信息', () => api('chat/rooms/update', {
		roomId: room.id,
		announcement: '每周三晚整理未处理反馈；涉及个人隐私和举报材料只发链接，不在群里转述。',
		avatarId: avatar?.id ?? undefined,
	}, a.admin.token));

	const writerMember = (await db.query(
		'select 1 from chat_room_membership where "roomId" = $1 and "userId" = $2 limit 1',
		[room.id, a.writer.id],
	)).rows.length > 0;
	if (!writerMember) {
		const request = await act('申请加入社区共建室', () => api('chat/rooms/requests/create', {
			roomId: room.id,
			requestMessage: '我负责共读和文章活动，想参与活动排期与内容规范的讨论。',
		}, a.writer.token));
		if (request) {
			const requestRow = (await db.query(
				'select id from chat_room_invitation where "roomId" = $1 and "userId" = $2 and "isRequest" = true and ignored = false limit 1',
				[room.id, a.writer.id],
			)).rows[0];
			if (requestRow) {
				await act('通过社区共建室申请', () => api('chat/rooms/requests/answer', {
					roomId: room.id,
					requestId: requestRow.id,
					approve: true,
				}, a.admin.token));
			}
		}
	}
	const hasWriter = (await db.query(
		'select 1 from chat_room_membership where "roomId" = $1 and "userId" = $2 limit 1',
		[room.id, a.writer.id],
	)).rows.length > 0;

	const messageCount = (await db.query(
		'select count(*)::int as count from chat_message where "toRoomId" = $1 and text is not null and "systemEvent" is null',
		[room.id],
	)).rows[0].count;
	if (messageCount === 0) {
		const intro = await roomMessage(
			a,
			'admin',
			room.id,
			'这个群只处理社区共建：规则调整、活动排期和反馈收尾。具体举报材料只发链接，不在群里展开。',
		);
		const modDigest = await roomMessage(
			a,
			'mod',
			room.id,
			'这周积压的反馈我先分了四类：发布入口、图片上传、目录展开时出现滚动条、移动端菜单层级。',
		);
		await roomMessage(a, 'main', room.id, '目录那条我下午复现了，内容刚好顶到边界时会闪一下，已经记到前端夜校的议题里。');
		if (hasWriter) {
			await roomMessage(a, 'writer', room.id, '共读活动报名页我补完说明了，周五晚把截止时间写清楚。');
		}
		if (modDigest) {
			await roomMessage(a, 'admin', room.id, '先按这个分类收尾。周五之前每人只处理一件，不要临时再加事项。', {
				replyId: modDigest.id,
				replyType: 'quote',
			});
		} else {
			await roomMessage(a, 'admin', room.id, '先按这个分类收尾。周五之前每人只处理一件，不要临时再加事项。');
		}
		await roomMessage(a, 'mod', room.id, '我把处理结果写回原反馈。没有新进展的就不在群里重复贴了。');
		await roomMessage(a, 'main', room.id, '周六维护公告我会提前发，只写清楚不能上传图片的时间段。');
		await roomMessage(a, 'mod', room.id, '活动页和共读通知也避开维护时间。我周五下午再统一检查一次入口。');
		await roomMessage(a, 'admin', room.id, '可以，今天就到这里。新事项先放进下周清单，不在群里临时扩散。');
		if (intro) {
			await act('共建室消息回应', () => api('chat/messages/react', {
				messageId: intro.id,
				reaction: '🙌',
			}, a.mod.token));
		}
	}

	await step('设置共建室管理员', () => api('chat/rooms/members/update', {
		roomId: room.id,
		userId: a.mod.id,
		role: 'administrator',
		nickname: '陈屿（治理）',
	}, a.admin.token));
	await step('设置共建室成员备注', () => api('chat/rooms/members/update', {
		roomId: room.id,
		userId: a.main.id,
		role: 'member',
		nickname: '夏夏（内容）',
	}, a.admin.token));
	await step('设置共建室免打扰', () => api('chat/conversations/update', {
		roomId: room.id,
		notificationMode: 'silent',
	}, a.writer.token));
	return room;
}

async function seedWallet(a, db) {
	const balances = {
		main: 2600, writer: 980, dev: 1260, designer: 2200, mod: 600, newbie: 520,
		private: 760, seller: 1800, buyer: 2400, travel: 1100, kitchen: 700, books: 640,
	};
	for (const key of communityKeys) {
		if (!a[key]) continue;
		await step(`充值 ${key}`, () => api('admin/wallet/adjust', {
			userId: a[key].id,
			amount: balances[key] ?? 500,
			requestId: requestId(`balance:${key}`),
			reason: '社区活动与内容创作预存',
		}, a.admin.token));
	}
	const accepted = await step('转账（已收款）', () => api('transfers/create', {
		recipientId: a.writer.id, amount: 88, requestId: requestId('transfer:main-writer'), message: '上次帮我改稿，请你喝咖啡 ☕',
	}, a.main.token));
	if (accepted?.id) await act('确认收款', () => api('transfers/accept', { transferId: accepted.id }, a.writer.token));
	await step('转账（待收款）', () => api('transfers/create', {
		recipientId: a.main.id, amount: 28, requestId: requestId('transfer:dev-main'), message: '上次的午饭钱',
	}, a.dev.token));
	await step('转账（待收款）', () => api('transfers/create', {
		recipientId: a.designer.id, amount: 120, requestId: requestId('transfer:main-designer'), message: '图标草稿的使用费',
	}, a.main.token));
	const kitTransfer = await step('转账（已退款）', () => api('transfers/create', {
		recipientId: a.kitchen.id, amount: 36, requestId: requestId('transfer:main-kitchen'), message: '上次聚餐的食材钱',
	}, a.main.token));
	if (kitTransfer?.id) await act('退回转账', () => api('transfers/refund', { transferId: kitTransfer.id }, a.kitchen.token));

	const noteTipSpecs = [
		['删了九百字', 'books', 8.8, '删稿的时候心疼，过两天再看通常会庆幸。'],
		['五点半从镇上出发', 'main', 12, '这张清晨的光很好，像真的站在山腰上。'],
		['今天的早餐：烤吐司', 'buyer', 10, '提前十分钟的办法试过了，早晨从容很多。'],
		['今天开窑，十二只白瓷杯', 'designer', 16, '会把瑕疵也写出来的店主不多，先收藏了。'],
		['书店角落来了一只猫', 'kitchen', 6.6, '“看了半天还是算了”太真实了。'],
		['今天又遇到一个很典型的 CSS 问题', 'newbie', 5, '刚好解决了我做课设时卡住的地方。'],
		['给一篇桂花主题的稿子试了三组颜色', 'dev', 9.9, '“第一版像奶茶广告”笑到了，灰绿确实舒服。'],
		['这周看得比较久的三篇', 'writer', 8, '谢谢整理，周末准备按这个顺序慢慢读。'],
		['下课去操场，梧桐叶落了一地', 'travel', 6, '能看的不到十张很正常，继续拍就好。'],
		['周六七点去菜市场', 'buyer', 9.9, '小雏菊和葱油饼这一段，很像我自己周末的早上。'],
	];
	const noteRows = (await db.query(`
		select id, "userId", text
		from note
		where "userId" = any($1::varchar[])
			and visibility = 'public'
			and "replyId" is null
			and "renoteId" is null
			and "deletedBy" is null
	`, [[a.writer.id, a.travel.id, a.books.id, a.seller.id, a.kitchen.id, a.dev.id, a.designer.id, a.mod.id, a.newbie.id, a.main.id, a.buyer.id]])).rows;
	for (const [snippet, senderKey, amount, message] of noteTipSpecs) {
		const target = noteRows.find(row => row.text?.includes(snippet));
		const recipientKey = target && Object.keys(a).find(key => a[key].id === target.userId);
		if (!target || !recipientKey || recipientKey === senderKey) continue;
		await step('打赏帖子', () => api('i/wallet/tip', {
			userId: target.userId, amount, requestId: requestId(`tip:note:${target.id}:${senderKey}`), message,
			targetType: 'note', targetId: target.id,
		}, a[senderKey].token));
	}

	const pageTips = [
		['note-taking-system', [['main', 20, '“整理当成另一份工作”说到我了，准备先把最近的十个文件名改掉。'], ['books', 6.6, '不追求每天都整理，反而更可能坚持下来。']]],
		['vue-composition-patterns', [['designer', 12, '清理副作用那一节帮我避开了一个内存泄漏。'], ['travel', 8, '虽然不写代码，也看懂了先做对再抽象。']]],
		['design-tokens-intro', [['main', 18, '正好在整理内容后台的配色，删掉一半变量比新增更花时间。'], ['kitchen', 9.9, '“变量描述用途”这句话，做菜单和排流程也适用。']]],
		['slow-train-southwest', [['writer', 15, '七个没下车的站名和没吃上的面，比景点清单更让人记得住。'], ['newbie', 5, '看完想试试第一次一个人的慢车旅行。']]],
		['reread-invisible-cities', [['main', 10, '用三个细节介绍一座城市，今天就想试一试。'], ['writer', 8.8, '重读把远方读成日常，这个变化写得很准。'], ['designer', 5, '描述是一种选择，做品牌叙事也一样。']]],
		['cup-from-clay', [['buyer', 26, '把瑕疵和损耗也写出来，反而更愿意买。'], ['kitchen', 12, '“拍照好看不能说明好用”这句很实在，想等开放日去看看。']]],
		['weekday-breakfast', [['main', 9.9, '先缩短清洗步骤，明早不用小锅了。'], ['buyer', 12, '不再按天排菜单，看到周三那段一下轻松了。'], ['seller', 6, '工作室的午饭也可以少洗两个盒子。']]],
		['new-friends-guide', [['newbie', 8, '“想不出第一条就先看两天”终于知道该写什么了。'], ['books', 5, '没人回复不等于被讨厌，这句很必要。']]],
		['home-with-less', [['main', 6.6, '先看东西从哪里来，比先买收纳盒具体多了。'], ['designer', 8.8, '玄关和门口那把椅子，几乎是每个家的默认堆叠区。']]],
		['color-and-tone', [['dev', 10, '灰度截图这招解决了我最近调暗色界面的问题。'], ['writer', 6.6, '先关掉色板只看明度，写文章时也像在排轻重。']]],
	];
	const pages = (await db.query('select id, name, "userId" from page where name = any($1::varchar[])', [
		pageTips.map(([name]) => name),
	])).rows;
	const pagesByName = new Map(pages.map(page => [page.name, page]));
	for (const [pageName, tips] of pageTips) {
		const page = pagesByName.get(pageName);
		if (!page) continue;
		for (const [senderKey, amount, message] of tips) {
			if (a[senderKey].id === page.userId) continue;
			await step('打赏文章', () => api('i/wallet/tip', {
				userId: page.userId, amount, requestId: requestId(`tip:page:${page.id}:${senderKey}`), message,
				targetType: 'page', targetId: page.id,
			}, a[senderKey].token));
		}
	}
	await step('打赏用户', () => api('tips/send', { userId: a.designer.id, amount: 5, requestId: requestId('tip:user'), message: '谢谢这周的小画' }, a.newbie.token));
}

async function seedRedPackets(a, db) {
	const publicPacket = await step('公开红包', () => api('red-packets/create', {
		kind: 'group', audience: 'public', mode: 'random', totalCoins: 88, count: 6,
		message: '周末散步小组第一站，请大家喝杯热茶', coverId: 'lucky', requestId: requestId('rp:public'),
	}, a.main.token));
	if (publicPacket) {
		const note = await post(a, 'main', { text: '周末散步小组第一次集合，发个小红包给早起的人 🧧\n周六早上九点地铁站见。#周末 #红包', redPacketId: publicPacket.id });
		if (note) for (const key of ['writer', 'travel', 'kitchen', 'newbie']) {
			await act('领取公开红包', () => api('red-packets/claim', { redPacketId: publicPacket.id }, a[key].token));
		}
	}
	const direct = await step('专属红包', () => api('red-packets/create', {
		kind: 'direct', audience: 'recipients', mode: 'equal', totalCoins: 52, count: 1,
		recipientIds: [a.writer.id], message: '谢谢你这周帮我改稿', coverId: 'classic', requestId: requestId('rp:direct'),
	}, a.main.token));
	if (direct) await dm(a, 'main', 'writer', null, { redPacketId: direct.id });
	const room = (await db.query('select id from chat_room where name = $1 order by id desc limit 1', ['周末散步小组'])).rows[0];
	if (room) {
		const roomPacket = await step('群红包', () => api('red-packets/create', {
			kind: 'group', audience: 'room', mode: 'random', totalCoins: 60, count: 4, roomId: room.id,
			message: '给周六准时集合的人', coverId: 'sunset', requestId: requestId('rp:room'),
		}, a.main.token));
		if (roomPacket) {
			await roomMessage(a, 'main', room.id, null, { redPacketId: roomPacket.id });
			for (const key of ['travel', 'newbie']) await act('领取群红包', () => api('red-packets/claim', { redPacketId: roomPacket.id }, a[key].token));
		}
		const secret = await step('口令红包', () => api('red-packets/create', {
			kind: 'group', audience: 'room', mode: 'random', totalCoins: 30, count: 3, roomId: room.id,
			password: '桂花开了', message: '口令：桂花开了', requestId: requestId('rp:password'),
		}, a.writer.token));
		if (secret) await roomMessage(a, 'writer', room.id, null, { redPacketId: secret.id });
	}

	const expiredUnclaimed = await step('已过期未领取红包', () => api('red-packets/create', {
		kind: 'group', audience: 'public', mode: 'equal', totalCoins: 12, count: 3,
		message: '活动改期，红包留到下回', coverId: 'sunset', requestId: requestId('rp:expired-unclaimed'),
	}, a.travel.token));
	if (expiredUnclaimed) {
		await step('退回过期未领取红包', async () => {
			await db.query(`update red_packet set "expiresAt" = now() - interval '1 second' where id = $1`, [expiredUnclaimed.id]);
			const shown = await api('red-packets/show', { redPacketId: expiredUnclaimed.id }, a.travel.token);
			if (shown?.status !== 'expired' || shown.remainingCoins !== 0 || shown.remainingCount !== 3) {
				throw new Error('未领取红包的过期退款状态异常');
			}
		});
	}

	if (room) {
		const expiredPartial = await step('部分领取后过期红包', () => api('red-packets/create', {
			kind: 'group', audience: 'room', mode: 'random', totalCoins: 18, count: 3, roomId: room.id,
			message: '雨停啦，先到的人喝茶', coverId: 'lucky', requestId: requestId('rp:expired-partial'),
		}, a.writer.token));
		if (expiredPartial) {
			await step('领取部分过期红包', () => api('red-packets/claim', {
				redPacketId: expiredPartial.id,
			}, a.travel.token));
			await step('退回部分领取红包', async () => {
				await db.query(`update red_packet set "expiresAt" = now() - interval '1 second' where id = $1`, [expiredPartial.id]);
				const shown = await api('red-packets/show', { redPacketId: expiredPartial.id }, a.writer.token);
				if (shown?.status !== 'expired' || shown.remainingCoins !== 0 || shown.remainingCount !== 2 || shown.claims?.length !== 1) {
					throw new Error('部分领取红包的过期退款状态异常');
				}
			});
			await step('拒绝过期红包领取', () => expectApiError('red-packets/claim', {
				redPacketId: expiredPartial.id,
			}, a.newbie.token, 'RED_PACKET_EXPIRED'));
		}
	}

	const canceled = await step('误发红包', () => api('red-packets/create', {
		kind: 'group', audience: 'public', mode: 'equal', totalCoins: 24, count: 3,
		message: '刚才把份数填错了，撤回后重新发', coverId: 'classic', requestId: requestId('rp:canceled'),
	}, a.main.token));
	if (canceled) {
		await step('撤回误发红包', () => api('red-packets/cancel', {
			redPacketId: canceled.id,
		}, a.main.token));
	}
}

async function seedCheckin(a) {
	for (const key of communityKeys) if (a[key]) await act(`${key} 签到`, () => api('i/checkin', {}, a[key].token));
	const cards = await step('补签卡兑换码', () => api('admin/benefits/codes/create', {
		name: '秋季共读签到礼', rewardType: 'makeupCards', amount: 2, maxRedemptions: 80,
		expiresAt: new Date(Date.now() + 60 * 86400000).toISOString(),
	}, a.admin.token));
	if (cards) for (const key of ['seller', 'buyer', 'writer', 'main', 'newbie', 'books', 'kitchen']) {
		if (!a[key]) continue;
		await act('补签卡兑换', () => api('i/benefits/redeem', { code: cards.code }, a[key].token));
		if (['seller', 'buyer', 'writer'].includes(key)) {
			for (const days of [1, 2]) await api('i/checkin-makeup', { date: daysAgo(days) }, a[key].token).then(() => stats.ok++, () => stats.skipped++);
		}
	}
	await step('积分兑换补签卡', () => api('i/checkin-exchange', { requestId: requestId('checkin:writer:exchange') }, a.writer.token));
	const points = await step('积分兑换码', () => api('admin/benefits/codes/create', {
		name: '秋季共读积分礼', rewardType: 'points', amount: 20, maxRedemptions: 80,
		expiresAt: new Date(Date.now() + 60 * 86400000).toISOString(),
	}, a.admin.token));
	if (points) for (const key of ['main', 'newbie', 'books', 'kitchen']) {
		await act('积分兑换', () => api('i/benefits/redeem', { code: points.code }, a[key].token));
	}
}

const PRODUCTS = [
	{
		key: 'whiteMug', seller: 'seller', name: '手捏白瓷马克杯', description: '景德镇高温白瓷，容量约 220 毫升。杯口手工修过，握着舒服，但杯口弧度和釉面流纹每只都不一样。有一只杯底有很浅的釉缩，我会单独拍照确认，不接受就不发。',
		type: 'physical', category: '陶瓷', unit: '只', price: 128, stockLimit: 12,
		imageUrl: unsplash('photo-1610701596007-11502861dcfa', 800, 800), colors: ['#92400e', '#e7e5e4'],
		deliveryText: '每周三开窑后发货，默认顺丰陆运。请在下单后私信确认收货地址。',
	},
	{
		key: 'smallDishes', seller: 'seller', name: '窑变釉小碟两只', description: '直径约 11 厘米，灰蓝和铁锈红随机搭两只。放茶点、戒指或咖啡豆都行。窑变颜色差别很大，可能一只深一只浅，不能指定成照片里的样子。',
		type: 'physical', category: '陶瓷', unit: '套', price: 96, stockLimit: 18,
		imageUrl: unsplash('photo-1490312278390-ab64016e0aa9', 800, 800), colors: ['#475569', '#b45309'],
		deliveryText: '两只一套，颜色随机搭配。下单后三天内发货，易碎品会双层加固。',
	},
	{
		key: 'linenApron', seller: 'seller', name: '草木染亚麻围裙', description: '中厚亚麻，植物染浅茶色。洗过几次会变软，颜色也会慢慢浅下去。胸前两个口袋，左边那只缝线有点歪，是打版时留下的。',
		type: 'physical', category: '织物', unit: '件', price: 168, stockLimit: 20, perUserLimit: 2,
		imageUrl: unsplash('photo-1452860606245-08befc0ff44b', 800, 800), colors: ['#78716c', '#166534'],
		deliveryText: '首次使用前建议冷水单独手洗。下单后五天内发货。',
	},
	{
		key: 'iconPack', seller: 'designer', name: '城市漫游线性图标包', description: '80 枚日常界面图标，按 24 像素网格画，2 像素描边。包含 SVG 和 Figma 源文件。卫生间、无障碍和公交三类图标改了两次，购买后如果发现断线可以告诉我。',
		type: 'virtual', category: '设计素材', unit: '份', price: 39, stockLimit: 0,
		imageUrl: unsplash('photo-1558655146-9f40138edfeb', 800, 800), colors: ['#be185d', '#312e81'],
		deliveryText: '下单后凭订单号私信，我会发送源文件下载说明。可用于个人和商业项目，不可转售。',
	},
	{
		key: 'autumnWallpaper', seller: 'designer', name: '秋日壁纸十二张', description: '六张手机竖版、六张桌面横版，都是低饱和的秋天小景。画面没有统一构图，有两张留白很多，在锁屏上可能显得空。仅供自用。',
		type: 'virtual', category: '数字', unit: '份', price: 12, stockLimit: 0,
		imageUrl: unsplash('photo-1507371341162-763b5e419408', 800, 800), colors: ['#c2410c', '#1e1b4b'],
		deliveryText: '下单后凭订单号私信获取高清文件，仅供自用。',
	},
	{
		key: 'writingSession', seller: 'writer', name: '文章结构一对一梳理', description: '60 分钟线上聊一篇卡住的稿子，重点看主题、结构和开头，不改全文。请提前发草稿和三个具体问题；如果稿子还没成形，可能先建议你继续写，费用会退。每周最多两单。',
		type: 'virtual', category: '服务', unit: '次', price: 199, stockLimit: 8, perUserLimit: 1,
		imageUrl: unsplash('photo-1455390582262-044cdead277a', 800, 800), colors: ['#9a3412', '#facc15'],
		deliveryText: '购买后请私信发送文章草稿和希望解决的问题，三天内约时间。',
	},
	{
		key: 'breakfastPdf', seller: 'kitchen', name: '工作日早餐食谱 PDF', description: '十套我实际反复做过的早餐，含采购清单、能提前准备的步骤和大概用时。没有精致摆盘，也有一半是“来不及时的替代方案”。用手机看的排版，打印出来字会偏小。',
		type: 'virtual', category: '食谱', unit: '份', price: 19, stockLimit: 0,
		imageUrl: unsplash('photo-1533777324565-a040eb52facd', 800, 800), colors: ['#b45309', '#166534'],
		deliveryText: '下单后凭订单号私信获取 PDF。后续有更新会免费补发。',
	},
	{
		key: 'chengduGuide', seller: 'travel', name: '成都慢走路线图', description: '三条自己走过很多次的步行路线，写了早饭摊、能坐下来的河边和厕所位置。不是完整旅游攻略，不包所有景点，部分小店可能会搬走，买前我会说明最近一次更新时间。',
		type: 'virtual', category: '旅行', unit: '份', price: 29, stockLimit: 0,
		imageUrl: unsplash('photo-1519608487953-e999c86e7455', 800, 800), colors: ['#0369a1', '#065f46'],
		deliveryText: '下单后凭订单号私信获取地图和文字说明，路线会按季节更新。',
	},
	{
		key: 'bookList', seller: 'books', name: '十一月私人书单', description: '告诉我最近读完的三本书，以及哪本不太喜欢，我手工整理五本候选，附两三句理由。不是算法推荐，可能有一两本你读不下去；不接受“只要心理学”或马上要交报告式催单。',
		type: 'virtual', category: '阅读', unit: '份', price: 10, stockLimit: 30, perUserLimit: 1,
		imageUrl: unsplash('photo-1524995997946-a1c2e315a42f', 800, 800), colors: ['#7c2d12', '#1e3a8a'],
		deliveryText: '购买后私信三本最近读过的书，三到五天内发送书单。',
	},
	{
		key: 'recipeCard', seller: 'kitchen', name: '番茄炖牛腩家庭配方卡', description: 'A5 配方卡，两人份和四人份的用量都写了，附冷藏和复热建议。锅、火力和牛腩部位会改变时间，卡上给的是我家燃气灶的大概时长，不是标准答案。',
		type: 'virtual', category: '食谱', unit: '份', price: 6, stockLimit: 0,
		imageUrl: unsplash('photo-1504674900247-0877df9cc836', 800, 800), colors: ['#b45309', '#7c2d12'],
		deliveryText: '下单后凭订单号私信获取可打印 PDF。',
	},
	{
		key: 'kilnBell', seller: 'seller', name: '冬日窑变陶铃', description: '手捏陶铃，灰白釉里带一点铁锈色。声音偏闷，不像玻璃铃，风大时才听得清。这一窑只有两只，一只釉色深，一只铃舌稍小。',
		type: 'physical', category: '陶瓷', unit: '只', price: 58, stockLimit: 2,
		imageUrl: unsplash('photo-1610701596007-11502861dcfa', 800, 800), colors: ['#78716c', '#b45309'],
		deliveryText: '两只都在本轮窑里，售完后不再补同款。下单后三天内发货，附手写养护说明。',
	},
	{
		key: 'teaCupTrio', seller: 'seller', name: '小满杯三只装', description: '三只不同器型的小杯，容量大约 80、110、150 毫升。能叠放，但不要硬卡太紧。釉色随机，整套不会完全同色，买前会先发实拍。',
		type: 'physical', category: '陶瓷', unit: '套', price: 118, stockLimit: 7,
		imageUrl: unsplash('photo-1490312278390-ab64016e0aa9', 800, 800), colors: ['#0f766e', '#d6d3d1'],
		deliveryText: '每套三只，釉色随机。下单后本周三或下周三开窑后发货，破损包补。',
	},
	{
		key: 'furnitureGuide', seller: 'buyer', name: '杭州旧家具淘货地图', description: '常去的旧货市场、两家修木工坊和搬运联系方式，加一份看家具时要检查的清单。市场摊位变化很快，我每月会更新一次；不负责估价，也不替你和老板砍价。',
		type: 'virtual', category: '城市生活', unit: '份', price: 16, stockLimit: 0, perUserLimit: 1,
		imageUrl: unsplash('photo-1484101403633-562f891dc89a', 800, 800), colors: ['#78716c', '#0f766e'],
		deliveryText: '下单后私信说明想找的家具类型，我会发地图，并补充最近一次逛市场的价格变化。',
	},
	{
		key: 'interviewWorkshop', seller: 'writer', name: '人物采访提纲工作坊', description: '90 分钟一起改采访提纲，重点看问题顺序和怎么追问。适合已经约到采访对象、至少写过一版提纲的人。只带着“想学采访”来，可能会觉得太具体。',
		type: 'virtual', category: '服务', unit: '次', price: 159, stockLimit: 6, perUserLimit: 1,
		imageUrl: unsplash('photo-1455390582262-044cdead277a', 800, 800), colors: ['#9a3412', '#e7e5e4'],
		deliveryText: '购买后私信发送采访对象、主题和已经列出的问题，三日内约时间。',
	},
	{
		key: 'nightTrainGuide', seller: 'travel', name: '西南慢车夜行手册', description: '四段自己坐过的慢车路线，写了车厢、停站、沿途看点和几个容易坐错的方向。时刻表会变，出发前必须再查一次；它不是铁路官方指南，也不推荐为了拍照冒险下车。',
		type: 'virtual', category: '旅行', unit: '份', price: 36, stockLimit: 80, perUserLimit: 1,
		imageUrl: unsplash('photo-1470770841072-f978cf4d019e', 800, 800), colors: ['#334155', '#0f766e'],
		deliveryText: '下单后凭订单号私信获取 PDF。路线会按铁路运行图变化更新，已购用户免费补发。',
	},
	{
		key: 'communityWorkshop', seller: 'mod', name: '社区活动策划一对一', description: '围绕一次读书会、市集或线上分享，聊目标、流程和分工，结束后给你一份能直接改的清单。不能替你拉赞助或做完整执行；活动太赶时，我会直说来不及。',
		type: 'virtual', category: '服务', unit: '次', price: 99, stockLimit: 4, perUserLimit: 1,
		imageUrl: unsplash('photo-1516321318423-f06f85e504b3', 800, 800), colors: ['#475569', '#0e7490'],
		deliveryText: '购买后私信写清活动人数、时间和目前卡住的地方，我会先看一遍，再约 45 分钟沟通。',
	},
	{
		key: 'rainGlazeTray', seller: 'seller', name: '雨灰釉试片托盘', description: '这一批专门试雨灰釉，每只颜色深浅不同，两只边缘有很小流釉。放首饰、茶匙或钥匙都行。试片盘不追求整齐，尺寸会有一两毫米误差，发货前逐只拍照。',
		type: 'physical', category: '陶瓷', unit: '只', price: 88, stockLimit: 10,
		imageUrl: unsplash('photo-1490312278390-ab64016e0aa9', 800, 800), colors: ['#334155', '#94a3b8'],
		deliveryText: '试片盘的釉色和尺寸略有差异，会在发货前逐只确认。下一批烧成后再重新上架。',
	},
];

async function seedShop(a) {
	const products = {};
	for (const product of PRODUCTS) {
		const seller = a[product.seller];
		if (!seller) continue;
		const image = await step('商品图', () => api('products/images/import', { url: product.imageUrl }, seller.token));
		const created = await step(`商品 ${product.name}`, () => api('products/create', {
			name: product.name, description: product.description, type: product.type, category: product.category,
			imageUrl: image?.url ?? '', unit: product.unit, price: product.price, perUserLimit: product.perUserLimit ?? 0,
			stockLimit: product.stockLimit, deliveryText: product.deliveryText, enabled: true, requestId: requestId(`product:${product.name}`),
		}, seller.token));
		if (created) products[product.key] = { ...created, imageUrl: image?.url ?? created.imageUrl };
	}
	const orders = [
		['buyer', 'whiteMug', 1], ['main', 'whiteMug', 1], ['newbie', 'smallDishes', 1], ['buyer', 'linenApron', 1],
		['main', 'iconPack', 1], ['newbie', 'autumnWallpaper', 1], ['writer', 'autumnWallpaper', 1], ['main', 'breakfastPdf', 1],
		['newbie', 'breakfastPdf', 1], ['buyer', 'chengduGuide', 1], ['designer', 'bookList', 1], ['travel', 'recipeCard', 1],
		['main', 'writingSession', 1], ['newbie', 'writingSession', 1], ['designer', 'writingSession', 1],
		['buyer', 'bookList', 1], ['main', 'bookList', 1], ['newbie', 'bookList', 1],
		['buyer', 'nightTrainGuide', 1], ['books', 'nightTrainGuide', 1], ['kitchen', 'nightTrainGuide', 1],
		['main', 'communityWorkshop', 1], ['buyer', 'communityWorkshop', 1],
		['buyer', 'kilnBell', 2], ['designer', 'teaCupTrio', 2], ['travel', 'teaCupTrio', 2], ['main', 'teaCupTrio', 2],
		['books', 'furnitureGuide', 1], ['newbie', 'furnitureGuide', 1], ['kitchen', 'furnitureGuide', 1],
	];
	for (const [buyer, productKey, quantity] of orders) {
		const product = products[productKey];
		if (!product || !a[buyer]) continue;
		await step(`${buyer} 下单`, () => api('orders/purchase', {
			productId: product.id, quantity, expectedPrice: product.price, expectedVersion: product.version,
			requestId: requestId(`order:${buyer}:${productKey}`),
		}, a[buyer].token));
	}

	const offSale = products.rainGlazeTray;
	const offSaleSpec = PRODUCTS.find(product => product.key === 'rainGlazeTray');
	if (offSale && offSaleSpec) {
		await step('下架雨灰釉试片托盘', () => api('products/update', {
			productId: offSale.id, expectedVersion: offSale.version,
			name: offSale.name, description: offSale.description, type: offSale.type, category: offSale.category,
			imageUrl: offSale.imageUrl, unit: offSale.unit, price: offSale.price,
			perUserLimit: offSale.perUserLimit, stockLimit: offSale.stockLimit,
			deliveryText: offSaleSpec.deliveryText, enabled: false,
		}, a.seller.token));
	}
}

async function seedFeedback(a) {
	const items = [
		['main', 'bug', '文章目录展开时短暂出现滚动条', '目录从收起变为展开的过程中，右侧会闪一下滚动条，展开结束后又消失。内容高度其实没有超出。', 'resolved', '已调整为只在内容真正溢出时显示滚动条，感谢录屏。'],
		['newbie', 'feature', '希望可以保存文章阅读位置', '长文章看到一半切换页面后，回来会跳回顶部。希望能记住上次看到的位置。', 'inProgress', '已记录，正在评估和登录状态同步的方案。'],
		['dev', 'feature', '代码块增加复制按钮', '文章里的代码块如果能一键复制，会比手动选中方便很多，尤其是手机上。', 'open', null],
		['designer', 'other', '深色主题下次要按钮对比度偏低', '夜间模式下灰色次要按钮和背景太接近，连续操作时不容易找到。', 'closed', '感谢截图，已在主题变量里提高次要按钮的对比度。'],
		['books', 'other', '希望书单页面可以按标签筛选', '私人书单多起来以后，想按城市、小说或非虚构快速筛选。', 'open', null],
		['kitchen', 'bug', '图片较多时发布页滚动位置会跳回顶部', '一次选择六张早餐照片，删除中间一张后编辑区域跳回最上面。', 'inProgress', '可以复现，正在排查图片列表重新渲染后的焦点位置。'],
	];
	for (const [key, category, title, description, status, response] of items) {
		const feedback = await step(`反馈 ${title}`, () => api('feedback/create', { title, description, category }, a[key].token));
		if (feedback && (status !== 'open' || response)) {
			await step('处理反馈', () => api('feedback/update', { feedbackId: feedback.id, status, ...(response ? { response } : {}) }, a.mod.token));
		}
	}
}

async function seedModeration(a, db) {
	const announcement = await step('公告', () => api('admin/announcements/create', {
		title: '十一月共读开始报名', text: '本月共读《看不见的城市》。可以在 @shenyan_writes 的报名页面留言，也可以直接参加周日晚的线上讨论。', imageUrl: null, icon: 'success', display: 'normal', forExistingUsers: true,
	}, a.admin.token));
	if (announcement) {
		for (const key of ['main', 'writer', 'books', 'newbie']) {
			await act('阅读公告', () => api('i/read-announcement', {
				announcementId: announcement.id,
			}, a[key].token));
		}
	}
	await step('横幅公告', () => api('admin/announcements/create', {
		title: '本周六夜间维护', text: '周六 23:30 至次日 01:00 将进行数据库维护，期间可能短暂无法上传图片。提前保存正在编辑的内容。', imageUrl: null, icon: 'warning', display: 'banner', forExistingUsers: true,
	}, a.admin.token));
	const marketPost = await post(a, 'buyer', {
		text: '家里多出一台闲置手冲壶，九成新，原价三百多。最近搬家不想带走，有需要的可以私信，价格可以聊。',
	});
	if (marketPost) {
		await step('举报帖子', () => api('users/report-abuse', {
			userId: a.buyer.id, reportType: 'note', targetId: marketPost.id, reason: 'spam',
			comment: '这条更像集市商品，放在普通时间线是否合适，麻烦共建组看一下。',
			requestId: requestId('report:note:market'),
		}, a.main.token));
	}
	const userReportRequestId = requestId('report:user:seller');
	await step('举报用户', () => api('users/report-abuse', {
		userId: a.seller.id, reportType: 'user', reason: 'spam',
		comment: '该账号最近连续发布商品内容，想确认是否都符合社区规范。',
		requestId: userReportRequestId,
	}, a.newbie.token));
	const userReport = (await db.query('select id from abuse_user_report where "requestId" = $1', [userReportRequestId])).rows[0];
	if (userReport) {
		await step('补充举报处理说明', () => api('admin/update-abuse-user-report', {
			reportId: userReport.id,
			moderationNote: '核对了主页说明、商品介绍和交易方式，属于正常的手作经营，未发现站外欺诈或冒充。',
		}, a.admin.token));
		await act('驳回商品账号举报', () => api('admin/resolve-abuse-user-report', {
			reportId: userReport.id, resolvedAs: 'reject',
		}, a.admin.token));
	}
}

async function seedGallery(a) {
	const images = [
		['design-autumn', a.designer, 'autumn-color-study.jpg', unsplash('photo-1507371341162-763b5e419408', 1080, 1350), ['#b45309', '#7c2d12']],
		['design-type', a.designer, 'book-cover-study.jpg', unsplash('photo-1545235617-9465d2a55698', 1080, 1350), ['#be185d', '#1e1b4b']],
		['design-illustration', a.designer, 'daily-illustration.jpg', unsplash('photo-1513364776144-60967b0f800f', 1080, 1350), ['#9d174d', '#f59e0b']],
	];
	const files = [];
	for (const [key, user, name, url, colors] of images) {
		const file = await step('图集图片', () => uploadAsset(user.token, `gallery:${key}`, name, url, colors));
		if (file) files.push(file.id);
	}
	if (files.length) {
		const gallery = await step('图集', () => api('gallery/posts/create', {
			title: '一周色彩记录', description: '三张小画和两张排版草稿，顺序没排好。第一张颜色最满意，后面越画越急。', fileIds: files,
		}, a.designer.token));
		if (gallery) for (const key of ['main', 'writer', 'dev', 'buyer']) {
			await act('图集点赞（需 Redis 7+）', () => api('gallery/posts/like', { postId: gallery.id }, a[key].token));
		}
	}

	const sensitive = await step('敏感图集图片', () => uploadAsset(
		a.designer.token, 'gallery:sensitive', 'figure-study.jpg',
		unsplash('photo-1513364776144-60967b0f800f', 900, 1200), ['#7f1d1d', '#fda4af'],
	));
	if (sensitive) {
		await step('敏感图集', () => api('gallery/posts/create', {
			title: '人体结构速写练习', description: '最近每周临摹两张人物结构，已标记为敏感内容，介意请跳过。',
			fileIds: [sensitive.id], isSensitive: true,
		}, a.designer.token));
	}

	const apps = [
		['kitchen', '今天吃什么', '从几道家常菜里随机挑一道。', String.raw`/// @ 1.2.1
let meals = ["番茄炖牛腩", "香菇鸡饭", "青菜豆腐汤", "葱油拌面", "剩菜炒饭"]
Ui:render([
	Ui:C:container({
		align: 'center'
		children: [
			Ui:C:button({
				text: "帮我选一道"
				primary: true
				onClick: @() {
					Mk:dialog("今晚吃", meals[Math:rnd(0, 4)])
				}
			})
		]
	})
])`],
		['travel', '旅行带什么', '每次抽一件出门常忘的东西。', String.raw`/// @ 1.2.1
let things = ["充电器", "创可贴", "折叠伞", "薄外套", "备用胶卷", "一小包纸巾"]
Ui:render([
	Ui:C:button({
		text: "检查一下背包"
		onClick: @() {
			Mk:dialog("别忘了", things[Math:rnd(0, 5)])
		}
	})
])`],
		['books', '今天读什么', '从最近的短篇集里随机挑一本。', String.raw`/// @ 1.2.1
let books = ["《夜航西飞》", "《看不见的城市》", "《城南旧事》", "《都柏林人》"]
Ui:render([
	Ui:C:container({
		align: 'center'
		children: [
			Ui:C:mfm({ text: "不知道读什么的时候，先把书拿起来。" })
			Ui:C:button({
				text: "抽一本"
				onClick: @() {
					Mk:dialog("今晚读", books[Math:rnd(0, 3)])
				}
			})
		]
	})
])`],
	];
	for (const [key, title, summary, script] of apps) {
		const app = await step(`互动应用 ${title}`, () => api('flash/create', {
			title, summary, permissions: [], visibility: 'public', script,
		}, a[key].token));
		if (app) for (const liker of ['main', 'writer', 'designer', 'newbie']) {
			if (liker !== key) await act('互动应用点赞', () => api('flash/like', { flashId: app.id }, a[liker].token));
		}
	}
}

async function seedPersonal(a) {
	const list = await step('用户列表', () => api('users/lists/create', { name: '周末一起走' }, a.main.token));
	if (list) for (const key of ['writer', 'travel', 'kitchen', 'books']) {
		await act('加入列表', () => api('users/lists/push', { listId: list.id, userId: a[key].id }, a.main.token));
	}
	await step('天线', () => api('antennas/create', {
		name: '独立写作者', src: 'all', keywords: [['写作'], ['阅读'], ['城市'], ['随笔']], excludeKeywords: [], users: [],
		caseSensitive: false, withReplies: false, withFile: false,
	}, a.main.token));
	if (list) await step('列表天线', () => api('antennas/create', {
		name: '周末慢生活', src: 'list', userListId: list.id, keywords: [['散步'], ['早餐'], ['书店'], ['旅行']], excludeKeywords: [], users: [],
		caseSensitive: false, withReplies: false, withFile: false,
	}, a.main.token));
	await step('展览天线', () => api('antennas/create', {
		name: '上海展览与活动', src: 'all', keywords: [['展览'], ['字体'], ['设计']], excludeKeywords: [], users: [a.designer.id, a.buyer.id],
		caseSensitive: false, withReplies: false, withFile: true,
	}, a.designer.token));
	await step('用户备注', () => api('users/update-memo', { userId: a.writer.id, memo: '写城市和书店，改稿建议很细。' }, a.main.token));
	await step('用户备注', () => api('users/update-memo', { userId: a.dev.id, memo: '前端问题可以问，回复很认真。' }, a.main.token));
	await step('用户备注', () => api('users/update-memo', { userId: a.seller.id, memo: '景德镇手作，周三开窑。' }, a.buyer.token));
}

async function seedPrivateAccount(a) {
	const user = a.private;
	if (!user) return;
	await step('私密账号设置', () => api('i/update', { isLocked: true, autoAcceptFollowed: false }, user.token));
	await post(a, 'private', {
		visibility: 'followers',
		text: '这周六会去拍雨后的老门东，想一起走走的朋友可以私信。人数不多，大概三个人就够。',
	});
	await act('私密账号关注主账号', () => api('following/create', { userId: a.main.id }, user.token));
}

// 使用已导入的自定义表情（见 import-local-assets.mjs），没有表情时跳过。
async function seedEmojis(a, db) {
	// 优先选字母开头的可读名称；_u 开头的是中文名转义后的导入名，纯数字名称也不便识别。
	const names = (await db.query('select name from emoji where host is null order by name !~ $1, name limit 5', ['^[a-zA-Z]'])).rows.map(row => row.name);
	if (names.length < 3) {
		console.log('  - 尚未导入自定义表情，跳过（先运行 pnpm --filter backend import:assets）');
		return;
	}
	const note = await post(a, 'dev', {
		text: `今晚把相机修好了，顺手试了三个表情 ${names.slice(0, 3).map(name => `:${name}:`).join(' ')}\n这周末终于可以带它出门。 #摄影 #日常`,
	});
	if (note) for (const [index, key] of ['main', 'writer', 'designer', 'newbie'].entries()) {
		await act('自定义表情回应', () => api('notes/reactions/create', { noteId: note.id, reaction: `:${names[index % names.length]}@.:` }, a[key].token));
	}
}

async function seedMediaNotes(a, db) {
	const folder = await step('网盘文件夹', () => api('drive/folders/create', { name: '城市小店采访' }, a.main.token));
	const subfolder = await step('子文件夹', () => api('drive/folders/create', { name: '菜市场', parentId: folder?.id ?? null }, a.main.token));
	const writingFolder = await step('写作资料文件夹', () => api('drive/folders/create', { name: '采访与写作资料' }, a.writer.token));
	const interviewFolder = await step('人物采访子文件夹', () => api('drive/folders/create', {
		name: '人物采访', parentId: writingFolder?.id ?? null,
	}, a.writer.token));
	const photos = [];
	const photoSpecs = [
		['market-vegetables', 'morning-market-vegetables.jpg', unsplash('photo-1488459716781-31db52582fe9', 1280, 960), ['#166534', '#b45309']],
		['market-flower', 'morning-market-flowers.jpg', unsplash('photo-1490750967868-88aa4486c946', 1280, 960), ['#be185d', '#facc15']],
		['market-street', 'market-street.jpg', unsplash('photo-1495474472287-4d71bcdd2085', 1280, 960), ['#78716c', '#0f766e']],
	];
	for (const [key, name, url, colors] of photoSpecs) {
		const file = await step('采访照片', () => uploadAsset(a.main.token, `drive:${key}`, name, url, colors, subfolder?.id ?? folder?.id ?? null));
		if (file) {
			photos.push(file.id);
		}
	}
	const notebookFile = await step('采访笔记照片', () => uploadAsset(
		a.writer.token, 'drive:interview-notebook', 'interview-question-notes.jpg',
		unsplash('photo-1455390582262-044cdead277a', 1280, 960), ['#7c2d12', '#e7e5e4'],
		interviewFolder?.id ?? writingFolder?.id ?? null,
	));
	if (notebookFile) {
		await step('整理采访笔记', () => api('drive/files/update', {
			fileId: notebookFile.id,
			comment: '下周采访用的提纲，重点问第一次开店的契机和这些年街区的变化。',
			isPinned: true,
		}, a.writer.token));
	}
	const uploadDraftImage = await step('上传草稿图片', () => uploadAsset(
		a.main.token, 'drive:upload-draft-market', 'market-interview-cover-draft.jpg',
		unsplash('photo-1488459716781-31db52582fe9', 1280, 960), ['#166534', '#b45309'],
		subfolder?.id ?? folder?.id ?? null,
	));
	if (photos.length) {
		const note = await post(a, 'main', {
			text: '今天在菜市场拍了三张：卖花阿姨的蓝色围裙、刚到的青菜、还有一直冒着热气的豆浆摊。\n采访稿还在整理，先把照片放进文件夹。#摄影 #城市散步',
			fileIds: photos,
		});
		if (note) for (const key of ['writer', 'designer', 'newbie', 'buyer']) {
			await act('点赞', () => api('notes/likes/create', { noteId: note.id }, a[key].token));
		}
	}
	const sensitive = await step('敏感图片', () => uploadAsset(
		a.designer.token, 'drive:sensitive-sketch', 'figure-drawing-wip.jpg',
		unsplash('photo-1513364776144-60967b0f800f', 900, 1200), ['#0f172a', '#e11d48'],
	));
	if (sensitive) {
		await step('标记敏感', () => api('drive/files/update', { fileId: sensitive.id, isSensitive: true }, a.designer.token));
		await post(a, 'designer', { cw: '人体结构速写，含身体线条', text: '最近的练习，比例还是有点不稳，先留个记录。', fileIds: [sensitive.id] });
	}

	await post(a, 'writer', { text: '@linzhixia @zhouyi_dev 新文章写好了，帮我看看开头是不是太慢？' });
	await post(a, 'main', { visibility: 'specified', visibleUserIds: [a.writer.id], text: '@shenyan_writes 私下说一句：你上次推荐的书真的很好看。' });
	await post(a, 'mod', { text: '本周精选：@shenyan_writes 的写作复盘、@ali_studio 的排版文章，还有 @anran_onroad 的慢车旅行。感谢大家的分享 🙏 #每周精选' });

	const channel = (await db.query('select id from channel where name = $1 order by id desc limit 1', ['前端手记'])).rows[0];
	if (channel) {
		const pinned = [];
		for (const text of ['频道规则：只讨论前端相关话题，提问请附上复现步骤和预期结果。', '资源汇总：Vue 文档、MDN、TypeScript Handbook，以及一个常用浏览器兼容表。']) {
			const note = await post(a, 'dev', { text, channelId: channel.id });
			if (note) pinned.push(note.id);
		}
		if (pinned.length) await step('频道置顶', () => api('channels/update', { channelId: channel.id, pinnedNoteIds: pinned }, a.dev.token));
	}

	await step('帖子草稿', () => api('notes/drafts/create', {
		text: '菜市场采访提纲：\n1. 为什么选择在这里摆摊？\n2. 一天里最忙的时间\n3. 收摊以后去哪里',
		fileIds: uploadDraftImage ? [uploadDraftImage.id] : [],
		poll: { choices: ['先发短记录', '等采访完整后发文章', '做成图集', '先发音频片段'], multiple: true },
		visibility: 'public',
	}, a.main.token));
	await step('定时帖子', () => api('notes/drafts/create', {
		text: '明早九点发一篇城市散步路线，写绍兴的那条河。路线不长，适合一个人慢慢走。#城市散步',
		visibility: 'public', scheduledAt: Date.now() + 86400000, isActuallyScheduled: true,
	}, a.travel.token));
}

async function seedChannelLife(a, db) {
	const names = ['城市散步', '前端手记', '视觉与排版', '书影音客厅', '手作与器物', '厨房小事', '新朋友请进'];
	const channelRows = (await db.query(
		'select id, name, "pinnedNoteIds" from channel where name = any($1::varchar[])',
		[names],
	)).rows;
	const channel = Object.fromEntries(channelRows.map(row => [row.name, row]));
	const notes = {};

	notes.cityWeekend = channel['城市散步'] ? await post(a, 'main', {
		channelId: channel['城市散步'].id,
		text: '频道置顶先放三条路线，都会写起点、怎么坐车和哪里能坐。\n后面想到哪条再加，暂时不追求做成大全。#城市散步',
	}) : null;
	notes.cityMarket = channel['城市散步'] ? await post(a, 'buyer', {
		channelId: channel['城市散步'].id,
		text: '今天去大马弄，修鞋摊旁边那棵桂花树开了。老板说每年都有人停下来拍，拍完就走。\n我在旁边站了五分钟，鞋没坏，也没好意思空手聊，最后买了双鞋垫。#城市散步',
	}) : null;
	notes.cityNewbieQuestion = channel['城市散步'] ? await post(a, 'newbie', {
		channelId: channel['城市散步'].id,
		text: '想拍一组从学校走到江边的傍晚路线，但总是走到一半不知道镜头该对准什么。\n你们拍城市时，会先定主题，还是边走边看？#摄影 #城市散步',
	}) : null;
	if (notes.cityNewbieQuestion) {
		notes.cityNewbieAnswer = await post(a, 'main', {
			replyId: notes.cityNewbieQuestion.id,
			text: '我会先拍十张“没有主题”的照片，回来再看它们共同在意什么。通常是光、招牌或者路边的人，主题会在选片时自己出现。',
		});
	}

	notes.designGuide = channel['视觉与排版'] ? await post(a, 'designer', {
		channelId: channel['视觉与排版'].id,
		text: '发作品求反馈时，最好带一句目标，比如“这张海报想让人先看到时间”。\n只说“帮我看看好不好看”，大家通常只能回颜色和感觉，很难聊到具体问题。#设计 #排版',
	}) : null;
	notes.designDev = channel['视觉与排版'] ? await post(a, 'dev', {
		channelId: channel['视觉与排版'].id,
		text: '最近在改夜间界面的次要按钮。灰度从 48% 提到 56% 以后，找按钮容易多了，但页面也比原来“重”了一点。\n这种对比度和视觉重量之间的取舍，大家一般怎么测？#设计',
	}) : null;
	notes.designCover = channel['视觉与排版'] ? await post(a, 'main', {
		channelId: channel['视觉与排版'].id,
		text: '做一本书封的选题，内容讲的是旧城改造。编辑想要“有历史感，但不要做旧”。\n找了几组照片以后发现，真正让它显旧的可能不是颜色，而是边缘的磨损和排版里的空白。#设计 #阅读',
	}) : null;
	if (notes.designDev) {
		notes.designDevReply = await post(a, 'designer', {
			replyId: notes.designDev.id,
			text: '我会先看按钮是不是主要操作。如果只是辅助，可以别把色值提得太高，改一下悬停和焦点态，反而更稳。',
		});
	}
	if (notes.designCover) {
		notes.designCoverReply = await post(a, 'buyer', {
			replyId: notes.designCover.id,
			text: '可以试试保留一张真实的沿街店招，不用做旧处理。城市的时间感往往藏在那些被换过几次字的地方。',
		});
	}

	notes.readingClub = channel['书影音客厅'] ? await post(a, 'writer', {
		channelId: channel['书影音客厅'].id,
		text: '十一月共读先定《看不见的城市》，周日晚八点线上聊。没读完也能来，带上一个你最近反复想起的城市细节就好。\n报名入口会放在我的页面里，频道里也会发提醒。#阅读 #书影音',
	}) : null;
	notes.readingAudio = channel['书影音客厅'] ? await post(a, 'travel', {
		channelId: channel['书影音客厅'].id,
		text: '夜车上听《夜航西飞》，一段听了两遍都没听清，最后睡着了。\n醒来刚好停站，窗外有人搬箱子。比有声书本身更像书里的场景。#阅读 #旅行',
	}) : null;
	notes.readingEssay = channel['书影音客厅'] ? await post(a, 'books', {
		channelId: channel['书影音客厅'].id,
		text: '最近连续读到几本“写得很聪明，但没有让我想继续待在里面”的书。\n好读和喜欢之间确实有距离。准备写一篇短文，专门说说那些完成度很高、却没能留下余味的作品。#阅读',
	}) : null;
	if (notes.readingAudio) {
		notes.readingAudioReply = await post(a, 'writer', {
			replyId: notes.readingAudio.id,
			text: '夜车很适合听书。光线和手机都不适合，耳朵反而能空出来。你听的是哪一版？',
		});
	}
	if (notes.readingEssay) {
		notes.readingEssayReply = await post(a, 'kitchen', {
			replyId: notes.readingEssay.id,
			text: '这种感觉很像吃到一道很精致的菜，却不会想第二天再做一次。期待你的短文。',
		});
	}

	notes.craftOpenDay = channel['手作与器物'] ? await post(a, 'seller', {
		channelId: channel['手作与器物'].id,
		text: '十一月第一个周六下午两点，工作室开放两小时。可以看修坯、摸不同的泥，也可以带一只自己用过但釉面磨花的小杯子来问问怎么养护。\n地址会在私信里发，每场最多六个人。#手作 #陶瓷',
	}) : null;
	notes.craftUse = channel['手作与器物'] ? await post(a, 'buyer', {
		channelId: channel['手作与器物'].id,
		text: '上个月那只白瓷杯已经用来喝水、泡茶、装草莓了。杯口有一边略低，刚开始会注意，现在习惯了。\n唯一问题是杯底圈足有点窄，放在湿桌布上容易倒，端的时候得看着点。#手作',
	}) : null;
	notes.craftCare = channel['手作与器物'] ? await post(a, 'newbie', {
		channelId: channel['手作与器物'].id,
		text: '第一次买手作杯子，请问可以放洗碗机吗？釉面上有一条很细的纹路，看起来像裂了，又像是本来就有的。\n不太敢直接刷。#手作',
	}) : null;
	if (notes.craftCare) {
		notes.craftCareReply = await post(a, 'seller', {
			replyId: notes.craftCare.id,
			text: '先别急着用钢丝球。开片和裂纹在光下的反光不一样，你可以拍一张侧光照发我。洗碗机最好先不用，手洗后用布擦干就够。',
		});
	}

	notes.kitchenMenu = channel['厨房小事'] ? await post(a, 'kitchen', {
		channelId: channel['厨房小事'].id,
		text: '这周想试一个“冰箱先吃完再买菜”的小挑战。频道里每天发一张当天用掉剩菜做成的饭，不要求好看，只记录用了什么。\n周日把大家最常留下的食材整理成下一周采购清单。#厨房 #生活',
	}) : null;
	notes.kitchenSoup = channel['厨房小事'] ? await post(a, 'books', {
		channelId: channel['厨房小事'].id,
		text: '武汉降温，第一次煮莲藕排骨汤。藕买多了，切块分袋冻起来，冰箱差点关不上。\n汤还行，就是盐放晚了，喝到下面才入味。#厨房',
	}) : null;
	notes.kitchenDorm = channel['厨房小事'] ? await post(a, 'newbie', {
		channelId: channel['厨房小事'].id,
		text: '宿舍只有电饭煲和一个小电锅，想问问有没有不占地方、一次能做两顿的菜？\n最近总是晚饭吃一半，第二天中午又不想点外卖。#厨房',
	}) : null;
	if (notes.kitchenDorm) {
		notes.kitchenDormReply = await post(a, 'kitchen', {
			replyId: notes.kitchenDorm.id,
			text: '可以试试土豆胡萝卜焖饭，米和水按平时放，菜切小一点，最后打一个蛋焖十分钟。第二顿加一点青菜就够了。',
		});
	}

	notes.frontendWriting = channel['前端手记'] ? await post(a, 'writer', {
		channelId: channel['前端手记'].id,
		text: '写一篇给非技术读者看的产品复盘，最难的是一直忍住不写“状态管理”“渲染”这样的词。\n但完全不写又会让过程变得像魔法。技术作者会怎么找这个平衡？#写作 #前端',
	}) : null;
	notes.frontendQuestion = channel['前端手记'] ? await post(a, 'mod', {
		channelId: channel['前端手记'].id,
		text: '整理社区反馈时遇到一个很典型的描述：“点了以后页面会自己滚一下”。\n如果不懂技术，怎样把这种问题补充到更容易排查？#前端',
	}) : null;
	if (notes.frontendWriting) {
		notes.frontendWritingReply = await post(a, 'dev', {
			replyId: notes.frontendWriting.id,
			text: '我会先写用户看到的现象，再补一个小括号解释机制。不是完全不出现术语，而是让不懂术语的人也能跳过它继续读。',
		});
	}
	if (notes.frontendQuestion) {
		notes.frontendQuestionReply = await post(a, 'dev', {
			replyId: notes.frontendQuestion.id,
			text: '可以补三件事：操作前在页面什么位置、点击后页面移动了多少、刷新以后还能不能复现。再有一段录屏就很好排查了。',
		});
	}

	notes.welcomeMod = channel['新朋友请进'] ? await post(a, 'mod', {
		channelId: channel['新朋友请进'].id,
		text: '新朋友可以先做三件事：填一句能让人了解你的简介，关注两个真正想读的账号，然后发一条最近正在做的事。\n不用急着认识所有人，先从一次具体回复开始就好。#新朋友 #社区',
	}) : null;
	notes.welcomeBooks = channel['新朋友请进'] ? await post(a, 'books', {
		channelId: channel['新朋友请进'].id,
		text: '欢迎刚来的朋友来书店话题下聊聊最近读的书。\n不需要写完整书评，哪怕只是“这本书让我想起哪一条街”也很好。#阅读 #新朋友',
	}) : null;
	notes.welcomeNewbie = channel['新朋友请进'] ? await post(a, 'newbie', {
		channelId: channel['新朋友请进'].id,
		text: '已经发了两条帖子，还想问一下：如果私信发错了人，可以撤回吗？刚刚不小心点到了联系人列表。\n有点紧张，怕是打扰别人。#新朋友',
	}) : null;
	if (notes.welcomeNewbie) {
		notes.welcomeNewbieReply = await post(a, 'mod', {
			replyId: notes.welcomeNewbie.id,
			text: '可以撤回，在聊天消息的菜单里选删除即可。如果对方已经看到，也可以简单说明一下发错了，不用太有压力。',
		});
	}

	const interactions = {
		cityWeekend: [['writer', '👟'], ['travel', '🌿'], ['buyer', '🚶'], ['newbie', '📷']],
		cityMarket: [['main', '❤️'], ['books', '🍂'], ['designer', '📷']],
		cityNewbieQuestion: [['main', '💡'], ['travel', '🙋'], ['writer', '📷']],
		designGuide: [['main', '💡'], ['dev', '🙌'], ['buyer', '❤️'], ['newbie', '📐']],
		designDev: [['designer', '👀'], ['main', '💡'], ['mod', '👍']],
		designCover: [['designer', '📚'], ['writer', '❤️'], ['books', '🌟']],
		readingClub: [['books', '📚'], ['main', '🙋'], ['kitchen', '❤️'], ['newbie', '🌙']],
		readingAudio: [['writer', '🚆'], ['books', '🎧'], ['main', '✨']],
		readingEssay: [['writer', '📝'], ['kitchen', '🍲'], ['travel', '❤️']],
		craftOpenDay: [['buyer', '🏺'], ['designer', '🙋'], ['kitchen', '❤️'], ['newbie', '👀']],
		craftUse: [['seller', '❤️'], ['main', '☕'], ['designer', '👏']],
		craftCare: [['seller', '💡'], ['buyer', '🙌'], ['main', '👍']],
		kitchenMenu: [['main', '🥬'], ['writer', '🙋'], ['buyer', '❤️'], ['books', '💡']],
		kitchenSoup: [['kitchen', '🍲'], ['newbie', '❤️'], ['main', '👍']],
		kitchenDorm: [['kitchen', '💡'], ['buyer', '🙌'], ['books', '❤️']],
		frontendWriting: [['dev', '💡'], ['designer', '📝'], ['main', '👍']],
		frontendQuestion: [['dev', '🙌'], ['designer', '💡'], ['newbie', '👀']],
		welcomeMod: [['newbie', '👋'], ['books', '❤️'], ['kitchen', '🌱'], ['designer', '🙌']],
		welcomeBooks: [['writer', '📚'], ['newbie', '❤️'], ['main', '👏']],
		welcomeNewbie: [['mod', '🙌'], ['books', '❤️'], ['kitchen', '👍']],
	};
	for (const [noteKey, entries] of Object.entries(interactions)) {
		const note = notes[noteKey];
		if (!note) continue;
		for (const [key, reaction] of entries) {
			if (!a[key] || a[key].id === note.userId) continue;
			await act('频道帖子点赞', () => api('notes/likes/create', { noteId: note.id }, a[key].token));
			await act('频道帖子回应', () => api('notes/reactions/create', { noteId: note.id, reaction }, a[key].token));
		}
	}

	const existingPins = Object.fromEntries(channelRows.map(row => [row.name, row.pinnedNoteIds ?? []]));
	const pins = {
		'城市散步': [notes.cityWeekend?.id],
		'前端手记': existingPins['前端手记'],
		'视觉与排版': [notes.designGuide?.id],
		'书影音客厅': [notes.readingClub?.id],
		'手作与器物': [notes.craftOpenDay?.id],
		'厨房小事': [notes.kitchenMenu?.id],
		'新朋友请进': [notes.welcomeMod?.id],
	};
	const owners = {
		'城市散步': 'main', '前端手记': 'dev', '视觉与排版': 'designer', '书影音客厅': 'writer',
		'手作与器物': 'seller', '厨房小事': 'kitchen', '新朋友请进': 'mod',
	};
	for (const [name, noteIds] of Object.entries(pins)) {
		const target = channel[name];
		const owner = a[owners[name]];
		const ids = [...new Set(noteIds.filter(Boolean))];
		if (!target || !owner || ids.length === 0) continue;
		await step(`置顶频道内容：${name}`, () => api('channels/update', {
			channelId: target.id,
			pinnedNoteIds: ids,
		}, owner.token));
	}
}

const TIMELINE_LIFE_TEXTS = Object.freeze({
	mainCanal: '早上七点沿着中河走，桥边豆浆摊还在摆桌子，修车师傅已经在给第一只轮胎打气。\n拐进一条没走过的小巷，走到头发现是小区铁门，又原路退回来。桂花倒是闻到了。#城市散步 #日常',
	writerDraft: '开头删了三次，最后只留下“她在门口等雨停”。\n原本写了六百多字交代她为什么来，删完以后才觉得人终于站到了门口。今天先这样。#写作',
	devChangelog: '下午终于把那个滚动跳动修了。先怀疑容器高度，又改滚动条样式，最后发现是占位元素晚了一帧出现。\n现在先留最终高度，内容到了再替换。多花了一个小时，但至少没继续乱猜。#前端 #开发记录',
	designerType: '长文正文从 16 调到 17，行高也松了一点。标题没动。\n客户说看起来舒服多了，问是不是换字体。没有，只是原来挤得太厉害。#设计 #排版',
	modQuestion: '想做个很小的周末征集：拍一下你最近一次认真吃饭的桌面，不用摆盘，也不用滤镜。\n我先来：昨晚一碗没吃完的面、摊开的书和忘收的杯子。大家会拍什么？#生活 #周末',
	newbieLecture: '传播学作业让我们去食堂门口做街头采访。站了半小时，只问了三个人，其中一个还是同学。\n回听录音才发现自己一直在抢话。下次先把嘴闭上，可能比多准备十个问题有用。#校园 #采访',
	sellerGlaze: '这次开窑，一只小杯的釉在杯口停成浅浅的月牙。\n原本想留着自己用，来取货的客人看到后说正好。那就让给她，我再做一只，不知道能不能烧回来。#手作 #陶瓷',
	buyerChair: '把客厅那把总堆衣服的椅子挪到窗边，衣架放回卧室。\n坚持了四天，椅子还是空的。不是因为突然自律，是每天回家少走了两步，衣服就顺手挂回柜门了。#生活',
	travelNight: '凌晨四点的站台只有卖豆浆的小车亮着灯。广播响了两遍，车还没来。\n那天没安排景点，只想到车上看看天亮。结果上车十分钟就睡着了。#旅行 #摄影',
	kitchenSoup: '苏州降温，煮了锅姜丝鸡毛菜汤，白胡椒放多了，喝得鼻尖冒汗。\n还是喝完了。小时候放学回家，桌上也有这样一只盖着盖子的碗，味道倒记不清。#厨房 #家常菜',
	booksTicket: '整理旧书掉出一张公交车票，背面写着“看到第 83 页”。\n书完全想不起来，倒是记得那天下雨，车窗上全是雾。票根比书更能记事，挺奇怪的。#阅读',
	privateFog: '雨停以后从公交站走回家，路灯把积水照得一块一块。\n最近在整理夜班公交的照片，先留一张，明早还要上班。',
	mainHome: '明早九点去运河边拍开门前的店铺，下午回来整采访提纲。\n这条只留在首页，成稿以后再发。',
	writerPoll: '天气一凉，周末更想怎么过？',
	designerCw: '凌晨三点醒着，听见楼下冰箱启动、远处一辆车经过，还有自己翻身时床单的声音。\n第二天看这些句子挺无聊，但昨晚只能靠写它们耗到困。',
	devChannelQuestion: '长列表大家会提前加载，还是到底再加载？\n我这两天来回改了三次。提前加载顺，但网慢时拉一堆；到底加载省请求，又容易看到空白。想听真实项目里怎么选。#前端 #交互',
	booksChannelRec: '这周翻到一本很薄的随笔，写菜市场、旧楼和公交站，几乎不总结道理。\n看到一半才发现作者和我住过同一片街区，但写的是十年前，很多店已经没有了。准备周末写篇短的。#阅读 #书店',
	newbieReply: '我会拍今天中午在图书馆台阶上吃的便当，盒盖边上压了一片银杏叶。',
	booksReply: '我可能会拍书店晚班桌面：一杯凉掉的茶、登记本，还有刚拆一半的纸箱。',
	mainReply: '银杏叶这个不错。不用等桌面很好看，拍下当时在吃什么就够了。',
	travelQuote: '删掉背景以后，人反而出来了。拍照也常这样，先走近一点，再看要不要交代环境。',
});

async function seedTimelineLife(a, db, redis) {
	const channelNames = ['城市散步', '前端手记', '书影音客厅'];
	const channelIds = Object.fromEntries((await db.query(
		'select id, name from channel where name = any($1::varchar[])',
		[channelNames],
	)).rows.map(row => [row.name, row.id]));

	const media = {};
	for (const [key, owner, name, url, colors] of [
		['canal', 'main', 'canal-morning.jpg', unsplash('photo-1519501025264-65ba15a82390', 1280, 960), ['#0f766e', '#d97706']],
		['layout', 'designer', 'longform-layout.jpg', unsplash('photo-1513364776144-60967b0f800f', 1280, 960), ['#9d174d', '#f59e0b']],
		['campus', 'newbie', 'campus-interview.jpg', unsplash('photo-1523240795612-9a054b0db644', 1280, 960), ['#4d7c0f', '#d97706']],
		['kiln', 'seller', 'kiln-cup.jpg', unsplash('photo-1610701596007-11502861dcfa', 1280, 960), ['#92400e', '#e7e5e4']],
		['platform', 'travel', 'night-platform.jpg', unsplash('photo-1474487548417-781cb71495f3', 1280, 960), ['#0f172a', '#0369a1']],
		['soup', 'kitchen', 'ginger-soup.jpg', unsplash('photo-1547592180-85f173990554', 1280, 960), ['#b45309', '#166534']],
		['ticket', 'books', 'book-ticket.jpg', unsplash('photo-1512820790803-83ca734da794', 1280, 960), ['#7c2d12', '#1e3a8a']],
		['night-bus', 'private', 'late-night-bus.jpg', unsplash('photo-1519608487953-e999c86e7455', 1280, 960), ['#334155', '#4c1d95']],
	]) {
		media[key] = await step(`时间线配图 ${key}`, () => uploadAsset(
			a[owner].token,
			`timeline:${key}`,
			name,
			url,
			colors,
		));
	}
	const fileId = key => media[key]?.id;
	const notes = {};

	notes.mainCanal = await post(a, 'main', {
		text: TIMELINE_LIFE_TEXTS.mainCanal,
		fileIds: [fileId('canal')].filter(Boolean),
		channelId: channelIds['城市散步'],
	});
	notes.writerDraft = await post(a, 'writer', {
		text: TIMELINE_LIFE_TEXTS.writerDraft,
	});
	notes.devChangelog = await post(a, 'dev', {
		text: TIMELINE_LIFE_TEXTS.devChangelog,
	});
	notes.designerType = await post(a, 'designer', {
		text: TIMELINE_LIFE_TEXTS.designerType,
		fileIds: [fileId('layout')].filter(Boolean),
	});
	notes.modQuestion = await post(a, 'mod', {
		text: TIMELINE_LIFE_TEXTS.modQuestion,
	});
	notes.newbieLecture = await post(a, 'newbie', {
		text: TIMELINE_LIFE_TEXTS.newbieLecture,
		fileIds: [fileId('campus')].filter(Boolean),
	});
	notes.sellerGlaze = await post(a, 'seller', {
		text: TIMELINE_LIFE_TEXTS.sellerGlaze,
		fileIds: [fileId('kiln')].filter(Boolean),
	});
	notes.buyerChair = await post(a, 'buyer', {
		text: TIMELINE_LIFE_TEXTS.buyerChair,
	});
	notes.travelNight = await post(a, 'travel', {
		text: TIMELINE_LIFE_TEXTS.travelNight,
		fileIds: [fileId('platform')].filter(Boolean),
	});
	notes.kitchenSoup = await post(a, 'kitchen', {
		text: TIMELINE_LIFE_TEXTS.kitchenSoup,
		fileIds: [fileId('soup')].filter(Boolean),
	});
	notes.booksTicket = await post(a, 'books', {
		text: TIMELINE_LIFE_TEXTS.booksTicket,
		fileIds: [fileId('ticket')].filter(Boolean),
	});
	notes.privateFog = await post(a, 'private', {
		text: TIMELINE_LIFE_TEXTS.privateFog,
		fileIds: [fileId('night-bus')].filter(Boolean),
		visibility: 'followers',
	});
	notes.mainHome = await post(a, 'main', {
		text: TIMELINE_LIFE_TEXTS.mainHome,
		visibility: 'home',
	});
	notes.writerPoll = await post(a, 'writer', {
		text: TIMELINE_LIFE_TEXTS.writerPoll,
		poll: {
			choices: ['一个人去散步', '和朋友吃饭聊天', '在家读点东西', '把拖了很久的小事做完'],
			multiple: false,
			expiredAfter: 8 * 86400000,
		},
	});
	notes.designerCw = await post(a, 'designer', {
		cw: '一段关于失眠的记录',
		text: TIMELINE_LIFE_TEXTS.designerCw,
	});
	notes.devChannelQuestion = await post(a, 'dev', {
		text: TIMELINE_LIFE_TEXTS.devChannelQuestion,
		channelId: channelIds['前端手记'],
	});
	notes.booksChannelRec = await post(a, 'books', {
		text: TIMELINE_LIFE_TEXTS.booksChannelRec,
		channelId: channelIds['书影音客厅'],
	});

	if (notes.modQuestion) {
		notes.newbieReply = await post(a, 'newbie', {
			replyId: notes.modQuestion.id,
			text: TIMELINE_LIFE_TEXTS.newbieReply,
		});
		notes.booksReply = await post(a, 'books', {
			replyId: notes.modQuestion.id,
			text: TIMELINE_LIFE_TEXTS.booksReply,
		});
		if (notes.newbieReply) {
			notes.mainReply = await post(a, 'main', {
				replyId: notes.newbieReply.id,
				text: TIMELINE_LIFE_TEXTS.mainReply,
			});
		}
	}
	if (notes.writerDraft) {
		notes.travelQuote = await post(a, 'travel', {
			renoteId: notes.writerDraft.id,
			text: TIMELINE_LIFE_TEXTS.travelQuote,
		});
	}
	if (notes.buyerChair) notes.sellerRenote = await post(a, 'seller', { renoteId: notes.buyerChair.id });
	if (notes.mainCanal) notes.kitchenRenote = await post(a, 'kitchen', { renoteId: notes.mainCanal.id });
	if (notes.newbieLecture) notes.booksRenote = await post(a, 'books', { renoteId: notes.newbieLecture.id });

	if (notes.writerPoll) {
		for (const [key, choice] of [
			['main', 0], ['dev', 3], ['books', 2], ['travel', 0], ['kitchen', 2], ['newbie', 1], ['buyer', 1],
		]) {
			await act('周末安排投票', () => api('notes/polls/vote', {
				noteId: notes.writerPoll.id,
				choice,
			}, a[key].token));
		}
	}

	const interactions = {
		mainCanal: [['writer', '🌿'], ['designer', '📷'], ['travel', '🚶'], ['newbie', '🌼'], ['books', '☕']],
		writerDraft: [['main', '✍️'], ['dev', '💡'], ['mod', '📝'], ['books', '❤️'], ['kitchen', '👏']],
		devChangelog: [['main', '💡'], ['designer', '🛠️'], ['writer', '👍'], ['mod', '🧭']],
		designerType: [['main', '📐'], ['dev', '👀'], ['writer', '❤️'], ['buyer', '✨'], ['books', '👏']],
		modQuestion: [['main', '🍜'], ['writer', '❤️'], ['newbie', '🌼'], ['books', '☕'], ['travel', '📷'], ['kitchen', '🙌']],
		newbieLecture: [['main', '🎙️'], ['designer', '📷'], ['travel', '❤️'], ['books', '👏']],
		sellerGlaze: [['buyer', '🏺'], ['designer', '✨'], ['main', '❤️'], ['kitchen', '👏']],
		buyerChair: [['main', '🪑'], ['kitchen', '❤️'], ['seller', '✨'], ['books', '👍']],
		travelNight: [['main', '🌄'], ['writer', '🚆'], ['newbie', '📷'], ['designer', '❤️'], ['books', '☕']],
		kitchenSoup: [['main', '🍲'], ['writer', '❤️'], ['buyer', '🥣'], ['seller', '👏'], ['newbie', '😋']],
		booksTicket: [['main', '🚌'], ['writer', '📚'], ['travel', '❤️'], ['kitchen', '☕'], ['newbie', '✨']],
		writerPoll: [['main', '🙋'], ['dev', '📚'], ['books', '❤️'], ['travel', '🌙']],
		designerCw: [['main', '🌃'], ['dev', '❤️'], ['writer', '🌙'], ['newbie', '👀']],
		devChannelQuestion: [['main', '💡'], ['designer', '🙌'], ['mod', '🧭'], ['newbie', '👀'], ['writer', '👍']],
		booksChannelRec: [['main', '📚'], ['writer', '❤️'], ['kitchen', '☕'], ['newbie', '👏']],
		privateFog: [['main', '🌧️']],
	};
	for (const [noteKey, entries] of Object.entries(interactions)) {
		const note = notes[noteKey];
		if (!note) continue;
		for (const [key, reaction] of entries) {
			if (!a[key] || a[key].id === note.userId) continue;
			await act('时间线帖子点赞', () => api('notes/likes/create', { noteId: note.id }, a[key].token));
			await act('时间线帖子回应', () => api('notes/reactions/create', {
				noteId: note.id,
				reaction,
			}, a[key].token));
		}
	}

	for (const [key, noteKey] of [
		['main', 'writerDraft'], ['writer', 'mainCanal'], ['dev', 'designerType'],
		['designer', 'newbieLecture'], ['books', 'travelNight'], ['travel', 'booksTicket'],
		['buyer', 'sellerGlaze'], ['kitchen', 'modQuestion'],
	]) {
		if (notes[noteKey]) {
			await act('收藏时间线帖子', () => api('notes/favorites/create', {
				noteId: notes[noteKey].id,
			}, a[key].token));
		}
	}

	if (notes.mainCanal) notes.mainCanal.channelId = channelIds['城市散步'] ?? notes.mainCanal.channelId;
	if (notes.devChannelQuestion) notes.devChannelQuestion.channelId = channelIds['前端手记'] ?? notes.devChannelQuestion.channelId;
	if (notes.booksChannelRec) notes.booksChannelRec.channelId = channelIds['书影音客厅'] ?? notes.booksChannelRec.channelId;
	await step('补充首页精选排序', () => ensureFeaturedEntries(redis, Object.values(notes)));
}

// 页面是由文本、章节、图片、嵌入帖子等内容块拼成的独立网页，和只有一个 Markdown 正文的文章不同。
async function seedPages(a, db) {
	const cover = await step('页面封面', () => uploadAsset(
		a.designer.token, 'page:portfolio-cover', 'portfolio-cover.jpg',
		unsplash('photo-1545235617-9465d2a55698', 1200, 630), ['#be185d', '#312e81'],
	));
	const work = await step('作品图', () => uploadAsset(
		a.designer.token, 'page:portfolio-work', 'portfolio-work.jpg',
		unsplash('photo-1513364776144-60967b0f800f', 1200, 800), ['#9d174d', '#f59e0b'],
	));
	const readingCover = await step('共读页面封面', () => uploadAsset(
		a.writer.token, 'page:reading-cover', 'reading-club-cover.jpg',
		unsplash('photo-1524995997946-a1c2e315a42f', 1200, 630), ['#7c2d12', '#1e3a8a'],
	));
	const studioCover = await step('工作室页面封面', () => uploadAsset(
		a.seller.token, 'page:studio-cover', 'studio-open-day-cover.jpg',
		unsplash('photo-1452860606245-08befc0ff44b', 1200, 630), ['#92400e', '#d6d3d1'],
	));
	const note = (await db.query('select id from note where "userId" = $1 and "replyId" is null and "renoteId" is null and visibility = $2 order by id limit 1', [a.designer.id, 'public'])).rows[0];
	const sellerNote = (await db.query('select id from note where "userId" = $1 and "replyId" is null and "renoteId" is null and visibility = $2 order by id limit 1', [a.seller.id, 'public'])).rows[0];
	const id = (name) => requestId(`page-block:${name}`).slice(0, 8);
	const portfolio = await step('作品集页面', () => api('pages/create', {
		title: '阿梨的作品与日常', name: 'ali-portfolio', summary: '界面、插画和一些正在发生的小项目。', variables: [], script: '', alignCenter: true, hideTitleWhenPinned: false, font: 'sans-serif', eyeCatchingImageId: cover?.id ?? null,
		content: [
			{ id: id('intro'), type: 'text', text: '你好，我是阿梨，做品牌与界面设计。这里收集最近完成的项目，也放一些没进入成品阶段的草稿。' },
			{ id: id('works'), type: 'section', title: '近期作品', children: [
				{ id: id('work-text'), type: 'text', text: '**一周色彩记录**：为秋天的日常做的一组低饱和配色。' },
				...(work ? [{ id: id('work-image'), type: 'image', fileId: work.id }] : []),
			] },
			...(note ? [{ id: id('note'), type: 'section', title: '最近的想法', children: [{ id: id('note-embed'), type: 'note', detailed: false, note: note.id }] }] : []),
			{ id: id('contact'), type: 'section', title: '联系我', children: [{ id: id('contact-text'), type: 'text', text: '品牌和界面项目可以先私信说明方向、时间与预算，我通常两天内回复。' }] },
		],
	}, a.designer.token));
	const event = await step('活动页面', () => api('pages/create', {
		title: '十一月共读 · 报名说明', name: 'november-reading-club', summary: '这个月一起读《看不见的城市》，线上讨论，不要求读完才能来。', variables: [], script: '', alignCenter: false, hideTitleWhenPinned: false, font: 'serif', eyeCatchingImageId: readingCover?.id ?? null,
		content: [
			{ id: id('club-intro'), type: 'text', text: '本月共读《看不见的城市》。它不是一本必须从头读到尾的书，可以每天翻两三章。' },
			{ id: id('club-time'), type: 'section', title: '时间与形式', children: [{ id: id('club-time-text'), type: 'text', text: '11 月 8 日和 11 月 22 日晚上八点，在“书影音客厅”相关群聊里线上讨论，每次约一小时。' }] },
			{ id: id('club-join'), type: 'section', title: '怎么参加', children: [{ id: id('club-join-text'), type: 'text', text: '在 @shenyan_writes 的共读帖子下留言“报名”，并写一句你最近读到的城市。' }] },
		],
	}, a.writer.token));
	const studio = await step('工作室开放日页面', () => api('pages/create', {
		title: '木木陶瓷工作室开放日', name: 'mumu-studio-open-day', summary: '开窑、看坯和一只杯子的制作过程。', variables: [], script: '', alignCenter: false, hideTitleWhenPinned: false, font: 'sans-serif', eyeCatchingImageId: studioCover?.id ?? null,
		content: [
			{ id: id('studio-intro'), type: 'text', text: '每月的第一个周六下午，工作室会开放两个小时。可以看修坯、摸不同的泥，也可以问关于釉色的问题。' },
			{ id: id('studio-note'), type: 'section', title: '最近开窑', children: sellerNote ? [{ id: id('studio-note-embed'), type: 'note', detailed: false, note: sellerNote.id }] : [{ id: id('studio-note-text'), type: 'text', text: '最近一批白瓷杯已经出窑。' }] },
			{ id: id('studio-visit'), type: 'section', title: '来访说明', children: [{ id: id('studio-visit-text'), type: 'text', text: '工作室不大，每场最多六人。请提前私信 @mumu_studio 预约，不需要费用，也不要带宠物。' }] },
		],
	}, a.seller.token));
	for (const page of [portfolio, event, studio]) {
		if (!page) continue;
		for (const key of ['main', 'writer', 'dev', 'newbie', 'buyer']) {
			if (a[key].id === page.userId) continue;
			await act('页面点赞', () => api('pages/like', { pageId: page.id }, a[key].token));
		}
	}
}

async function seedPlays(a) {
	const plays = [
		['designer', '今天用什么颜色', '从今天的配色练习里抽一个主色。', 'public', String.raw`/// @ 1.2.1
let colors = ["雾蓝", "灰绿", "砖红", "姜黄", "墨黑", "米白"]
Ui:render([
	Ui:C:container({
		align: 'center'
		children: [
			Ui:C:mfm({ text: "先选一个颜色，再想它适合什么内容。" })
			Ui:C:button({
				text: "抽一个颜色"
				primary: true
				onClick: @() {
					Mk:dialog("今天的颜色", colors[Math:rnd(0, 5)])
				}
			})
		]
	})
])`],
		['mod', '周末安排抽签', '选择困难的时候，把周末交给随机。', 'public', String.raw`/// @ 1.2.1
let plans = ["去公园散步", "逛菜市场", "在家看一部老电影", "找家没去过的书店", "睡到自然醒"]
Ui:render([
	Ui:C:button({
		text: "帮我决定"
		onClick: @() {
			Mk:dialog("周末安排", plans[Math:rnd(0, 4)])
		}
	})
])`],
		['main', '今天走哪条路', '给没有计划的下午抽一条散步方向。', 'public', String.raw`/// @ 1.2.1
let walks = ["沿河走到第一座桥", "去菜市场买一束花", "找一条没走过的小巷", "坐两站公交再走回来", "去旧书店待到天黑"]
Ui:render([
	Ui:C:container({
		align: 'center'
		children: [
			Ui:C:mfm({ text: "先出门，路线可以边走边改。" })
			Ui:C:button({
				text: "抽一条"
				primary: true
				onClick: @() {
					Mk:dialog("今天的路线", walks[Math:rnd(0, 4)])
				}
			})
		]
	})
])`],
		['dev', '今天先修哪个小问题', '积压的小问题太多时，先挑一件能收尾的。', 'public', String.raw`/// @ 1.2.1
let tasks = ["补一条错误提示", "删掉过期开关", "给旧页面加空状态", "把一条注释写清楚", "处理一个很小的移动端溢出"]
Ui:render([
	Ui:C:container({
		align: 'center'
		children: [
			Ui:C:mfm({ text: "先做二十分钟能结束的事。" })
			Ui:C:button({
				text: "挑一件"
				onClick: @() {
					Mk:dialog("下午先做", tasks[Math:rnd(0, 4)])
				}
			})
		]
	})
])`],
		['writer', '给开头换一个天气', '写不下去时，用一个天气重新进入场景。', 'public', String.raw`/// @ 1.2.1
let weather = ["刚下过雨", "风把招牌吹响", "太阳还没出来", "有一点雾", "空气里有桂花味", "天正在慢慢变蓝"]
Ui:render([
	Ui:C:container({
		align: 'center'
		children: [
			Ui:C:mfm({ text: "不要解释天气，先让一个人走进来。" })
			Ui:C:button({
				text: "换一个天气"
				primary: true
				onClick: @() {
					Mk:dialog("这一段的天气", weather[Math:rnd(0, 5)])
				}
			})
		]
	})
])`],
		['seller', '下一只杯子做什么', '从今天的泥和心情里挑一个器型。', 'public', String.raw`/// @ 1.2.1
let forms = ["杯口微收的茶杯", "带把手的小马克杯", "很浅的酱碟", "一人用的小碗", "可以插一枝花的高杯"]
Ui:render([
	Ui:C:container({
		align: 'center'
		children: [
			Ui:C:mfm({ text: "先想它会被怎样拿在手里。" })
			Ui:C:button({
				text: "抽一个器型"
				onClick: @() {
					Mk:dialog("下一只", forms[Math:rnd(0, 4)])
				}
			})
		]
	})
])`],
		['newbie', '采访先问哪一句', '面对陌生采访对象时，抽一个不那么生硬的开场。', 'public', String.raw`/// @ 1.2.1
let questions = ["你今天是几点到的？", "这条路你走了多少年？", "早上最忙的时候在做什么？", "最近有没有哪件小事让你印象很深？", "如果第一次来的人只做一件事，你推荐什么？"]
Ui:render([
	Ui:C:container({
		align: 'center'
		children: [
			Ui:C:mfm({ text: "先从眼前具体的事问起。" })
			Ui:C:button({
				text: "抽一个问题"
				primary: true
				onClick: @() {
					Mk:dialog("第一句可以问", questions[Math:rnd(0, 4)])
				}
			})
		]
	})
])`],
		['private', '今晚的拍摄清单', '给自己留一份不公开的夜拍检查表。', 'private', String.raw`/// @ 1.2.1
let checks = ["备用电池", "镜头布", "公交末班时间", "一张能垫着坐的纸", "雨停后积水的位置"]
Ui:render([
	Ui:C:container({
		align: 'center'
		children: [
			Ui:C:mfm({ text: "今晚不赶路，只拍完想拍的三张。" })
			Ui:C:button({
				text: "检查一件"
				onClick: @() {
					Mk:dialog("出门前", checks[Math:rnd(0, 4)])
				}
			})
		]
	})
])`],
		['admin', '今晚先处理哪条反馈', '把积压的社区问题变成一件今天能收尾的小事。', 'public', String.raw`/// @ 1.2.1
let issues = ["补清文章草稿恢复的说明", "检查移动端目录溢出", "回复一条图片上传反馈", "整理本周频道举报记录", "把新朋友指南的入口往前挪"]
Ui:render([
	Ui:C:container({
		align: 'center'
		children: [
			Ui:C:mfm({ text: "先挑一件影响正常发布或交流的事。" })
			Ui:C:button({
				text: "挑一件"
				primary: true
				onClick: @() {
					Mk:dialog("今晚先做", issues[Math:rnd(0, 4)])
				}
			})
		]
	})
])`],
	];
	for (const [key, title, summary, visibility, body] of plays) {
		const play = await step(`互动应用 ${title}`, () => api('flash/create', { title, summary, permissions: [], visibility, script: body }, a[key].token));
		if (play && visibility === 'public') {
			const likers = ['main', 'writer', 'dev', 'designer', 'newbie', 'books'].filter(liker => liker !== key).slice(0, 4);
			for (const liker of likers) {
				await act('互动应用点赞', () => api('flash/like', { flashId: play.id }, a[liker].token));
			}
		}
	}
}

async function seedMoreGallery(a) {
	const travelFiles = [];
	for (const [key, name, url, colors] of [
		['travel-c1', 'southwest-morning.jpg', unsplash('photo-1501785888041-af3ef285b470', 1200, 900), ['#0369a1', '#065f46']],
		['travel-c2', 'southwest-train.jpg', unsplash('photo-1470770841072-f978cf4d019e', 1200, 900), ['#475569', '#0f766e']],
		['travel-c3', 'southwest-street.jpg', unsplash('photo-1519608487953-e999c86e7455', 1200, 900), ['#1e3a8a', '#b45309']],
	]) {
		const file = await step('旅行照片', () => uploadAsset(a.travel.token, `gallery:${key}`, name, url, colors));
		if (file) travelFiles.push(file.id);
	}
	if (travelFiles.length) {
		await step('旅行图集', () => api('gallery/posts/create', {
			title: '西南慢车 · 窗外', description: '车窗、站台和没下去的小站。胶片和手机混着拍，颜色没统一，也懒得再调。', fileIds: travelFiles,
		}, a.travel.token));
	}

	const kitchenFiles = [];
	for (const [key, name, url, colors] of [
		['kitchen-g1', 'breakfast-table.jpg', unsplash('photo-1533777324565-a040eb52facd', 1080, 1350), ['#b45309', '#fde68a']],
		['kitchen-g2', 'noodle-bowl.jpg', unsplash('photo-1504674900247-0877df9cc836', 1080, 1350), ['#7c2d12', '#166534']],
		['kitchen-g3', 'weekend-bread.jpg', unsplash('photo-1509440159596-0249088772ff', 1080, 1350), ['#92400e', '#e7e5e4']],
	]) {
		const file = await step('早餐照片', () => uploadAsset(a.kitchen.token, `gallery:${key}`, name, url, colors));
		if (file) kitchenFiles.push(file.id);
	}
	if (kitchenFiles.length) {
		const gallery = await step('早餐图集', () => api('gallery/posts/create', {
			title: '这周的三顿早餐', description: '三顿实际吃掉的早餐。第二张桌子没擦，第三张面包烤过头了。', fileIds: kitchenFiles,
		}, a.kitchen.token));
		if (gallery) for (const key of ['main', 'writer', 'buyer']) {
			await act('图集点赞（需 Redis 7+）', () => api('gallery/posts/like', { postId: gallery.id }, a[key].token));
		}
	}

	const campusFiles = [];
	for (const [key, name, url, colors] of [
		['campus-g1', 'campus-wutong.jpg', unsplash('photo-1516321318423-f06f85e504b3', 1080, 1350), ['#4d7c0f', '#d97706']],
		['campus-g2', 'campus-library-window.jpg', unsplash('photo-1521587760476-6c12a4b040da', 1080, 1350), ['#b45309', '#e7e5e4']],
		['campus-g3', 'campus-evening-track.jpg', unsplash('photo-1503676260728-1c00da094a0b', 1080, 1350), ['#0f766e', '#d97706']],
	]) {
		const file = await step('校园图集照片', () => uploadAsset(a.newbie.token, `gallery:${key}`, name, url, colors));
		if (file) campusFiles.push(file.id);
	}
	if (campusFiles.length) {
		const gallery = await step('校园秋天图集', () => api('gallery/posts/create', {
			title: '下课以后，校园慢慢安静下来', description: '梧桐叶、图书馆窗边和操场最后一点天光。借来的相机还不太熟，有几张虚焦。', fileIds: campusFiles,
		}, a.newbie.token));
		if (gallery) for (const key of ['main', 'travel', 'designer', 'books']) {
			await act('图集点赞（需 Redis 7+）', () => api('gallery/posts/like', { postId: gallery.id }, a[key].token));
		}
	}

	const bookstoreFiles = [];
	for (const [key, name, url, colors] of [
		['bookstore-g1', 'bookstore-counter.jpg', unsplash('photo-1524995997946-a1c2e315a42f', 1080, 1350), ['#7c2d12', '#1e3a8a']],
		['bookstore-g2', 'bookstore-shelf.jpg', unsplash('photo-1507842217343-583bb7270b66', 1080, 1350), ['#92400e', '#e7e5e4']],
		['bookstore-g3', 'bookstore-closed.jpg', unsplash('photo-1521587760476-6c12a4b040da', 1080, 1350), ['#334155', '#b45309']],
	]) {
		const file = await step('书店图集照片', () => uploadAsset(a.books.token, `gallery:${key}`, name, url, colors));
		if (file) bookstoreFiles.push(file.id);
	}
	if (bookstoreFiles.length) {
		const gallery = await step('书店一周图集', () => api('gallery/posts/create', {
			title: '关灯前的书店', description: '值晚班最后半小时随手拍的。手机画质一般，第二张还拍到了同事的拖把。', fileIds: bookstoreFiles,
		}, a.books.token));
		if (gallery) for (const key of ['writer', 'kitchen', 'newbie', 'main']) {
			await act('图集点赞（需 Redis 7+）', () => api('gallery/posts/like', { postId: gallery.id }, a[key].token));
		}
	}
}

async function seedExtras(a) {
	await step('文章云端草稿', () => api('articles/drafts/save', {
		draftId: 'city-walk-notes-draft', expectedRevision: 0, title: '城市散步时，我会带什么',
		summary: '一篇还在整理的随身物品清单。', text: '## 出发前\n\n带一双舒服的鞋。\n\n## 路上\n\n水、纸巾、一支笔，还有一台不急着拍的相机。\n',
		name: 'city-walk-kit', articleCategoryId: 'thoughts', articleTags: ['生活', '城市'], articleId: null, coverId: null,
	}, a.writer.token));
	await step('邀请码', () => api('admin/invite/create', { count: 3, expiresAt: null }, a.admin.token));
	const routeApp = await step('创建路线助手', () => api('app/create', {
		name: '城市散步路线助手',
		description: '整理收藏过的散步路线，并在周六出门前提醒集合时间和天气。',
		permission: ['read:account', 'write:notes', 'write:notifications'],
		callbackUrl: null,
	}, a.main.token));
	let routeAccessToken = null;
	if (routeApp) {
		const authorization = await step('发起路线助手授权', () => api('auth/session/generate', {
			appSecret: routeApp.secret,
		}));
		if (authorization) {
			await step('确认路线助手授权', () => api('auth/accept', {
				token: authorization.token,
			}, a.main.token));
			const userkey = await step('签发路线助手访问令牌', () => api('auth/session/userkey', {
				appSecret: routeApp.secret,
				token: authorization.token,
			}));
			routeAccessToken = userkey?.accessToken ?? null;
		}
	}
	if (routeAccessToken) {
		await step('路线助手天气提醒', () => api('notifications/create', {
			header: LIFECYCLE_APP_HEADER,
			body: LIFECYCLE_APP_BODY,
		}, routeAccessToken));
	}
	const clip = await step('公开便签', () => api('clips/create', {
		name: '新朋友可以先看这些', description: '社区介绍、发帖方式和几个常去的频道。', isPublic: true,
	}, a.mod.token));
	if (clip) for (const key of ['main', 'newbie', 'books']) {
		await act('收藏便签', () => api('clips/favorite', { clipId: clip.id }, a[key].token));
	}
	for (const [key, achievements] of [
		['main', ['profileFilled', 'tutorialCompleted', 'viewInstanceChart', 'iLoveMisskey']],
		['writer', ['profileFilled', 'iLoveMisskey']],
		['dev', ['profileFilled', 'tutorialCompleted', 'viewInstanceChart']],
	]) {
		for (const name of achievements) {
			await act(`成就 ${name}`, () => api('i/claim-achievement', { name }, a[key].token));
		}
	}
	for (const [key, saveData] of [
		['main', { gameVersion: 2, cookies: 188420, totalCookies: 912480, totalHandmadeCookies: 420, clicked: 3860, achievements: [], facilities: [] }],
		['newbie', { gameVersion: 2, cookies: 52300, totalCookies: 186000, totalHandmadeCookies: 86, clicked: 940, achievements: [], facilities: [] }],
	]) {
		await step(`点击游戏存档 ${key}`, () => api('i/registry/set', {
			key: 'saveData', scope: ['clickerGame'], value: saveData,
		}, a[key].token));
	}
}

const LIFECYCLE_POLL_TEXT = '周六如果下雨，散步活动怎么改？';
const LIFECYCLE_SCHEDULED_TEXT = '采访提纲整理完了，明天把路线和集合信息补到共读页面。#写作';
const LIFECYCLE_FAILED_TEXT = '周六改走博物馆线，集合前会再确认一次天气。';
const LIFECYCLE_APP_HEADER = '周六散步提醒';
const LIFECYCLE_APP_BODY = '明天上午有小雨，集合地点改到地铁站 A 口。记得带伞，路线缩短到 6 公里。';
const SIGNIN_DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const SIGNIN_IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

function unpackNotificationRows(rows) {
	return rows.flatMap(row => {
		try {
			return [JSON.parse(row[1][1])];
		} catch {
			return [];
		}
	});
}

async function waitForNotifications(redis, specs, timeout = 30000) {
	const userIds = [...new Set(specs.map(spec => spec.userId))];
	let notificationsByUser = new Map();

	await waitUntil(async () => {
		notificationsByUser = new Map(await Promise.all(userIds.map(async userId => {
			const rows = await redis.xrevrange(`${redisKeyPrefix}notificationTimeline:${userId}`, '+', '-', 'COUNT', 200);
			return [userId, unpackNotificationRows(rows)];
		})));

		return specs.every(spec => notificationsByUser.get(spec.userId)?.some(notification => {
			return notification.type === spec.type && (spec.predicate?.(notification) ?? true);
		}));
	}, timeout, '异步通知未在预期时间内全部生成', 250);

	return notificationsByUser;
}

async function seedLifecycle(a, db, redis) {
	const startedAt = Date.now();
	const pollExpiresAt = startedAt + 10000;
	const scheduledAt = startedAt + 15000;
	const failedScheduledAt = startedAt + 16000;

	await step('导出个人帖子', () => api('i/export-notes', {}, a.books.token));

	const pollNote = await post(a, 'newbie', {
		text: LIFECYCLE_POLL_TEXT,
		poll: {
			choices: ['改去博物馆看展', '沿河走有廊檐的一段', '顺延到周日早上'],
			multiple: false,
			expiresAt: pollExpiresAt,
		},
	});
	if (pollNote) {
		for (const [key, choice] of [['main', 0], ['writer', 1], ['books', 2]]) {
			await act('雨天路线投票', () => api('notes/polls/vote', {
				noteId: pollNote.id,
				choice,
			}, a[key].token));
		}
	}

	const scheduledDraft = await step('定时发布采访整理', () => api('notes/drafts/create', {
		text: LIFECYCLE_SCHEDULED_TEXT,
		visibility: 'public',
		scheduledAt,
		isActuallyScheduled: true,
	}, a.writer.token));

	const scheduledAttachment = await step('定时帖附件', () => uploadAsset(
		a.main.token,
		'lifecycle:scheduled-failure',
		'rainy-route-map.jpg',
		unsplash('photo-1524661135-423995f22d0b', 1280, 960),
		['#334155', '#0f766e'],
	));
	let failedScheduledDraft = null;
	if (scheduledAttachment) {
		failedScheduledDraft = await step('创建待撤销定时帖子', () => api('notes/drafts/create', {
			text: LIFECYCLE_FAILED_TEXT,
			fileIds: [scheduledAttachment.id],
			visibility: 'public',
			scheduledAt: failedScheduledAt,
			isActuallyScheduled: true,
		}, a.main.token));
		// 用户临时删除了还没发布的配图，定时任务应在到点时给出失败提醒。
		await step('删除已排程图片', () => api('drive/files/delete', {
			fileId: scheduledAttachment.id,
		}, a.main.token));
	}

	await step('新设备登录', async () => {
		const existingSignins = (await db.query(
			'select count(*)::int as count from signin where "userId" = $1 and success = true',
			[a.writer.id],
		)).rows[0].count;
		if (existingSignins !== 0) throw new Error(`登录样本账号已有 ${existingSignins} 条成功记录，无法稳定验证新设备提醒`);

		await signinFlow(a.writer.username, SIGNIN_DESKTOP_UA);
		await waitUntil(async () => {
			const count = (await db.query(
				'select count(*)::int as count from signin where "userId" = $1 and success = true',
				[a.writer.id],
			)).rows[0].count;
			return count === 1;
		}, 5000, '桌面端登录记录写入超时');

		// 登录接口对同一 IP 限制每秒一次，同时等待上一条历史记录完整落库。
		await sleep(1200);
		await signinFlow(a.writer.username, SIGNIN_IPHONE_UA);
		await waitUntil(async () => {
			const count = (await db.query(
				'select count(*)::int as count from signin where "userId" = $1 and success = true',
				[a.writer.id],
			)).rows[0].count;
			return count === 2;
		}, 5000, '手机端登录记录写入超时');
	});

	await step('创建离线散步令牌', () => api('miauth/gen-token', {
		session: 'saturday-walk-offline-notes',
		name: '周六散步备忘',
		description: '把本周路线和集合信息保存在手机上，出门后也能查看。',
		iconUrl: null,
		permission: ['read:account', 'read:notes'],
	}, a.main.token));

	const editingRoom = (await db.query('select id from chat_room where name = $1 order by id desc limit 1', ['城市观察编辑会'])).rows[0];
	if (editingRoom) {
		const existingMember = (await db.query(
			'select 1 from chat_room_membership where "roomId" = $1 and "userId" = $2',
			[editingRoom.id, a.books.id],
		)).rows.length > 0;
		if (!existingMember) {
			const invitation = await step('邀请可可加入编辑会', () => api('chat/rooms/invitations/create', {
				roomId: editingRoom.id,
				userId: a.books.id,
			}, a.travel.token));
			if (invitation) {
				await step('可可接受编辑会邀请', () => api('chat/rooms/join', {
					roomId: editingRoom.id,
				}, a.books.token));
			}
		}
		const joined = (await db.query(
			'select 1 from chat_room_membership where "roomId" = $1 and "userId" = $2',
			[editingRoom.id, a.books.id],
		)).rows.length > 0;
		if (joined) {
			await step('移出临时协作者', () => api('chat/rooms/members/delete', {
				roomId: editingRoom.id,
				userId: a.books.id,
			}, a.travel.token));
		}
	}

	await step('等待异步通知', () => waitForNotifications(redis, [
		{
			userId: a.main.id,
			type: 'app',
			predicate: notification => notification.customHeader === LIFECYCLE_APP_HEADER && notification.customBody === LIFECYCLE_APP_BODY,
		},
		{
			userId: a.main.id,
			type: 'scheduledNotePostFailed',
			predicate: notification => failedScheduledDraft?.createdDraft?.id != null && notification.noteDraftId === failedScheduledDraft.createdDraft.id,
		},
		{ userId: a.main.id, type: 'createToken' },
		{
			userId: a.writer.id,
			type: 'scheduledNotePosted',
			predicate: notification => Date.parse(notification.createdAt) >= startedAt,
		},
		{
			userId: a.writer.id,
			type: 'login',
			predicate: notification => notification.newDevice === true && notification.userAgent === SIGNIN_IPHONE_UA,
		},
		{
			userId: a.books.id,
			type: 'exportCompleted',
			predicate: notification => notification.exportedEntity === 'note',
		},
		{
			userId: a.books.id,
			type: 'chatRoomMemberRemoved',
			predicate: notification => notification.roomId === editingRoom?.id && notification.roomName === '城市观察编辑会',
		},
		{ userId: a.newbie.id, type: 'pollEnded', predicate: notification => notification.noteId === pollNote?.id },
		{ userId: a.main.id, type: 'pollEnded', predicate: notification => notification.noteId === pollNote?.id },
		{ userId: a.writer.id, type: 'pollEnded', predicate: notification => notification.noteId === pollNote?.id },
		{ userId: a.books.id, type: 'pollEnded', predicate: notification => notification.noteId === pollNote?.id },
	]));

	if (scheduledDraft?.createdDraft?.id == null) throw new Error('定时成功样本草稿未创建');
	if (failedScheduledDraft?.createdDraft?.id == null) throw new Error('定时失败样本草稿未创建');
}

async function seedIntegrationData(a, db) {
	await step('钱包设置', () => api('admin/wallet/update-settings', {
		exchangeEnabled: false,
		exchangeRate: 1,
	}, a.admin.token));

	let communityWebhook = (await db.query(
		'select id from webhook where "userId" = $1 and name = $2 order by id desc limit 1',
		[a.writer.id, COMMUNITY_WEBHOOK_NAME],
	)).rows[0];
	if (!communityWebhook) {
		communityWebhook = await step('社区内容 Webhook', () => api('i/webhooks/create', {
			name: COMMUNITY_WEBHOOK_NAME,
			url: COMMUNITY_WEBHOOK_URL,
			secret: '',
			on: ['note', 'reply', 'mention'],
		}, a.writer.token));
	}
	if (communityWebhook) {
		await step('停用社区内容 Webhook', () => api('i/webhooks/update', {
			webhookId: communityWebhook.id,
			active: false,
		}, a.writer.token));
	}

	let moderationWebhook = (await db.query(
		'select id, "isActive" from system_webhook where name = $1 order by id desc limit 1',
		[MODERATION_WEBHOOK_NAME],
	)).rows[0];
	if (!moderationWebhook) {
		moderationWebhook = await step('社区治理系统 Webhook', () => api('admin/system-webhook/create', {
			isActive: false,
			name: MODERATION_WEBHOOK_NAME,
			on: ['abuseReport', 'abuseReportResolved', 'userCreated', 'inactiveModeratorsWarning'],
			url: MODERATION_WEBHOOK_URL,
			secret: '',
		}, a.admin.token));
	} else if (moderationWebhook.isActive) {
		moderationWebhook = await step('停用社区治理系统 Webhook', () => api('admin/system-webhook/update', {
			id: moderationWebhook.id,
			isActive: false,
			name: MODERATION_WEBHOOK_NAME,
			on: ['abuseReport', 'abuseReportResolved', 'userCreated', 'inactiveModeratorsWarning'],
			url: MODERATION_WEBHOOK_URL,
			secret: '',
		}, a.admin.token));
	}

	if (moderationWebhook) {
		const recipient = (await db.query(
			'select id from abuse_report_notification_recipient where name = $1 and method = $2 order by id desc limit 1',
			[MODERATION_RECIPIENT_NAME, 'webhook'],
		)).rows[0];
		if (!recipient) {
			await step('举报事件接收配置', () => api('admin/abuse-report/notification-recipient/create', {
				isActive: false,
				name: MODERATION_RECIPIENT_NAME,
				method: 'webhook',
				systemWebhookId: moderationWebhook.id,
			}, a.admin.token));
		}
	}

	const noteRows = (await db.query(`
		select id, text, "fileIds", "channelId"
		from note
		where text = any($1::varchar[]) and "deletedBy" is null
	`, [[TIMELINE_LIFE_TEXTS.mainCanal, TIMELINE_LIFE_TEXTS.designerType]] )).rows;
	const canalNote = noteRows.find(note => note.text === TIMELINE_LIFE_TEXTS.mainCanal);
	const designNote = noteRows.find(note => note.text === TIMELINE_LIFE_TEXTS.designerType);
	const frontendChannel = (await db.query('select id from channel where name = $1 limit 1', ['前端手记'])).rows[0];

	const createDraftIfMissing = async (label, account, text, params = {}) => {
		const existing = (await db.query(
			'select id from note_draft where "userId" = $1 and text = $2 order by id desc limit 1',
			[account.id, text],
		)).rows[0];
		if (existing) {
			stats.skipped++;
			return existing;
		}
		return await step(label, async () => {
			const result = await api('notes/drafts/create', { text, ...params }, account.token);
			return result.createdDraft;
		});
	};

	await createDraftIfMissing(
		'路线核对草稿',
		a.main,
		'周六可能从拱宸桥走到小河直街，路上有两家店想进去看看。先记路线，晚点核一下桥西那边的施工围挡。',
		{
			visibility: 'public',
			cw: '路线还没核对，别提前转发。',
			hashtag: '城市散步',
			fileIds: canalNote?.fileIds ?? [],
		},
	);
	await createDraftIfMissing(
		'照片配文回复草稿',
		a.writer,
		'“拐进一条没走过的小巷”这一句很好。走到铁门再退回来，也是散步的一部分，不必每次都抵达什么。',
		{
			visibility: 'public',
			replyId: canalNote?.id ?? null,
		},
	);
	await createDraftIfMissing(
		'引用照片草稿',
		a.designer,
		'很喜欢“小区铁门”这个结尾。照片里的入口也可以只留一半，不把整条巷子交代完，读者会自己补上后面的路。',
		{
			visibility: 'public',
			renoteId: canalNote?.id ?? null,
		},
	);
	await createDraftIfMissing(
		'街访问题投票草稿',
		a.newbie,
		'第一次去菜市场做街访，下面哪类问题最容易让对方愿意多聊两句？',
		{
			visibility: 'public',
			poll: {
				choices: ['今天几点开始忙', '在这里摆摊多久了', '最近哪件小事最难忘', '收摊以后会去哪里'],
				multiple: false,
				expiresAt: Date.now() + 3 * 86400000,
			},
		},
	);
	if (frontendChannel) {
		await createDraftIfMissing(
			'前端夜校整理草稿',
			a.dev,
			'这周前端夜校先整理成三条：占位元素什么时候出现、容器高度怎么量、什么时候不该继续改滚动条样式。',
			{
				visibility: 'public',
				channelId: frontendChannel.id,
				hashtag: '前端',
			},
		);
	}
	await createDraftIfMissing(
		'反馈补充私密草稿',
		a.main,
		'图片上传的两条反馈我都补了复现步骤：一条是 GIF 超过 8MB，另一条是相册里选原图后没有反应。明天一起看。',
		{
			visibility: 'specified',
			visibleUserIds: [a.mod.id],
		},
	);

	const designerArticle = (await db.query(
		'select id, name, title from page where "userId" = $1 and name = $2 limit 1',
		[a.designer.id, 'color-and-tone'],
	)).rows[0];
	const saveArticleDraftIfMissing = async (draftId, account, data) => {
		const existing = (await db.query(
			'select "draftId", revision, data from article_draft where "userId" = $1 and "draftId" = $2',
			[account.id, draftId],
		)).rows[0];
		if (existing) {
			stats.skipped++;
			return existing;
		}
		return await step(`文章草稿 ${draftId}`, () => api('articles/drafts/save', {
			draftId,
			expectedRevision: 0,
			...data,
		}, account.token));
	};

	if (designerArticle) {
		await saveArticleDraftIfMissing('color-and-tone-revision', a.designer, {
			title: designerArticle.title,
			summary: '把原来的配色经验改成一次改版复盘，补上灰度测试和最后没有采用的方案。',
			text: '## 先把颜色关掉\n\n这次改版先看灰度截图，确认标题、正文和按钮的轻重。颜色留到最后。\n\n## 没有采用的方案\n\n试过把强调色再提高一档，列表看起来更醒目，但用户停留时间长的正文区会变得很吵。最后退回去了。\n',
			name: designerArticle.name,
			articleCategoryId: 'resources',
			articleTags: ['设计', '排版'],
			articleId: designerArticle.id,
			coverId: designNote?.fileIds?.[0] ?? null,
		});
	}
	await saveArticleDraftIfMissing('campus-interview-notes', a.newbie, {
		title: '第一次去菜市场采访，我准备先学会不抢话',
		summary: '把课堂作业里的采访提纲改得更像日常聊天，也记录第一次被摊主拒绝后的调整。',
		text: '## 出发前\n\n问题不要一次问完。先从对方手上的事问起，再看要不要追问。\n\n## 现场\n\n被拒绝也正常。先说清楚用途，再留一张写着联系方式的纸。\n',
		name: 'campus-interview-notes',
		articleCategoryId: 'thoughts',
		articleTags: ['生活', '随笔'],
		articleId: null,
		coverId: null,
	});
	const discardedDraft = await saveArticleDraftIfMissing('weekend-kitchen-plan', a.kitchen, {
		title: '周末想试的三道菜',
		summary: '写到一半发现步骤太像菜单，先留着改。',
		text: '## 周六\n\n先买菜，再决定要不要炖汤。\n',
		name: 'weekend-kitchen-plan',
		articleCategoryId: 'thoughts',
		articleTags: ['厨房', '生活'],
		articleId: null,
		coverId: null,
	});
	if (discardedDraft?.revision != null) {
		await step('删除文章草稿版本', () => api('articles/drafts/delete', {
			draftId: 'weekend-kitchen-plan',
			expectedRevision: discardedDraft.revision,
		}, a.kitchen.token));
	}
}

let bubbleGameModulePromise;

async function loadBubbleGameModule() {
	if (bubbleGameModulePromise) return bubbleGameModulePromise;
	bubbleGameModulePromise = (async () => {
		const bubbleRequire = createRequire(resolve(root, 'packages/misskey-bubble-game/package.json'));
		const esbuild = bubbleRequire('esbuild');
		const result = esbuild.buildSync({
			entryPoints: [resolve(root, 'packages/misskey-bubble-game/src/index.ts')],
			bundle: true,
			platform: 'node',
			format: 'esm',
			write: false,
			sourcemap: false,
			logLevel: 'silent',
		});
		const code = result.outputFiles?.[0]?.text;
		if (!code) throw new Error('合成游戏模块构建结果为空');

		// esbuild 打包为临时 ESM，避免直接加载浏览器端构建产物时的 CommonJS 互操作问题。
		const directory = mkdtempSync(join(tmpdir(), 'misskey-community-seed-'));
		const modulePath = join(directory, 'bubble-game.mjs');
		try {
			writeFileSync(modulePath, code);
			return await import(pathToFileURL(modulePath).href);
		} finally {
			rmSync(modulePath, { force: true });
			rmdirSync(directory);
		}
	})();
	return bubbleGameModulePromise;
}

async function simulateBubbleGame(mode, seed, laneOffset) {
	const { DropAndFusionGame } = await loadBubbleGameModule();
	const game = new DropAndFusionGame({ seed, gameMode: mode, getMonoRenderOptions: () => ({}) });
	const lanes = [
		[112, 225, 338, 169, 281],
		[150, 300, 220, 350, 120],
		[200, 100, 340, 260, 170],
		[270, 130, 350, 180, 90],
		[95, 320, 205, 345, 250],
	][laneOffset % 5];
	let score = 0;
	let ended = false;
	let drops = 0;
	game.on('changeScore', value => {
		score = value;
	});

	try {
		game.start();
		for (let frame = 0; frame < 30_000; frame++) {
			if (game.frame % 60 === 0 && drops < 180) {
				if (drops > 0 && drops % 19 === 0) game.hold();
				game.drop(lanes[drops % lanes.length] + ((laneOffset % 3) - 1) * 8);
				drops++;
			}
			if (!game.tick()) {
				ended = true;
				break;
			}
		}
		if (!ended) game.surrender();
		return {
			score,
			logs: DropAndFusionGame.serializeLogs(game.getLogs()),
			frame: game.frame,
			drops,
		};
	} finally {
		game.dispose();
	}
}

async function seedAdCreatives(a, db) {
	const pages = (await db.query(
		'select id, name from page where name = any($1::varchar[])',
		[['reread-invisible-cities', 'weekday-breakfast']],
	)).rows;
	const pagesByName = new Map(pages.map(page => [page.name, page]));
	const walkRoom = (await db.query(
		'select id from chat_room where name = $1 order by id desc limit 1',
		['周末散步小组'],
	)).rows[0];
	const now = Date.now();
	const specs = [
		{
			memo: '周末手作市集：陶瓷、织物与私人书单',
			file: 'weekend-handmade-market.png',
			url: `${baseUrl}/shop`,
			ratio: 3,
			colors: ['#d97706', '#0f766e'],
		},
		{
			memo: '十一月社区共读：《看不见的城市》',
			file: 'november-reading-club.png',
			url: pagesByName.get('reread-invisible-cities') ? `${baseUrl}/articles/${pagesByName.get('reread-invisible-cities').id}` : `${baseUrl}/pages`,
			ratio: 2,
			colors: ['#173f3a', '#cf594f'],
		},
		{
			memo: '周六城市散步：8 公里，不赶路',
			file: 'saturday-city-walk.png',
			url: walkRoom ? `${baseUrl}/chat/room/${walkRoom.id}` : `${baseUrl}/chat/groups`,
			ratio: 2,
			colors: ['#8fd6df', '#4e9577'],
		},
		{
			memo: '十分钟早餐研究所：坐下来吃完，再出门',
			file: 'weekday-breakfast.png',
			url: pagesByName.get('weekday-breakfast') ? `${baseUrl}/articles/${pagesByName.get('weekday-breakfast').id}` : `${baseUrl}/pages`,
			ratio: 1,
			colors: ['#f7d379', '#ee5b39'],
		},
	];

	for (const spec of specs) {
		const image = await step(`广告素材 ${spec.file}`, () => uploadAsset(
			a.admin.token,
			`ad:${spec.file}`,
			spec.file,
			adAsset(spec.file),
			spec.colors,
		));
		if (!image) continue;

		const existing = (await db.query(
			'select id from ad where memo = $1 order by id desc limit 1',
			[spec.memo],
		)).rows[0];
		const payload = {
			url: spec.url,
			memo: spec.memo,
			place: 'horizontal',
			priority: 'middle',
			ratio: spec.ratio,
			startsAt: now,
			expiresAt: now + 45 * 86400000,
			imageUrl: image.url,
			dayOfWeek: 0,
			isSensitive: false,
		};
		if (existing) {
			await step(`更新广告 ${spec.memo}`, () => api('admin/ad/update', {
				id: existing.id,
				...payload,
			}, a.admin.token));
		} else {
			await step(`创建广告 ${spec.memo}`, () => api('admin/ad/create', payload, a.admin.token));
		}
	}

	const legacyAdFiles = (await db.query(DRIVE_REFERENCE_QUERY, [[a.admin.id]])).rows
		.filter(file => file.name === 'community-market-ad.jpg' && file.references === 0);
	for (const file of legacyAdFiles) {
		await step('清理旧广告图片', () => api('drive/files/delete', {
			fileId: file.id,
		}, a.admin.token));
	}
}

async function seedProfileExtras(a, db) {
	// 头像框必须是带透明区域的环形图片，使用已导入的素材，不自行生成。
	const decorations = (await db.query('select id from avatar_decoration order by category = $1 desc, name limit 3', ['光环'])).rows;
	for (const [index, key] of ['main', 'writer', 'designer'].entries()) {
		if (decorations[index]) await step(`佩戴头像框 ${key}`, () => api('i/update', { avatarDecorations: [{ id: decorations[index].id }] }, a[key].token));
	}

	const portfolio = (await db.query('select id from page where "userId" = $1 and name = $2', [a.designer.id, 'ali-portfolio'])).rows[0];
	if (portfolio) await step('置顶页面', () => api('i/update', { pinnedPageId: portfolio.id }, a.designer.token));
	const list = (await db.query('select id from user_list where "userId" = $1 order by id desc limit 1', [a.main.id])).rows[0];
	if (list) {
		await step('公开用户列表', () => api('users/lists/update', { listId: list.id, isPublic: true }, a.main.token));
		await act('收藏用户列表', () => api('users/lists/favorite', { listId: list.id }, a.buyer.token));
	}

	// 使用项目自身的游戏引擎模拟完整对局，注册的分数和回放日志来自同一局操作。
	const gameRecords = [
		['normal', 'main'], ['normal', 'dev'], ['normal', 'newbie'], ['normal', 'admin'],
		['square', 'designer'], ['square', 'kitchen'], ['square', 'mod'],
		['yen', 'seller'], ['yen', 'buyer'], ['yen', 'travel'],
		['sweets', 'books'], ['sweets', 'writer'], ['sweets', 'private'],
	];
	const gameStartedAt = Date.now();
	for (const [recordIndex, [gameMode, key]] of gameRecords.entries()) {
		const seed = String(gameStartedAt - recordIndex * 45_000);
		const result = await simulateBubbleGame(gameMode, seed, recordIndex);
		await step(`合成游戏成绩 ${gameMode} / ${key}`, () => api('bubble-game/register', {
			score: result.score,
			seed,
			logs: result.logs,
			gameMode,
			gameVersion: 3,
		}, a[key].token));
		await step(`合成游戏最高分 ${gameMode} / ${key}`, () => api('i/registry/set', {
			scope: ['dropAndFusionGame'],
			key: `highScore:${gameMode}`,
			value: result.score,
		}, a[key].token));
		if (gameMode === 'yen') {
			await step(`合成游戏累计金额 ${key}`, () => api('i/registry/set', {
				scope: ['dropAndFusionGame'],
				key: 'yenTotal',
				value: result.score,
			}, a[key].token));
		}
		console.log(`  - ${key} ${gameMode}：${result.drops} 次落子，${result.score} 分，${result.logs.length} 条操作记录`);
	}
}

async function seedSocialBoundaries(a) {
	// 保留一条经历合作分歧后建立的拉黑关系，用于验证双方内容、互动和提醒的隐藏规则。
	await act('晚星拉黑安然', () => api('blocking/create', {
		userId: a.travel.id,
	}, a.private.token));
}

function ensureSeed(condition, message) {
	if (!condition) throw new Error(message);
}

async function verifySeedData(a, db, redis) {
	console.log('• 数据自检');
	const accountIds = [...Object.values(a).map(account => account.id)];
	const communityAccountIds = communityKeys.map(key => a[key]?.id).filter(Boolean);

	await step('自检：账号与密码', async () => {
		const rows = (await db.query(`
			select u.id, u.username, u.name, u."isBot", u."avatarId", avatar.name as "avatarName", p.password
			from "user" u
			left join drive_file avatar on avatar.id = u."avatarId"
			left join user_profile p on p."userId" = u.id
			where u.id = any($1::varchar[])
		`, [communityAccountIds])).rows;
		ensureSeed(rows.length === communityAccountIds.length, `账号数量不一致：${rows.length}/${communityAccountIds.length}`);
		ensureSeed(rows.every(row => row.isBot === false), '种子账号中存在机器人账号');
		ensureSeed(rows.every(row => row.name && row.name !== row.username), '种子账号缺少自然显示名');
		ensureSeed(rows.every(row => row.avatarId && row.avatarName === `${row.username}-avatar.jpg`), '种子账号头像关联异常');
		const placeholderUsers = rows
			.filter(row => /^(?:66666666|123456|demo_|test|bot)/i.test(row.username) || /(?:^|_)(?:test|bot)(?:_|$)/i.test(row.username))
			.map(row => row.username);
		ensureSeed(placeholderUsers.length === 0, `种子账号仍含占位用户名：${placeholderUsers.join('、')}`);
		const invalid = rows.filter(row => !row.password || !bcrypt.compareSync(PASSWORD, row.password));
		ensureSeed(invalid.length === 0, `密码校验失败：${invalid.map(row => row.username).join('、')}`);
	});

	await step('自检：真实内容与计数', async () => {
		const counts = (await db.query(`
			select
				(select count(*) from note where "userId" = any($1::varchar[]) and "deletedBy" is null)::int as notes,
				(select count(*) from note where "userId" = any($1::varchar[]) and "replyId" is not null and "deletedBy" is null)::int as replies,
				(select count(*) from note where "userId" = any($1::varchar[]) and "renoteId" is not null and "deletedBy" is null)::int as renotes,
				(select count(*) from poll poll_row join note poll_note on poll_note.id = poll_row."noteId"
					where poll_note."userId" = any($1::varchar[]) and poll_note."deletedBy" is null)::int as polls,
				(select count(*) from page)::int as pages,
				(select count(*) from page where "articleCategoryId" is not null)::int as articles,
				(select count(*) from article_comment)::int as article_comments,
				(select count(*) from article_comment where "replyId" is not null)::int as nested_article_comments,
				(select count(*) from product)::int as products,
				(select count(*) from "order")::int as orders,
				(select count(*) from chat_message)::int as chat_messages,
				(select count(*) from chat_message where "editedAt" is not null)::int as edited_chat_messages,
				(select count(*) from red_packet where "userId" = any($1::varchar[]))::int as red_packets,
				(select count(*) from gallery_post)::int as gallery_posts,
				(select count(*) from flash)::int as flash_posts,
				(select count(*) from bubble_game_record)::int as bubble_games
		`, [communityAccountIds])).rows[0];
		ensureSeed(counts.notes === 171, `种子账号帖子数量异常：${counts.notes}`);
		ensureSeed(counts.replies === 46, `种子账号楼中楼数量异常：${counts.replies}`);
		ensureSeed(counts.renotes === 16, `引用和转发数量异常：${counts.renotes}`);
		ensureSeed(counts.polls === 18, `投票数量异常：${counts.polls}`);
		ensureSeed(counts.pages === 13, `独立页面与文章总数异常：${counts.pages}`);
		ensureSeed(counts.articles === 10, `文章数量异常：${counts.articles}`);
		ensureSeed(counts.article_comments === 85, `文章评论数量异常：${counts.article_comments}`);
		ensureSeed(counts.nested_article_comments === 33, `文章楼中楼数量异常：${counts.nested_article_comments}`);
		ensureSeed(counts.products === 17, `商品数量异常：${counts.products}`);
		ensureSeed(counts.orders === 30, `订单数量异常：${counts.orders}`);
		ensureSeed(counts.chat_messages >= 100, `聊天消息不足：${counts.chat_messages}`);
		ensureSeed(counts.edited_chat_messages >= 3, '缺少聊天消息编辑记录');
		ensureSeed(counts.red_packets === 7, `红包数量异常：${counts.red_packets}`);
		ensureSeed(counts.gallery_posts === 7, `图集数量异常：${counts.gallery_posts}`);
		ensureSeed(counts.flash_posts === 12, `互动应用数量异常：${counts.flash_posts}`);
		ensureSeed(counts.bubble_games === 13, `合成游戏记录异常：${counts.bubble_games}`);

		const articleComments = (await db.query(`
			select
				count(*) filter (where c."isDeleted")::int as deleted,
				count(*) filter (where c."replyId" is not null and parent.id is null)::int as orphan_replies,
				count(*) filter (where c."replyId" is not null and parent."articleId" <> c."articleId")::int as cross_article_replies
			from article_comment c
			left join article_comment parent on parent.id = c."replyId"
		`)).rows[0];
		ensureSeed(articleComments.deleted === 1, `文章评论删除样本异常：${articleComments.deleted}`);
		ensureSeed(articleComments.orphan_replies === 0, '存在找不到父评论的楼中楼');
		ensureSeed(articleComments.cross_article_replies === 0, '存在跨文章的楼中楼回复');
	});

	await step('自检：首页与时间线内容', async () => {
		const texts = Object.values(TIMELINE_LIFE_TEXTS);
		const notes = (await db.query(`
			select
				n.id, n."userId", n.text, n.visibility, n.cw, n."replyId", n."renoteId", n."channelId",
				cardinality(n."fileIds")::int as files,
				(select count(*) from note_like l where l."noteId" = n.id)::int as likes,
				coalesce((select sum(value::int) from jsonb_each_text(n.reactions)), 0)::int as reactions
			from note n
			where n."deletedBy" is null and n.text = any($1::varchar[])
		`, [texts])).rows;
		ensureSeed(notes.length === texts.length, `时间线内容数量异常：${notes.length}/${texts.length}`);
		ensureSeed(new Set(notes.map(note => note.userId)).size === 12, '时间线内容作者数量不足');

		const publicPosts = notes.filter(note => note.visibility === 'public' && note.replyId == null && note.renoteId == null);
		ensureSeed(publicPosts.length === 15, `首页公开内容数量异常：${publicPosts.length}`);
		ensureSeed(publicPosts.every(note => note.likes >= 4 && note.reactions >= 4), '首页内容缺少足够的点赞或回应');
		ensureSeed(notes.filter(note => note.visibility === 'home').length === 1, '缺少首页可见帖子');
		ensureSeed(notes.filter(note => note.visibility === 'followers').length === 1, '缺少关注者可见帖子');
		ensureSeed(notes.filter(note => note.replyId != null).length === 3, '时间线楼中楼数量异常');
		ensureSeed(notes.filter(note => note.renoteId != null).length === 1, '时间线引用数量异常');
		ensureSeed(notes.filter(note => note.channelId != null).length === 3, '时间线频道帖子数量异常');
		ensureSeed(notes.filter(note => note.files > 0).length === 8, '时间线图片帖子数量异常');
		ensureSeed(notes.filter(note => note.cw === '一段关于失眠的记录').length === 1, '缺少时间线内容警告样本');

		const poll = (await db.query(`
			select 1
			from poll p
			join note n on n.id = p."noteId"
			where n.text = $1 and n."deletedBy" is null
			limit 1
		`, [TIMELINE_LIFE_TEXTS.writerPoll])).rows[0];
		ensureSeed(poll != null, '缺少时间线投票');

		const local = await api('notes/local-timeline', { limit: 100, withRenotes: true }, null);
		ensureSeed(local.length === 100, `本地时间线首屏不足：${local.length}`);
		const localTexts = new Set(local.map(note => note.text));
		for (const text of [
			TIMELINE_LIFE_TEXTS.mainCanal,
			TIMELINE_LIFE_TEXTS.writerDraft,
			TIMELINE_LIFE_TEXTS.modQuestion,
			TIMELINE_LIFE_TEXTS.travelNight,
		]) {
			ensureSeed(localTexts.has(text), '本地时间线首屏缺少新增内容');
		}
		const older = await api('notes/local-timeline', {
			limit: 100,
			withRenotes: true,
			untilId: local.at(-1).id,
		}, null);
		ensureSeed(older.length > 0, '本地时间线无法继续向前翻页');

		const homeTimeline = await api('notes/timeline', { limit: 100 }, a.main.token);
		ensureSeed(homeTimeline.length === 100, `关注时间线首屏不足：${homeTimeline.length}`);
		const homeTexts = new Set(homeTimeline.map(note => note.text));
		ensureSeed(homeTexts.has(TIMELINE_LIFE_TEXTS.writerDraft), '关注时间线缺少关注对象的新内容');
		ensureSeed(homeTexts.has(TIMELINE_LIFE_TEXTS.privateFog), '关注时间线缺少关注者可见内容');
		ensureSeed(homeTexts.has(TIMELINE_LIFE_TEXTS.mainHome), '关注时间线缺少本人首页可见内容');

		const globalWindow = featuredWindow(FEATURED_GLOBAL_WINDOW);
		const scores = await Promise.all(publicPosts.map(note => redis.zscore(
			`${redisKeyPrefix}featuredGlobalNotesRanking:${globalWindow}`,
			note.id,
		)));
		ensureSeed(scores.every(score => score != null), '首页精选排序没有覆盖新增内容');
	});

	await step('自检：聊天结构与可见状态', async () => {
		const chat = (await db.query(`
			select
				(select count(*) from chat_room)::int as rooms,
				(select count(*) from chat_room_membership)::int as memberships,
				(select count(*) from chat_message)::int as messages,
				(select count(*) from chat_message where "toRoomId" is not null)::int as room_messages,
				(select count(*) from chat_message where "toUserId" is not null)::int as direct_messages,
				(select count(*) from chat_message where "editedAt" is not null)::int as edited_messages,
				(select count(*) from chat_message where "redPacketId" is not null)::int as packet_messages,
				(select count(*) from chat_message where "toRoomId" is not null and "replyType" = 'quote')::int as quoted_room_messages,
				(select count(*) from chat_message where "toRoomId" is not null and "fileId" is not null)::int as file_room_messages,
				(select count(*) from chat_message where "toRoomId" is not null and cardinality("reactions") > 0)::int as reacted_room_messages
		`)).rows[0];
		ensureSeed(chat.rooms >= 7, `聊天群数量不足：${chat.rooms}`);
		ensureSeed(chat.memberships >= 34, `聊天成员数量不足：${chat.memberships}`);
		ensureSeed(chat.messages >= 100 && chat.room_messages >= 60 && chat.direct_messages >= 41, `聊天消息分布异常：${JSON.stringify(chat)}`);
		ensureSeed(chat.edited_messages >= 3, `聊天编辑样本异常：${chat.edited_messages}`);
		ensureSeed(chat.packet_messages >= 3, `聊天红包消息数量异常：${chat.packet_messages}`);
		ensureSeed(chat.quoted_room_messages >= 3, `群聊引用消息不足：${chat.quoted_room_messages}`);
		ensureSeed(chat.file_room_messages >= 4, `群聊附件消息不足：${chat.file_room_messages}`);
		ensureSeed(chat.reacted_room_messages >= 8, `群聊消息回应不足：${chat.reacted_room_messages}`);

		const roomNames = ['周末散步小组', '城市观察编辑会', '书影音客厅', '前端夜校', '器物与手作交流', '早餐研究所'];
		const rooms = (await db.query(`
			select
				room.name,
				room."joinPolicy",
				room.announcement,
				room.description,
				room."avatarId",
				(select count(*) from chat_room_membership member where member."roomId" = room.id)::int as memberships,
				(select count(*) from chat_room_invitation invite
					where invite."roomId" = room.id and invite."isRequest" = false and invite.ignored = false)::int as active_invitations,
				(select count(*) from chat_room_invitation request
					where request."roomId" = room.id and request."isRequest" = true and request.ignored = false)::int as pending_requests
			from chat_room room
			where room.name = any($1::varchar[])
		`, [roomNames])).rows;
		ensureSeed(rooms.length === roomNames.length, `群聊名称覆盖异常：${rooms.length}/${roomNames.length}`);
		ensureSeed(rooms.every(room => room.joinPolicy && room.announcement.trim() && room.description.trim() && room.avatarId != null), '群聊缺少公告、简介或头像');
		const roomByName = Object.fromEntries(rooms.map(room => [room.name, room]));
		for (const [name, memberships, joinPolicy, activeInvitations, pendingRequests] of [
			['周末散步小组', 6, 'public', 0, 0],
			['城市观察编辑会', 3, 'approval', 1, 1],
			['书影音客厅', 7, 'approval', 1, 0],
			['前端夜校', 5, 'public', 0, 0],
			['器物与手作交流', 4, 'invitation', 0, 0],
			['早餐研究所', 6, 'approval', 0, 0],
		]) {
			const room = roomByName[name];
			ensureSeed(room != null, `缺少群聊：${name}`);
			ensureSeed(room?.memberships === memberships, `群聊「${name}」成员数量异常：${room?.memberships}`);
			ensureSeed(room?.joinPolicy === joinPolicy, `群聊「${name}」入群方式异常：${room?.joinPolicy}`);
			ensureSeed(room?.active_invitations === activeInvitations, `群聊「${name}」邀请状态异常：${room?.active_invitations}`);
			ensureSeed(room?.pending_requests === pendingRequests, `群聊「${name}」申请状态异常：${room?.pending_requests}`);
		}
		const roomAdmins = (await db.query(
			'select count(*)::int as count from chat_room_membership where role = $1',
			['administrator'],
		)).rows[0].count;
		ensureSeed(roomAdmins >= 5, `群聊管理员数量不足：${roomAdmins}`);
		const adminRooms = (await db.query(
			`select count(distinct room.id)::int as count
			from chat_room room
			left join chat_room_membership member on member."roomId" = room.id
			where room."ownerId" = $1 or member."userId" = $1`,
			[a.admin.id],
		)).rows[0].count;
		ensureSeed(adminRooms >= 7, `管理员加入的群聊数量不足：${adminRooms}`);
		const adminOwnedRoom = (await db.query(`
			select
				room.id,
				room."joinPolicy",
				room.announcement,
				room.description,
				room."avatarId",
				(select count(*) from chat_room_membership member where member."roomId" = room.id)::int as memberships,
				(select count(*) from chat_message message where message."toRoomId" = room.id)::int as messages,
				(select role from chat_room_membership member where member."roomId" = room.id and member."userId" = $2 limit 1) as moderator_role
			from chat_room room
			where room."ownerId" = $1 and room.name = $3
			limit 1
		`, [a.admin.id, a.mod.id, '社区共建室'])).rows[0];
		ensureSeed(adminOwnedRoom != null, '管理员没有创建自己的群聊');
		ensureSeed(adminOwnedRoom.joinPolicy === 'approval', '社区共建室入群方式异常');
		ensureSeed(adminOwnedRoom.avatarId != null && adminOwnedRoom.description.trim() && adminOwnedRoom.announcement.trim(), '社区共建室资料不完整');
		ensureSeed(adminOwnedRoom.memberships >= 3 && adminOwnedRoom.messages >= 8, '社区共建室成员或消息不足');
		ensureSeed(adminOwnedRoom.moderator_role === 'administrator', '社区共建室缺少管理员');

		const replyIntegrity = (await db.query(`
			select
				count(*) filter (where message."replyId" is not null and parent.id is null)::int as orphan_replies,
				count(*) filter (where message."replyId" is not null and parent.id is not null and parent."toRoomId" is distinct from message."toRoomId")::int as cross_room_replies
			from chat_message message
			left join chat_message parent on parent.id = message."replyId"
			where message."toRoomId" is not null
		`)).rows[0];
		ensureSeed(replyIntegrity.orphan_replies === 0, '存在找不到父消息的群聊回复');
		ensureSeed(replyIntegrity.cross_room_replies === 0, '存在跨群聊的引用回复');

		const removedMembership = (await db.query(`
			select 1
			from chat_room room
			join chat_room_membership member on member."roomId" = room.id
			where room.name = '城市观察编辑会' and member."userId" = $1
			limit 1
		`, [a.books.id])).rows[0];
		ensureSeed(removedMembership == null, '已移出的临时协作者仍在群成员列表中');
	});

	await step('自检：频道、商品与红包状态', async () => {
		const channels = (await db.query('select name, cardinality("pinnedNoteIds") as pinned from channel')).rows;
		ensureSeed(channels.length === 7, `频道数量异常：${channels.length}`);
		ensureSeed(channels.every(channel => channel.pinned > 0), '存在没有置顶内容的频道');

		const productImages = (await db.query(`
			select
				count(*)::int as products,
				count(*) filter (where p."imageUrl" <> '')::int as with_cover,
				count(*) filter (where p.enabled)::int as enabled,
				count(*) filter (where not p.enabled)::int as disabled,
				count(*) filter (where p."soldCount" <> coalesce((select sum(o.quantity) from "order" o where o."productId" = p.id), 0))::int as sold_mismatch,
				(select count(*) from product_image image where not exists (select 1 from product p2 where p2.id = image."productId"))::int as orphan_images,
				(select count(*) from "order" o where not exists (select 1 from product p3 where p3.id = o."productId"))::int as orphan_orders,
				(select count(*) from product_image)::int as imported_images
			from product p
		`)).rows[0];
		ensureSeed(productImages.products === productImages.with_cover, '存在没有封面的商品');
		ensureSeed(productImages.with_cover === productImages.imported_images, '商品封面与图片记录数量不一致');
		ensureSeed(productImages.enabled === 16 && productImages.disabled === 1, `商品上下架分布异常：${JSON.stringify(productImages)}`);
		ensureSeed(productImages.sold_mismatch === 0, '商品销量与订单数量不一致');
		ensureSeed(productImages.orphan_images === 0 && productImages.orphan_orders === 0, '存在孤立商品图片或订单');

		const redPackets = (await db.query(`
			select
				count(*)::int as total,
				count(*) filter (where status = 'active')::int as active,
				count(*) filter (where status = 'cancelled')::int as cancelled,
				count(*) filter (where status = 'expired')::int as expired,
				count(*) filter (where (select count(*) from red_packet_claim c where c."redPacketId" = p.id) <> p.count - p."remainingCount")::int as claim_count_mismatch,
				count(*) filter (where status = 'active' and abs((select coalesce(sum(c.coins), 0) from red_packet_claim c where c."redPacketId" = p.id) - ("totalCoins" - "remainingCoins")) > 0.001)::int as active_amount_mismatch,
				count(*) filter (where status in ('expired', 'cancelled') and "remainingCoins" <> 0)::int as closed_unrefunded
			from red_packet p
			where p."userId" = any($1::varchar[])
		`, [communityAccountIds])).rows[0];
		ensureSeed(redPackets.total === 7, `红包数量异常：${redPackets.total}`);
		ensureSeed(redPackets.active === 4 && redPackets.cancelled === 1 && redPackets.expired === 2, `红包状态分布异常：${JSON.stringify(redPackets)}`);
		ensureSeed(redPackets.claim_count_mismatch === 0, '红包剩余份数与领取记录不一致');
		ensureSeed(redPackets.active_amount_mismatch === 0, '进行中红包的剩余金额与领取记录不一致');
		ensureSeed(redPackets.closed_unrefunded === 0, '已结束红包仍有未退回金额');

		const expiredSamples = (await db.query(`
			select message, count - "remainingCount" as claims
			from red_packet
			where "userId" = any($1::varchar[])
				and message in ('活动改期，红包留到下回', '雨停啦，先到的人喝茶')
			order by message
		`, [communityAccountIds])).rows;
		ensureSeed(
			expiredSamples.some(sample => sample.message === '活动改期，红包留到下回' && sample.claims === 0) &&
			expiredSamples.some(sample => sample.message === '雨停啦，先到的人喝茶' && sample.claims === 1),
			`过期红包领取场景不完整：${JSON.stringify(expiredSamples)}`,
		);
	});

	await step('自检：广告素材与投放状态', async () => {
		const ads = (await db.query(`
			select
				ad.id,
				ad.memo,
				ad.place,
				ad.ratio,
				ad."dayOfWeek",
				ad."startsAt",
				ad."expiresAt",
				ad."imageUrl",
				file.name as "fileName",
				file.type,
				file.properties->>'width' as width,
				file.properties->>'height' as height
			from ad
			left join drive_file file on file.url = ad."imageUrl"
			where ad.memo = any($1::varchar[])
			order by ad.id
		`, [MANAGED_AD_MEMOS])).rows;
		ensureSeed(ads.length === MANAGED_AD_MEMOS.length, `广告素材数量异常：${ads.length}/${MANAGED_AD_MEMOS.length}`);
		ensureSeed(new Set(ads.map(ad => ad.memo)).size === MANAGED_AD_MEMOS.length, '广告素材存在重复标题');
		ensureSeed(ads.every(ad => ad.place === 'horizontal' && ad.ratio > 0 && ad.dayOfWeek === 0), '广告投放参数异常');
		ensureSeed(ads.every(ad => new Date(ad.startsAt).getTime() <= Date.now() && new Date(ad.expiresAt).getTime() > Date.now()), '广告投放时间异常');
		ensureSeed(ads.every(ad => ad.imageUrl && ad.fileName?.endsWith('.png') && ad.type === 'image/png'), '广告图片记录不完整');
		ensureSeed(ads.every(ad => ad.width === '1200' && ad.height === '250'), '广告素材尺寸不是 1200×250');
		ensureSeed(ads.some(ad => ad.memo === '十一月社区共读：《看不见的城市》'), '缺少共读广告');
		ensureSeed(ads.some(ad => ad.memo === '周六城市散步：8 公里，不赶路'), '缺少散步广告');

		const meta = await api('meta', {});
		const publicAds = new Set(meta.ads.map(ad => ad.id));
		ensureSeed(ads.every(ad => publicAds.has(ad.id)), '有效广告没有进入实例广告列表');
	});

	await step('自检：异步生命周期数据', async () => {
		const poll = (await db.query(`
			select p."expiresAt", count(v.id)::int as votes
			from note n
			join poll p on p."noteId" = n.id
			left join poll_vote v on v."noteId" = n.id
			where n.text = $1 and n."deletedBy" is null
			group by p."expiresAt"
			order by p."expiresAt" desc
			limit 1
		`, [LIFECYCLE_POLL_TEXT])).rows[0];
		ensureSeed(poll != null, '缺少投票生命周期样本');
		ensureSeed(new Date(poll.expiresAt).getTime() < Date.now(), '投票生命周期样本尚未结束');
		ensureSeed(poll.votes === 3, `投票样本票数异常：${poll.votes}`);

		const scheduledNote = (await db.query(
			'select id from note where "userId" = $1 and text = $2 and "deletedBy" is null limit 1',
			[a.writer.id, LIFECYCLE_SCHEDULED_TEXT],
		)).rows[0];
		ensureSeed(scheduledNote != null, '定时帖子未成功发布');

		const failedDraft = (await db.query(
			'select id from note_draft where "userId" = $1 and text = $2 and "isActuallyScheduled" = true limit 1',
			[a.main.id, LIFECYCLE_FAILED_TEXT],
		)).rows[0];
		ensureSeed(failedDraft != null, '缺少定时发布失败草稿');

		const signins = (await db.query(`
			select "headers"->>'user-agent' as "userAgent"
			from signin
			where "userId" = $1 and success = true
			order by id
		`, [a.writer.id])).rows;
		ensureSeed(signins.some(signin => signin.userAgent === SIGNIN_DESKTOP_UA), '缺少桌面端登录历史');
		ensureSeed(signins.some(signin => signin.userAgent === SIGNIN_IPHONE_UA), '缺少手机端登录历史');
	});

	await step('自检：OAuth 应用与访问令牌', async () => {
		const app = (await db.query(`
			select 1
			from app
			where name = $1 and permission @> array['write:notifications']::varchar[]
			limit 1
		`, ['城市散步路线助手'])).rows[0];
		ensureSeed(app != null, '路线助手缺少通知权限');
		const token = (await db.query(
			'select 1 from access_token where "userId" = $1 and name = $2 limit 1',
			[a.main.id, '周六散步备忘'],
		)).rows[0];
		ensureSeed(token != null, '缺少离线散步令牌');
	});

	await step('自检：草稿状态与集成配置', async () => {
		const draftStates = (await db.query(`
			select
				count(*)::int as total,
				count(*) filter (where "replyId" is not null)::int as replies,
				count(*) filter (where "renoteId" is not null)::int as quotes,
				count(*) filter (where "hasPoll")::int as polls,
				count(*) filter (where "channelId" is not null)::int as channels,
				count(*) filter (where visibility = 'specified')::int as specified,
				count(*) filter (where "isActuallyScheduled")::int as scheduled
			from note_draft
			where "userId" = any($1::varchar[])
		`, [communityAccountIds])).rows[0];
		ensureSeed(draftStates.replies >= 1 && draftStates.quotes >= 1 && draftStates.polls >= 1, '帖子草稿缺少回复、引用或投票状态');
		ensureSeed(draftStates.channels >= 1 && draftStates.specified >= 1, '帖子草稿缺少频道或指定可见状态');
		ensureSeed(draftStates.scheduled >= 2, '帖子草稿缺少已排程状态');

		const articleDrafts = (await db.query(`
			select
				count(*) filter (where data is not null)::int as active,
				count(*) filter (where data is null)::int as deleted_versions
			from article_draft
			where "userId" = any($1::varchar[])
		`, [communityAccountIds])).rows[0];
		ensureSeed(articleDrafts.active >= 3, `文章云稿不足：${articleDrafts.active}`);
		ensureSeed(articleDrafts.deleted_versions >= 1, '缺少文章草稿删除版本');

		const walletSettings = (await db.query(
			'select "exchangeEnabled", "exchangeRate" from wallet_settings where id = $1 limit 1',
			['default'],
		)).rows[0];
		ensureSeed(walletSettings?.exchangeEnabled === false && walletSettings.exchangeRate === 1, '钱包设置未初始化');

		const webhook = (await db.query(
			'select "active", "on" from webhook where "userId" = $1 and name = $2 order by id desc limit 1',
			[a.writer.id, COMMUNITY_WEBHOOK_NAME],
		)).rows[0];
		ensureSeed(webhook?.active === false, '社区内容 Webhook 应停用');
		ensureSeed(webhook?.on?.includes('note') && webhook.on.includes('reply') && webhook.on.includes('mention'), '社区内容 Webhook 事件不完整');

		const systemWebhook = (await db.query(
			'select id, "isActive", "on" from system_webhook where name = $1 order by id desc limit 1',
			[MODERATION_WEBHOOK_NAME],
		)).rows[0];
		ensureSeed(systemWebhook?.isActive === false, '社区治理系统 Webhook 应停用');
		ensureSeed(systemWebhook?.on?.includes('abuseReport') && systemWebhook.on.includes('userCreated'), '社区治理系统 Webhook 事件不完整');

		const recipient = (await db.query(
			'select id, "isActive", "systemWebhookId" from abuse_report_notification_recipient where name = $1 and method = $2 order by id desc limit 1',
			[MODERATION_RECIPIENT_NAME, 'webhook'],
		)).rows[0];
		ensureSeed(recipient != null && recipient.isActive === false, '举报事件接收配置异常');
		ensureSeed(systemWebhook != null && recipient.systemWebhookId === systemWebhook.id, '举报接收配置未关联社区治理系统 Webhook');

		const writerDrafts = await api('notes/drafts/list', { limit: 100 }, a.writer.token);
		ensureSeed(writerDrafts.some(draft => draft.replyId != null), '帖子回复草稿未出现在草稿列表');
	});

	await step('自检：重复数据', async () => {
		const duplicateFiles = await findUnreferencedDuplicateDriveFiles(db, accountIds);
		ensureSeed(duplicateFiles.length === 0, `仍有 ${duplicateFiles.length} 个无引用重复网盘文件`);

		const duplicateNotes = (await db.query(`
			select count(*)::int as count
			from (
				select "userId", text
				from note
				where "userId" = any($1::varchar[]) and "deletedBy" is null and coalesce(text, '') <> ''
				group by "userId", text
				having count(*) > 1
			) duplicate
		`, [communityAccountIds])).rows[0].count;
		ensureSeed(duplicateNotes === 0, `存在 ${duplicateNotes} 组同账号重复帖子`);

		const duplicateComments = (await db.query(`
			select count(*)::int as count
			from (
				select "articleId", "userId", text
				from article_comment
				where "userId" = any($1::varchar[])
				group by "articleId", "userId", text
				having count(*) > 1
			) duplicate
		`, [communityAccountIds])).rows[0].count;
		ensureSeed(duplicateComments === 0, `存在 ${duplicateComments} 组同账号重复文章评论`);

		const duplicatePages = (await db.query(`
			select count(*)::int as count
			from (
				select "userId", name
				from page
				where "userId" = any($1::varchar[])
				group by "userId", name
				having count(*) > 1
			) duplicate
		`, [communityAccountIds])).rows[0].count;
		ensureSeed(duplicatePages === 0, `存在 ${duplicatePages} 组同账号重复页面`);

		const duplicateProducts = (await db.query(`
			select count(*)::int as count
			from (
				select "sellerId", name
				from product
				where "sellerId" = any($1::varchar[])
				group by "sellerId", name
				having count(*) > 1
			) duplicate
		`, [communityAccountIds])).rows[0].count;
		ensureSeed(duplicateProducts === 0, `存在 ${duplicateProducts} 组同账号重复商品`);
	});

	await step('自检：通知 API 的类型完整性', async () => {
		const notifications = [];
		for (const account of Object.values(a)) {
			const items = await api('i/notifications', {
				limit: 100,
				markAsRead: false,
			}, account.token);
			notifications.push(...items);
		}
		const types = new Set(notifications.map(notification => notification.type));
		const findNotification = (type, predicate = () => true) => {
			return notifications.find(notification => notification.type === type && predicate(notification));
		};
		const requiredTypes = [
			'achievementEarned', 'app', 'chatRoomInvitationReceived', 'chatRoomMemberRemoved',
			'createToken', 'exportCompleted', 'follow', 'followRequestAccepted', 'login',
			'mention', 'pollEnded', 'quote', 'reaction', 'receiveFollowRequest', 'renote',
			'reply', 'roleAssigned', 'scheduledNotePostFailed', 'scheduledNotePosted', 'system',
		];
		const missing = requiredTypes.filter(type => !types.has(type));
		ensureSeed(missing.length === 0, `通知类型缺失：${missing.join('、')}`);
		ensureSeed(!types.has('test'), '通知流中存在测试通知');

		const app = findNotification('app', notification => notification.header === LIFECYCLE_APP_HEADER);
		ensureSeed(app?.body === LIFECYCLE_APP_BODY, '应用通知内容异常');

		const scheduled = findNotification('scheduledNotePosted', notification => notification.note?.text === LIFECYCLE_SCHEDULED_TEXT);
		ensureSeed(scheduled != null, '定时发布通知未关联正确的帖子');

		const scheduledFailed = findNotification('scheduledNotePostFailed');
		ensureSeed(scheduledFailed != null, '通知 API 未返回定时发布失败提醒');

		const pollEnded = findNotification('pollEnded', notification => notification.note?.text === LIFECYCLE_POLL_TEXT);
		ensureSeed(pollEnded != null, '投票结束通知未关联正确的投票');

		const exported = findNotification('exportCompleted', notification => notification.exportedEntity === 'note');
		ensureSeed(exported?.exportedEntity === 'note' && exported?.fileId != null, '帖子导出通知不完整');

		const removed = findNotification('chatRoomMemberRemoved', notification => notification.roomName === '城市观察编辑会');
		ensureSeed(removed?.roomName === '城市观察编辑会' && removed?.roomId != null, '群成员移出通知的群信息异常');

		const login = findNotification('login', notification => notification.userAgent === SIGNIN_IPHONE_UA);
		ensureSeed(login?.newDevice === true, '登录提醒未标记新设备');
		ensureSeed(login?.ip != null, '登录提醒缺少 IP 地址');

		console.log(`  - 通知 API 已覆盖 ${requiredTypes.length} 种真实类型`);
	});

	await step('自检：无演示与测试标记', async () => {
		const markers = (await db.query(`
			select
				(select count(*) from "user" where id = any($1::varchar[]) and username ~* '(^demo_|test|bot)')::int as users,
				(select count(*) from "user" where "usernameLower" = any($2::varchar[]) and host is null)::int as legacy_users,
				(select count(*) from note where text ~* '(【演示】|demo_|测试账号|测试数据|模板数据|机器人账号)')::int as notes,
				(select count(*) from page where title ~* '(【演示】|demo_|测试账号|测试数据|模板数据|机器人账号)' or coalesce(summary, '') ~* '(【演示】|demo_|测试账号|测试数据|模板数据|机器人账号)')::int as pages,
				(select count(*) from product where name ~* '(【演示】|demo_|测试账号|测试数据|模板数据|机器人账号)' or description ~* '(【演示】|demo_|测试账号|测试数据|模板数据|机器人账号)')::int as products
		`, [accountIds, LEGACY_USERNAMES.map(username => username.toLowerCase())])).rows[0];
		ensureSeed(Object.values(markers).every(count => count === 0), `检测到演示数据：${JSON.stringify(markers)}`);
	});
}

async function main() {
	await api('meta', {}).catch(() => {
		console.error(`无法连接 ${baseUrl}，请先运行 pnpm dev。`);
		process.exit(1);
	});
	const db = await openDatabase();
	const redis = await openRedis();
	try {
		const admin = await prepareAdmin(db);
		const version = await getRegistryValue(db, admin, 'community_version');
		const hasSeedData = await hasManagedSeedData(db, admin);
		if (force || (hasSeedData && version !== SEED_VERSION)) {
			await resetManagedData(db, admin, redis);
		}

		console.log('• 账号');
		const a = await prepareAccounts(db, admin);
		await runSection(a, 'profiles', () => seedProfiles(a));
		await runSection(a, 'follows', () => seedFollows(a));
		await runSection(a, 'adminPresence', () => seedAdminPresence(a));
		await runSection(a, 'instanceSettings', () => seedInstanceSettings(a));
		await runSection(a, 'roles', () => seedRoles(a, db));
		await runSection(a, 'channels', () => seedChannels(a));
		await runSection(a, 'relationships', () => seedRelationships(a, db));
		await runSection(a, 'notes', () => seedNotes(a, db));
		await runSection(a, 'reversi', () => seedReversi(a));
		await runSection(a, 'articles', () => seedArticles(a));
		await runSection(a, 'discovery', () => seedDiscovery(a, db));
		await runSection(a, 'chat', () => seedChat(a, db));
		await runSection(a, 'adminRoom', () => seedAdminRoom(a, db));
		await runSection(a, 'wallet', () => seedWallet(a, db));
		await runSection(a, 'redPackets', () => seedRedPackets(a, db));
		await runSection(a, 'checkin', () => seedCheckin(a));
		await runSection(a, 'shop', () => seedShop(a));
		await runSection(a, 'feedback', () => seedFeedback(a));
		await runSection(a, 'moderation', () => seedModeration(a, db));
		await runSection(a, 'gallery', () => seedGallery(a));
		await runSection(a, 'personal', () => seedPersonal(a));
		await runSection(a, 'privateAccount', () => seedPrivateAccount(a));
		await runSection(a, 'emojis', () => seedEmojis(a, db));
		await runSection(a, 'mediaNotes', () => seedMediaNotes(a, db));
		await runSection(a, 'channelLife', () => seedChannelLife(a, db));
		await runSection(a, 'pages', () => seedPages(a, db));
		await runSection(a, 'plays', () => seedPlays(a));
		await runSection(a, 'moreGallery', () => seedMoreGallery(a));
		await runSection(a, 'extras', () => seedExtras(a));
		await runSection(a, 'lifecycle', () => seedLifecycle(a, db, redis));
		await runSection(a, 'timelineLife', () => seedTimelineLife(a, db, redis));
		await runSection(a, 'integrationData', () => seedIntegrationData(a, db));
		await runSection(a, 'profileExtras', () => seedProfileExtras(a, db));
		await runSection(a, 'adCreatives', () => seedAdCreatives(a, db));
		await runSection(a, 'views', () => seedViews(a, db));
		await runSection(a, 'socialBoundaries', () => seedSocialBoundaries(a));
		await cleanupDuplicateDriveFiles(a, db);
		await verifySeedData(a, db, redis);
		if (stats.failed === 0) {
			await api('i/registry/set', { key: 'community_version', value: SEED_VERSION, scope: MARKER_SCOPE }, admin.token);
		}
		console.log(`\n完成：成功 ${stats.ok}，跳过 ${stats.skipped}，失败 ${stats.failed}`);
		console.log(`社区账号（密码均为 ${PASSWORD}）：${ACCOUNTS.filter(account => a[account.key]).map(account => account.username).join('、')}`);
		if (stats.failed > 0) process.exitCode = 1;
	} finally {
		await redis.quit();
		await db.end();
	}
}

await main();
