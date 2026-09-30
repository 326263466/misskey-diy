/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type * as Misskey from 'misskey-js';
import type { SharePlatform } from '@/utility/share.js';
import { canShareWithSystem, copyShareLink, copyShareText, getShareText, getShareUrl, shareWithSystem } from '@/utility/share.js';
import { copyNoteLink, getNoteShareData } from '@/utility/share-note.js';

const mocks = vi.hoisted(() => ({ popup: vi.fn(), toast: vi.fn() }));
vi.mock('@/os.js', () => ({ popup: mocks.popup, toast: mocks.toast }));

const data = { title: 'A note', url: 'https://example.com/notes/note' };
const sharePlatforms: SharePlatform[] = ['qq', 'qzone', 'weibo', 'x', 'telegram', 'facebook', 'whatsapp'];
const originalClipboard = navigator.clipboard;
const originalShare = navigator.share;
const originalCanShare = navigator.canShare;
const originalExecCommand = document.execCommand;

beforeEach(() => {
	vi.clearAllMocks();
	mocks.popup.mockReturnValue({ dispose: vi.fn() });
	Object.defineProperties(navigator, {
		clipboard: { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } },
		share: { configurable: true, value: vi.fn().mockResolvedValue(undefined) },
		canShare: { configurable: true, value: undefined },
	});
	Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(true) });
});

afterEach(() => {
	Object.defineProperties(navigator, {
		clipboard: { configurable: true, value: originalClipboard },
		share: { configurable: true, value: originalShare },
		canShare: { configurable: true, value: originalCanShare },
	});
	Object.defineProperty(document, 'execCommand', { configurable: true, value: originalExecCommand });
});

describe('share text', () => {
	test('skips empty fields and removes duplicate fields without changing their content', () => {
		expect(getShareText({ title: 'Same content', text: 'Same content', url: data.url })).toBe(`Same content\n${data.url}`);
		expect(getShareText({ title: ' \n ', text: '', url: data.url })).toBe(data.url);
		expect(getShareText({})).toBe('');
	});

	test('preserves full multiline content when copying', async () => {
		const text = `  First line\n${'👩‍💻'.repeat(600)}\nLast line  `;
		const shareText = getShareText({ ...data, text });
		expect(shareText).toBe(`${data.title}\n${text}\n${data.url}`);
		expect(await copyShareText(shareText)).toBe(true);
		expect(navigator.clipboard.writeText).toHaveBeenCalledWith(shareText);
	});
});

describe('platform compose links', () => {
	const encodedData = {
		title: 'Title &injected=true + # 标题',
		text: 'First line? = &\nSecond line 😀',
		url: 'https://example.com/notes/a?x=a%26b&y=c+d#中文😀',
	};
	const combinedText = `${encodedData.title}\n${encodedData.text}`;

	test.each([
		{ platform: 'qq', endpoint: 'https://connect.qq.com/widget/shareqq/index.html', parameters: { url: encodedData.url, title: encodedData.title, summary: encodedData.text } },
		{ platform: 'qzone', endpoint: 'https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey', parameters: { url: encodedData.url, title: encodedData.title, summary: encodedData.text } },
		{ platform: 'weibo', endpoint: 'https://service.weibo.com/share/share.php', parameters: { url: encodedData.url, title: combinedText } },
		{ platform: 'x', endpoint: 'https://twitter.com/intent/tweet', parameters: { url: encodedData.url, text: combinedText } },
		{ platform: 'telegram', endpoint: 'https://t.me/share/url', parameters: { url: encodedData.url, text: combinedText } },
		{ platform: 'facebook', endpoint: 'https://www.facebook.com/sharer/sharer.php', parameters: { u: encodedData.url } },
		{ platform: 'whatsapp', endpoint: 'https://api.whatsapp.com/send', parameters: { text: `${combinedText}\n${encodedData.url}` } },
	] as const)('encodes every field once for $platform', ({ platform, endpoint, parameters }) => {
		const result = new URL(getShareUrl(platform, encodedData));
		expect(`${result.origin}${result.pathname}`).toBe(endpoint);
		expect(Object.fromEntries(result.searchParams)).toEqual(parameters);
		expect(result.searchParams.has('injected')).toBe(false);
	});

	test.each(sharePlatforms)('never truncates the destination URL for %s', platform => {
		const url = `https://example.com/${'a'.repeat(3000)}?value=+%26#fragment`;
		const result = new URL(getShareUrl(platform, { title: 'Long content', text: '😀'.repeat(1000), url }));
		if (platform === 'whatsapp') {
			expect(result.searchParams.get('text')?.endsWith(`\n${url}`)).toBe(true);
		} else {
			expect(result.searchParams.get(platform === 'facebook' ? 'u' : 'url')).toBe(url);
		}
	});

	test.each([
		{ platform: 'qq', parameter: 'summary', limit: 500 },
		{ platform: 'qzone', parameter: 'summary', limit: 500 },
		{ platform: 'weibo', parameter: 'title', limit: 140 },
		{ platform: 'x', parameter: 'text', limit: 100 },
		{ platform: 'telegram', parameter: 'text', limit: 500 },
		{ platform: 'whatsapp', parameter: 'text', limit: 500 },
	] as const)('bounds $platform summaries without splitting emoji', ({ platform, parameter, limit }) => {
		const result = new URL(getShareUrl(platform, { text: '😀'.repeat(600), url: data.url }));
		const summary = result.searchParams.get(parameter)!.split('\n')[0];
		expect(summary).toBe(`${'😀'.repeat(limit - 1)}…`);
		expect(Array.from(summary)).toHaveLength(limit);
	});

	test('keeps joined emoji intact at a summary boundary', () => {
		const text = `${'a'.repeat(497)}👩‍💻more text`;
		const result = new URL(getShareUrl('telegram', { text, url: data.url }));
		expect(result.searchParams.get('text')).toBe(`${'a'.repeat(497)}…`);
	});

	test.each(['qq', 'qzone'] as const)('bounds the separate %s title field', platform => {
		const result = new URL(getShareUrl(platform, { title: '😀'.repeat(200), url: data.url }));
		expect(result.searchParams.get('title')).toBe(`${'😀'.repeat(99)}…`);
	});
});

