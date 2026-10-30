/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { SummalyResult } from '@misskey-dev/summaly';

type PendingPreview = {
	controller: AbortController;
	timeout: number;
	consumers: number;
	promise: Promise<SummalyResult | null>;
};

const CACHE_TTL = 60 * 60_000;
const CACHE_CAPACITY = 100;
const cache = new Map<string, { expires: number; result: SummalyResult }>();
const pending = new Map<string, PendingPreview>();
const keyFor = (url: string, lang: string) => JSON.stringify([url, lang]);

export function getUrlPreviewRequestUrl(url: string | URL, base = window.location.href): string {
	const requestUrl = new URL(url, base);
	if (requestUrl.hostname === 'music.youtube.com' && /^\/(?:watch|channel)/.test(requestUrl.pathname)) {
		requestUrl.hostname = 'www.youtube.com';
	}
	requestUrl.hash = '';
	return requestUrl.href;
}

export function getUrlPreviewTitle(result: SummalyResult | null | undefined, sourceUrl: string | URL, base = window.location.href): string | null {
	const value = result?.title?.trim();
	if (!value) return null;
	const source = new URL(sourceUrl, base);
	// 部分预览服务把地址当作标题，避免在地址行和标题行重复显示。
	return [source.href, getUrlPreviewRequestUrl(source), source.host, result?.url].includes(value) ? null : value;
}

function get(url: string, lang: string): SummalyResult | undefined {
	const key = keyFor(url, lang);
	const entry = cache.get(key);
	if (!entry) return undefined;
	cache.delete(key);
	if (entry.expires <= Date.now()) return undefined;
	cache.set(key, entry);
	return entry.result;
}

function request(url: string, lang: string): { promise: Promise<SummalyResult | null>; release: () => void } {
	const cached = get(url, lang);
	if (cached) return { promise: Promise.resolve(cached), release: () => {} };

	const key = keyFor(url, lang);
	let entry = pending.get(key);
	if (!entry) {
		const controller = new AbortController();
		const timeout = window.setTimeout(() => controller.abort(), 30000);
		const created: PendingPreview = {
			controller,
			timeout,
			consumers: 0,
			promise: window.fetch(`/url?url=${encodeURIComponent(url)}&lang=${encodeURIComponent(lang)}`, { signal: controller.signal, cache: 'no-cache' })
				.then(res => {
					if (!res.ok) {
						if (_DEV_) console.warn(`[HTTP${res.status}] Failed to fetch url preview`);
						return null;
					}
					return res.json() as Promise<SummalyResult | null>;
				})
				.then(info => {
					const result = info ? { ...info, url: info.url ?? url } : null;
					if (result && !controller.signal.aborted) {
						cache.set(key, { expires: Date.now() + CACHE_TTL, result });
						while (cache.size > CACHE_CAPACITY) cache.delete(cache.keys().next().value!);
					}
					return result;
				})
				.finally(() => {
					window.clearTimeout(timeout);
					if (pending.get(key) === created) pending.delete(key);
				}),
		};
		pending.set(key, created);
		entry = created;
	}

	entry.consumers++;
	const shared = entry;
	let released = false;
	return {
		promise: shared.promise,
		release: () => {
			if (released) return;
			released = true;
			shared.consumers--;
			// 单个预览卸载不应取消其他卡片正在使用的请求。
			if (shared.consumers === 0 && pending.get(key) === shared) {
				pending.delete(key);
				window.clearTimeout(shared.timeout);
				shared.controller.abort();
			}
		},
	};
}

function getTitle(url: string, lang: string): string | null {
	return getUrlPreviewTitle(get(getUrlPreviewRequestUrl(url), lang), url);
}

export const urlPreviewCache = { get, getTitle, request };
