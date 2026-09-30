/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick, unref } from 'vue';
import MkAutoReplyDialog from '@/components/MkAutoReplyDialog.vue';
import { i18n } from '@/i18n.js';
import { AUTO_REPLY_TEXT_LIMIT, getAutoReplyPresets } from '@/utility/status-auto-reply.js';
import type { AutoReplyStatus } from '@/utility/status-auto-reply.js';
import type { MenuButton } from '@/types/menu.js';

const mocks = vi.hoisted(() => ({ close: vi.fn(), menu: vi.fn(), dismiss: undefined as (() => void) | undefined }));

vi.mock('@/os.js', () => ({ popupMenu: mocks.menu }));

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

function renderDialog(status: AutoReplyStatus = 'away', initialReply?: string | null) {
	const save = vi.fn<(reply: string | null) => Promise<void>>().mockResolvedValue(undefined);
	const view = render(MkAutoReplyDialog, { props: { status, initialReply, save } });
	const trigger = view.getByRole('button', { name: i18n.ts._onlineStatus.autoReply }) as HTMLButtonElement;
	const label = (value: string) => value === 'none' ? i18n.ts.none : value === 'custom' ? i18n.ts._onlineStatus.customAutoReply : getAutoReplyPresets().find(preset => preset.value === value)!.text;
	const selected = () => trigger.textContent!.trim();
	const choose = async (value: string) => {
		await fireEvent.click(trigger);
		const [items, , options] = mocks.menu.mock.calls.at(-1)!;
		(items as MenuButton[]).find(item => unref(item.text) === label(value))!.action({} as PointerEvent);
		options.onClosing();
		mocks.dismiss?.();
		await nextTick();
		await nextTick();
	};
	const saveButton = view.getByRole('button', { name: i18n.ts.ok }) as HTMLButtonElement;
	return { ...view, trigger, choose, selected, label, saveButton, save };
}

