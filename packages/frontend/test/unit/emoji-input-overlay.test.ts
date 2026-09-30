/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick } from 'vue';
import MkEmojiInputOverlay from '@/components/MkEmojiInputOverlay.vue';
import { prefer } from '@/preferences.js';

vi.mock('@/preferences.js', async () => {
	const { reactive } = await import('vue');
	return { prefer: { s: reactive({ emojiStyle: 'twemoji' }) } };
});
vi.mock('@/utility/emoji-mute.js', () => ({ checkMuted: () => ({ value: true }) }));
vi.mock('@/os.js', () => ({}));

const preferences = prefer.s as { emojiStyle: 'twemoji' | 'fluentEmoji' | 'native' };
const parents: HTMLElement[] = [];

function renderOverlay(text: string, singleLine = false) {
	const parent = document.createElement('div');
	parent.style.position = 'relative';
	const input = document.createElement(singleLine ? 'input' : 'textarea');
	input.value = text;
	input.style.cssText = 'font: 16px Arial; line-height: 20px; padding: 4px 8px; color: rgb(40, 50, 60);';
	Object.defineProperties(input, {
		clientWidth: { configurable: true, value: 180 },
		clientHeight: { configurable: true, value: singleLine ? 32 : 80 },
		clientLeft: { configurable: true, value: 1 },
		clientTop: { configurable: true, value: 2 },
		offsetLeft: { configurable: true, value: 10 },
		offsetTop: { configurable: true, value: 12 },
	});
	const host = document.createElement('div');
	parent.append(input, host);
	document.body.append(parent);
	parents.push(parent);
	const view = render(MkEmojiInputOverlay, { container: host, props: { inputElement: input, text } });
	return { ...view, input, overlay: () => host.querySelector<HTMLElement>('[data-emoji-input-overlay]') };
}

