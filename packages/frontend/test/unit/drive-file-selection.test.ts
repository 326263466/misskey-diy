/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as Misskey from 'misskey-js';
import { chooseDriveFile } from '@/utility/drive.js';

const mocks = vi.hoisted(() => ({ popup: vi.fn() }));
vi.mock('@/os.js', () => ({ popupAsyncWithDialog: mocks.popup }));
vi.mock('@/components/MkDriveFileSelectDialog.vue', () => ({ default: { name: 'DriveFileSelectDialog' } }));

type PickerEvents = {
	done: (files?: Misskey.entities.DriveFile[]) => void;
	closed: () => void;
};

const pickers: { events: PickerEvents; dispose: () => void }[] = [];
const file = { id: 'avatar', type: 'image/png', url: 'https://example.com/avatar.png' } as Misskey.entities.DriveFile;

beforeEach(() => {
	pickers.length = 0;
	mocks.popup.mockReset().mockImplementation((_component: unknown, _props: unknown, events: PickerEvents) => {
		const dispose = vi.fn();
		pickers.push({ events, dispose });
		return Promise.resolve({ dispose });
	});
});

describe('drive file selection cancellation', () => {
	test.each(['done', 'closed'] as const)('releases an opted-in %s cancellation and allows another selection', async cancelEvent => {
		const first = chooseDriveFile({ multiple: false, resolveOnCancel: true });
		const canceled = pickers[0];
		if (cancelEvent === 'done') canceled.events.done();
		else canceled.events.closed();
		await expect(first).resolves.toEqual([]);
		if (cancelEvent === 'done') canceled.events.closed();
		await Promise.resolve();
		expect(canceled.dispose).toHaveBeenCalledOnce();

		const second = chooseDriveFile({ multiple: false, resolveOnCancel: true });
		const selected = pickers[1];
		const files = [file];
		selected.events.done(files);
		selected.events.closed();
		await expect(second).resolves.toBe(files);
		expect(selected.dispose).toHaveBeenCalledOnce();
		expect(mocks.popup).toHaveBeenCalledTimes(2);
	});

	test('preserves a normal selection when the dialog subsequently closes', async () => {
		const result = chooseDriveFile({ multiple: true, excludeSensitive: true });
		const picker = pickers[0];
		const files = [file];
		picker.events.done(files);
		picker.events.closed();
		await expect(result).resolves.toBe(files);
		expect(picker.dispose).toHaveBeenCalledOnce();
		expect(mocks.popup.mock.lastCall![1]).toEqual({ multiple: true, excludeSensitive: true });
	});

	test('rejects a popup loading failure and leaves the next selection usable', async () => {
		const error = new Error('Selector failed to load');
		mocks.popup.mockRejectedValueOnce(error);
		await expect(chooseDriveFile({ resolveOnCancel: true })).rejects.toBe(error);

		const result = chooseDriveFile({ resolveOnCancel: true });
		const picker = pickers[0];
		const files = [file];
		picker.events.done(files);
		picker.events.closed();
		await expect(result).resolves.toBe(files);
		expect(picker.dispose).toHaveBeenCalledOnce();
	});

	test('retains the legacy pending cancellation when the option is omitted', async () => {
		const result = chooseDriveFile();
		const settled = vi.fn();
		void result.then(settled, settled);
		const picker = pickers[0];
		picker.events.done();
		picker.events.closed();
		await Promise.resolve();
		await Promise.resolve();
		expect(settled).not.toHaveBeenCalled();
		expect(picker.dispose).toHaveBeenCalledOnce();
	});
});
