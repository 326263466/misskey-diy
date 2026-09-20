/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ref } from 'vue';
import type * as Misskey from 'misskey-js';
import type { MenuButton } from '@/types/menu.js';
import { getNoteMenu } from '@/utility/get-note-menu.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	edit: vi.fn(),
	confirm: vi.fn(),
	post: vi.fn(),
}));
vi.mock('@/i.js', () => ({ $i: { id: 'self', policies: {}, pinnedNoteIds: [] } }));
vi.mock('@/os.js', () => ({ confirm: mocks.confirm, post: mocks.post }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/edit-note.js', () => ({ editNote: mocks.edit }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: vi.fn() }));
vi.mock('@/utility/get-user-menu.js', () => ({ getUserMenu: vi.fn() }));
vi.mock('@/utility/get-embed-code.js', () => ({ genEmbedCode: vi.fn() }));
vi.mock('@/cache.js', () => ({ clipsCache: {}, favoritedChannelsCache: {} }));
vi.mock('@/instance.js', () => ({ instance: {} }));
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

async function getButtons(note: Misskey.entities.Note): Promise<MenuButton[]> {
	const { menu } = getNoteMenu({ note, translation: ref(null), translating: ref(false) });
	return (await Promise.all(menu)).filter((item): item is MenuButton => !item.type || item.type === 'button');
}

describe('note editing menu', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.api.mockResolvedValue({ isMutedThread: false });
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
