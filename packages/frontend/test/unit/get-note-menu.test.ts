/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ref } from 'vue';
import type * as Misskey from 'misskey-js';
import type { MenuButton } from '@/types/menu.js';
import { getNoteClipMenu, getNoteMenu, getRenoteMenu } from '@/utility/get-note-menu.js';
import { markAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	edit: vi.fn(),
	confirm: vi.fn(),
	post: vi.fn(),
	share: vi.fn(),
	copyLink: vi.fn(),
	apiWithDialog: vi.fn(),
	toast: vi.fn(),
	success: vi.fn(),
	form: vi.fn(),
	achievement: vi.fn(),
	clipsFetch: vi.fn(),
	clipsSet: vi.fn(),
	clipsDelete: vi.fn(),
	channelsFetch: vi.fn(),
	postEvent: vi.fn(),
	popupAsyncWithDialog: vi.fn(),
}));
vi.mock('@/i.js', () => ({ $i: { id: 'self', policies: { canUseTranslator: true }, pinnedNoteIds: [] } }));
vi.mock('@/os.js', () => ({ confirm: mocks.confirm, post: mocks.post, apiWithDialog: mocks.apiWithDialog, toast: mocks.toast, success: mocks.success, form: mocks.form, popupAsyncWithDialog: mocks.popupAsyncWithDialog }));
vi.mock('@/components/MkTipDialog.vue', () => ({ default: {} }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/edit-note.js', () => ({ editNote: mocks.edit }));
vi.mock('@/utility/share-note.js', () => ({ shareNote: mocks.share, copyNoteLink: mocks.copyLink }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: mocks.achievement }));
vi.mock('@/utility/get-user-menu.js', () => ({ getUserMenu: vi.fn() }));
vi.mock('@/utility/get-embed-code.js', () => ({ genEmbedCode: vi.fn() }));
vi.mock('@/cache.js', () => ({ clipsCache: { fetch: mocks.clipsFetch, set: mocks.clipsSet, delete: mocks.clipsDelete }, favoritedChannelsCache: { fetch: mocks.channelsFetch } }));
vi.mock('@/events.js', () => ({ globalEvents: { emit: mocks.postEvent, on: vi.fn() }, useGlobalEvent: vi.fn() }));
vi.mock('@/instance.js', () => ({ instance: { translatorAvailable: true } }));
vi.mock('@/store.js', () => ({ store: { s: {} } }));
vi.mock('@/plugin.js', () => ({ getPluginHandlers: () => [] }));

function makeNote(overrides: Partial<Misskey.entities.Note> = {}): Misskey.entities.Note {
	return {
		id: 'post', userId: 'self', user: { id: 'self', username: 'self', host: null },
		createdAt: '2026-09-01T00:00:00.000Z', text: 'Original', cw: null,
		replyId: null, renoteId: null, visibility: 'public',
		...overrides,
	} as Misskey.entities.Note;
}

async function getButtons(note: Misskey.entities.Note, menuContext?: 'list' | 'detail'): Promise<MenuButton[]> {
	const { menu } = getNoteMenu({ note, menuContext, translation: ref(null), translating: ref(false) });
	return (await Promise.all(menu)).filter((item): item is MenuButton => !item.type || item.type === 'button');
}

describe('note editing menu', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.api.mockResolvedValue({ isMutedThread: false });
	});

	test('opens the shared dialog from the note menu', async () => {
		const note = makeNote();
		const buttons = await getButtons(note);
		await buttons.find(item => item.text === i18n.ts.share)!.action(new PointerEvent('click'));
		expect(mocks.share).toHaveBeenCalledExactlyOnceWith(note);
	});

	test('uses verified link copying from the note menu', async () => {
		const note = makeNote();
		const buttons = await getButtons(note);
		await buttons.find(item => item.text === i18n.ts.copyLink)!.action(new PointerEvent('click'));
		expect(mocks.copyLink).toHaveBeenCalledExactlyOnceWith(note);
	});

	test.each(([undefined, 'list', 'detail'] as const).flatMap(menuContext => [false, true].map(renoted => ({ menuContext, renoted }))))('仅详情菜单提供帖子打赏，场景=$menuContext，纯转发=$renoted', async ({ menuContext, renoted }) => {
		const original = makeNote({ id: 'original', userId: 'author', user: { id: 'author', username: 'author', host: null } as Misskey.entities.UserLite });
		const note = renoted ? makeNote({ text: null, renoteId: original.id, renote: original }) : original;
		const dispose = vi.fn();
		mocks.popupAsyncWithDialog.mockResolvedValue({ dispose });
		const buttons = await getButtons(note, menuContext);
		const tip = buttons.find(item => item.text === i18n.ts._tip.title);
		if (menuContext !== 'detail') {
			expect(tip).toBeUndefined();
			return;
		}
		await tip!.action(new PointerEvent('click'));
		expect(mocks.popupAsyncWithDialog).toHaveBeenCalledExactlyOnceWith(expect.any(Promise), {
			recipient: original.user, target: { type: 'note', id: original.id },
		}, expect.any(Object));
		mocks.popupAsyncWithDialog.mock.calls[0][2].closed();
		expect(dispose).toHaveBeenCalledOnce();
	});

	test.each([
		{ userId: 'self' },
		{ userId: 'other', user: { id: 'other', host: 'remote.test' } },
		{ userId: 'other', isHidden: true },
	])('不向本人、远程或隐藏帖子提供打赏：%j', async overrides => {
		const buttons = await getButtons(makeNote(overrides as Partial<Misskey.entities.Note>), 'detail');
		expect(buttons.some(item => item.text === i18n.ts._tip.title)).toBe(false);
	});

	test.each([
		['a post', {}],
		['a reply', { replyId: 'parent' }],
		['a quote', { renoteId: 'quoted' }],
	] as const)('keeps editing %s separate from deleting it', async (_label, overrides) => {
		const note = makeNote(overrides);
		const buttons = await getButtons(note);
		const edit = buttons.find(item => item.text === i18n.ts.edit);
		expect(edit).toBeDefined();
		expect(buttons.some(item => item.text === i18n.ts.delete)).toBe(true);
		expect(buttons.some(item => item.text === i18n.ts.deleteAndEdit)).toBe(false);
		await edit!.action(new PointerEvent('click'));
		expect(mocks.edit).toHaveBeenCalledExactlyOnceWith(note);
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('notes/state', { noteId: note.id });
		expect(mocks.confirm).not.toHaveBeenCalled();
		expect(mocks.post).not.toHaveBeenCalled();
	});

	test.each([
		['another author', { userId: 'other' }],
		['a remote post', { user: { id: 'self', username: 'self', host: 'remote.test' } }],
		['a pure renote', { renoteId: 'quoted', text: null }],
	] as const)('does not expose editing for %s', async (_label, overrides) => {
		const buttons = await getButtons(makeNote(overrides as Partial<Misskey.entities.Note>));
		expect(buttons.some(item => item.text === i18n.ts.edit)).toBe(false);
		expect(buttons.some(item => item.text === i18n.ts.deleteAndEdit)).toBe(false);
	});
});

