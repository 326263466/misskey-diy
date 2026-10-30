/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { get } from 'idb-keyval';
import * as Misskey from 'misskey-js';
import refreshIcon from '@@/icons/refresh.svg';
import { FETCH_TIMEOUT_MS } from '@/const.js';
import type { PushNotificationDataMap } from '@/types.js';
import type { I18n } from '@@/js/i18n.js';
import type { Locale } from 'i18n';
import { createEmptyNotification, createNotification } from '@/scripts/create-notification.js';
import { swLang } from '@/scripts/lang.js';
import * as swos from '@/scripts/operations.js';

async function respondToNavigation(request: Request): Promise<Response> {
	const controller = new AbortController();
	const timeout = globalThis.setTimeout(() => {
		controller.abort('navigation-timeout');
	}, FETCH_TIMEOUT_MS);

	try {
		const response = await fetch(request, { signal: controller.signal });

		if (response?.status && response.status < 500) return response;
		if (response?.type === 'opaqueredirect') return response;
	} catch (error) {
		if (_DEV_) {
			console.warn('navigation fetch failed; showing offline page', error);
		}
	} finally {
		globalThis.clearTimeout(timeout);
	}

	// Only show offline page when network request actually fails
	const html = await offlineContentHTML();
	return new Response(html, {
		status: 200,
		headers: {
			'content-type': 'text/html',
		},
	});
}

