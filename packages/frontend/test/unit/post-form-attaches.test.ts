/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import MkPostFormAttaches from '@/components/MkPostFormAttaches.vue';
import { i18n } from '@/i18n.js';
import { globalEvents } from '@/events.js';
import type { MenuButton, MenuItem } from '@/types/menu.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(), apiWithDialog: vi.fn(), confirm: vi.fn(), inputText: vi.fn(),
	popupMenu: vi.fn(), popupAsyncWithDialog: vi.fn(),
}));
vi.mock('@/os.js', () => mocks);
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/components/MkDriveFileThumbnail.vue', () => ({ default: { props: ['file'], template: '<span>{{ file.name }}</span>' } }));
vi.mock('@/components/MkLightbox.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkFileCaptionEditWindow.vue', () => ({ default: { template: '<div/>' } }));

function file(id: string, overrides: Partial<Misskey.entities.DriveFile> = {}): Misskey.entities.DriveFile {
	return {
		id, name: `${id}.png`, type: 'image/png', isSensitive: false, comment: null,
		url: `https://example.com/${id}.png`, thumbnailUrl: null,
		properties: { width: 64, height: 64 },
		...overrides,
	} as Misskey.entities.DriveFile;
}

async function openMenu(view: ReturnType<typeof render>, name: string) {
	await fireEvent.click(view.getByRole('button', { name }));
	return mocks.popupMenu.mock.calls.at(-1)![0] as MenuItem[];
}

function action(menu: MenuItem[], text: string) {
	const item = menu.find(item => 'text' in item && item.text === text) as MenuButton;
	expect(item).toBeDefined();
	return item.action(new MouseEvent('click') as PointerEvent);
}

function buttons(menu: MenuItem[]) {
	return menu.filter((item): item is MenuButton => 'action' in item);
}

