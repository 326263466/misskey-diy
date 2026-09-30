/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick, reactive } from 'vue';
import type { App } from 'vue';
import MkEmojiInputOverlay from '@/components/MkEmojiInputOverlay.vue';
import MkEmoji from '@/components/global/MkEmoji.vue';
import { prefer } from '@/preferences.js';

vi.mock('@/preferences.js', async () => {
	const { reactive } = await import('vue');
	return { prefer: { s: reactive({ emojiStyle: 'twemoji' }) } };
});
vi.mock('@/utility/emoji-mute.js', async () => {
	const { ref } = await import('vue');
	return { checkMuted: () => ref(false), mute: vi.fn(), unmute: vi.fn() };
});
vi.mock('@/os.js', () => ({ confirm: vi.fn(), popupMenu: vi.fn() }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {}, tsx: {} } }));
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: vi.fn() }));
vi.mock('@/utility/emoji-palette.js', () => ({ addToEmojiPalette: vi.fn() }));

const preferences = prefer.s as { emojiStyle: 'twemoji' | 'fluentEmoji' | 'native' };
const fixtures: { app: App; host: HTMLElement }[] = [];

async function settleLayout() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
}

async function mountEditor(value: string, options: { width?: number; height?: number; wrap?: 'soft' | 'off'; input?: boolean } = {}) {
	const host = document.createElement('div');
	host.style.cssText = 'position:relative;width:fit-content;margin:24px;background:white;color:#555;';
	document.body.append(host);
	const input = document.createElement(options.input ? 'input' : 'textarea');
	input.setAttribute('aria-label', 'Emoji editor');
	input.style.cssText = `display:block;box-sizing:border-box;width:${options.width ?? 300}px;height:${options.height ?? 120}px;border:3px solid #bbb;padding:11px 17px;font:20px/30px Arial,"Microsoft YaHei",sans-serif;letter-spacing:0.3px;word-spacing:0.5px;color:#555;resize:none;`;
	if (input instanceof HTMLTextAreaElement) input.wrap = options.wrap ?? 'soft';
	input.value = value;
	host.append(input);
	const mount = document.createElement('div');
	host.append(mount);
	const state = reactive({ text: value, disabled: false });
	const app = createApp({
		render: () => h(MkEmojiInputOverlay, { inputElement: input, text: state.text, disabled: state.disabled }),
	});
	app.mount(mount);
	fixtures.push({ app, host });
	await settleLayout();
	return {
		host, input, state,
		viewport: () => host.querySelector<HTMLElement>('[data-emoji-input-overlay]')!,
		mirror: () => host.querySelector<HTMLElement>('[data-emoji-input-overlay] > div')!,
	};
}

function glyphRects(element: HTMLElement, originElement: HTMLElement = element) {
	const origin = originElement.getBoundingClientRect();
	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
	const rects: { text: string; x: number; y: number; width: number; height: number }[] = [];
	const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		// Native fallback artwork is absolutely positioned; the hidden source
		// glyph remains the only text that participates in the editor's layout.
		if (node.parentElement?.closest('span[alt]')) continue;
		for (const { segment, index } of segmenter.segment(node.textContent ?? '')) {
			if (segment === '\u200b') continue;
			const range = document.createRange();
			range.setStart(node, index);
			range.setEnd(node, index + segment.length);
			const rect = range.getBoundingClientRect();
			rects.push({ text: segment, x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height });
		}
	}
	return rects;
}

function plainTextReference(input: HTMLTextAreaElement | HTMLInputElement, text: string) {
	const reference = document.createElement('div');
	const style = getComputedStyle(input);
	// Independently reproduce a textarea's formatting context, with no spans or
	// replacement images. Range measurements catch wrapping changed by markup.
	for (const property of ['font', 'font-family', 'font-size', 'line-height', 'letter-spacing', 'word-spacing', 'padding', 'text-align', 'text-autospace', 'word-break', 'overflow-wrap', 'tab-size', 'direction', 'unicode-bidi']) {
		reference.style.setProperty(property, style.getPropertyValue(property));
	}
	reference.style.cssText += `position:absolute;left:0;top:200px;box-sizing:border-box;width:${input.clientWidth}px;white-space:pre-wrap;visibility:hidden;`;
	reference.textContent = text + '\u200b';
	input.parentElement!.append(reference);
	return reference;
}

