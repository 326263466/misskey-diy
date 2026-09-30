/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import { preferState } from '../setup.unit.js';
import MkBoostComposer from '@/components/MkBoostComposer.vue';
import { formatCjkText } from '@/utility/cjk-text-spacing.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	popup: vi.fn(),
	emit: vi.fn(),
	position: vi.fn(() => ({ top: 0, left: 0 })),
}));
vi.mock('@/i.js', () => ({ $i: { id: 'self', username: 'self' } }));
vi.mock('@/os.js', () => ({ claimZIndex: () => 1, popup: mocks.popup }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/composables/use-note-capture.js', () => ({ noteEvents: { emit: mocks.emit } }));
vi.mock('@/utility/popup-position.js', () => ({ calcPopupPosition: mocks.position }));
vi.mock('@/components/MkEmojiPickerDialog.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkMention.vue', () => ({ default: { template: '<span/>' } }));
vi.mock('@/components/MkLink.vue', () => ({ default: { template: '<a><slot/></a>' } }));
vi.mock('@/components/global/MkUrl.vue', () => ({ default: { template: '<a/>' } }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { template: '<a><slot/></a>' } }));
vi.mock('@/components/global/MkCustomEmoji.vue', () => ({ default: { template: '<img/>' } }));
vi.mock('@/components/MkCodeInline.vue', () => ({ default: { template: '<code/>' } }));
vi.mock('@/components/MkCode.vue', () => ({ default: { template: '<code/>' } }));
vi.mock('@/components/MkSparkle.vue', () => ({ default: { template: '<span><slot/></span>' } }));
vi.mock('@/components/MkGoogle.vue', () => ({ default: { template: '<span/>' } }));

function renderComposer() {
	const view = render(MkBoostComposer, {
		props: { note: { id: 'note', user: { username: 'author' }, reactionAcceptance: null } as Misskey.entities.Note },
		global: { stubs: { MkAvatar: true } },
	});
	return { ...view, input: view.getByRole('textbox') as HTMLInputElement };
}

async function edit(input: HTMLInputElement, value: string, caret = value.length) {
	input.value = value;
	input.setSelectionRange(caret, caret);
	await fireEvent.input(input);
}

describe('Boost mixed text spacing', () => {
	test.each([
		['中文ABC123中文', '中文\u2009ABC123\u2009中文'],
		['中😀文', '中\u2009😀\u2009文'],
		['中👨‍👩‍👧‍👦文', '中\u2009👨‍👩‍👧‍👦\u2009文'],
		['中:cat@example.com:文', '中\u2009:cat@example.com:\u2009文'],
		['ABC123😀中文', 'ABC123😀\u2009中文'],
		['纯中文，。ABC 123 😀', '纯中文，。ABC 123 😀'],
		['中 A 中\u2009😀', '中 A 中\u2009😀'],
	])('formats only Chinese boundaries in %s', (source, display) => {
		expect(formatCjkText(source).text).toBe(display);
	});

	beforeEach(() => {
		vi.clearAllMocks();
		preferState.emojiStyle = 'twemoji';
		mocks.api.mockResolvedValue(undefined);
		mocks.popup.mockReturnValue({ dispose: vi.fn() });
	});
	afterEach(() => {
		cleanup();
		delete preferState.emojiStyle;
	});

	test('positions against its containing note and keeps the left alignment preference', async () => {
		const anchorElement = document.createElement('button');
		const boundaryElement = document.createElement('div');
		render(MkBoostComposer, {
			props: { note: { id: 'note', user: { username: 'author' } } as Misskey.entities.Note, anchorElement, boundaryElement },
			global: { stubs: { MkAvatar: true } },
		});
		await nextTick();
		expect(mocks.position).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ anchorElement, boundaryElement, align: 'left' }));
	});

	test('renders the selected emoji style inside the editor without an extra preview', async () => {
		const view = renderComposer();
		await edit(view.input, '中文😀');
		const overlay = view.input.parentElement!.querySelector('[data-emoji-input-overlay]')!;
		expect(overlay.textContent).toContain('中文\u2009😀');
		expect(overlay.querySelector('img')?.getAttribute('src')).toBe('/twemoji/1f600.svg');
		expect(view.queryByRole('region', { name: i18n.ts.preview })).toBeNull();
		await edit(view.input, '');
		expect(view.container.querySelector('[data-emoji-input-overlay] img')).toBeNull();
	});

	test('displays boundary spaces while submitting the original content', async () => {
		const view = renderComposer();
		await edit(view.input, '中文A1😀中文');
		expect(view.input.value).toBe('中文\u2009A1😀\u2009中文');
		await fireEvent.submit(view.input.form!);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('notes/reactions/create', { noteId: 'note', reaction: 'text:中文A1😀中文' }));
	});

	test('shows live IME composition in the editor while preserving the committed raw draft', async () => {
		const view = renderComposer();
		await edit(view.input, '中😀A');
		await fireEvent.compositionStart(view.input);
		await fireEvent.input(view.input, { target: { value: '中\u2009😀A文' }, isComposing: true });
		expect(view.input.value).toBe('中\u2009😀A文');
		expect(view.container.querySelector('[data-emoji-input-overlay]')?.textContent).toContain('中\u2009😀A文');
		await fireEvent.compositionEnd(view.input);
		expect(view.input.value).toBe('中\u2009😀A\u2009文');
		expect(view.container.querySelector('[data-emoji-input-overlay]')?.textContent).toContain('中\u2009😀A\u2009文');
		await fireEvent.submit(view.input.form!);
		expect(mocks.api).toHaveBeenCalledWith('notes/reactions/create', { noteId: 'note', reaction: 'text:中😀A文' });
	});

	test('keeps editing positions when adding text at the start, middle and end', async () => {
		const view = renderComposer();
		await edit(view.input, '中A文');
		await edit(view.input, `B${view.input.value}`, 1);
		expect(view.input.value).toBe('B\u2009中\u2009A\u2009文');
		expect(view.input.selectionStart).toBe(1);
		await edit(view.input, 'B\u2009中\u2009A2\u2009文', 6);
		expect(view.input.value).toBe('B\u2009中\u2009A2\u2009文');
		expect(view.input.selectionStart).toBe(6);
		await edit(view.input, `${view.input.value}😀`);
		expect(view.input.value).toBe('B\u2009中\u2009A2\u2009文\u2009😀');
		await fireEvent.submit(view.input.form!);
		expect(mocks.api).toHaveBeenCalledWith('notes/reactions/create', { noteId: 'note', reaction: 'text:B中A2文😀' });
	});

	test('deleting a generated gap lets the next backspace reach the preceding character', async () => {
		const view = renderComposer();
		await edit(view.input, '中A');
		await edit(view.input, '中A', 1);
		expect(view.input.value).toBe('中\u2009A');
		expect(view.input.selectionStart).toBe(1);
		await edit(view.input, '\u2009A', 0);
		expect(view.input.value).toBe('A');
		expect(view.input.selectionStart).toBe(0);
	});

	test('preserves user-entered spaces and replacement selections', async () => {
		const view = renderComposer();
		await edit(view.input, '中A文');
		await edit(view.input, '中\u2009 A\u2009文', 3);
		expect(view.input.value).toBe('中 A\u2009文');
		await edit(view.input, '中 \u2009B\u2009文', 4);
		await fireEvent.submit(view.input.form!);
		expect(mocks.api).toHaveBeenCalledWith('notes/reactions/create', { noteId: 'note', reaction: 'text:中 \u2009B文' });
	});

	test('forward Delete can move past a generated gap and delete the next character', async () => {
		const view = renderComposer();
		await edit(view.input, '中AB');
		view.input.value = '中AB';
		view.input.setSelectionRange(1, 1);
		await fireEvent.input(view.input, { inputType: 'deleteContentForward' });
		expect(view.input.value).toBe('中\u2009AB');
		expect(view.input.selectionStart).toBe(2);
		view.input.value = '中\u2009B';
		view.input.setSelectionRange(2, 2);
		await fireEvent.input(view.input, { inputType: 'deleteContentForward' });
		expect(view.input.value).toBe('中\u2009B');
		expect(view.input.selectionStart).toBe(2);
		await fireEvent.submit(view.input.form!);
		expect(mocks.api).toHaveBeenCalledWith('notes/reactions/create', { noteId: 'note', reaction: 'text:中B' });
	});

	test('leaves IME composition untouched until committed', async () => {
		const view = renderComposer();
		await edit(view.input, 'A');
		await fireEvent.compositionStart(view.input);
		await edit(view.input, 'Azhong');
		expect(view.input.value).toBe('Azhong');
		view.input.value = 'A中';
		view.input.setSelectionRange(2, 2);
		await fireEvent.compositionEnd(view.input);
		expect(view.input.value).toBe('A\u2009中');
		expect(view.input.selectionStart).toBe(3);
		await fireEvent.submit(view.input.form!);
		expect(mocks.api).toHaveBeenCalledWith('notes/reactions/create', { noteId: 'note', reaction: 'text:A中' });
	});

	test('copies original text so pasting it does not turn display gaps into content', async () => {
		const view = renderComposer();
		await edit(view.input, '中A');
		view.input.setSelectionRange(0, view.input.value.length);
		const clipboardData = { setData: vi.fn() };
		await fireEvent.copy(view.input, { clipboardData });
		expect(clipboardData.setData).toHaveBeenCalledWith('text/plain', '中A');
		await edit(view.input, `${view.input.value}${clipboardData.setData.mock.calls[0][1]}`);
		await fireEvent.submit(view.input.form!);
		expect(mocks.api).toHaveBeenCalledWith('notes/reactions/create', { noteId: 'note', reaction: 'text:中A中A' });
	});

	test('cuts a selection using original offsets and keeps the next caret position', async () => {
		const view = renderComposer();
		await edit(view.input, '中ABC文');
		view.input.setSelectionRange(2, 5);
		const clipboardData = { setData: vi.fn() };
		await fireEvent.cut(view.input, { clipboardData });
		expect(clipboardData.setData).toHaveBeenCalledWith('text/plain', 'ABC');
		expect(view.input.value).toBe('中文');
		expect(view.input.selectionStart).toBe(1);
		await fireEvent.submit(view.input.form!);
		expect(mocks.api).toHaveBeenCalledWith('notes/reactions/create', { noteId: 'note', reaction: 'text:中文' });
	});

	test('maps the emoji picker selection back to the original text', async () => {
		const view = renderComposer();
		await edit(view.input, '中A文');
		view.input.setSelectionRange(2, 3);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.emoji }));
		const events = mocks.popup.mock.calls[0][2];
		events.done('😀');
		await events.closed();
		await nextTick();
		expect(view.input.value).toBe('中\u2009😀\u2009文');
		expect(view.input.selectionStart).toBe(4);
		await fireEvent.submit(view.input.form!);
		expect(mocks.api).toHaveBeenCalledWith('notes/reactions/create', { noteId: 'note', reaction: 'text:中😀文' });
	});

	test('counts original graphemes rather than generated gaps', async () => {
		const view = renderComposer();
		await edit(view.input, `${'中A'.repeat(8)}😀`);
		expect(view.input.value).toBe(formatCjkText('中A'.repeat(8)).text);
		await fireEvent.submit(view.input.form!);
		expect(mocks.api).toHaveBeenCalledWith('notes/reactions/create', { noteId: 'note', reaction: `text:${'中A'.repeat(8)}` });
	});
});
