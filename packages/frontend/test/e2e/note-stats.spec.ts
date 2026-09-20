/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import type { APIRequestContext, Browser, BrowserContext, Locator, Page, WebSocketRoute } from '@playwright/test';
import type * as Misskey from 'misskey-js';
import { test, expect } from './fixtures.js';
import { BASE_URL, registerUser } from './utils.js';
import type { RegisteredUser } from './utils.js';

type CounterName = 'repliesCount' | 'likeCount' | 'renoteCount' | 'reactionCount' | 'favoritesCount' | 'viewsCount';
const counterNames: CounterName[] = ['repliesCount', 'likeCount', 'renoteCount', 'reactionCount', 'favoritesCount', 'viewsCount'];

type MotionSample = { counter: number; transform: string; duration: string; elapsed: number };
declare global {
	interface Window {
		noteStatsMotion: MotionSample[];
	}
}

async function api(request: APIRequestContext, user: RegisteredUser, endpoint: string, body: Record<string, unknown> = {}) {
	const response = await request.post(`${BASE_URL}/api/${endpoint}`, { data: { ...body, i: user.token } });
	expect(response.ok(), `${endpoint}: ${response.status()}`).toBe(true);
	return response.status() === 204 ? null : await response.json();
}

async function authenticatedContext(browser: Browser, request: APIRequestContext, user: RegisteredUser): Promise<BrowserContext> {
	await api(request, user, 'i/registry/set', { scope: ['client', 'base'], key: 'accountSetupWizard', value: -1 });
	const account = await api(request, user, 'i');
	const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'en-US' });
	await context.addInitScript(({ account, token }) => {
		localStorage.setItem('account', JSON.stringify({ ...account, token }));
		localStorage.setItem('lang', 'en-US');
		localStorage.setItem('neverShowDonationInfo', 'true');
		localStorage.setItem('preferences', JSON.stringify({
			id: 'note-stats-e2e', version: '2026.9.0', type: 'main', modifiedAt: Date.now(), name: '',
			preferences: { animation: [[{}, true, {}]], showReactionsCount: [[{}, true, {}]] },
		}));
	}, { account, token: user.token });
	return context;
}

function noteArticle(page: Page, text: string): Locator {
	return page.locator('article').filter({ hasText: text }).first();
}

async function observeMotion(page: Page, text: string): Promise<void> {
	await page.evaluate((text) => {
		const samples: MotionSample[] = [];
		window.noteStatsMotion = samples;
		document.addEventListener('transitionrun', (event) => {
			const element = event.target;
			if (!(element instanceof HTMLElement) || !element.className.includes('MkRollingNumber-value')) return;
			const article = element.closest('article');
			if (!article?.textContent?.includes(text)) return;
			const root = element.closest('[class*="MkRollingNumber-root"]');
			const counters = Array.from(article.querySelectorAll('footer [class*="MkRollingNumber-root"]'));
			const counter = counters.indexOf(root!);
			if (counter < 0) return;
			window.setTimeout(() => {
				if (!element.isConnected) return;
				const style = getComputedStyle(element);
				samples.push({ counter, transform: style.transform, duration: style.transitionDuration, elapsed: event.elapsedTime });
			}, 80);
		});
	}, text);
}

function counter(article: Locator, name: CounterName): Locator {
	return article.locator('footer [aria-live="polite"]').nth(counterNames.indexOf(name));
}

function observeNetwork(page: Page, noteId: string) {
	const state = { subscriptions: 0, updates: [] as string[], partials: 0, connections: 0 };
	page.on('websocket', socket => {
		if (!socket.url().includes('/streaming')) return;
		state.connections++;
		socket.on('framesent', ({ payload }) => {
			const message = JSON.parse(String(payload));
			if (['sr', 'subNote'].includes(message.type) && message.body?.id === noteId) state.subscriptions++;
		});
		socket.on('framereceived', ({ payload }) => {
			const message = JSON.parse(String(payload));
			if (message.type === 'noteUpdated' && message.body?.id === noteId) state.updates.push(message.body.type);
		});
	});
	page.on('response', response => {
		if (!response.url().endsWith('/api/notes/show-partial-bulk') || !response.ok()) return;
		const params = response.request().postDataJSON();
		if (params?.noteIds?.includes(noteId)) state.partials++;
	});
	return state;
}

