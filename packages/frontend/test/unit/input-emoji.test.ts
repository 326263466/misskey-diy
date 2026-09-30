/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import MkInput from '@/components/MkInput.vue';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';

vi.mock('@/preferences.js', async () => {
	const { reactive } = await import('vue');
	return { prefer: { s: reactive({ emojiStyle: 'twemoji' }) } };
});
vi.mock('@/utility/emoji-mute.js', () => ({ checkMuted: () => ({ value: false }) }));
vi.mock('@/os.js', () => ({}));
vi.mock('@/utility/autocomplete.js', () => ({
	Autocomplete: class {
		detach() {}
	},
}));
vi.mock('@/components/MkButton.vue', () => ({
	default: { template: '<button type="button"><slot/></button>' },
}));

const preferences = prefer.s as { emojiStyle: 'twemoji' | 'fluentEmoji' | 'native' };
const global = { directives: { 'adaptive-border': () => {} } };

describe('MFM text inputs', () => {
	beforeEach(() => { preferences.emojiStyle = 'twemoji'; });
	afterEach(cleanup);

	test('renders emoji in the editor and saves the complete raw MFM value on demand', async () => {
		const onUpdate = vi.fn();
		const view = render(MkInput, {
			props: { modelValue: '昵称 🎉', mfmAutocomplete: ['emoji'], manualSave: true, 'onUpdate:modelValue': onUpdate },
			global,
		});
		await nextTick();
		const input = view.getByRole('combobox') as HTMLInputElement;
		expect(view.container.querySelector('img')?.getAttribute('src')).toBe('/twemoji/1f389.svg');
		const text = '**中文** 👍🏽 :custom: [link](https://example.com)';
		await fireEvent.update(input, text);
		expect(view.container.querySelector('[data-emoji-input-overlay]')?.textContent).toBe(`${text}\u200b`);
		expect(input.value).toBe(text);
		expect(onUpdate).not.toHaveBeenCalled();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.save }));
		expect(onUpdate).toHaveBeenCalledExactlyOnceWith(text);
	});

	test('switches artwork and native rendering without changing the selection or value', async () => {
		const view = render(MkInput, { props: { modelValue: 'hello 🎉 world', mfmAutocomplete: true }, global });
		await nextTick();
		const input = view.getByRole('combobox') as HTMLInputElement;
		input.setSelectionRange(6, 8, 'backward');
		preferences.emojiStyle = 'fluentEmoji';
		await nextTick();
		expect(view.container.querySelector('img')?.getAttribute('src')).toBe('/fluent-emoji/1f389.png');
		preferences.emojiStyle = 'native';
		await nextTick();
		expect(view.container.querySelector('[data-emoji-input-overlay]')).toBeNull();
		expect(input.className).not.toContain('maskedInput');
		expect(input.value).toBe('hello 🎉 world');
		expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([6, 8, 'backward']);
	});

	test('keeps composition text visible while only emitting the completed input', async () => {
		const onUpdate = vi.fn();
		const view = render(MkInput, {
			props: { modelValue: '🎉 ', mfmAutocomplete: true, 'onUpdate:modelValue': onUpdate },
			global,
		});
		await nextTick();
		const input = view.getByRole('combobox');
		await fireEvent.compositionStart(input);
		await fireEvent.input(input, { target: { value: '🎉 zhong' }, isComposing: true });
		expect(onUpdate).not.toHaveBeenCalled();
		expect(view.container.querySelector('[data-emoji-input-overlay]')?.textContent).toBe('🎉 zhong\u200b');
		await fireEvent.input(input, { target: { value: '🎉 中' }, isComposing: true });
		await fireEvent.compositionEnd(input);
		expect(onUpdate).toHaveBeenCalledExactlyOnceWith('🎉 中');
	});

	test('does not create a decorative copy of password fields even if MFM is requested', async () => {
		const view = render(MkInput, { props: { modelValue: 'secret🎉', type: 'password', mfmAutocomplete: true }, global });
		expect(view.container.querySelector('input')?.type).toBe('password');
		expect(view.container.querySelector('[data-emoji-input-overlay]')).toBeNull();
		expect(view.container.textContent).not.toContain('secret');
		await view.rerender({ type: 'text' });
		expect(view.container.querySelector('[data-emoji-input-overlay]')).not.toBeNull();
		await view.rerender({ type: 'password' });
		expect(view.container.querySelector('[data-emoji-input-overlay]')).toBeNull();
		expect(view.container.querySelector('input')?.className).not.toContain('maskedInput');
	});

	test('keeps plain text and numeric inputs on their existing native path', async () => {
		const plain = render(MkInput, { props: { modelValue: 'plain 🎉' }, global });
		expect(plain.container.querySelector('[data-emoji-input-overlay]')).toBeNull();
		plain.unmount();
		const onUpdate = vi.fn();
		const numeric = render(MkInput, {
			props: { modelValue: 42, type: 'number', mfmAutocomplete: true, 'onUpdate:modelValue': onUpdate },
			global,
		});
		await fireEvent.update(numeric.getByRole('spinbutton'), '123');
		expect(onUpdate).toHaveBeenCalledExactlyOnceWith(123);
		expect(numeric.container.querySelector('[data-emoji-input-overlay]')).toBeNull();
	});
});
