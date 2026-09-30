/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type SharePlatform = 'qq' | 'qzone' | 'weibo' | 'x' | 'telegram' | 'facebook' | 'whatsapp';

const shareEndpoints: Record<SharePlatform, string> = {
	qq: 'https://connect.qq.com/widget/shareqq/index.html',
	qzone: 'https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey',
	weibo: 'https://service.weibo.com/share/share.php',
	x: 'https://twitter.com/intent/tweet',
	telegram: 'https://t.me/share/url',
	facebook: 'https://www.facebook.com/sharer/sharer.php',
	whatsapp: 'https://api.whatsapp.com/send',
};
const shareSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Preserve complete content for copying, without repeating identical fields. */
export function getShareText(data: ShareData): string {
	const parts = [data.title, data.text, data.url].filter((part): part is string => part != null && part.trim() !== '');
	return [...new Set(parts)].join('\n');
}

/** Keep URLs small while preserving complete emoji sequences and code points. */
function truncateShareText(text: string, limit: number): string {
	if (Array.from(text).length <= limit) return text;
	let result = '';
	let length = 0;
	for (const { segment } of shareSegmenter.segment(text)) {
		const segmentLength = Array.from(segment).length;
		if (length + segmentLength > limit - 1) break;
		result += segment;
		length += segmentLength;
	}
	return `${result}…`;
}

/** Build a compose link; only the destination app decides when to publish it. */
export function getShareUrl(platform: SharePlatform, data: ShareData): string {
	const url = data.url ?? '';
	const summary = getShareText({ title: data.title, text: data.text });
	let parameters: Record<string, string>;
	switch (platform) {
		case 'qq':
		case 'qzone':
			parameters = { url, title: truncateShareText(data.title ?? '', 100), summary: truncateShareText(data.text ?? '', 500) };
			break;
		case 'weibo':
			parameters = { url, title: truncateShareText(summary, 140) };
			break;
		case 'x':
			// Leave room for CJK weighting and the platform's shortened link.
			parameters = { url, text: truncateShareText(summary, 100) };
			break;
		case 'telegram':
			parameters = { url, text: truncateShareText(summary, 500) };
			break;
		case 'facebook':
			parameters = { u: url };
			break;
		case 'whatsapp':
			parameters = { text: getShareText({ text: truncateShareText(summary, 500), url }) };
			break;
	}
	const shareUrl = new URL(shareEndpoints[platform]);
	for (const [key, value] of Object.entries(parameters)) {
		if (value.trim() !== '') shareUrl.searchParams.set(key, value);
	}
	return shareUrl.toString();
}

export function canShareWithSystem(data: ShareData): boolean {
	if (typeof navigator.share !== 'function') return false;
	try {
		return typeof navigator.canShare !== 'function' || navigator.canShare(data);
	} catch {
		return false;
	}
}

export async function shareWithSystem(data: ShareData): Promise<'shared' | 'canceled' | 'failed'> {
	if (!canShareWithSystem(data)) return 'failed';
	try {
		await navigator.share(data);
		return 'shared';
	} catch (error) {
		return error instanceof Error && error.name === 'AbortError' ? 'canceled' : 'failed';
	}
}

/** Wait for clipboard confirmation, with a fallback for HTTP and older browsers. */
export async function copyShareText(text: string): Promise<boolean> {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		// A denied clipboard permission can still permit copying a selected field.
	}

	const previousFocus = window.document.activeElement;
	const input = window.document.createElement('textarea');
	input.value = text;
	input.readOnly = true;
	input.style.position = 'fixed';
	input.style.opacity = '0';
	window.document.body.appendChild(input);
	try {
		input.select();
		return window.document.execCommand('copy');
	} catch {
		return false;
	} finally {
		input.remove();
		if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
	}
}

export async function copyShareLink(link: string): Promise<boolean> {
	return copyShareText(link);
}