test('real accounts update list and detail counters through streaming and recover missed updates', async ({ browser, request }, testInfo) => {
	test.setTimeout(180_000);
	const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
	const author = await registerUser(`statsa${suffix}`, randomUUID());
	const visitor = await registerUser(`statsb${suffix}`, randomUUID());
	const text = `Live counter regression ${suffix}`;
	const original = (await api(request, author, 'notes/create', { text })).createdNote as Misskey.entities.Note;
	const authorContext = await authenticatedContext(browser, request, author);
	const visitorContext = await authenticatedContext(browser, request, visitor);
	const pages = [await authorContext.newPage(), await authorContext.newPage()];
	const visitorPage = await visitorContext.newPage();
	const networks = pages.map(page => observeNetwork(page, original.id));
	const fault = { dropUpdates: false, failedRequests: 0, failed: 0, dropped: 0 };
	const sockets: { current?: WebSocketRoute } = {};

	// 只丢弃真实网络消息及请求，统计数据始终来自测试服务器。
	await pages[0].routeWebSocket('**/streaming**', socket => {
		sockets.current = socket;
		const server = socket.connectToServer();
		server.onMessage(message => {
			const event = JSON.parse(String(message));
			if (fault.dropUpdates && event.type === 'noteUpdated' && event.body?.id === original.id) {
				fault.dropped++;
				return;
			}
			socket.send(message);
		});
	});
	await pages[0].route('**/api/notes/show-partial-bulk', async route => {
		if (fault.failedRequests > 0 && route.request().postDataJSON()?.noteIds?.includes(original.id)) {
			fault.failedRequests--;
			fault.failed++;
			await route.abort('failed');
		} else {
			await route.continue();
		}
	});

	try {
		await pages[0].goto(`${BASE_URL}/`);
		await pages[1].goto(`${BASE_URL}/notes/${original.id}`);
		const articles = pages.map(page => noteArticle(page, text));
		for (let index = 0; index < pages.length; index++) {
			await expect(articles[index]).toBeVisible();
			await articles[index].scrollIntoViewIfNeeded();
			await expect(articles[index].locator('footer [aria-live="polite"]')).toHaveCount(6);
			await expect.poll(() => networks[index].subscriptions).toBeGreaterThan(0);
			await expect.poll(() => networks[index].partials).toBeGreaterThan(0);
			expect(await pages[index].evaluate(() => document.visibilityState)).toBe('visible');
			await observeMotion(pages[index], text);
		}
		await expect.poll(async () => (await api(request, author, 'notes/show', { noteId: original.id })).viewsCount).toBe(1);
		for (const article of articles) await expect(counter(article, 'viewsCount')).toHaveText('1');

		async function change(name: CounterName, expected: number, event: string, action: () => Promise<unknown>): Promise<void> {
			const starts = await Promise.all(pages.map(async (page, index) => ({
				updates: networks[index].updates.length,
				partials: networks[index].partials,
				motions: await page.evaluate(() => window.noteStatsMotion.length),
			})));
			await action();
			for (let index = 0; index < pages.length; index++) {
				await expect(counter(articles[index], name)).toHaveText(String(expected));
				await expect.poll(() => networks[index].updates.slice(starts[index].updates)).toContain(event);
				await expect.poll(() => networks[index].partials).toBeGreaterThan(starts[index].partials);
				await expect.poll(async () => pages[index].evaluate(({ start, counter }) => window.noteStatsMotion.slice(start).some(sample =>
					sample.counter === counter && sample.duration === '0.3s' && !['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(sample.transform),
				), { start: starts[index].motions, counter: counterNames.indexOf(name) })).toBe(true);
			}
			const serverNote = await api(request, author, 'notes/show', { noteId: original.id });
			expect(serverNote[name]).toBe(expected);
			for (const article of articles) {
				await expect(article.locator('footer [class*="MkRollingNumber-root"]').nth(counterNames.indexOf(name)).locator('[aria-hidden="true"]')).toHaveCount(1);
			}
		}

		await change('likeCount', 1, 'statsUpdated', () => api(request, visitor, 'notes/likes/create', { noteId: original.id }));
		await change('likeCount', 0, 'statsUpdated', () => api(request, visitor, 'notes/likes/delete', { noteId: original.id }));
		await change('favoritesCount', 1, 'statsUpdated', () => api(request, visitor, 'notes/favorites/create', { noteId: original.id }));
		await change('favoritesCount', 0, 'statsUpdated', () => api(request, visitor, 'notes/favorites/delete', { noteId: original.id }));
		await change('reactionCount', 1, 'reacted', () => api(request, visitor, 'notes/reactions/create', { noteId: original.id, reaction: '\u2764' }));
		await change('reactionCount', 0, 'unreacted', () => api(request, visitor, 'notes/reactions/delete', { noteId: original.id }));
		let renoteId = '';
		await change('renoteCount', 1, 'renoted', async () => {
			renoteId = (await api(request, visitor, 'notes/create', { renoteId: original.id })).createdNote.id;
		});
		await change('renoteCount', 0, 'unrenoted', () => api(request, visitor, 'notes/delete', { noteId: renoteId }));
		let replyId = '';
		await change('repliesCount', 1, 'replied', async () => {
			replyId = (await api(request, visitor, 'notes/create', { text: 'Visitor reply', replyId: original.id })).createdNote.id;
		});
		await change('repliesCount', 2, 'replied', () => api(request, author, 'notes/create', { text: 'Author reply', replyId: original.id }));
		await change('repliesCount', 3, 'replied', () => api(request, author, 'notes/create', { text: 'Nested author reply', replyId }));

		await change('viewsCount', 2, 'statsUpdated', async () => {
			await visitorPage.goto(`${BASE_URL}/notes/${original.id}`);
			await expect(noteArticle(visitorPage, text)).toBeVisible();
		});
		const duplicateView = visitorPage.waitForResponse(response => response.url().endsWith('/api/notes/views'));
		await visitorPage.reload();
		await duplicateView;
		expect((await api(request, author, 'notes/show', { noteId: original.id })).viewsCount).toBe(2);

		fault.dropUpdates = true;
		fault.failedRequests = 1;
		await api(request, visitor, 'notes/likes/create', { noteId: original.id });
		await expect.poll(() => fault.dropped).toBeGreaterThan(0);
		await expect.poll(() => fault.failed, { timeout: 15_000 }).toBe(1);
		await expect(counter(articles[0], 'likeCount')).toHaveText('1', { timeout: 25_000 });
		fault.dropUpdates = false;
		const connections = networks[0].connections;
		sockets.current?.close({ code: 1012, reason: 'e2e reconnect' });
		await api(request, visitor, 'notes/favorites/create', { noteId: original.id });
		await expect.poll(() => networks[0].connections, { timeout: 20_000 }).toBeGreaterThan(connections);
		for (const article of articles) await expect(counter(article, 'favoritesCount')).toHaveText('1', { timeout: 20_000 });

		for (const width of [1200, 390]) {
			for (let index = 0; index < pages.length; index++) {
				await pages[index].setViewportSize({ width, height: 900 });
				await articles[index].scrollIntoViewIfNeeded();
				await expect(counter(articles[index], 'repliesCount')).toHaveText('3');
				await expect(counter(articles[index], 'likeCount')).toHaveText('1');
				await expect(counter(articles[index], 'favoritesCount')).toHaveText('1');
				expect(await pages[index].evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
				await pages[index].screenshot({ path: testInfo.outputPath(`${index === 0 ? 'list' : 'detail'}-${width}.png`) });
			}
		}
		await testInfo.attach('network-summary', { body: JSON.stringify({ networks, failedRequests: fault.failed, droppedUpdates: fault.dropped }), contentType: 'application/json' });
	} finally {
		await authorContext.close();
		await visitorContext.close();
		await api(request, author, 'notes/delete', { noteId: original.id });
	}
});
