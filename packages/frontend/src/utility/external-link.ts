/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { url as local } from '@@/js/config.js';
import { versatileLang } from '@@/js/intl-const.js';
import { tryParseUrl } from '@@/js/url.js';
import * as os from '@/os.js';
import { urlPreviewCache } from '@/utility/url-preview-cache.js';

let dialogOpen = false;

function getLinkTitle(anchor: HTMLAnchorElement, destination: URL): string {
	const heading = anchor.querySelector('h1, h2, h3, h4, h5, h6');
	const text = (heading?.textContent ?? anchor.textContent ?? '').replace(/\s+/g, ' ').trim();
	const titleUrl = tryParseUrl(text);
	if (text !== '' && titleUrl?.href !== destination.href) return text;
	// 正文网址本身没有标题，复用同一链接已加载的预览标题。
	return urlPreviewCache.getTitle(destination.href, versatileLang) ?? destination.host;
}

export async function confirmExternalLink(event: MouseEvent): Promise<void> {
	if (event.defaultPrevented || event.button > 1) return;
	const anchor = event.currentTarget instanceof HTMLAnchorElement ? event.currentTarget
		: event.target instanceof Element ? event.target.closest('a[href]') : null;
	if (!(anchor instanceof HTMLAnchorElement)) return;

	// Read the actual href so the displayed destination is the one being opened.
	const destination = tryParseUrl(anchor.href);
	if (destination == null || !['http:', 'https:'].includes(destination.protocol)) return;
	if (destination.origin === new URL(local).origin) return;

	event.preventDefault();
	event.stopPropagation();
	if (dialogOpen) return;
	dialogOpen = true;

	try {
		const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkExternalLinkDialog.vue').then(x => x.default), {
			url: destination.href,
			linkTitle: getLinkTitle(anchor, destination),
			returnFocusTo: anchor,
		}, {
			closed: () => {
				dialogOpen = false;
				dispose();
			},
		});
	} catch {
		// popupAsyncWithDialog reports loading errors; allow the user to retry.
		dialogOpen = false;
	}
}