async function offlineContentHTML() {
	let i18n: Partial<I18n<Locale>>;
	try {
		i18n = await (swLang.i18n ?? await swLang.fetchLocale()) as Partial<I18n<Locale>>;
	} catch {
		i18n = {};
	}

	const messages = {
		title: i18n.ts?._offlineScreen.title ?? 'Connection unavailable',
		header: i18n.ts?._offlineScreen.header ?? 'Unable to connect to the server',
		description: i18n.ts?._offlineScreen.description ?? '',
		reload: i18n.ts?.reload ?? 'Reload',
	};
	const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;',
	}[character] ?? character));
	const descriptionMarkup = messages.description.length > 0
		? `<p class="description">${escapeHtml(messages.description)}</p>`
		: '';
	const pageLang = await swLang.lang.catch(() => 'zh-CN');

	return `<!DOCTYPE html>
<html lang="${escapeHtml(pageLang)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#f2f3f5">
<title>${escapeHtml(messages.title)}</title>
<style>
:root {
	color-scheme: light;
	--background: #f2f3f5;
	--foreground: #252933;
	--muted: #687686;
	--accent: #1e80ff;
	--accent-strong: #086ded;
	--accent-hover: #0060dd;
	--ease: cubic-bezier(.22, 1, .36, 1);
}
* { box-sizing: border-box; }
html {
	min-width: 320px;
	background: var(--background);
}
body {
	position: relative;
	margin: 0;
	min-height: 100vh;
	min-height: 100svh;
	overflow-x: hidden;
	background: var(--background);
	color: var(--foreground);
	font-family: "Aptos", "Segoe UI Variable Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
	line-height: 1.6;
	-webkit-font-smoothing: antialiased;
}
body::before {
	content: "";
	position: fixed;
	z-index: 0;
	inset: -28%;
	background:
		radial-gradient(circle at 33% 24%, rgba(30, 128, 255, .16), transparent 25rem),
		radial-gradient(circle at 74% 70%, rgba(112, 196, 255, .13), transparent 28rem);
	filter: blur(52px);
	pointer-events: none;
	animation: ambient-drift 22s ease-in-out infinite alternate;
}
body::after {
	content: "";
	position: fixed;
	z-index: 1;
	inset: 0;
	background:
		linear-gradient(180deg, rgba(255, 255, 255, .5), transparent 26%),
		linear-gradient(0deg, rgba(255, 255, 255, .7), transparent 30%);
	pointer-events: none;
}
.page {
	position: relative;
	z-index: 2;
	isolation: isolate;
	width: 100%;
	min-height: 100vh;
	min-height: 100svh;
	padding: 32px 24px 0;
	display: grid;
	grid-template-rows: minmax(0, 1fr) auto;
	overflow-x: hidden;
}
.content {
	align-self: center;
	justify-self: center;
	width: min(520px, 100%);
	margin-top: -4vh;
	text-align: center;
	animation: content-in .7s var(--ease) .06s backwards;
}
.signal {
	width: min(300px, 74vw);
	margin: 0 auto 26px;
}
.signal svg {
	display: block;
	width: 100%;
	height: auto;
	overflow: visible;
}
.signal-line,
.signal-pulse {
	fill: none;
	stroke-linecap: round;
}
.signal-line {
	stroke-width: 1.5;
}
.signal-line.left { stroke: url("#signal-left"); }
.signal-line.right { stroke: url("#signal-right"); }
.signal-pulse {
	stroke: var(--accent);
	stroke-width: 2;
	stroke-dasharray: 1 16;
	opacity: .72;
	animation: signal-flow-left 3.2s linear infinite;
}
.signal-pulse.right {
	animation-name: signal-flow-right;
}
.signal-node {
	fill: #f9fcff;
	stroke: rgba(30, 128, 255, .45);
	stroke-width: 1.5;
}
.signal-core {
	fill: var(--accent);
	animation: node-pulse 2.4s ease-in-out infinite;
}
h1 {
	margin: 0;
	font-family: "Bahnschrift", "Aptos Display", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
	font-size: clamp(1.55rem, 2.35vw, 1.95rem);
	font-weight: 600;
	letter-spacing: -.025em;
	line-height: 1.28;
	line-break: strict;
	text-wrap: balance;
	word-break: keep-all;
	overflow-wrap: anywhere;
}
h1:lang(zh) { white-space: nowrap; }
.description {
	max-width: 28em;
	margin: 11px auto 0;
	color: var(--muted);
	font-size: .9375rem;
	line-height: 1.7;
	text-wrap: pretty;
}
.retry {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	min-width: 124px;
	min-height: 44px;
	max-width: 100%;
	margin-top: 24px;
	padding: 10px 20px;
	border: 0;
	border-radius: 8px;
	background: var(--accent-strong);
	color: #ffffff;
	font: inherit;
	font-size: .875rem;
	font-weight: 700;
	line-height: 1.2;
	cursor: pointer;
	box-shadow: 0 1px 2px rgba(15, 70, 140, .12);
	transition:
		background-color .18s ease,
		box-shadow .18s ease,
		transform .18s var(--ease);
	-webkit-tap-highlight-color: transparent;
}
.retry svg {
	width: 17px;
	height: 17px;
	flex: none;
}
@media (hover: hover) and (pointer: fine) {
	.retry:hover {
		background: var(--accent-hover);
		box-shadow:
			0 1px 2px rgba(15, 70, 140, .16),
			0 8px 20px rgba(30, 128, 255, .2);
		transform: translateY(-1px);
	}
	.retry:hover svg {
		transform: rotate(180deg);
		transition: transform .45s var(--ease);
	}
}
.retry:active {
	transform: translateY(0);
	box-shadow: 0 1px 2px rgba(15, 70, 140, .12);
}
.retry:focus-visible {
	outline: 2px solid var(--accent-strong);
	outline-offset: 3px;
}
.foot {
	padding: 18px 0 24px;
	color: var(--muted);
	font-family: "Cascadia Mono", "SFMono-Regular", Consolas, monospace;
	font-size: 11px;
	letter-spacing: .06em;
	text-align: center;
}
.version { opacity: .72; }
@keyframes ambient-drift {
	from { transform: translate3d(-1.6%, -1%, 0) scale(1); }
	to { transform: translate3d(1.6%, 1.4%, 0) scale(1.06); }
}
@keyframes content-in {
	from { opacity: 0; transform: translateY(10px); }
	to { opacity: 1; transform: translateY(0); }
}
@keyframes signal-flow-left {
	to { stroke-dashoffset: -34; }
}
@keyframes signal-flow-right {
	to { stroke-dashoffset: 34; }
}
@keyframes node-pulse {
	0%, 100% { opacity: .5; }
	50% { opacity: 1; }
}
@media (max-width: 600px) {
	.page {
		padding: 28px 22px 0;
		grid-template-rows: minmax(0, 1fr) auto;
	}
	.content {
		margin-top: -3vh;
	}
	.signal {
		width: min(250px, 70vw);
		margin-bottom: 24px;
	}
	h1 {
		font-size: clamp(1.4rem, 6.5vw, 1.7rem);
		line-height: 1.32;
		text-wrap: pretty;
	}
	.description {
		margin-top: 11px;
		font-size: .875rem;
	}
	.retry {
		width: min(240px, 100%);
		min-height: 46px;
		margin-top: 22px;
	}
	.foot { padding: 16px 0 22px; font-size: 10px; }
}
@media (prefers-reduced-motion: reduce) {
	*, *::before, *::after {
		animation: none !important;
		transition: none !important;
		scroll-behavior: auto !important;
	}
	.retry:active, .retry:hover { transform: none; }
}
</style>
</head>
<body>
<main class="page" aria-labelledby="title">
	<section class="content">
		<div class="signal" aria-hidden="true">
			<svg viewBox="0 0 300 64">
				<defs>
					<linearGradient id="signal-left" x1="0" y1="0" x2="1" y2="0">
						<stop offset="0" stop-color="#1e80ff" stop-opacity="0"/>
						<stop offset=".7" stop-color="#1e80ff" stop-opacity=".35"/>
						<stop offset="1" stop-color="#1e80ff" stop-opacity=".72"/>
					</linearGradient>
					<linearGradient id="signal-right" x1="0" y1="0" x2="1" y2="0">
						<stop offset="0" stop-color="#1e80ff" stop-opacity=".72"/>
						<stop offset=".3" stop-color="#1e80ff" stop-opacity=".35"/>
						<stop offset="1" stop-color="#1e80ff" stop-opacity="0"/>
					</linearGradient>
					<radialGradient id="signal-glow">
						<stop offset="0" stop-color="#1e80ff" stop-opacity=".12"/>
						<stop offset="1" stop-color="#1e80ff" stop-opacity="0"/>
					</radialGradient>
				</defs>
				<circle cx="150" cy="32" r="32" fill="url(#signal-glow)"/>
				<path class="signal-line left" d="M0 32H118"/>
				<path class="signal-line right" d="M182 32H300"/>
				<path class="signal-pulse left" d="M0 32H118"/>
				<path class="signal-pulse right" d="M182 32H300"/>
				<circle class="signal-node" cx="118" cy="32" r="6"/>
				<circle class="signal-core" cx="118" cy="32" r="2.5"/>
				<circle class="signal-node" cx="182" cy="32" r="6"/>
				<circle class="signal-core" cx="182" cy="32" r="2.5" style="animation-delay:-1.2s"/>
			</svg>
		</div>
		<h1 id="title">${escapeHtml(messages.header)}</h1>
		${descriptionMarkup}
		<button class="retry" id="retry" type="button">
		${refreshIcon}
		<span>${escapeHtml(messages.reload)}</span>
		</button>
	</section>
	<footer class="foot">
		<span class="version">v${_VERSION_}</span>
	</footer>
</main>
<script>
(() => {
	const retry = document.getElementById('retry');
	let refreshing = false;
	retry.addEventListener('click', () => location.reload());
	async function checkServer() {
		if (refreshing) return;
		try {
			const response = await fetch('/api/meta', { method: 'POST', body: '{}', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'cache-control': 'no-cache' } });
			if (response.ok) { refreshing = true; location.reload(); }
		} catch {}
	}
	const connectionTimer = setInterval(checkServer, 2500);
	window.addEventListener('online', checkServer);
	window.addEventListener('pagehide', () => clearInterval(connectionTimer), { once: true });
	checkServer();
})();
</script>
</body>
</html>`;
}

