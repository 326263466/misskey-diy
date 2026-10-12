/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import type { entities } from 'misskey-js';
import MkRedPacketDialog from '@/components/MkRedPacketDialog.vue';
import { i18n } from '@/i18n.js';

type UploadEvents = { done: (files: entities.DriveFile[]) => void; canceled: () => void; closed: () => void };
const mocks = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn(), popup: vi.fn(), dispose: vi.fn(), animated: vi.fn(), toast: vi.fn() }));
vi.mock('is-file-animated', () => ({ default: mocks.animated }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/i.js', () => ({ ensureSignin: () => ({ id: 'sender', token: 'test-token' }) }));
vi.mock('@/os.js', () => ({ confirm: mocks.confirm, popupAsyncWithDialog: mocks.popup, toast: mocks.toast }));
vi.mock('@/components/MkUploaderDialog.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkModalWindow.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ setup(_props, { slots, expose, emit }) {
		expose({ close: () => emit('closed') });
		return () => h('div', [h('button', { onClick: () => emit('close') }, 'Close dialog'), slots.default?.(), slots.footer?.()]);
	} }) };
});
vi.mock('@/components/MkButton.vue', () => ({ default: { props: ['disabled'], template: '<button :disabled="disabled"><slot/></button>' } }));

const global = { stubs: { Mfm: true, MkLoading: true } };
const packet = { id: 'packet', kind: 'group', status: 'active' };
let uploadEvents: UploadEvents;

beforeEach(() => {
	localStorage.clear();
	mocks.animated.mockResolvedValue(false);
	mocks.confirm.mockResolvedValue({ canceled: false });
	mocks.api.mockImplementation(async (endpoint: string, data: object) => endpoint === 'i/wallet' ? { balance: 100 } : { ...packet, ...data });
	mocks.popup.mockImplementation(async (_component: unknown, _props: unknown, events: UploadEvents) => {
		uploadEvents = events;
		return { dispose: mocks.dispose };
	});
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function uploadedFile(id: string, overrides: Partial<entities.DriveFile> = {}): entities.DriveFile {
	return { id, url: `https://example.test/${id}.png`, type: 'image/png', isSensitive: false, ...overrides } as entities.DriveFile;
}

async function chooseImage(container: Element, file = new File(['image'], 'cover.png', { type: 'image/png' })) {
	await fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
}

test('uploads and previews a cover before enabling creation, then preserves the issued cover', async () => {
	const view = render(MkRedPacketDialog, { global });
	const fileInput = view.container.querySelector<HTMLInputElement>('input[type="file"]')!;
	const selectFile = vi.spyOn(fileInput, 'click').mockImplementation(() => {});
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.uploadCover }));
	expect(selectFile).toHaveBeenCalledOnce();
	selectFile.mockRestore();
	await chooseImage(view.container);
	expect(view.getByRole('button', { name: i18n.ts._redPacket.create })).toHaveProperty('disabled', true);
	await fireEvent.click(view.getByRole('button', { name: 'Close dialog' }));
	expect(view.emitted('closed')).toBeUndefined();
	uploadEvents.done([uploadedFile('cover')]);
	uploadEvents.closed();
	await waitFor(() => expect(view.container.querySelector('[data-red-packet-cover] img')?.getAttribute('src')).toBe('https://example.test/cover.png'));
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
	await waitFor(() => expect(view.emitted('created')).toHaveLength(1));
	expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ coverFileId: 'cover' }));
	expect(mocks.api.mock.calls.find(([endpoint]) => endpoint === 'red-packets/create')?.[1]).not.toHaveProperty('coverUrl');
	view.unmount();
	expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'drive/files/delete')).toBe(false);
});

test('replacing and resetting covers cleans up only unused uploaded images', async () => {
	const view = render(MkRedPacketDialog, { global });
	await chooseImage(view.container);
	uploadEvents.done([uploadedFile('first')]);
	await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._redPacket.resetCover })).toHaveProperty('disabled', false));
	await chooseImage(view.container);
	uploadEvents.done([uploadedFile('second')]);
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('drive/files/delete', { fileId: 'first', ifUnusedForRedPacket: true }, 'test-token'));
	expect(view.container.querySelector('[data-red-packet-cover] img')?.getAttribute('src')).toBe('https://example.test/second.png');
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.resetCover }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('drive/files/delete', { fileId: 'second', ifUnusedForRedPacket: true }, 'test-token'));
	expect(view.container.querySelector('[data-red-packet-cover] img')).toBeNull();
});