describe('system sharing', () => {
	test('works in browsers that have share without canShare', async () => {
		expect(canShareWithSystem(data)).toBe(true);
		expect(await shareWithSystem(data)).toBe('shared');
		expect(navigator.share).toHaveBeenCalledWith(data);
	});

	test('does not offer sharing when the browser rejects the payload', () => {
		Object.defineProperty(navigator, 'canShare', { value: vi.fn().mockReturnValue(false) });
		expect(canShareWithSystem(data)).toBe(false);
		Object.defineProperty(navigator, 'canShare', { value: vi.fn().mockImplementation(() => { throw new Error('Unavailable'); }) });
		expect(canShareWithSystem(data)).toBe(false);
	});

	test('distinguishes user cancellation from a platform failure', async () => {
		vi.mocked(navigator.share).mockRejectedValueOnce(new DOMException('Canceled', 'AbortError'));
		expect(await shareWithSystem(data)).toBe('canceled');
		vi.mocked(navigator.share).mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
		expect(await shareWithSystem(data)).toBe('failed');
	});
});

describe('link copying', () => {
	test('does not report success until the clipboard confirms the write', async () => {
		let finish!: () => void;
		vi.mocked(navigator.clipboard.writeText).mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
		const result = vi.fn();
		const copying = copyShareLink(data.url).then(result);
		await Promise.resolve();
		expect(result).not.toHaveBeenCalled();
		finish();
		await copying;
		expect(result).toHaveBeenCalledWith(true);
		expect(document.execCommand).not.toHaveBeenCalled();
	});

	test('uses selection copying when clipboard permission is denied and restores focus', async () => {
		vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('Denied'));
		const button = document.createElement('button');
		document.body.appendChild(button);
		button.focus();
		expect(await copyShareLink(data.url)).toBe(true);
		expect(document.execCommand).toHaveBeenCalledWith('copy');
		expect(document.activeElement).toBe(button);
		expect(document.querySelector('textarea')).toBeNull();
		button.remove();
	});

	test('returns failure when neither clipboard method is available', async () => {
		Object.defineProperty(navigator, 'clipboard', { value: undefined });
		Object.defineProperty(document, 'execCommand', { value: undefined });
		expect(await copyShareLink(data.url)).toBe(false);
		expect(document.querySelector('textarea')).toBeNull();
	});

	test('treats a failed selection copy as a failure', async () => {
		Object.defineProperty(navigator, 'clipboard', { value: undefined });
		vi.mocked(document.execCommand).mockReturnValue(false);
		expect(await copyShareLink(data.url)).toBe(false);
	});
});

describe('note share content', () => {
	const note = {
		id: 'note', text: 'Body', cw: null, visibility: 'public',
		user: { username: 'author', name: 'Author' },
	} as Misskey.entities.Note;

	test('shares the displayed note when opening a pure renote', () => {
		const renote = { ...note, id: 'renote', renote: note, renoteId: note.id, text: null };
		expect(getNoteShareData(renote).url).toMatch(/\/notes\/note$/);
	});

	test('copies the requested renote link instead of the displayed original note', async () => {
		const renote = { ...note, id: 'renote', renote: note, renoteId: note.id, text: null };
		await copyNoteLink(renote);
		expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringMatching(/\/notes\/renote$/));
		expect(mocks.popup).not.toHaveBeenCalled();
		expect(mocks.toast).toHaveBeenCalledOnce();
	});

	test('preserves the requested renote URL in the clipboard failure fallback', async () => {
		vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('Denied'));
		vi.mocked(document.execCommand).mockReturnValue(false);
		const renote = { ...note, id: 'renote', renote: note, renoteId: note.id, text: null, visibility: 'followers' as const };
		await copyNoteLink(renote);
		expect(mocks.popup).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			url: expect.stringMatching(/\/notes\/renote$/), restricted: true,
		}), expect.anything());
		expect(mocks.toast).not.toHaveBeenCalled();
	});

	test('keeps content-warning text and hides the spoiler body', () => {
		expect(getNoteShareData({ ...note, cw: 'Spoiler' }).text).toBe('Spoiler');
	});

	test('does not reveal the body when a content warning is empty', () => {
		const shareData = getNoteShareData({ ...note, cw: '' });
		expect(shareData.text).toBe('');
		expect(getShareText(shareData)).not.toContain(note.text);
	});

	test.each(['followers', 'specified'] as const)('does not place %s content in external previews', visibility => {
		const shareData = getNoteShareData({ ...note, visibility, cw: 'Hidden warning' });
		expect(shareData).toMatchObject({ restricted: true, text: undefined });
		expect(getShareText(shareData)).not.toContain(note.text);
		for (const platform of sharePlatforms) {
			const values = [...new URL(getShareUrl(platform, shareData)).searchParams.values()].join('\n');
			expect(values).not.toContain(note.text);
			expect(values).not.toContain('Hidden warning');
		}
	});
});