globalThis.addEventListener('install', (ev) => {
	// 离线页是导航失败时才会显示，更新后立即接管才能避免继续返回旧页面。
	ev.waitUntil(globalThis.skipWaiting());

	// 次の問題が発生するため、ServiceWorkerAutoPreload をオプトアウトする必要がある
	// https://issues.chromium.org/issues/466790291
	if ('addRoutes' in ev) {
		// doc: https://developer.mozilla.org/en-US/docs/Web/API/InstallEvent/addRoutes
		// @ts-expect-error 実験的なAPIなので型定義がない
		ev.addRoutes({
			condition: {
				// doc: https://developer.mozilla.org/ja/docs/Web/API/URLPattern
				// @ts-expect-error 実験的なAPIなので型定義がない
				urlPattern: new URLPattern({}),
			},
			source: 'fetch-event',
		});
	}
});

globalThis.addEventListener('activate', ev => {
	ev.waitUntil(
		caches.keys()
			.then(cacheNames => Promise.all(
				cacheNames
					.filter((v) => v !== swLang.cacheName)
					.map(name => caches.delete(name)),
			))
			.then(() => globalThis.clients.claim()),
	);
});

globalThis.addEventListener('fetch', ev => {
	let isHTMLRequest = false;
	if (ev.request.headers.get('sec-fetch-dest') === 'document') {
		isHTMLRequest = true;
	} else if (ev.request.headers.get('accept')?.includes('/html')) {
		isHTMLRequest = true;
	} else if (ev.request.url.endsWith('/')) {
		isHTMLRequest = true;
	}

	if (!isHTMLRequest) return;
	ev.respondWith(respondToNavigation(ev.request));
});

globalThis.addEventListener('push', ev => {
	// クライアント取得
	ev.waitUntil(globalThis.clients.matchAll({
		includeUncontrolled: true,
		type: 'window',
	}).then(async () => {
		const data: PushNotificationDataMap[keyof PushNotificationDataMap] = ev.data?.json();

		switch (data.type) {
			// case 'driveFileCreated':
			case 'notification':
			case 'unreadAntennaNote':
			case 'newChatMessage':
				// 1日以上経過している場合は無視
				if (Date.now() - data.dateTime > 1000 * 60 * 60 * 24) break;

				return createNotification(data);
			case 'readAllNotifications':
				await globalThis.registration.getNotifications()
					.then(notifications => notifications.forEach(n => n.tag !== 'read_notification' && n.close()));
				break;
		}

		await createEmptyNotification();
		return;
	}));
});

