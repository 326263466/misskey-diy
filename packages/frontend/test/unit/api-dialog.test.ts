/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';
import { apiWithDialog, popups, promiseDialog } from '@/os.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/preferences.js', () => ({ prefer: { s: {} } }));
vi.mock('@/utility/please-login.js', () => ({ pleaseLogin: vi.fn() }));
vi.mock('@/utility/show-moved-dialog.js', () => ({ showMovedDialog: vi.fn() }));
vi.mock('@/components/MkPostFormDialog.vue', () => ({ default: { name: 'PostFormDialog' } }));
vi.mock('@/components/MkWaitingDialog.vue', () => ({ default: { name: 'WaitingDialog' } }));
vi.mock('@/components/MkPageWindow.vue', () => ({ default: { name: 'PageWindow' } }));
vi.mock('@/components/MkToast.vue', () => ({ default: { name: 'Toast' } }));
vi.mock('@/components/MkDialog.vue', () => ({ default: { name: 'Dialog' } }));
vi.mock('@/components/MkPopupMenu.vue', () => ({ default: { name: 'PopupMenu' } }));
vi.mock('@/components/MkContextMenu.vue', () => ({ default: { name: 'ContextMenu' } }));

describe('API dialog feedback', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		popups.value = [];
	});

	test.each(['notes/show', 'notes/likes/create', 'notes/likes/delete'] as const)('does not open a blank dialog before or after %s', async endpoint => {
		let finish!: (value: unknown) => void;
		const request = new Promise(resolve => { finish = resolve; });
		mocks.api.mockReturnValue(request);
		const result = apiWithDialog(endpoint, { noteId: 'note' });
		expect(result).toBe(request);
		expect(popups.value).toEqual([]);
		finish({ id: 'note' });
		await result;
		await nextTick();
		expect(popups.value).toEqual([]);
	});

	test('preserves error messages and rejects the request without a waiting popup', async () => {
		const error = { code: 'RATE_LIMIT_EXCEEDED', id: 'limited', message: 'Too many requests' };
		mocks.api.mockRejectedValue(error);
		await expect(apiWithDialog('notes/show', { noteId: 'note' })).rejects.toBe(error);
		await nextTick();
		expect(popups.value).toHaveLength(1);
		expect(popups.value[0].props).toMatchObject({ type: 'error', title: i18n.ts.cannotPerformTemporary, text: i18n.ts.cannotPerformTemporaryDescription });
	});

	test('shows network failures even when they have no API error code', async () => {
		const error = new TypeError('Failed to fetch');
		mocks.api.mockRejectedValue(error);
		await expect(apiWithDialog('notes/show', { noteId: 'note' })).rejects.toBe(error);
		await nextTick();
		expect(popups.value).toHaveLength(1);
		expect(popups.value[0].props).toMatchObject({ type: 'error', text: 'Failed to fetch' });
	});

	test('retains custom error explanations', async () => {
		const error = { code: 'ACCESS_DENIED', id: 'denied', message: 'No access' };
		mocks.api.mockRejectedValue(error);
		await expect(apiWithDialog('notes/show', { noteId: 'note' }, undefined, { denied: { title: 'Permission', text: 'This post is unavailable.' } })).rejects.toBe(error);
		await nextTick();
		expect(popups.value[0].props).toMatchObject({ title: 'Permission', text: 'This post is unavailable.' });
	});

	test('displays an explicit progress message and closes it on completion', async () => {
		let finish!: (value: number) => void;
		const request = new Promise<number>(resolve => { finish = resolve; });
		const complete = vi.fn();
		promiseDialog(request, complete, null, 'Fetching the requested post');
		expect(popups.value).toHaveLength(1);
		expect(popups.value[0].props).toMatchObject({ text: 'Fetching the requested post', success: false, showing: true });
		finish(7);
		await request;
		await nextTick();
		expect(complete).toHaveBeenCalledExactlyOnceWith(7);
		expect(popups.value[0].props).toMatchObject({ showing: false, success: false });
		popups.value[0].events.closed();
		await nextTick();
		expect(popups.value).toEqual([]);
	});

	test('does not render whitespace-only progress messages', async () => {
		const request = Promise.resolve(7);
		promiseDialog(request, null, null, '  ');
		await request;
		expect(popups.value).toEqual([]);
	});
});
