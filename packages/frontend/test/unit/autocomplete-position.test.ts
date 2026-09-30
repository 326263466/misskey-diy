/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick, ref } from 'vue';
import MkAutocomplete from '@/components/MkAutocomplete.vue';
import { Autocomplete } from '@/utility/autocomplete.js';

const mocks = vi.hoisted(() => ({
	popup: vi.fn(),
	caret: vi.fn(() => ({ left: 40, top: 60, height: 24 })),
}));

vi.mock('@/os.js', () => ({ popup: mocks.popup, claimZIndex: () => 100 }));
vi.mock('textarea-caret', () => ({ default: mocks.caret }));
vi.mock('@/store.js', () => ({ store: { s: { additionalUnicodeEmojiIndexes: {}, recentlyUsedEmojis: [] } } }));
vi.mock('@/custom-emojis.js', async () => ({ customEmojis: (await import('vue')).ref([]) }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn() }));
vi.mock('@/utility/get-user-avatar.js', () => ({ getUserAvatar: (user: unknown) => user }));

let scroller: HTMLDivElement;
let textarea: HTMLTextAreaElement;
let autocomplete: Autocomplete | undefined;

beforeEach(() => {
	vi.clearAllMocks();
	mocks.popup.mockReturnValue({ dispose: vi.fn() });
	mocks.caret.mockReturnValue({ left: 40, top: 60, height: 24 });
	vi.stubGlobal('innerWidth', 1000);
	vi.stubGlobal('innerHeight', 800);
	scroller = document.createElement('div');
	textarea = document.createElement('textarea');
	scroller.append(textarea);
	document.body.append(scroller);
});

afterEach(() => {
	autocomplete?.detach();
	autocomplete = undefined;
	cleanup();
	scroller.remove();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

test('keeps an open suggestion at the caret through ancestor scrolling, textarea scrolling and resize', async () => {
	let rect = new DOMRect(300, 200, 400, 120);
	textarea.getBoundingClientRect = () => rect;
	textarea.scrollLeft = 10;
	textarea.scrollTop = 20;
	textarea.value = ':sm';
	textarea.setSelectionRange(3, 3);
	autocomplete = new Autocomplete(textarea, ref(':sm'));
	await fireEvent.input(textarea);
	const props = vi.mocked(mocks.popup).mock.calls[0][1];
	expect([props.x.value, props.y.value]).toEqual([330, 240]);

	rect = new DOMRect(200, 100, 400, 120);
	await fireEvent.scroll(scroller);
	expect([props.x.value, props.y.value]).toEqual([230, 140]);

	textarea.scrollLeft = 25;
	textarea.scrollTop = 50;
	await fireEvent.scroll(textarea);
	expect([props.x.value, props.y.value]).toEqual([215, 110]);

	rect = new DOMRect(100, 80, 300, 120);
	mocks.caret.mockReturnValue({ left: 60, top: 80, height: 24 });
	await fireEvent.resize(window);
	expect([props.x.value, props.y.value]).toEqual([135, 110]);
	expect(mocks.popup).toHaveBeenCalledTimes(1);

	autocomplete.detach();
	autocomplete = undefined;
	mocks.caret.mockClear();
	await fireEvent.scroll(scroller);
	await fireEvent.resize(window);
	expect(mocks.caret).not.toHaveBeenCalled();
});

describe('autocomplete viewport placement', () => {
	beforeEach(() => {
		vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300);
		vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(190);
		vi.spyOn(window, 'getComputedStyle').mockReturnValue({ fontSize: '16px' } as CSSStyleDeclaration);
	});

	async function renderSuggestions(x: number, y: number) {
		const view = render(MkAutocomplete, {
			props: { type: 'mfmParam', q: { tag: 'x', params: [''] }, textarea, close: vi.fn(), x, y },
			global: { stubs: { MkUserName: true, MkCustomEmoji: true, MkEmoji: true } },
		});
		await nextTick();
		return view.container.firstElementChild as HTMLElement;
	}

	test('includes the gap below the caret when choosing which side fits', async () => {
		const panel = await renderSuggestions(400, 600);
		expect(panel.style.top).toBe('410px');
		expect(panel.style.marginTop).toBe('0px');
	});

	test.each([
		{ y: 180, top: '0px', margin: '0px', maxHeight: '180px' },
		{ y: 100, top: '100px', margin: 'calc(1em + 8px)', maxHeight: '176px' },
	])('uses the larger side and limits scrolling height when neither side fits at y=$y', async ({ y, top, margin, maxHeight }) => {
		vi.stubGlobal('innerHeight', 300);
		const panel = await renderSuggestions(400, y);
		expect(panel.style.top).toBe(top);
		expect(panel.style.marginTop).toBe(margin);
		expect(panel.style.getPropertyValue('--MI-autocomplete-max-height')).toBe(maxHeight);
	});

	test('restores the normal list height when the viewport grows', async () => {
		vi.stubGlobal('innerHeight', 300);
		const panel = await renderSuggestions(400, 180);
		vi.stubGlobal('innerHeight', 800);
		await fireEvent.resize(window);
		expect(panel.style.top).toBe('180px');
		expect(panel.style.marginTop).toBe('calc(1em + 8px)');
		expect(panel.style.getPropertyValue('--MI-autocomplete-max-height')).toBe('198px');
	});

	test('rechecks the viewport on resize even when the caret coordinates do not change', async () => {
		const panel = await renderSuggestions(900, 300);
		expect([panel.style.left, panel.style.top]).toEqual(['700px', '300px']);
		vi.stubGlobal('innerWidth', 600);
		vi.stubGlobal('innerHeight', 400);
		await fireEvent.resize(window);
		expect([panel.style.left, panel.style.top]).toEqual(['300px', '110px']);
	});
});