globalThis.addEventListener('notificationclick', (ev: ServiceWorkerGlobalScopeEventMap['notificationclick']) => {
	ev.waitUntil((async (): Promise<void> => {
		if (_DEV_) {
			console.log('notificationclick', ev.action, ev.notification.data);
		}

		const { action, notification } = ev;
		const data: PushNotificationDataMap[keyof PushNotificationDataMap] = notification.data ?? {};
		const { userId: loginId } = data;
		let client: WindowClient | null = null;

		switch (data.type) {
			case 'notification':
				switch (action) {
					case 'follow':
						if ('userId' in data.body) await swos.api('following/create', loginId, { userId: data.body.userId });
						break;
					case 'showUser':
						if ('user' in data.body) client = await swos.openUser(Misskey.acct.toString(data.body.user), loginId);
						break;
					case 'reply':
						if ('note' in data.body) client = await swos.openPost({ reply: data.body.note }, loginId);
						break;
					case 'renote':
						if ('note' in data.body) await swos.api('notes/create', loginId, { renoteId: data.body.note.id });
						break;
					case 'accept':
						switch (data.body.type) {
							case 'receiveFollowRequest':
								await swos.api('following/requests/accept', loginId, { userId: data.body.userId });
								break;
						}
						break;
					case 'reject':
						switch (data.body.type) {
							case 'receiveFollowRequest':
								await swos.api('following/requests/reject', loginId, { userId: data.body.userId });
								break;
						}
						break;
					case 'showFollowRequests':
						client = await swos.openClient('push', '/my/notifications/follow-requests', loginId);
						break;
					default:
						switch (data.body.type) {
							case 'receiveFollowRequest':
								client = await swos.openClient('push', '/my/notifications/follow-requests', loginId);
								break;
							case 'reaction':
								client = await swos.openNote(data.body.note.id, loginId);
								break;
							case 'chatRoomInvitationReceived':
								client = await swos.openClient('push', '/chat/invitations', loginId);
								break;
							case 'chatRoomMemberRemoved':
								client = await swos.openClient('push', '/my/notifications/chat', loginId);
								break;
							default:
								if ('note' in data.body) {
									client = await swos.openNote(data.body.note.id, loginId);
								} else if ('user' in data.body) {
									client = await swos.openUser(Misskey.acct.toString(data.body.user), loginId);
								}
								break;
						}
				}
				break;
			case 'unreadAntennaNote':
				client = await swos.openAntenna(data.body.antenna.id, loginId);
				break;
			case 'newChatMessage':
				client = await swos.openChat(data.body, loginId);
				break;
			default:
				switch (action) {
					case 'markAllAsRead':
						await globalThis.registration.getNotifications()
							.then(notifications => notifications.forEach(n => n.tag !== 'read_notification' && n.close()));
						await get<Pick<Misskey.entities.SignupResponse, 'id' | 'token'>[]>('accounts').then(accounts => {
							return Promise.all((accounts ?? []).map(async account => {
								await swos.sendMarkAllAsRead(account.id);
							}));
						});
						break;
					case 'settings':
						client = await swos.openClient('push', '/settings/notifications', loginId);
						break;
				}
		}

		if (client) {
			client.focus();
		}
		if (data.type === 'notification') {
			await swos.sendMarkAllAsRead(loginId);
		}

		notification.close();
	})());
});

globalThis.addEventListener('notificationclose', (ev: ServiceWorkerGlobalScopeEventMap['notificationclose']) => {
	const data: PushNotificationDataMap[keyof PushNotificationDataMap] = ev.notification.data;

	ev.waitUntil((async (): Promise<void> => {
		if (data.type === 'notification') {
			await swos.sendMarkAllAsRead(data.userId);
		}
		return;
	})());
});

globalThis.addEventListener('message', (ev: ServiceWorkerGlobalScopeEventMap['message']) => {
	ev.waitUntil((async (): Promise<void> => {
		switch (ev.data) {
			case 'clear':
				// Cache Storage全削除
				await caches.keys()
					.then(cacheNames => Promise.all(
						cacheNames.map(name => caches.delete(name)),
					));
				return; // TODO
		}

		if (typeof ev.data === 'object') {
			// E.g. '[object Array]' → 'array'
			const otype = Object.prototype.toString.call(ev.data).slice(8, -1).toLowerCase();

			if (otype === 'object') {
				if (ev.data.msg === 'initialize') {
					swLang.setLang(ev.data.lang);
				}
			}
		}
	})());
});