describe('note menu request feedback', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.api.mockResolvedValue({ isMutedThread: false });
		mocks.clipsFetch.mockResolvedValue([{ id: 'clip', name: 'Saved', userId: 'self', notesCount: 2 }]);
		mocks.channelsFetch.mockResolvedValue([{ id: 'other-channel', name: 'Other' }]);
	});

	async function clipAction() {
		const menu = await getNoteClipMenu({ note: makeNote() });
		return menu[0] as MenuButton;
	}

	test('updates the clip count and achievement only after adding the note succeeds', async () => {
		const response = Promise.withResolvers<void>();
		mocks.api.mockReturnValueOnce(response.promise);
		const item = await clipAction();
		const action = item.action(new PointerEvent('click'));
		expect(mocks.achievement).not.toHaveBeenCalled();
		expect(mocks.clipsSet).not.toHaveBeenCalled();
		response.resolve();
		await action;
		expect(mocks.achievement).toHaveBeenCalledExactlyOnceWith('noteClipped1');
		expect(mocks.clipsSet.mock.calls[0][0][0].notesCount).toBe(3);
		expect(mocks.toast).not.toHaveBeenCalled();
	});

	test.each([false, true])('consumes a failed clip request and respects session error handling (%s)', async (handled) => {
		const error = { code: 'ACCOUNT_SUSPENDED' };
		if (handled) markAccountSessionErrorHandled(error);
		mocks.api.mockRejectedValueOnce(error);
		const item = await clipAction();
		await item.action(new PointerEvent('click'));
		expect(mocks.achievement).not.toHaveBeenCalled();
		expect(mocks.clipsSet).not.toHaveBeenCalled();
		if (handled) expect(mocks.toast).not.toHaveBeenCalled();
		else expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts.somethingHappened, 'error');
	});

	test.each([true, false])('confirms removal of an already clipped note and applies only successful removal (%s)', async (canceled) => {
		mocks.api.mockRejectedValueOnce({ id: '734806c4-542c-463a-9311-15c512803965' });
		mocks.confirm.mockResolvedValueOnce({ canceled });
		mocks.apiWithDialog.mockResolvedValueOnce(undefined);
		const item = await clipAction();
		await item.action(new PointerEvent('click'));
		expect(mocks.confirm).toHaveBeenCalledTimes(1);
		expect(mocks.achievement).not.toHaveBeenCalled();
		if (canceled) {
			expect(mocks.apiWithDialog).not.toHaveBeenCalled();
			expect(mocks.clipsSet).not.toHaveBeenCalled();
		} else {
			expect(mocks.apiWithDialog).toHaveBeenCalledExactlyOnceWith('clips/remove-note', { clipId: 'clip', noteId: 'post' });
			expect(mocks.clipsSet.mock.calls[0][0][0].notesCount).toBe(1);
		}
		expect(mocks.toast).not.toHaveBeenCalled();
	});

	test('does not award clipping when creating a clip succeeds but adding the note fails', async () => {
		mocks.form.mockResolvedValueOnce({ canceled: false, result: { name: 'New', isPublic: false } });
		mocks.apiWithDialog.mockResolvedValueOnce({ id: 'new-clip' }).mockRejectedValueOnce(new Error('offline'));
		const menu = await getNoteClipMenu({ note: makeNote() });
		await (menu.at(-1) as MenuButton).action(new PointerEvent('click'));
		expect(mocks.clipsDelete).toHaveBeenCalledTimes(1);
		expect(mocks.achievement).not.toHaveBeenCalled();
		expect(mocks.toast).not.toHaveBeenCalled();
	});

	test.each(['normal', 'channel', 'other-channel'] as const)('%s renote handles failure without posting a success event, then allows retry', async (path) => {
		const note = makeNote(path === 'channel' ? { channelId: 'channel', channel: { id: 'channel', name: 'Channel', allowRenoteToExternal: true } as Misskey.entities.Note['channel'] } : {});
		const { menu } = getRenoteMenu({ note, renoteButton: ref(null) });
		let item: MenuButton;
		if (path === 'other-channel') {
			const parent = menu.find(candidate => 'type' in candidate && candidate.type === 'parent')!;
			if (!('children' in parent) || typeof parent.children !== 'function') throw new Error('Missing channel submenu');
			item = (await parent.children())[0] as MenuButton;
		} else {
			item = menu.find(candidate => 'text' in candidate && candidate.text === (path === 'channel' ? i18n.ts.inChannelRenote : i18n.ts.renote)) as MenuButton;
		}
		mocks.apiWithDialog.mockRejectedValueOnce(new Error('offline'));
		await item.action(new PointerEvent('click'));
		expect(mocks.success).not.toHaveBeenCalled();
		expect(mocks.postEvent).not.toHaveBeenCalled();
		mocks.apiWithDialog.mockResolvedValueOnce({ createdNote: { id: 'renote' } });
		await item.action(new PointerEvent('click'));
		expect(mocks.success).toHaveBeenCalledTimes(1);
		expect(mocks.postEvent).toHaveBeenCalledExactlyOnceWith('notePosted', { id: 'renote' });
	});

	test('ends translation loading after failure and lets the user retry', async () => {
		const translation = ref<Misskey.entities.NotesTranslateResponse | null>(null);
		const translating = ref(false);
		const { menu } = getNoteMenu({ note: makeNote(), translation, translating });
		const buttons = (await Promise.all(menu)).filter((item): item is MenuButton => !item.type || item.type === 'button');
		const item = buttons.find(button => button.text === i18n.ts.translate)!;
		mocks.apiWithDialog.mockRejectedValueOnce(new Error('offline'));
		await item.action(new PointerEvent('click'));
		expect(translating.value).toBe(false);
		expect(translation.value).toBeNull();
		mocks.apiWithDialog.mockResolvedValueOnce({ sourceLang: 'en', text: '翻译内容' });
		await item.action(new PointerEvent('click'));
		expect(translating.value).toBe(false);
		expect(translation.value?.text).toBe('翻译内容');
		expect(mocks.toast).not.toHaveBeenCalled();
	});
});
