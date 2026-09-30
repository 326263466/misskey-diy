/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import MkTextarea from '@/components/MkTextarea.vue';
import Mfm from '@/components/global/MkMfm.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: vi.fn() }));
vi.mock('@/components/MkButton.vue', () => ({
	default: { template: '<button type="button"><slot/></button>' },
}));
vi.mock('@/preferences.js', async () => {
	const { reactive } = await import('vue');
	return { prefer: { s: reactive({ emojiStyle: 'twemoji' }) } };
});
vi.mock('@/utility/emoji-mute.js', () => ({ checkMuted: () => ({ value: false }) }));
vi.mock('@/os.js', () => ({}));

function renderTextarea(props: { modelValue?: string; collapsible?: boolean; disabled?: boolean; manualSave?: boolean; code?: boolean; collapsedPlaceholder?: string } = {}, realMfm = false) {
	const onUpdate = vi.fn();
	return {
		...render(MkTextarea, {
			props: {
				modelValue: '',
				manualSave: true,
				collapsible: true,
				collapsedPlaceholder: 'Add note',
				'onUpdate:modelValue': onUpdate,
				...props,
			},
			slots: { label: 'Note', caption: 'Only moderators can read this note.' },
			global: {
				directives: { 'adaptive-border': () => {}, panel: () => {} },
				components: realMfm ? { Mfm } : {},
				stubs: realMfm ? {} : { Mfm: { props: ['text'], template: '<span>{{ text }}</span>' } },
			},
		}),
		onUpdate,
	};
}