describe('post form attachments', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.api.mockResolvedValue(undefined);
		mocks.apiWithDialog.mockResolvedValue(undefined);
		mocks.confirm.mockResolvedValue({ canceled: false });
		mocks.inputText.mockResolvedValue({ canceled: false, result: 'Renamed.png' });
		mocks.popupMenu.mockResolvedValue(undefined);
		mocks.popupAsyncWithDialog.mockResolvedValue({ dispose: vi.fn() });
	});
	afterEach(() => cleanup());

	test('allows preview and detaching in edit mode without changing or deleting the drive file', async () => {
		const attachment = file('existing');
		const original = structuredClone(attachment);
		const view = render(MkPostFormAttaches, { props: { modelValue: [attachment], editing: true } });
		const menu = await openMenu(view, attachment.name);
		expect(buttons(menu).map(item => item.text)).toEqual([i18n.ts.preview, i18n.ts.attachCancel]);
		await action(menu, i18n.ts.preview);
		expect(mocks.popupAsyncWithDialog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			contents: [expect.objectContaining({ id: attachment.id, url: attachment.url })],
		}), expect.anything());
		await action(menu, i18n.ts.attachCancel);
		expect(view.emitted().detach).toEqual([[attachment.id]]);
		expect(mocks.api).not.toHaveBeenCalled();
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
		expect(mocks.confirm).not.toHaveBeenCalled();
		expect(mocks.inputText).not.toHaveBeenCalled();
		expect(attachment).toEqual(original);
	});

	test('allows attachment order changes while editing and blocks an in-progress drop when saving', async () => {
		const attachments = [file('first'), file('second')];
		const view = render(MkPostFormAttaches, { props: { modelValue: attachments, editing: true } });
		const items = view.container.querySelectorAll('[draggable]');
		const dataTransfer = new DataTransfer();
		await fireEvent.dragStart(items[0], { dataTransfer });
		await fireEvent.drop(items[1].lastElementChild!, { dataTransfer });
		expect(view.emitted()['update:modelValue']).toEqual([[[attachments[1], attachments[0]]]]);
		await view.rerender({ modelValue: attachments, editing: true, disabled: true });
		await fireEvent.drop(items[1].lastElementChild!, { dataTransfer });
		expect(view.emitted()['update:modelValue']).toHaveLength(1);
		expect(Array.from(items, item => item.getAttribute('draggable'))).toEqual(['false', 'false']);
		const blockedDrag = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
		items[0].dispatchEvent(blockedDrag);
		expect(blockedDrag.defaultPrevented).toBe(true);
		await fireEvent.dragEnd(items[0]);
	});

	test('blocks clicks, keyboard menus and a previously opened detach action while saving', async () => {
		const attachment = file('existing');
		const detachMediaFn = vi.fn();
		const view = render(MkPostFormAttaches, { props: { modelValue: [attachment], editing: true, detachMediaFn } });
		const menu = await openMenu(view, attachment.name);
		await view.rerender({ modelValue: [attachment], editing: true, disabled: true, detachMediaFn });
		const button = view.getByRole('button', { name: attachment.name });
		expect(button.getAttribute('aria-disabled')).toBe('true');
		expect(button.getAttribute('tabindex')).toBe('-1');
		await fireEvent.click(button);
		await fireEvent.keyDown(button, { key: 'Enter' });
		await fireEvent.contextMenu(button);
		await action(menu, i18n.ts.attachCancel);
		expect(mocks.popupMenu).toHaveBeenCalledTimes(1);
		expect(detachMediaFn).not.toHaveBeenCalled();
		expect(view.emitted().detach).toBeUndefined();
	});

	test.each(['editing', 'disabled'] as const)('guards stale file-mutation menu actions after %s becomes true', async flag => {
		const attachment = file('existing');
		const view = render(MkPostFormAttaches, { props: { modelValue: [attachment] } });
		const menu = await openMenu(view, attachment.name);
		await view.rerender({ modelValue: [attachment], [flag]: true });
		await action(menu, i18n.ts.renameFile);
		await action(menu, i18n.ts.markAsSensitive);
		await action(menu, i18n.ts.describeFile);
		await action(menu, i18n.ts.deleteFile);
		expect(mocks.api).not.toHaveBeenCalled();
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
		expect(mocks.inputText).not.toHaveBeenCalled();
		expect(mocks.popupAsyncWithDialog).not.toHaveBeenCalled();
		expect(mocks.confirm).not.toHaveBeenCalled();
		expect(view.emitted().detach).toBeUndefined();
	});

	test.each(['editing', 'disabled'] as const)('does not apply a pending rename after %s becomes true', async flag => {
		const attachment = file('existing');
		let finish!: (value: { canceled: boolean; result: string }) => void;
		mocks.inputText.mockReturnValue(new Promise(resolve => { finish = resolve; }));
		const view = render(MkPostFormAttaches, { props: { modelValue: [attachment] } });
		const menu = await openMenu(view, attachment.name);
		action(menu, i18n.ts.renameFile);
		await view.rerender({ modelValue: [attachment], [flag]: true });
		finish({ canceled: false, result: 'Should not be saved.png' });
		await Promise.resolve();
		expect(mocks.api).not.toHaveBeenCalled();
		expect(attachment.name).toBe('existing.png');
	});

	test('does not apply a pending caption after editing starts', async () => {
		const attachment = file('existing');
		const view = render(MkPostFormAttaches, { props: { modelValue: [attachment] } });
		const menu = await openMenu(view, attachment.name);
		action(menu, i18n.ts.describeFile);
		await waitFor(() => expect(mocks.popupAsyncWithDialog).toHaveBeenCalled());
		await view.rerender({ modelValue: [attachment], editing: true });
		mocks.popupAsyncWithDialog.mock.calls[0][2].done('Should not be saved');
		expect(mocks.api).not.toHaveBeenCalled();
		expect(attachment.comment).toBeNull();
	});

	test('does not delete a drive file if saving starts while its confirmation is open', async () => {
		const attachment = file('existing');
		let finish!: (value: { canceled: boolean }) => void;
		mocks.confirm.mockReturnValue(new Promise(resolve => { finish = resolve; }));
		const view = render(MkPostFormAttaches, { props: { modelValue: [attachment] } });
		const menu = await openMenu(view, attachment.name);
		action(menu, i18n.ts.deleteFile);
		await view.rerender({ modelValue: [attachment], disabled: true });
		finish({ canceled: false });
		await Promise.resolve();
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
	});

	test('preserves file rename, sensitivity and caption actions for new posts', async () => {
		const attachment = file('new');
		const view = render(MkPostFormAttaches, { props: { modelValue: [attachment] } });
		const menu = await openMenu(view, attachment.name);
		expect(buttons(menu).map(item => item.text)).toEqual([
			i18n.ts.renameFile, i18n.ts.markAsSensitive, i18n.ts.describeFile,
			i18n.ts.preview, i18n.ts.attachCancel, i18n.ts.deleteFile,
		]);
		action(menu, i18n.ts.renameFile);
		await waitFor(() => expect(view.emitted().changeName).toEqual([[attachment, 'Renamed.png']]));
		expect(mocks.api).toHaveBeenCalledWith('drive/files/update', { fileId: attachment.id, name: 'Renamed.png' });
		action(menu, i18n.ts.markAsSensitive);
		await waitFor(() => expect(view.emitted().changeSensitive).toEqual([[attachment, true]]));
		expect(mocks.api).toHaveBeenCalledWith('drive/files/update', { fileId: attachment.id, isSensitive: true });
		action(menu, i18n.ts.describeFile);
		await waitFor(() => expect(mocks.popupAsyncWithDialog).toHaveBeenCalled());
		mocks.popupAsyncWithDialog.mock.calls[0][2].done('Updated caption');
		await waitFor(() => expect(attachment.comment).toBe('Updated caption'));
		expect(mocks.api).toHaveBeenCalledWith('drive/files/update', { fileId: attachment.id, comment: 'Updated caption' });
	});

	test('preserves confirmed drive-file deletion for new posts', async () => {
		const attachment = file('new');
		const onDelete = vi.fn();
		globalEvents.on('driveFilesDeleted', onDelete);
		try {
			const view = render(MkPostFormAttaches, { props: { modelValue: [attachment] } });
			const menu = await openMenu(view, attachment.name);
			action(menu, i18n.ts.deleteFile);
			await waitFor(() => expect(onDelete).toHaveBeenCalledWith([attachment]));
			expect(view.emitted().detach).toEqual([[attachment.id]]);
			expect(mocks.confirm).toHaveBeenCalledTimes(1);
			expect(mocks.apiWithDialog).toHaveBeenCalledExactlyOnceWith('drive/files/delete', { fileId: attachment.id });
		} finally {
			globalEvents.off('driveFilesDeleted', onDelete);
		}
	});
});
