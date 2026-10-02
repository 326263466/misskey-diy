/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import locales from 'i18n';
import MkCustomStatusDialog from '@/components/MkCustomStatusDialog.vue';
import MkStatusIcon from '@/components/MkStatusIcon.vue';
import { i18n, updateI18n } from '@/i18n.js';
import type { CustomStatus } from '@/utility/status-icons.js';
import { customStatusIcons, customStatusIconKeys } from '@/utility/status-icons.js';

const mocks = vi.hoisted(() => ({ close: vi.fn() }));

vi.mock('@/components/MkModalWindow.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		emits: ['close', 'closed', 'click', 'esc'],
		setup(_props, { slots, expose, emit }) {
			expose({ close: () => { mocks.close(); emit('closed'); } });
			return () => h('section', [
				slots.header?.(), slots.default?.(), slots.footer?.(),
				h('button', { onClick: () => emit('close') }, 'Close window'),
				h('button', { onClick: () => emit('esc') }, 'Escape window'),
			]);
		},
	}) };
});

vi.mock('@/components/MkButton.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		props: { disabled: Boolean, wait: Boolean },
		emits: ['click'],
		setup(props, { slots, emit }) {
			return () => h('button', { type: 'button', disabled: props.disabled || props.wait, onClick: () => emit('click') }, slots.default?.());
		},
	}) };
});

const savedStatus: CustomStatus = { icon: 'book', text: 'Reading' };

async function renderDialog(initialStatus?: CustomStatus | null) {
	const save = vi.fn<(status: CustomStatus | null) => Promise<void>>().mockResolvedValue(undefined);
	const view = render(MkCustomStatusDialog, { props: { initialStatus, save } });
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.text }));
	const saveButton = view.getByRole('button', { name: i18n.ts._onlineStatus.useStatus }) as HTMLButtonElement;
	return { ...view, save, get input() { return view.getByRole('textbox', { name: i18n.ts.text }) as HTMLInputElement; }, saveButton };
}