describe('Emoji input overlay', () => {
	beforeEach(() => { preferences.emojiStyle = 'twemoji'; });
	afterEach(() => {
		cleanup();
		for (const parent of parents.splice(0)) parent.remove();
	});

	test('uses the actual emoji renderer while keeping raw text, selection and custom codes intact', () => {
		const text = '中文 deepseek 🎉 :custom: <b>原文</b>';
		const view = renderOverlay(text);
		view.input.setSelectionRange(3, 12, 'backward');
		expect(view.overlay()?.getAttribute('aria-hidden')).toBe('true');
		expect(view.overlay()?.textContent).toBe(`${text}\u200b`);
		expect(view.overlay()?.querySelector('img')?.getAttribute('src')).toBe('/twemoji/1f389.svg');
		expect(view.overlay()?.querySelector('b')).toBeNull();
		expect(view.input.value).toBe(text);
		expect([view.input.selectionStart, view.input.selectionEnd, view.input.selectionDirection]).toEqual([3, 12, 'backward']);
		expect(view.input.className).toContain('maskedInput');
	});

	test('preserves joined emoji, skin tones, flags and variation selectors as complete graphemes', () => {
		const emojis = ['👨‍👩‍👧‍👦', '👍🏽', '🇨🇳', '❤️', '1️⃣', '👩🏽‍🤝‍👨🏻', '👁️‍🗨️'];
		const view = renderOverlay(emojis.join(' '));
		expect(Array.from(view.overlay()!.querySelectorAll('img'), image => image.alt)).toEqual(emojis);
		expect(view.input.value).toBe(emojis.join(' '));
	});

	test('follows MFM text presentation rules instead of treating every picker entry as emoji', () => {
		const view = renderOverlay('© ® ™ ❤︎ ☑︎ ↔︎');
		expect(view.overlay()).toBeNull();
		expect(view.input.className).not.toContain('maskedInput');
	});

	test('switches styles immediately and restores the input for native emoji', async () => {
		const view = renderOverlay('🎉');
		preferences.emojiStyle = 'fluentEmoji';
		await nextTick();
		expect(view.overlay()?.querySelector('img')?.getAttribute('src')).toBe('/fluent-emoji/1f389.png');
		preferences.emojiStyle = 'native';
		await nextTick();
		expect(view.overlay()).toBeNull();
		expect(view.input.className).not.toContain('maskedInput');
		preferences.emojiStyle = 'twemoji';
		await nextTick();
		expect(view.overlay()?.querySelector('img')?.getAttribute('src')).toBe('/twemoji/1f389.svg');
		expect(view.input.value).toBe('🎉');
	});

	test('leaves plain text and explicitly disabled editors on the native path', async () => {
		const view = renderOverlay('plain :emoji:');
		expect(view.overlay()).toBeNull();
		expect(view.input.className).not.toContain('maskedInput');
		view.input.value = '🎉';
		await fireEvent.input(view.input);
		expect(view.overlay()?.querySelector('img')).toBeTruthy();
		await view.rerender({ disabled: true });
		expect(view.overlay()).toBeNull();
		expect(view.input.className).not.toContain('maskedInput');
		view.input.setSelectionRange(0, 2, 'backward');
		await view.rerender({ disabled: false });
		expect(view.overlay()?.querySelector('img')?.getAttribute('alt')).toBe('🎉');
		expect(view.input.className).toContain('maskedInput');
		expect(view.input.value).toBe('🎉');
		expect([view.input.selectionStart, view.input.selectionEnd, view.input.selectionDirection]).toEqual([0, 2, 'backward']);
	});

	test('reads the native composition value even when the model remains stale', async () => {
		const view = renderOverlay('🎉 old');
		await fireEvent.compositionStart(view.input);
		view.input.value = '🎉 zhong';
		view.input.setSelectionRange(8, 8);
		await fireEvent.input(view.input, { isComposing: true });
		expect(view.overlay()?.textContent).toBe('🎉 zhong\u200b');
		await view.rerender({ text: 'unrelated stale model update' });
		expect(view.input.value).toBe('🎉 zhong');
		expect(view.overlay()?.textContent).toBe('🎉 zhong\u200b');
		expect(view.input.selectionStart).toBe(8);
		view.input.value = '🎉 中';
		await fireEvent.compositionEnd(view.input);
		expect(view.overlay()?.textContent).toBe('🎉 中\u200b');
	});

	test('updates programmatic edits after the owning input has been patched', async () => {
		const view = renderOverlay('🎉');
		view.input.value = 'after ❤️\n';
		await view.rerender({ text: 'after ❤️\n' });
		expect(view.overlay()?.textContent).toBe('after ❤️\n\u200b');
		expect(view.overlay()?.querySelector('img')?.getAttribute('alt')).toBe('❤️');
		view.input.value = '';
		await view.rerender({ text: '' });
		expect(view.overlay()).toBeNull();
		expect(view.input.className).not.toContain('maskedInput');
	});

	test('uses the client area without scrollbar or border and follows native scrolling', async () => {
		const view = renderOverlay('🎉\n'.repeat(10));
		expect(view.overlay()?.style.left).toBe('11px');
		expect(view.overlay()?.style.top).toBe('14px');
		expect(view.overlay()?.style.width).toBe('180px');
		expect(view.overlay()?.style.height).toBe('80px');
		view.input.scrollTop = 40;
		view.input.scrollLeft = 12;
		await fireEvent.scroll(view.input);
		const mirror = view.overlay()!.firstElementChild as HTMLElement;
		expect(mirror.style.transform).toBe('translate(-12px, -40px)');
		expect(mirror.style.width).toBe('180px');
		expect(mirror.style.whiteSpace).toBe('pre-wrap');
	});

	test('centers single-line text and follows horizontal scrolling without wrapping', async () => {
		const view = renderOverlay('🎉 long text', true);
		const mirror = view.overlay()!.firstElementChild as HTMLElement;
		expect(mirror.style.whiteSpace).toBe('pre');
		expect(mirror.style.width).toBe('max-content');
		expect(mirror.style.paddingTop).toBe('4px');
		expect(view.overlay()?.style.display).toBe('flex');
		expect(view.overlay()?.style.alignItems).toBe('center');
		view.input.scrollLeft = 35;
		await fireEvent.scroll(view.input);
		expect(mirror.style.transform).toBe('translate(-35px, 0px)');
	});

	test('preserves CSS preformatted textarea lines and inherited word wrapping rules', async () => {
		const view = renderOverlay('a very long preformatted line 🎉 '.repeat(10));
		view.input.style.whiteSpace = 'pre';
		view.input.style.overflowWrap = 'anywhere';
		view.input.style.wordBreak = 'break-all';
		await fireEvent.input(view.input);
		const mirror = view.overlay()!.firstElementChild as HTMLElement;
		expect((view.input as HTMLTextAreaElement).wrap).not.toBe('off');
		expect(mirror.style.whiteSpace).toBe('pre');
		expect(mirror.style.overflowWrap).toBe('anywhere');
		expect(mirror.style.wordBreak).toBe('break-all');
	});

	test('uses the shared native fallback while retaining its original width and retrying after a style change', async () => {
		const view = renderOverlay('before 🎉 after');
		await fireEvent.error(view.overlay()!.querySelector('img')!);
		expect(view.overlay()?.querySelector('img')).toBeNull();
		expect(view.overlay()?.querySelector('[class*="glyph"]')?.textContent).toBe('🎉');
		expect(view.overlay()?.querySelector('span[alt="🎉"]')?.textContent).toBe('🎉');
		expect(view.input.value).toBe('before 🎉 after');
		preferences.emojiStyle = 'fluentEmoji';
		await nextTick();
		expect(view.overlay()?.querySelector('img')?.getAttribute('src')).toBe('/fluent-emoji/1f389.png');
	});

	test('restores masking after the parent replaces input classes and resizes with the input', async () => {
		const view = renderOverlay('🎉');
		view.input.className = 'parent-updated';
		Object.defineProperty(view.input, 'clientWidth', { configurable: true, value: 220 });
		await fireEvent(window, new Event('resize'));
		await waitFor(() => expect(view.input.className).toContain('maskedInput'));
		expect(view.input.className).toContain('parent-updated');
		expect(view.overlay()?.style.width).toBe('220px');
	});

	test('removes its native input class when the input is replaced or the overlay unmounts', async () => {
		const view = renderOverlay('🎉');
		const replacement = document.createElement('textarea');
		replacement.value = '❤️';
		view.input.parentElement!.append(replacement);
		await view.rerender({ inputElement: replacement, text: '❤️' });
		expect(view.input.className).not.toContain('maskedInput');
		expect(replacement.className).toContain('maskedInput');
		expect(view.overlay()?.querySelector('img')?.getAttribute('alt')).toBe('❤️');
		view.unmount();
		expect(replacement.className).not.toContain('maskedInput');
	});
});
