/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, reactive, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import type { MenuButton, MenuItem } from '@/types/menu.js';
import { useNote } from '@/composables/use-note.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	popupMenu: vi.fn(),
	getRenoteMenu: vi.fn(),
	getAbuseNoteMenu: vi.fn(),
	getMyRenoteId: vi.fn(),
	unregisterMyRenote: vi.fn(),
	canShare: vi.fn(), copy: vi.fn(), alert: vi.fn(),
	account: { id: 'self', isBot: false, isModerator: false, isAdmin: false, mutedWords: [], hardMutedWords: [] },
}));

vi.mock('@/i.js', () => ({ $i: mocks.account }));
vi.mock('@/os.js', () => ({ popupMenu: mocks.popupMenu, alert: mocks.alert }));
vi.mock('@/utility/navigator.js', () => ({ isSupportShare: mocks.canShare }));
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: mocks.copy }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api, misskeyApiGet: mocks.api }));
vi.mock('@/utility/get-note-menu.js', () => ({
	getRenoteMenu: mocks.getRenoteMenu,
	getAbuseNoteMenu: mocks.getAbuseNoteMenu,
	getCopyNoteLinkMenu: (_note: unknown, text: string) => ({ text, action: vi.fn() }),
	getNoteMenu: vi.fn(),
	getNoteClipMenu: vi.fn(),
}));
vi.mock('@/composables/use-note-capture.js', () => ({
	getMyRenoteId: mocks.getMyRenoteId,
	unregisterMyRenote: mocks.unregisterMyRenote,
	noteEvents: { emit: vi.fn() },
	useNoteCaptureVisibility: () => ref(true),
	useNoteCapture: ({ note }: { note: Misskey.entities.Note }) => ({ $note: reactive(note), subscribe: vi.fn() }),
}));
vi.mock('@/composables/use-like.js', () => ({ useLike: () => ({ liking: ref(false), toggleLike: vi.fn() }) }));
vi.mock('@/composables/use-tooltip.js', () => ({ useTooltip: vi.fn() }));
vi.mock('@/utility/please-login.js', () => ({ pleaseLogin: async () => true }));
vi.mock('@/utility/show-moved-dialog.js', () => ({ showMovedDialog: vi.fn() }));
vi.mock('@/utility/sound.js', () => ({ playMisskeySfx: vi.fn() }));
vi.mock('@/utility/reaction-picker.js', () => ({ reactionPicker: {} }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: vi.fn() }));
vi.mock('@/plugin.js', () => ({ getPluginHandlers: () => [] }));
vi.mock('@/components/MkUsersTooltip.vue', () => ({ default: {} }));
vi.mock('@/components/MkReactionsViewer.details.vue', () => ({ default: {} }));
vi.mock('@/components/MkRippleEffect.vue', () => ({ default: {} }));
vi.mock('@/components/MkBoostComposer.vue', () => ({ default: {} }));

function makeNote(id: string, overrides: Partial<Misskey.entities.Note> = {}): Misskey.entities.Note {
	return {
		id, createdAt: '2026-09-08T00:00:00.000Z', userId: 'other',
		user: { id: 'other', username: 'other', host: null } as Misskey.entities.UserLite,
		text: 'Original post', cw: null, visibility: 'public', localOnly: false,
		replyId: null, renoteId: null, fileIds: [], files: [],
		reactionCount: 0, reactions: {}, reactionEmojis: {}, repliesCount: 0, renoteCount: 2,
		viewsCount: 0, favoritesCount: 0,
		reactionAcceptance: null, likeCount: 0, isLiked: false, likeUsers: [],
		...overrides,
	};
}

function mountNote(note: Misskey.entities.Note): ReturnType<typeof useNote> {
	let state!: ReturnType<typeof useNote>;
	render(defineComponent({
		setup() {
			state = useNote({ note }, { renoteButton: ref(document.createElement('button')) });
			return {};
		},
		template: '<div></div>',
	}));
	return state;
}

function latestMenu(): MenuItem[] {
	return mocks.popupMenu.mock.calls.at(-1)![0];
}

function findButton(text: string): MenuButton | undefined {
	return latestMenu().find((item): item is MenuButton => 'text' in item && (!('type' in item) || item.type === 'button') && item.text === text);
}

