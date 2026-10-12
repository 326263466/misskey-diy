/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/*
 * Language manager for SW
 */
import { get, set } from 'idb-keyval';
import { I18n } from '@@/js/i18n.js';
import { FETCH_TIMEOUT_MS } from '@/const.js';
import type { Locale } from 'i18n';

class SwLang {
	public cacheName = `mk-cache-${_VERSION_}`;

	public lang: Promise<string> = get('lang').then(async prelang => {
		if (typeof prelang !== 'string' || !_LANGS_.some(([code]) => code === prelang)) return 'en-US';
		return prelang;
	});

	public setLang(newLang: string): Promise<I18n<Locale>> {
		this.lang = Promise.resolve(newLang);
		set('lang', newLang);
		return this.fetchLocale();
	}

	public i18n: Promise<I18n<Locale>> | null = null;

	public fetchLocale(): Promise<I18n<Locale>> {
		return (this.i18n = this._fetch());
	}

	private async _fetch(): Promise<I18n<Locale>> {
		// 优先拉取最新文案，断网时再回退到当前版本的缓存。
		const localeUrl = `/assets/locales/${await this.lang}.${_VERSION_}.json`;
		let localeRes: Response | undefined;
		const controller = new AbortController();
		const timeout = globalThis.setTimeout(() => {
			controller.abort('locale-fetch-timeout');
		}, FETCH_TIMEOUT_MS);

		try {
			localeRes = await fetch(localeUrl, { signal: controller.signal, cache: 'no-store' });
			if (!localeRes.ok) throw new Error('locale fetching error');
			const clone = localeRes.clone();
			caches.open(this.cacheName).then(cache => cache.put(localeUrl, clone));
		} catch {
			localeRes = await caches.match(localeUrl);
		} finally {
			globalThis.clearTimeout(timeout);
		}

		if (!localeRes) throw new Error('locale unavailable');
		return new I18n<Locale>(await localeRes.json());
	}
}

export const swLang = new SwLang();