test.each(['canceled', 'closed'] as const)('the uploader %s event unlocks the form without removing the current cover', async event => {
	const view = render(MkRedPacketDialog, { global });
	await chooseImage(view.container);
	uploadEvents.done([uploadedFile('current')]);
	await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._redPacket.uploadCover })).toHaveProperty('disabled', false));
	await chooseImage(view.container);
	uploadEvents[event]();
	await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._redPacket.create })).toHaveProperty('disabled', false));
	expect(view.container.querySelector('[data-red-packet-cover] img')?.getAttribute('src')).toBe('https://example.test/current.png');
	expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'drive/files/delete')).toBe(false);
});

test('rejects unsupported input and sensitive server results without leaving unused files', async () => {
	const view = render(MkRedPacketDialog, { global });
	await chooseImage(view.container, new File(['text'], 'file.txt', { type: 'text/plain' }));
	expect(mocks.popup).not.toHaveBeenCalled();
	expect(mocks.toast).toHaveBeenCalledWith(i18n.ts._redPacket.coverImageOnly, 'error');
	expect(view.queryByRole('alert')).toBeNull();
	await chooseImage(view.container);
	uploadEvents.done([uploadedFile('sensitive', { isSensitive: true })]);
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('drive/files/delete', { fileId: 'sensitive', ifUnusedForRedPacket: true }, 'test-token'));
	expect(view.container.querySelector('[data-red-packet-cover] img')).toBeNull();
});

test('an upload finishing after the editor unmounts is cleaned up', async () => {
	const view = render(MkRedPacketDialog, { global });
	await chooseImage(view.container);
	view.unmount();
	uploadEvents.done([uploadedFile('late')]);
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('drive/files/delete', { fileId: 'late', ifUnusedForRedPacket: true }, 'test-token'));
	expect(localStorage.getItem('red-packet-create:sender:group:public:')).toBeNull();
});

test.each([
	{ type: 'image/gif', animated: true },
	{ type: 'image/png', animated: true },
	{ type: 'image/webp', animated: true },
	{ type: 'image/png', animated: false },
	{ type: 'image/webp', animated: false },
])('$type with animation=$animated preserves animation while allowing static image editing', async ({ type, animated }) => {
	mocks.animated.mockResolvedValue(animated);
	const view = render(MkRedPacketDialog, { global });
	const file = new File(['image'], 'cover', { type });
	await chooseImage(view.container, file);
	await waitFor(() => expect(mocks.popup).toHaveBeenCalledOnce());
	expect(mocks.animated).toHaveBeenCalledWith(file);
	expect(mocks.popup.mock.calls[0][1]).toEqual({ files: [file], multiple: false, features: { imageEditing: !animated, watermark: !animated } });
	uploadEvents.done([uploadedFile('cover', { type })]);
	await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._redPacket.create })).toHaveProperty('disabled', false));
	expect(view.container.querySelector('[data-red-packet-cover] img')?.getAttribute('src')).toBe('https://example.test/cover.png');
});

test('failed animation detection disables transformations without rejecting the cover', async () => {
	mocks.animated.mockRejectedValue(new Error('Unable to inspect image'));
	const view = render(MkRedPacketDialog, { global });
	await chooseImage(view.container);
	await waitFor(() => expect(mocks.popup).toHaveBeenCalledOnce());
	expect(mocks.popup.mock.calls[0][1].features).toEqual({ imageEditing: false, watermark: false });
	uploadEvents.done([uploadedFile('cover')]);
	await waitFor(() => expect(view.container.querySelector('[data-red-packet-cover] img')).not.toBeNull());
	expect(view.queryByRole('alert')).toBeNull();
});

test('animation detection holds the creation lock and does not open an uploader after unmount', async () => {
	let finishDetection!: (animated: boolean) => void;
	mocks.animated.mockReturnValue(new Promise<boolean>(resolve => { finishDetection = resolve; }));
	const view = render(MkRedPacketDialog, { global });
	await chooseImage(view.container);
	expect(view.getByRole('button', { name: i18n.ts._redPacket.create })).toHaveProperty('disabled', true);
	expect(mocks.popup).not.toHaveBeenCalled();
	view.unmount();
	finishDetection(true);
	await Promise.resolve();
	expect(mocks.popup).not.toHaveBeenCalled();
});