beforeEach(() => {
	preferences.emojiStyle = 'twemoji';
});

afterEach(() => {
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
});

describe('emoji input overlay in a real browser', () => {
	test.each([
		'管理员测试deepseek帖子🎉中文🙂内容',
		'Latin wrapping 🎉 with emoji🙂near the line boundary',
		'🎉🙂🥳🎉🙂🥳🎉🙂🥳🎉🙂🥳',
	])('preserves native glyph widths and wrapping for %s', async value => {
		const editor = await mountEditor(value);
		for (const width of [141, 160, 179, 198, 217, 236]) {
			editor.input.style.width = `${width}px`;
			window.dispatchEvent(new Event('resize'));
			await settleLayout();
			const reference = plainTextReference(editor.input, value);
			const actual = glyphRects(editor.mirror());
			const expected = glyphRects(reference);
			expect(actual.map(rect => rect.text)).toEqual(expected.map(rect => rect.text));
			for (let index = 0; index < expected.length; index++) {
				for (const property of ['x', 'y', 'width', 'height'] as const) {
					expect(actual[index][property], `width ${width}, character ${index} ${expected[index].text}, ${property}`).toBeCloseTo(expected[index][property], 1);
				}
			}
			expect(reference.offsetHeight).toBe(editor.mirror().offsetHeight);
			expect(editor.input.scrollHeight).toBe(Math.max(editor.input.clientHeight, reference.offsetHeight));
			reference.remove();
		}
	});

	test('copies the input font, padding, viewport and vertical scrolling', async () => {
		const editor = await mountEditor('中文 Latin 🎉\n'.repeat(20));
		const inputStyle = getComputedStyle(editor.input);
		const mirrorStyle = getComputedStyle(editor.mirror());
		for (const property of ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'wordSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const) {
			expect(mirrorStyle[property]).toBe(inputStyle[property]);
		}
		expect(editor.viewport().clientWidth).toBe(editor.input.clientWidth);
		expect(editor.viewport().clientHeight).toBe(editor.input.clientHeight);
		expect(editor.viewport().offsetLeft).toBe(editor.input.offsetLeft + editor.input.clientLeft);
		expect(editor.viewport().offsetTop).toBe(editor.input.offsetTop + editor.input.clientTop);
		editor.input.scrollTop = 74;
		editor.input.dispatchEvent(new Event('scroll'));
		await settleLayout();
		expect(editor.input.scrollTop).toBeGreaterThan(0);
		expect(new DOMMatrix(getComputedStyle(editor.mirror()).transform).m42).toBe(-editor.input.scrollTop);
		editor.input.style.fontSize = '24px';
		editor.input.style.padding = '4px 9px';
		await settleLayout();
		expect(getComputedStyle(editor.mirror()).fontSize).toBe('24px');
		expect(getComputedStyle(editor.mirror()).padding).toBe('4px 9px');
	});

	test('respects CSS preformatted text without requiring the wrap attribute', async () => {
		const value = '中文 Latin 🎉🙂 '.repeat(20);
		const editor = await mountEditor(value);
		editor.input.style.whiteSpace = 'pre';
		await settleLayout();
		expect((editor.input as HTMLTextAreaElement).wrap).toBe('soft');
		expect(getComputedStyle(editor.mirror()).whiteSpace).toBe('pre');
		const reference = plainTextReference(editor.input, value);
		reference.style.whiteSpace = 'pre';
		const actual = glyphRects(editor.mirror());
		const expected = glyphRects(reference);
		for (let index = 0; index < expected.length; index++) {
			expect(actual[index].y).toBeCloseTo(expected[index].y, 1);
		}
		expect(editor.input.scrollHeight).toBe(editor.input.clientHeight);
		editor.input.scrollLeft = 145;
		editor.input.dispatchEvent(new Event('scroll'));
		await settleLayout();
		expect(editor.input.scrollLeft).toBeGreaterThan(0);
		expect(new DOMMatrix(getComputedStyle(editor.mirror()).transform).m41).toBe(-editor.input.scrollLeft);
	});

	test('preserves CJK and Latin spacing when text-autospace is enabled', async () => {
		const value = '中文Latin🎉间隔 mixed🙂中文 mixed 🎉';
		const editor = await mountEditor(value, { width: 210 });
		editor.input.style.setProperty('text-autospace', 'normal');
		await settleLayout();
		expect(getComputedStyle(editor.mirror()).getPropertyValue('text-autospace')).toBe(getComputedStyle(editor.input).getPropertyValue('text-autospace'));
		const reference = plainTextReference(editor.input, value);
		const actual = glyphRects(editor.mirror());
		const expected = glyphRects(reference);
		for (let index = 0; index < expected.length; index++) {
			expect(actual[index].x).toBeCloseTo(expected[index].x, 1);
			expect(actual[index].y).toBeCloseTo(expected[index].y, 1);
		}
	});

	test('centers single-line input glyphs and follows its horizontal scroll', async () => {
		const value = '编辑 🎉 Latin 🙂'.repeat(12);
		const editor = await mountEditor(value, { input: true, height: 52 });
		const reference = plainTextReference(editor.input, value);
		reference.textContent = '';
		const line = document.createElement('div');
		line.textContent = value;
		reference.append(line);
		reference.style.height = `${editor.input.clientHeight}px`;
		reference.style.display = 'flex';
		reference.style.alignItems = 'center';
		reference.style.whiteSpace = 'pre';
		const expected = glyphRects(reference);
		const actual = glyphRects(editor.mirror(), editor.viewport());
		for (let index = 0; index < expected.length; index++) {
			expect(actual[index].y).toBeCloseTo(expected[index].y, 1);
			expect(actual[index].width).toBeCloseTo(expected[index].width, 1);
		}
		editor.input.scrollLeft = 99;
		editor.input.dispatchEvent(new Event('scroll'));
		await settleLayout();
		expect(editor.input.scrollLeft).toBeGreaterThan(0);
		expect(new DOMMatrix(getComputedStyle(editor.mirror()).transform).m41).toBe(-editor.input.scrollLeft);
	});

	test('tracks horizontal scrolling without changing value, selection or caret color', async () => {
		const value = 'Latin🎉中文🙂'.repeat(25);
		const editor = await mountEditor(value, { wrap: 'off' });
		editor.input.focus();
		editor.input.setSelectionRange(4, 10, 'backward');
		editor.input.scrollLeft = 112;
		editor.input.dispatchEvent(new Event('scroll'));
		await settleLayout();
		expect(editor.input.scrollLeft).toBeGreaterThan(0);
		expect(new DOMMatrix(getComputedStyle(editor.mirror()).transform).m41).toBe(-editor.input.scrollLeft);
		expect(editor.input.value).toBe(value);
		expect([editor.input.selectionStart, editor.input.selectionEnd, editor.input.selectionDirection]).toEqual([4, 10, 'backward']);
		expect(document.activeElement).toBe(editor.input);
		expect(getComputedStyle(editor.input).caretColor).toBe(getComputedStyle(editor.input).color);
		expect(getComputedStyle(editor.viewport()).pointerEvents).toBe('none');
	});

	test('keeps right-to-left single-line text anchored to the native starting edge', async () => {
		const editor = await mountEditor('אבג 🎉 דהוז חטי כלמ נסע פצק רשת '.repeat(6), { input: true, height: 52 });
		editor.input.dir = 'rtl';
		await settleLayout();
		const first = glyphRects(editor.mirror())[0];
		const mirrorBounds = editor.mirror().getBoundingClientRect();
		const viewportBounds = editor.viewport().getBoundingClientRect();
		const expectedRight = viewportBounds.right - Number.parseFloat(getComputedStyle(editor.input).paddingRight);
		expect(mirrorBounds.left + first.x + first.width).toBeCloseTo(expectedRight, 1);
		editor.input.scrollLeft = -120;
		editor.input.dispatchEvent(new Event('scroll'));
		await settleLayout();
		expect(editor.input.scrollLeft).toBeLessThan(0);
		expect(new DOMMatrix(getComputedStyle(editor.mirror()).transform).m41).toBe(-editor.input.scrollLeft);
	});

	test('centers a single-line input with normal line height using its actual font metrics', async () => {
		const value = 'Latin 🎉';
		const editor = await mountEditor(value, { input: true, height: 52 });
		editor.input.style.lineHeight = 'normal';
		await settleLayout();
		const reference = plainTextReference(editor.input, value);
		reference.textContent = '';
		const line = document.createElement('div');
		line.textContent = value;
		reference.append(line);
		reference.style.height = `${editor.input.clientHeight}px`;
		reference.style.display = 'flex';
		reference.style.alignItems = 'center';
		reference.style.whiteSpace = 'pre';
		const expected = glyphRects(reference);
		const actual = glyphRects(editor.mirror(), editor.viewport());
		for (let index = 0; index < expected.length; index++) {
			expect(actual[index].y).toBeCloseTo(expected[index].y, 1);
		}
	});

	test('keeps bidirectional multiline text aligned after wrapping and scrolling', async () => {
		const value = 'אבג 🎉 דהוז Latin 🙂 حروف عربية\n'.repeat(12);
		const editor = await mountEditor(value, { width: 230 });
		editor.input.dir = 'rtl';
		await settleLayout();
		const reference = plainTextReference(editor.input, value);
		const expected = glyphRects(reference);
		const actual = glyphRects(editor.mirror());
		for (let index = 0; index < expected.length; index++) {
			for (const property of ['x', 'y', 'width', 'height'] as const) {
				expect(actual[index][property], `character ${index} ${expected[index].text}, ${property}`).toBeCloseTo(expected[index][property], 1);
			}
		}
		editor.input.scrollTop = 98;
		editor.input.dispatchEvent(new Event('scroll'));
		await settleLayout();
		expect(new DOMMatrix(getComputedStyle(editor.mirror()).transform).m42).toBe(-editor.input.scrollTop);
	});

	test('reads the DOM composition value before v-model commits it', async () => {
		const editor = await mountEditor('编辑🎉');
		editor.input.focus();
		editor.input.dispatchEvent(new CompositionEvent('compositionstart'));
		editor.input.value = '编辑🎉zhong中文';
		editor.input.setSelectionRange(8, 8);
		editor.input.dispatchEvent(new InputEvent('input', { data: '中文', inputType: 'insertCompositionText', isComposing: true }));
		editor.input.dispatchEvent(new CompositionEvent('compositionupdate', { data: '中文' }));
		await settleLayout();
		expect(editor.state.text).toBe('编辑🎉');
		expect(editor.mirror().textContent).toBe(editor.input.value + '\u200b');
		expect(editor.input.selectionStart).toBe(8);
		expect(editor.input.selectionEnd).toBe(8);
		editor.input.dispatchEvent(new CompositionEvent('compositionend', { data: '中文' }));
		await settleLayout();
		expect(editor.input.value).toBe('编辑🎉zhong中文');
	});

	test.each(['❤', '🎉'])('keeps source geometry and selection when %s falls back to native artwork', async emoji => {
		const value = `Latin ${emoji} 中文 `.repeat(8);
		const editor = await mountEditor(value, { width: 230 });
		editor.input.setSelectionRange(6, 6 + emoji.length, 'backward');
		const expected = glyphRects(editor.mirror());
		const height = editor.mirror().offsetHeight;
		for (const img of editor.mirror().querySelectorAll('img')) img.dispatchEvent(new Event('error'));
		await settleLayout();
		expect(editor.mirror().querySelectorAll('img')).toHaveLength(0);
		expect(glyphRects(editor.mirror())).toEqual(expected);
		expect(editor.mirror().offsetHeight).toBe(height);
		expect(editor.input.value).toBe(value);
		expect([editor.input.selectionStart, editor.input.selectionEnd, editor.input.selectionDirection]).toEqual([6, 6 + emoji.length, 'backward']);
		for (const fallback of editor.mirror().querySelectorAll<HTMLElement>('span[alt]')) {
			const slot = fallback.parentElement!.getBoundingClientRect();
			const artwork = fallback.getBoundingClientRect();
			const sourceRange = document.createRange();
			sourceRange.selectNodeContents(fallback.previousElementSibling!);
			const artworkRange = document.createRange();
			artworkRange.selectNodeContents(fallback);
			expect(artwork.left).toBeCloseTo(slot.left, 1);
			expect(artwork.width).toBeLessThanOrEqual(slot.width + 0.1);
			expect(artworkRange.getBoundingClientRect().top).toBeCloseTo(sourceRange.getBoundingClientRect().top, 1);
			expect(artworkRange.getBoundingClientRect().width).toBeCloseTo(sourceRange.getBoundingClientRect().width, 1);
		}
		await page.screenshot({ element: editor.host, path: `../e2e/artifacts/component-browser/emoji-input-native-fallback-${emoji === '❤' ? 'heart' : 'party'}.png` });
	});

	test('does not force native plain-text editors through layout reads', async () => {
		const editor = await mountEditor('plain text');
		await settleLayout();
		const computedStyle = vi.spyOn(window, 'getComputedStyle');
		try {
			editor.input.value += ' typed';
			editor.input.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ' typed' }));
			await settleLayout();
			expect(computedStyle.mock.calls.filter(([element]) => element === editor.input)).toHaveLength(0);
			expect(editor.viewport()).toBeNull();
		} finally {
			computedStyle.mockRestore();
		}
	});

	test('uses the same loaded artwork as MkEmoji and restores native rendering when selected', async () => {
		const editor = await mountEditor('管理员测试 deepseek 帖子 🎉 🙂 ❤️', { width: 530, height: 120 });
		const palette = document.createElement('div');
		palette.style.cssText = 'font:36px/60px Arial;padding:12px;display:flex;gap:14px;';
		editor.host.append(palette);
		const paletteApp = createApp({ render: () => ['🎉', '🙂', '❤️'].map(emoji => h(MkEmoji, { emoji })) });
		paletteApp.mount(palette);
		fixtures.push({ app: paletteApp, host: palette });
		for (const style of ['twemoji', 'fluentEmoji'] as const) {
			preferences.emojiStyle = style;
			await settleLayout();
			const images = [...editor.mirror().querySelectorAll('img')];
			expect(images).toHaveLength(3);
			for (let index = 0; index < images.length; index++) {
				await expect.poll(() => images[index].complete && images[index].naturalWidth > 0, { timeout: 5000 }).toBe(true);
				expect(images[index].src).toBe(palette.querySelectorAll('img')[index].src);
				expect(images[index].getAttribute('src')).toContain(style === 'twemoji' ? '/twemoji/' : '/fluent-emoji/');
			}
			await page.screenshot({ element: editor.host, path: `../e2e/artifacts/component-browser/emoji-input-${style}.png` });
		}
		preferences.emojiStyle = 'native';
		await settleLayout();
		expect(editor.viewport()).toBeNull();
		expect(getComputedStyle(editor.input).webkitTextFillColor).toBe(getComputedStyle(editor.input).color);
		expect(editor.input.value).toBe('管理员测试 deepseek 帖子 🎉 🙂 ❤️');
	});
});
