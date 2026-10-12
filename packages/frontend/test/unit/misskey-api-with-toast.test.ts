/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, expect, test, vi } from 'vitest';
import { misskeyApiWithToast, misskeyApiWithErrorToast } from '@/utility/misskey-api-with-toast.js';
import { markAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => ({ toast: mocks.toast }));
beforeEach(() => { vi.clearAllMocks(); });

test('only announces success after the request completes and returns its result', async () => {
	let finish!: (result: unknown) => void;
	mocks.api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
	const action = misskeyApiWithToast('i/update', { name: 'Updated' });
	expect(mocks.toast).not.toHaveBeenCalled();
	finish({ name: 'Updated' });
	expect(await action).toEqual({ name: 'Updated' });
	expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts.saved, 'success');
});

test('preserves rejection so the form can retry and shows an error instead of success', async () => {
	const error = new Error('offline');
	mocks.api.mockRejectedValueOnce(error);
	await expect(misskeyApiWithToast('i/update', { name: 'Keep me' })).rejects.toBe(error);
	expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts.somethingHappened, 'error');
});

test('avoids a duplicate session error notification', async () => {
	const error = { code: 'ACCOUNT_SUSPENDED' };
	markAccountSessionErrorHandled(error);
	mocks.api.mockRejectedValueOnce(error);
	await expect(misskeyApiWithToast('i/update', {})).rejects.toBe(error);
	expect(mocks.toast).not.toHaveBeenCalled();
});

test('error-only requests return quietly on success and notify once on failure', async () => {
	mocks.api.mockResolvedValueOnce({ id: 'message' });
	expect(await misskeyApiWithErrorToast('users/show', { userId: 'user' })).toEqual({ id: 'message' });
	expect(mocks.toast).not.toHaveBeenCalled();
	mocks.api.mockRejectedValueOnce(new Error('offline'));
	await expect(misskeyApiWithErrorToast('users/show', { userId: 'user' })).rejects.toThrow('offline');
	expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts.somethingHappened, 'error');
});

test.each([
	['chat/rooms/create', () => i18n.ts._chat.roomCreated],
	['chat/rooms/update', () => i18n.ts.saved],
	['chat/rooms/delete', () => i18n.ts._chat.roomDeleted],
	['chat/rooms/join', () => i18n.ts._chat.roomJoined],
	['chat/rooms/leave', () => i18n.ts._chat.roomLeft],
	['chat/rooms/members/update', () => i18n.ts.saved],
	['chat/rooms/members/delete', () => i18n.ts._chat.memberRemoved],
] as const)('%s 成功后显示简短反馈，失败不显示成功', async (endpoint, message) => {
	mocks.api.mockResolvedValueOnce({});
	await misskeyApiWithErrorToast(endpoint, {} as never);
	expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(message(), 'success');
	mocks.toast.mockClear();
	mocks.api.mockRejectedValueOnce(new Error('failed'));
	await expect(misskeyApiWithErrorToast(endpoint, {} as never)).rejects.toThrow('failed');
	expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts.somethingHappened, 'error');
});

test.each([
	['none', 'invitationChatDisabled'],
	['followers', 'invitationFollowersOnly'],
	['following', 'invitationFollowingOnly'],
	['mutual', 'invitationMutualOnly'],
] as const)('邀请失败只显示 %s 对应的准确原因', async (chatScope, key) => {
	const error = { code: 'INVALID_INVITEE', info: { reason: 'privacy', chatScope } };
	mocks.api.mockRejectedValueOnce(error);
	await expect(misskeyApiWithErrorToast('chat/rooms/invitations/create', { roomId: 'room', userId: 'peer' })).rejects.toBe(error);
	expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts._chat[key], 'error');
});