describe('custom status dialog', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => {
		cleanup();
		updateI18n(locales['en-US']);
	});

	test('starts with a text button and edits only on request without submitting on Enter or Escape', async () => {
		const save = vi.fn().mockResolvedValue(undefined);
		const view = render(MkCustomStatusDialog, { props: { initialStatus: savedStatus, save } });
		expect(view.queryByRole('textbox')).toBeNull();
		const edit = view.getByRole('button', { name: i18n.ts.text });
		expect(edit.textContent).toBe('Reading');
		await fireEvent.click(edit);
		let input = view.getByRole('textbox', { name: i18n.ts.text });
		expect(document.activeElement).toBe(input);
		await fireEvent.update(input, '听一会歌');
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(view.queryByRole('textbox')).toBeNull();
		expect(view.getByRole('button', { name: i18n.ts.text }).textContent).toBe('听一会歌');
		expect(document.activeElement).toBe(view.getByRole('button', { name: i18n.ts.text }));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.text }).querySelector('span')!);
		input = view.getByRole('textbox', { name: i18n.ts.text });
		await fireEvent.update(input, '撤销这次');
		await fireEvent.keyDown(input, { key: 'Escape' });
		expect(view.queryByRole('textbox')).toBeNull();
		expect(view.getByRole('button', { name: i18n.ts.text }).textContent).toBe('听一会歌');
		expect(save).not.toHaveBeenCalled();
		expect(mocks.close).not.toHaveBeenCalled();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.text }));
		input = view.getByRole('textbox', { name: i18n.ts.text });
		await fireEvent.update(input, '保留草稿');
		await fireEvent.blur(input);
		expect(view.queryByRole('textbox')).toBeNull();
		expect(view.getByRole('button', { name: i18n.ts.text }).textContent).toBe('保留草稿');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._onlineStatus.useStatus }));
		expect(save).toHaveBeenCalledExactlyOnceWith({ icon: 'book', text: '保留草稿' });
	});

	test('loads the saved icon and text and offers the thirteen supported icons', async () => {
		const view = await renderDialog(savedStatus);
		expect(view.input.value).toBe('Reading');
		expect(view.getAllByRole('radio').map(radio => (radio as HTMLInputElement).value)).toEqual(customStatusIcons);
		expect(view.getAllByRole('radio')).toHaveLength(13);
		expect(view.queryAllByRole('heading')).toHaveLength(0);
		expect((view.getByRole('radio', { name: i18n.ts._onlineStatus._icons.book }) as HTMLInputElement).checked).toBe(true);
		expect(view.getByLabelText(i18n.ts.preview).contains(view.input)).toBe(true);
		expect(view.saveButton.disabled).toBe(false);
	});

	test('previews and saves the charging status using the supported battery icon', async () => {
		updateI18n(locales['zh-CN']);
		const view = await renderDialog();
		await fireEvent.click(view.getByRole('radio', { name: '充电中' }));
		expect(view.input.value).toBe('充电中');
		expect(view.getByLabelText(i18n.ts.preview).querySelector('[data-custom-status-icon="battery"]')).not.toBeNull();
		await fireEvent.click(view.saveButton);
		await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
		expect(view.save).toHaveBeenCalledExactlyOnceWith({ icon: 'battery', text: '充电中' });
	});

	test('uses the icon meaning as the default text in the current language', async () => {
		updateI18n(locales['zh-CN']);
		const view = await renderDialog();
		expect(view.input.value).toBe('休息中');
		expect(view.saveButton.disabled).toBe(false);
		await fireEvent.click(view.getByRole('radio', { name: '听歌中' }));
		expect(view.input.value).toBe('听歌中');
		await fireEvent.click(view.getByRole('radio', { name: i18n.ts._onlineStatus._icons.plane }));
		expect(view.input.value).toBe(i18n.ts._onlineStatus._icons.plane);
		await fireEvent.click(view.saveButton);
		await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
		expect(view.save).toHaveBeenCalledExactlyOnceWith({ icon: 'plane', text: i18n.ts._onlineStatus._icons.plane });
	});

	test('replaces saved or edited text when the icon changes and preserves edits for the same icon', async () => {
		updateI18n(locales['zh-CN']);
		const view = await renderDialog({ icon: 'music', text: '听音乐' });
		expect(view.input.value).toBe('听音乐');
		await fireEvent.click(view.getByRole('radio', { name: i18n.ts._onlineStatus._icons.car }));
		expect(view.input.value).toBe(i18n.ts._onlineStatus._icons.car);
		await fireEvent.update(view.input, '准备出发');
		await fireEvent.click(view.getByRole('radio', { name: i18n.ts._onlineStatus._icons.car }));
		expect(view.input.value).toBe('准备出发');
		await fireEvent.click(view.getByRole('radio', { name: i18n.ts._onlineStatus._icons.book }));
		expect(view.input.value).toBe(i18n.ts._onlineStatus._icons.book);
		await fireEvent.keyDown(view.input, { key: 'Escape' });
		expect(view.getByRole('button', { name: i18n.ts.text }).textContent).toBe(i18n.ts._onlineStatus._icons.book);
	});

	test('previews the selected icon and saves trimmed text', async () => {
		const view = await renderDialog();
		expect(view.queryByRole('button', { name: i18n.ts.remove })).toBeNull();
		await fireEvent.click(view.getByRole('radio', { name: i18n.ts._onlineStatus._icons.music }));
		await fireEvent.update(view.input, '  听首歌  ');
		const preview = view.getByLabelText(i18n.ts.preview);
		expect((preview.querySelector('input') as HTMLInputElement).value).toBe('  听首歌  ');
		const previewIcon = preview.querySelector('[data-custom-status-icon="music"]');
		expect(previewIcon).not.toBeNull();
		expect(previewIcon?.querySelector('i, svg, img')).toBeNull();
		await fireEvent.click(view.saveButton);
		await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
		expect(view.save).toHaveBeenCalledExactlyOnceWith({ icon: 'music', text: '听首歌' });
		expect(view.emitted().closed).toHaveLength(1);
	});

	test('limits input to eight Unicode code points without splitting emoji', async () => {
		const view = await renderDialog();
		await fireEvent.update(view.input, '🎵'.repeat(8));
		expect([...view.input.value]).toHaveLength(8);
		expect(view.saveButton.disabled).toBe(false);
		expect(view.input.getAttribute('aria-invalid')).toBe('false');
		await fireEvent.update(view.input, '🎵'.repeat(9));
		expect(view.input.value).toBe('🎵'.repeat(8));
		expect(view.input.getAttribute('aria-invalid')).toBe('false');
		await fireEvent.update(view.input, '  ' + '🎵'.repeat(8) + '  ');
		await fireEvent.click(view.saveButton);
		await waitFor(() => expect(view.save).toHaveBeenCalledExactlyOnceWith({ icon: 'coffee', text: '🎵'.repeat(8) }));
	});

	test('keeps an IME composition intact until confirmation and does not submit while composing', async () => {
		const view = await renderDialog();
		await fireEvent.compositionStart(view.input);
		await fireEvent.input(view.input, { target: { value: '春夏秋冬一二三四五' }, isComposing: true });
		expect(view.input.value).toBe('春夏秋冬一二三四五');
		expect(view.saveButton.disabled).toBe(true);
		const enter = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true });
		await fireEvent(view.input, enter);
		expect(enter.defaultPrevented).toBe(true);
		await fireEvent.submit(view.input.closest('form')!);
		expect(view.save).not.toHaveBeenCalled();
		await fireEvent.compositionEnd(view.input);
		expect(view.input.value).toBe('春夏秋冬一二三四');
		expect(view.input.getAttribute('aria-invalid')).toBe('false');
		expect(view.saveButton.disabled).toBe(false);
		await fireEvent.click(view.saveButton);
		await waitFor(() => expect(view.save).toHaveBeenCalledExactlyOnceWith({ icon: 'coffee', text: '春夏秋冬一二三四' }));
	});

	test('requires editing an older status longer than eight characters before saving', async () => {
		const view = await renderDialog({ icon: 'book', text: '以前保存的超过八字状态' });
		expect(view.input.value).toBe('以前保存的超过八字状态');
		expect(view.input.getAttribute('aria-invalid')).toBe('true');
		expect(view.saveButton.disabled).toBe(true);
		await fireEvent.submit(view.input.closest('form')!);
		expect(view.save).not.toHaveBeenCalled();
		await fireEvent.update(view.input, '还在读书');
		await fireEvent.click(view.saveButton);
		await waitFor(() => expect(view.save).toHaveBeenCalledExactlyOnceWith({ icon: 'book', text: '还在读书' }));
	});

	test('discards edited text and icon through the window close button without a duplicate cancel action', async () => {
		const view = await renderDialog(savedStatus);
		expect(view.queryByRole('button', { name: i18n.ts.cancel })).toBeNull();
		await fireEvent.update(view.input, '先去听歌');
		await fireEvent.click(view.getByRole('radio', { name: i18n.ts._onlineStatus._icons.music }));
		await fireEvent.click(view.getByRole('button', { name: 'Close window' }));
		expect(view.save).not.toHaveBeenCalled();
		expect(mocks.close).toHaveBeenCalledOnce();
		expect(savedStatus).toEqual({ icon: 'book', text: 'Reading' });
	});

	test.each([
		'   ', 'A\u2028B', 'A\u2029B', 'A\u0007B',
		...Array.from({ length: 5 }, (_, offset) => 'A' + String.fromCodePoint(0x202A + offset) + 'B'),
		...Array.from({ length: 4 }, (_, offset) => 'A' + String.fromCodePoint(0x2066 + offset) + 'B'),
	])('rejects empty text and line, control, or bidi characters %j', async text => {
		const view = await renderDialog();
		await fireEvent.update(view.input, text);
		expect(view.saveButton.disabled).toBe(true);
		if (text.trim().length > 0) {
			expect(view.input.getAttribute('aria-invalid')).toBe('true');
		}
		await fireEvent.submit(view.input.closest('form')!);
		expect(view.save).not.toHaveBeenCalled();
		expect(mocks.close).not.toHaveBeenCalled();
	});

	test('locks editing and closing while saving and ignores repeated form submission', async () => {
		const view = await renderDialog(savedStatus);
		const saved = Promise.withResolvers<void>();
		view.save.mockReturnValueOnce(saved.promise);
		await fireEvent.click(view.saveButton);
		expect(view.saveButton.disabled).toBe(true);
		expect(view.input.disabled).toBe(true);
		expect((view.getByRole('group') as HTMLFieldSetElement).disabled).toBe(true);
		expect((view.getByRole('button', { name: i18n.ts.remove }) as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.submit(view.input.closest('form')!);
		await fireEvent.click(view.getByRole('button', { name: 'Close window' }));
		await fireEvent.click(view.getByRole('button', { name: 'Escape window' }));
		expect(view.save).toHaveBeenCalledOnce();
		expect(mocks.close).not.toHaveBeenCalled();
		saved.resolve();
		await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
	});

	test('retains the edited draft after a failed save and allows retrying', async () => {
		const view = await renderDialog(savedStatus);
		view.save.mockRejectedValueOnce(new Error('Connection failed'));
		await fireEvent.update(view.input, '还在读书');
		await fireEvent.click(view.saveButton);
		await waitFor(() => expect(view.saveButton.disabled).toBe(false));
		expect(mocks.close).not.toHaveBeenCalled();
		expect(view.input.value).toBe('还在读书');
		expect(document.activeElement).toBe(view.input);
		await fireEvent.click(view.saveButton);
		await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
		expect(view.save).toHaveBeenCalledTimes(2);
		expect(view.save).toHaveBeenLastCalledWith({ icon: 'book', text: '还在读书' });
	});

	test('clears a saved status only after removal succeeds', async () => {
		const view = await renderDialog(savedStatus);
		const saved = Promise.withResolvers<void>();
		view.save.mockReturnValueOnce(saved.promise);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.remove }));
		expect(view.save).toHaveBeenCalledExactlyOnceWith(null);
		expect(mocks.close).not.toHaveBeenCalled();
		saved.resolve();
		await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
	});

	test.each([
		{ status: 'away', glyph: 'ti-moon' },
		{ status: 'busy', glyph: 'ti-minus' },
		{ status: 'doNotDisturb', glyph: 'ti-ban' },
		{ status: 'invisible', glyph: 'ti-eye-off' },
	] as const)('uses the $status glyph even with a saved custom icon', ({ status, glyph }) => {
		const view = render(MkStatusIcon, { props: { status, icon: 'music' } });
		expect(view.container.querySelector('i')?.classList.contains(glyph)).toBe(true);
		expect(view.container.querySelector('[data-custom-status-icon]')).toBeNull();
	});

	test.each([...customStatusIconKeys, null])('renders custom %s without font icons or SVG', icon => {
		const view = render(MkStatusIcon, { props: { status: 'custom', icon } });
		const badge = view.container.querySelector('[data-custom-status-icon]');
		expect(badge?.getAttribute('data-custom-status-icon')).toBe(icon ?? 'add');
		expect(badge?.getAttribute('aria-hidden')).toBe('true');
		expect(badge?.querySelector('i, svg, img')).toBeNull();
		expect(badge?.textContent).toBe('');
	});
});