describe('renote actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.account.isModerator = false;
		mocks.account.isAdmin = false;
		mocks.api.mockResolvedValue(undefined);
		mocks.popupMenu.mockResolvedValue(undefined);
		mocks.getMyRenoteId.mockReturnValue(null);
		mocks.canShare.mockReturnValue(false);
		mocks.getRenoteMenu.mockReturnValue({ menu: [{ text: i18n.ts.renote, action: vi.fn() }, { text: i18n.ts.quote, action: vi.fn() }] });
		mocks.getAbuseNoteMenu.mockImplementation((_note, text) => ({ text, action: vi.fn() }));
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	test('shares through link copying on browsers without native sharing', async () => {
		const state = mountNote(makeNote('share-original'));
		await state.share();
		expect(mocks.copy).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('/notes/share-original'));
	});

	test('does not display an error when native sharing is canceled', async () => {
		mocks.canShare.mockReturnValue(true);
		const share = vi.fn().mockRejectedValue(new DOMException('Canceled', 'AbortError'));
		vi.stubGlobal('navigator', { share });
		const state = mountNote(makeNote('share-original'));
		await state.share();
		expect(share).toHaveBeenCalledOnce();
		expect(mocks.alert).not.toHaveBeenCalled();
	});

	test('keeps the original post renote and quote menu after the user has renoted it', async () => {
		const source = makeNote('original');
		mocks.getMyRenoteId.mockReturnValue('my-renote');
		const state = mountNote(source);
		expect(state.isRenotedByMe.value).toBe(true);
		await state.toggleRenote();
		await state.toggleRenote();
		expect(mocks.getRenoteMenu).toHaveBeenCalledTimes(2);
		expect(mocks.getRenoteMenu).toHaveBeenLastCalledWith(expect.objectContaining({ note: source }));
		expect(findButton(i18n.ts.renote)).toBeDefined();
		expect(findButton(i18n.ts.quote)).toBeDefined();
		expect(findButton(i18n.ts.unrenote)).toBeUndefined();
	});

	test('cancels the current own renote instead of the most recent renote of its source', async () => {
		const source = makeNote('original');
		const current = makeNote('older-renote', { userId: 'self', text: null, renoteId: source.id, renote: source });
		mocks.getMyRenoteId.mockReturnValue('newer-renote');
		const state = mountNote(current);
		await state.toggleRenote();
		expect(mocks.getRenoteMenu).not.toHaveBeenCalled();
		await findButton(i18n.ts.unrenote)!.action(new PointerEvent('click'));
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('notes/delete', { noteId: current.id });
		expect(mocks.unregisterMyRenote).toHaveBeenCalledWith(source.id, current.id);
		expect(state.isDeleted.value).toBe(true);
	});

	test('keeps someone else\'s renote reportable even when the user also renoted its source', async () => {
		const source = makeNote('original');
		const otherRenote = makeNote('other-renote', { text: null, renoteId: source.id, renote: source });
		mocks.getMyRenoteId.mockReturnValue('my-renote');
		const state = mountNote(otherRenote);
		await state.toggleRenote();
		expect(findButton(i18n.ts.unrenote)).toBeUndefined();
		expect(findButton(i18n.ts.reportAbuseRenote)).toBeDefined();
		await state.deleteRenote(otherRenote.id);
		expect(mocks.api).not.toHaveBeenCalled();
	});

	test('does not expose renote management or delete a saved renote from the original post', async () => {
		mocks.getMyRenoteId.mockReturnValue('my-renote');
		const state = mountNote(makeNote('original'));
		await state.showRenoteMenu();
		await state.deleteRenote();
		await state.deleteRenote('my-renote');
		expect(mocks.popupMenu).not.toHaveBeenCalled();
		expect(mocks.api).not.toHaveBeenCalled();
	});

	test('preserves moderation on the selected renote', async () => {
		mocks.account.isModerator = true;
		const source = makeNote('original');
		const current = makeNote('moderated-renote', { text: null, renoteId: source.id, renote: source });
		const state = mountNote(current);
		await state.toggleRenote();
		await findButton(i18n.ts.unrenote)!.action(new PointerEvent('click'));
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('notes/delete', { noteId: current.id });
	});
});
