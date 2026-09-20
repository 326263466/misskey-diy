/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { reactive } from 'vue';
import type * as Misskey from 'misskey-js';
import { useLike } from '@/composables/use-like.js';
import { globalEvents } from '@/events.js';

const mocks = vi.hoisted(() => ({ apiWithDialog: vi.fn(), pleaseLogin: vi.fn(), showMovedDialog: vi.fn() }));
vi.mock('@/os.js', () => ({ apiWithDialog: mocks.apiWithDialog }));
vi.mock('@/utility/please-login.js', () => ({ pleaseLogin: mocks.pleaseLogin }));
vi.mock('@/utility/show-moved-dialog.js', () => ({ showMovedDialog: mocks.showMovedDialog }));

function makeNote(overrides: Partial<Misskey.entities.Note> = {}): Misskey.entities.Note {
	return {
		id: 'post', reactions: { '\u2764': 7 }, myReaction: '\u2764', reactionCount: 7,
		...overrides,
	} as Misskey.entities.Note;
}

const noteId = 'post';

function likeState(isLiked = false): Misskey.entities.LikeState {
	return { likeCount: isLiked ? 1 : 0, isLiked, likeUsers: [] };
}

describe('independent content likes', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.pleaseLogin.mockResolvedValue(true);
		mocks.apiWithDialog.mockResolvedValue(likeState(true));
	});
	afterEach(() => vi.restoreAllMocks());

	test.each([
		{ liked: false, endpoint: 'notes/likes/create' },
		{ liked: true, endpoint: 'notes/likes/delete' },
	])('uses $endpoint and leaves the existing reaction intact', async ({ liked, endpoint }) => {
		const note = makeNote();
		const original = structuredClone(note);
		const state = reactive({ ...note, ...likeState(liked) });
		const updated = likeState(!liked);
		mocks.apiWithDialog.mockResolvedValue(updated);
		const emit = vi.spyOn(globalEvents, 'emit');
		const action = useLike(noteId, state);

		await action.toggleLike();
		expect(mocks.apiWithDialog).toHaveBeenCalledExactlyOnceWith(endpoint, { noteId });
		expect(emit).toHaveBeenCalledExactlyOnceWith('likesUpdated', noteId, updated);
		expect(state).toEqual({ ...original, ...likeState(liked) });
		expect(action.liking.value).toBe(false);
	});

	test('does not issue another request while login or the like request is pending', async () => {
		let finishLogin!: (value: boolean) => void;
		let finishRequest!: (value: Misskey.entities.LikeState) => void;
		mocks.pleaseLogin.mockImplementation(() => new Promise<boolean>(resolve => { finishLogin = resolve; }));
		mocks.apiWithDialog.mockImplementation(() => new Promise<Misskey.entities.LikeState>(resolve => { finishRequest = resolve; }));
		const emit = vi.spyOn(globalEvents, 'emit');
		const action = useLike(noteId, likeState());

		const request = action.toggleLike();
		expect(action.liking.value).toBe(true);
		await action.toggleLike();
		expect(mocks.pleaseLogin).toHaveBeenCalledTimes(1);
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
		finishLogin(true);
		await Promise.resolve();
		await action.toggleLike();
		expect(mocks.apiWithDialog).toHaveBeenCalledTimes(1);
		expect(emit).not.toHaveBeenCalled();

		finishRequest(likeState(true));
		await request;
		expect(emit).toHaveBeenCalledExactlyOnceWith('likesUpdated', noteId, likeState(true));
		expect(action.liking.value).toBe(false);
	});

	test.each([false, true])('preserves likes and reactions on a failed toggle from liked=%s and permits retry', async liked => {
		const note = makeNote();
		const state = reactive(likeState(liked));
		const emit = vi.spyOn(globalEvents, 'emit');
		const action = useLike(noteId, state);
		mocks.apiWithDialog.mockRejectedValueOnce(new Error('request failed'));

		await expect(action.toggleLike()).resolves.toBeUndefined();
		expect(emit).not.toHaveBeenCalled();
		expect(state).toEqual(likeState(liked));
		expect(note).toEqual(makeNote());
		expect(action.liking.value).toBe(false);

		mocks.apiWithDialog.mockResolvedValueOnce(likeState(!liked));
		await action.toggleLike();
		expect(mocks.apiWithDialog).toHaveBeenCalledTimes(2);
		expect(emit).toHaveBeenCalledExactlyOnceWith('likesUpdated', noteId, likeState(!liked));
	});

	test('returns without changing data when login is canceled', async () => {
		mocks.pleaseLogin.mockResolvedValueOnce(false);
		const emit = vi.spyOn(globalEvents, 'emit');
		const action = useLike(noteId, likeState());
		await action.toggleLike();
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
		expect(mocks.showMovedDialog).not.toHaveBeenCalled();
		expect(emit).not.toHaveBeenCalled();
		expect(action.liking.value).toBe(false);
	});

	test.each([
		{ mock: true, disabled: false },
		{ mock: false, disabled: true },
	])('does not change mocked or disabled content: %o', async ({ mock, disabled }) => {
		const action = useLike(noteId, likeState(), { mock, disabled: () => disabled });
		await action.toggleLike();
		expect(mocks.pleaseLogin).not.toHaveBeenCalled();
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
		expect(action.liking.value).toBe(false);
	});
});