describe('collapsible textareas', () => {
	afterEach(cleanup);

	test('collapses an empty editor on an outside click', async () => {
		const view = renderTextarea();
		expect(view.queryByRole('textbox')).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: 'Add note' }));
		expect(view.getByLabelText('Note')).toBe(document.activeElement);
		await fireEvent.pointerDown(document.body);
		expect(view.queryByRole('textbox')).toBeNull();
		expect(view.getByRole('button', { name: 'Add note' })).toBeTruthy();
		expect(view.onUpdate).not.toHaveBeenCalled();
	});

	test('keeps the editor open when removing the focused toggle emits focusout', async () => {
		const view = renderTextarea();
		const toggle = view.getByRole('button', { name: 'Add note' });
		toggle.focus();
		const clicking = fireEvent.click(toggle);
		await fireEvent.focusOut(toggle, { relatedTarget: null });
		await clicking;
		expect(view.getByRole('textbox')).toBe(document.activeElement);
		expect(view.onUpdate).not.toHaveBeenCalled();
	});

	test.each(['Edited note\nSecond line', ''])('automatically saves a changed value "%s" only once when leaving', async value => {
		const view = renderTextarea({ modelValue: 'Saved note' });
		await fireEvent.click(view.getByRole('button', { name: 'Saved note' }));
		const textarea = view.getByRole('textbox');
		await fireEvent.update(textarea, value);
		await fireEvent.pointerDown(document.body);
		await fireEvent.focusOut(textarea, { relatedTarget: document.body });
		expect(view.queryByRole('textbox')).toBeNull();
		expect(view.onUpdate).toHaveBeenCalledExactlyOnceWith(value);
		expect(view.queryByRole('button', { name: i18n.ts.save })).toBeNull();
		await fireEvent.click(view.getByRole('button'));
		expect((view.getByRole('textbox') as HTMLTextAreaElement).value).toBe(value);
		await fireEvent.focusOut(view.getByRole('textbox'), { relatedTarget: document.body });
		expect(view.onUpdate).toHaveBeenCalledExactlyOnceWith(value);
	});

	test.each([false, true])('does not save unchanged content after editing and reverting=%s', async reverted => {
		const view = renderTextarea({ modelValue: 'Saved note' });
		await fireEvent.click(view.getByRole('button', { name: 'Saved note' }));
		if (reverted) {
			await fireEvent.update(view.getByRole('textbox'), 'Different note');
			await fireEvent.update(view.getByRole('textbox'), 'Saved note');
		}
		await fireEvent.focusOut(view.getByRole('textbox'), { relatedTarget: document.body });
		expect(view.queryByRole('textbox')).toBeNull();
		expect(view.onUpdate).not.toHaveBeenCalled();
		expect(view.queryByRole('button', { name: i18n.ts.save })).toBeNull();
	});

	test('keeps internal clicks and focus changes working until the save button is clicked', async () => {
		const view = renderTextarea();
		await fireEvent.click(view.getByRole('button', { name: 'Add note' }));
		await fireEvent.update(view.getByRole('textbox'), 'Draft');
		const save = view.getByRole('button', { name: i18n.ts.save });
		await fireEvent.pointerDown(save);
		await fireEvent.focusOut(view.getByRole('textbox'), { relatedTarget: save });
		expect(view.getByRole('textbox')).toBeTruthy();
		expect(view.onUpdate).not.toHaveBeenCalled();
		await fireEvent.click(save);
		expect(view.onUpdate).toHaveBeenCalledExactlyOnceWith('Draft');
		expect(view.queryByRole('textbox')).toBeNull();
	});

	test('automatically saves when keyboard focus leaves the save button', async () => {
		const view = renderTextarea();
		await fireEvent.click(view.getByRole('button', { name: 'Add note' }));
		await fireEvent.update(view.getByRole('textbox'), 'Draft');
		const save = view.getByRole('button', { name: i18n.ts.save });
		await fireEvent.focusOut(view.getByRole('textbox'), { relatedTarget: save });
		await fireEvent.focusOut(save, { relatedTarget: document.body });
		expect(view.onUpdate).toHaveBeenCalledExactlyOnceWith('Draft');
		expect(view.queryByRole('textbox')).toBeNull();
	});

	test('keeps regular textareas visible and preserves manual save behavior', async () => {
		const view = renderTextarea({ collapsible: false });
		const textarea = view.getByRole('textbox');
		await fireEvent.update(textarea, 'Draft');
		await fireEvent.focusOut(textarea, { relatedTarget: document.body });
		await fireEvent.pointerDown(document.body);
		expect(view.getByRole('textbox')).toBe(textarea);
		expect(view.onUpdate).not.toHaveBeenCalled();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.save }));
		expect(view.onUpdate).toHaveBeenCalledExactlyOnceWith('Draft');
		expect(view.getByRole('textbox')).toBe(textarea);
	});

	test('preserves immediate updates for regular automatic textareas', async () => {
		const view = renderTextarea({ collapsible: false, manualSave: false });
		const textarea = view.getByRole('textbox');
		await fireEvent.update(textarea, 'Draft');
		expect(view.onUpdate).toHaveBeenCalledExactlyOnceWith('Draft');
		await fireEvent.focusOut(textarea, { relatedTarget: document.body });
		await fireEvent.pointerDown(document.body);
		expect(view.getByRole('textbox')).toBe(textarea);
		expect(view.onUpdate).toHaveBeenCalledExactlyOnceWith('Draft');
	});

	test('waits for IME composition to finish before saving and collapsing', async () => {
		const view = renderTextarea();
		await fireEvent.click(view.getByRole('button', { name: 'Add note' }));
		const textarea = view.getByRole('textbox');
		await fireEvent.compositionStart(textarea);
		await fireEvent.input(textarea, { target: { value: '管理笔记' }, isComposing: true });
		await fireEvent.pointerDown(document.body);
		expect(view.onUpdate).not.toHaveBeenCalled();
		expect(view.getByRole('textbox')).toBe(textarea);
		await fireEvent.compositionEnd(textarea);
		await nextTick();
		expect(view.onUpdate).toHaveBeenCalledExactlyOnceWith('管理笔记');
		expect(view.queryByRole('textbox')).toBeNull();
	});

	test('does not open a disabled editor', async () => {
		const view = renderTextarea({ disabled: true });
		await fireEvent.click(view.getByRole('button', { name: 'Add note' }));
		await nextTick();
		expect(view.queryByRole('textbox')).toBeNull();
	});

	test('uses the selected emoji artwork in both the collapsed summary and the raw editor', async () => {
		const source = '**中文** 🎉 https://example.com @alice';
		const view = renderTextarea({ modelValue: source }, true);
		for (const [style, src] of [['twemoji', '/twemoji/1f389.svg'], ['fluentEmoji', '/fluent-emoji/1f389.png']] as const) {
			prefer.s.emojiStyle = style;
			await nextTick();
			const collapsed = view.getByRole('button');
			expect(collapsed.textContent).toContain('**中文**');
			expect(collapsed.textContent).toContain('https://example.com @alice');
			expect(collapsed.querySelector('a, strong, b')).toBeNull();
			const image = collapsed.querySelector('img')!;
			expect(image.getAttribute('src')).toBe(src);
			await fireEvent.pointerEnter(image);
			expect(image.getAttribute('title')).toBe('');
			await fireEvent.click(collapsed);
			const textarea = view.getByRole('textbox') as HTMLTextAreaElement;
			expect(textarea.value).toBe(source);
			expect(textarea.parentElement!.querySelector('[data-emoji-input-overlay] img')?.getAttribute('src')).toBe(src);
			await fireEvent.pointerDown(document.body);
			expect(view.queryByRole('textbox')).toBeNull();
			expect(view.onUpdate).not.toHaveBeenCalled();
		}
		prefer.s.emojiStyle = 'native';
		await nextTick();
		expect(view.getByRole('button').querySelector('img')).toBeNull();
		expect(view.getByRole('button').textContent).toContain('🎉');
		prefer.s.emojiStyle = 'twemoji';
	});

	test.each([
		{ modelValue: 'const message = "🎉";', code: true },
		{ modelValue: '', collapsedPlaceholder: 'Add note 🎉' },
	])('keeps code and empty-editor placeholders as literal text: %j', async props => {
		const view = renderTextarea(props, true);
		const button = view.getByRole('button');
		expect(button.textContent?.trim()).toBe(props.modelValue || props.collapsedPlaceholder);
		expect(button.querySelector('img')).toBeNull();
		await fireEvent.click(button);
		expect((view.getByRole('textbox') as HTMLTextAreaElement).value).toBe(props.modelValue);
	});
});