describe('status auto reply dialog', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.menu.mockImplementation(() => new Promise<void>(resolve => { mocks.dismiss = resolve; }));
	});
	afterEach(cleanup);

	test('keeps the label accessible without forwarding clicks outside the dropdown button', async () => {
		const view = renderDialog();
		await fireEvent.click(view.getByText(i18n.ts._onlineStatus.autoReply, { exact: true }));
		expect(mocks.menu).not.toHaveBeenCalled();
		expect(view.trigger.getAttribute('aria-expanded')).toBe('false');
		await view.choose('none');
		expect(view.selected()).toBe(i18n.ts.none);
	});

	test.each(['pointer', 'keyboard'])('opens the %s dropdown at the trigger width and restores focus after dismissal', async activation => {
		const view = renderDialog('busy');
		vi.spyOn(view.trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 80, 344, 46));
		if (activation === 'pointer') await fireEvent.click(view.trigger);
		else await fireEvent.keyDown(view.trigger, { key: 'ArrowDown' });
		expect(view.trigger.getAttribute('aria-expanded')).toBe('true');
		const [items, anchor, options] = mocks.menu.mock.calls[0];
		expect(anchor).toBe(view.trigger);
		expect(options).toMatchObject({ matchAnchorWidth: true, width: 344 });
		expect((items as MenuButton[]).map(item => unref(item.text))).toEqual([
			...getAutoReplyPresets().map(preset => preset.text), i18n.ts.none, i18n.ts._onlineStatus.customAutoReply,
		]);
		expect((items as MenuButton[]).map(item => unref(item.active))).toEqual([false, true, false, false, false]);
		await fireEvent.click(view.trigger);
		expect(mocks.menu).toHaveBeenCalledOnce();
		options.onClosing();
		mocks.dismiss?.();
		await waitFor(() => expect(view.trigger.getAttribute('aria-expanded')).toBe('false'));
		await waitFor(() => expect(document.activeElement).toBe(view.trigger));
		expect(view.save).not.toHaveBeenCalled();
	});

	test.each(['away', 'busy', 'doNotDisturb'] as const)('offers an initial preset for %s and applies it only on confirmation', async status => {
		const view = renderDialog(status);
		expect(view.getByText(i18n.tsx._onlineStatus.switchTo({ status: i18n.ts._onlineStatus[status] }))).toBeTruthy();
		expect(view.selected()).toBe(view.label(status === 'away' ? 'away' : 'work'));
		expect(view.trigger.getAttribute('aria-expanded')).toBe('false');
		expect(view.queryByRole('combobox')).toBeNull();
		expect(view.save).not.toHaveBeenCalled();
		await fireEvent.click(view.saveButton);
		const preset = getAutoReplyPresets().find(p => p.text === view.selected())!;
		await waitFor(() => expect(view.save).toHaveBeenCalledExactlyOnceWith(preset.text));
		expect(mocks.close).toHaveBeenCalledOnce();
	});

	test('keeps an explicitly disabled reply off when opened again', async () => {
		const view = renderDialog('away', null);
		expect(view.selected()).toBe(i18n.ts.none);
		expect(view.queryByRole('textbox')).toBeNull();
		await fireEvent.click(view.saveButton);
		await waitFor(() => expect(view.save).toHaveBeenCalledExactlyOnceWith(null));
	});

	test('loads a saved custom reply, keeps the draft when switching options, and trims on save', async () => {
		const view = renderDialog('busy', '开会中，稍后联系');
		expect(view.selected()).toBe(i18n.ts._onlineStatus.customAutoReply);
		const input = view.getByRole('textbox', { name: i18n.ts._onlineStatus.autoReplyContent }) as HTMLTextAreaElement;
		expect(input.value).toBe('开会中，稍后联系');
		await fireEvent.update(input, '  吃完饭再联系\n谢谢！  ');
		await view.choose('none');
		await view.choose('custom');
		expect((view.getByRole('textbox') as HTMLTextAreaElement).value).toBe('  吃完饭再联系\n谢谢！  ');
		await fireEvent.click(view.saveButton);
		await waitFor(() => expect(view.save).toHaveBeenCalledExactlyOnceWith('吃完饭再联系\n谢谢！'));
	});

	test('selects a matching saved preset and permits switching to another preset', async () => {
		const presets = getAutoReplyPresets();
		const view = renderDialog('away', presets[0].text);
		expect(view.selected()).toBe(presets[0].text);
		await view.choose('meal');
		await fireEvent.click(view.saveButton);
		await waitFor(() => expect(view.save).toHaveBeenCalledExactlyOnceWith(presets[2].text));
	});

	test('rejects blank and overlong custom replies and counts astral characters correctly', async () => {
		const view = renderDialog();
		await view.choose('custom');
		const input = view.getByRole('textbox');
		await fireEvent.update(input, '   ');
		expect(view.saveButton.disabled).toBe(true);
		await fireEvent.submit(input.closest('form')!);
		expect(view.save).not.toHaveBeenCalled();
		await fireEvent.update(input, '🎵'.repeat(AUTO_REPLY_TEXT_LIMIT + 1));
		expect(view.saveButton.disabled).toBe(true);
		expect(input.getAttribute('aria-invalid')).toBe('true');
		await fireEvent.update(input, '🎵'.repeat(AUTO_REPLY_TEXT_LIMIT));
		expect(view.getByText('500 / 500')).toBeTruthy();
		expect(view.saveButton.disabled).toBe(false);
		await fireEvent.click(view.saveButton);
		await waitFor(() => expect(view.save).toHaveBeenCalledExactlyOnceWith('🎵'.repeat(AUTO_REPLY_TEXT_LIMIT)));
	});

	test('cancel and escape close without applying the chosen status or reply', async () => {
		const view = renderDialog();
		await view.choose('none');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.cancel }));
		expect(mocks.close).toHaveBeenCalledOnce();
		expect(view.save).not.toHaveBeenCalled();
		await fireEvent.click(view.getByRole('button', { name: 'Escape window' }));
		expect(view.save).not.toHaveBeenCalled();
	});

	test('prevents duplicate saves or closure while the request is pending', async () => {
		const view = renderDialog('busy', '稍后回复');
		const saved = Promise.withResolvers<void>();
		view.save.mockReturnValueOnce(saved.promise);
		await fireEvent.click(view.saveButton);
		expect(view.saveButton.disabled).toBe(true);
		expect(view.trigger.disabled).toBe(true);
		await fireEvent.click(view.trigger);
		expect(mocks.menu).not.toHaveBeenCalled();
		expect((view.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
		await fireEvent.submit(view.trigger.closest('form')!);
		await fireEvent.click(view.getByRole('button', { name: 'Close window' }));
		expect(view.save).toHaveBeenCalledOnce();
		expect(mocks.close).not.toHaveBeenCalled();
		saved.resolve();
		await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
	});

	test('retains a custom draft and restores focus after a failed save', async () => {
		const view = renderDialog('busy', '稍后回复');
		view.save.mockRejectedValueOnce(new Error('Connection failed'));
		const input = view.getByRole('textbox') as HTMLTextAreaElement;
		await fireEvent.update(input, '开会中');
		await fireEvent.click(view.saveButton);
		await waitFor(() => expect(view.saveButton.disabled).toBe(false));
		expect(mocks.close).not.toHaveBeenCalled();
		expect(input.value).toBe('开会中');
		expect(document.activeElement).toBe(input);
		await fireEvent.click(view.saveButton);
		await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
	});
});
