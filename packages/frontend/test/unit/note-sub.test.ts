/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import MkNoteSub from '@/components/MkNoteSub.vue';
import { globalEvents } from '@/events.js';
import { i18n } from '@/i18n.js';
import type { MenuButton } from '@/types/menu.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn<(endpoint: string) => Promise<Misskey.entities.Note[]>>(async () => []), apiWithDialog: vi.fn(), post: vi.fn(),
	popupMenu: vi.fn(), confirm: vi.fn(), form: vi.fn(),
}));
vi.mock('@/i.js', () => ({ $i: { id: 'self', mutedWords: [], policies: { chatAvailability: 'available' } }, iAmModerator: false }));
vi.mock('@/os.js', () => mocks);
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/please-login.js', () => ({ pleaseLogin: async () => true }));
vi.mock('@/utility/show-moved-dialog.js', () => ({ showMovedDialog: () => {} }));
vi.mock('@/utility/get-note-menu.js', () => ({ getAbuseNoteMenu: (_note: unknown, text: string) => ({ text, action: vi.fn() }) }));
vi.mock('@/components/MkNoteHeader.vue', () => ({ default: { props: ['note'], template: '<header>{{ note.user.username }}</header>' } }));
vi.mock('@/components/MkSubNoteContent.vue', () => ({ default: { props: ['note'], template: '<p>{{ note.text }}</p>' } }));

function makeNote(id: string, overrides: Partial<Misskey.entities.Note> = {}): Misskey.entities.Note {
	return {
		id, createdAt: '2026-09-05T01:00:00.000Z', userId: 'self',
		user: { id: 'self', username: 'self', host: null } as Misskey.entities.UserLite,
		text: id, cw: null, visibility: 'public', localOnly: false,
		reactionCount: 0, reactions: {}, reactionEmojis: {}, repliesCount: 0, renoteCount: 0, replyId: 'original',
		reactionAcceptance: null,
		...overrides,
	};
}

function renderComment(note: Misskey.entities.Note) {
	return render(MkNoteSub, {
		props: { note, detail: true },
		global: {
			stubs: {
				MkAvatar: true,
				MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
				MkTime: { props: ['time'], template: '<time :datetime="time">{{ time }}</time>' },
			},
			directives: { tooltip: () => {} },
		},
	});
}

describe('comment actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.api.mockResolvedValue([]);
		mocks.apiWithDialog.mockResolvedValue(undefined);
		mocks.post.mockResolvedValue(undefined);
		mocks.popupMenu.mockResolvedValue(undefined);
		mocks.confirm.mockResolvedValue({ canceled: false });
	});
	afterEach(() => cleanup());

	test('renders actions beneath both parent and child comments', async () => {
		const parent = makeNote('parent', { repliesCount: 1 });
		const child = makeNote('child', { replyId: parent.id });
		mocks.api.mockImplementation(async (endpoint: string) => endpoint === 'notes/replies' ? [child] : []);
		const view = renderComment(parent);
		await waitFor(() => expect(view.container.querySelectorAll('footer time')).toHaveLength(2));
		expect(view.getAllByRole('button', { name: i18n.ts.like })).toHaveLength(2);
		await fireEvent.click(view.getAllByRole('button', { name: i18n.ts.reply })[1]);
		await waitFor(() => expect(mocks.post).toHaveBeenCalledWith({ reply: child, channel: undefined }));
	});

	test('toggles existing reactions and refreshes the count immediately', async () => {
		const view = renderComment(makeNote('liked-comment'));
		const like = view.getByRole('button', { name: i18n.ts.like });
		await fireEvent.click(like);
		await waitFor(() => expect(like.getAttribute('aria-pressed')).toBe('true'));
		expect(like.textContent).toContain('1');
		expect(mocks.apiWithDialog).toHaveBeenCalledWith('notes/reactions/create', { noteId: 'liked-comment', reaction: '\u2764\ufe0f' });
		await fireEvent.click(like);
		await waitFor(() => expect(like.getAttribute('aria-pressed')).toBe('false'));
	});

	test('adds descendants once and shows edits without losing their children or likes', async () => {
		const parent = makeNote('live-parent', { reactions: { '\u2764\ufe0f': 12 }, reactionCount: 12 });
		const child = makeNote('live-child', { replyId: parent.id });
		const view = renderComment(parent);
		globalEvents.emit('notePosted', child);
		globalEvents.emit('notePosted', child);
		globalEvents.emit('noteEdited', parent.id, { text: 'Updated parent', cw: null });
		await nextTick();
		expect(view.getByText('Updated parent')).toBeTruthy();
		expect(view.getAllByText('live-child')).toHaveLength(1);
		expect(view.getAllByRole('button', { name: i18n.ts.like })[0].textContent).toContain('12');
		globalEvents.emit('noteDeleted', child.id, parent.id);
		await nextTick();
		expect(view.queryByText('live-child')).toBeNull();
	});

	test('offers separate delete and edit actions and never deletes when editing', async () => {
		const note = makeNote('own-comment');
		const view = renderComment(note);
		mocks.form.mockResolvedValue({ canceled: false, result: { text: 'Edited comment', cw: '' } });
		mocks.apiWithDialog.mockResolvedValue({ ...note, text: 'Edited comment' });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.more }));
		await waitFor(() => expect(mocks.popupMenu).toHaveBeenCalled());
		const menu = mocks.popupMenu.mock.calls[0][0] as MenuButton[];
		expect(menu.map(item => item.text)).toEqual([i18n.ts.delete, i18n.ts.edit]);
		await menu[1].action(new MouseEvent('click') as PointerEvent);
		expect(mocks.apiWithDialog).toHaveBeenCalledExactlyOnceWith('notes/update', { noteId: note.id, text: 'Edited comment', cw: null });
		expect(view.getByText('Edited comment')).toBeTruthy();
	});

	test('offers report and block for another author', async () => {
		const note = makeNote('other-comment', { userId: 'other', user: { id: 'other', username: 'other', host: null } as Misskey.entities.UserLite });
		const view = renderComment(note);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.more }));
		await waitFor(() => expect(mocks.popupMenu).toHaveBeenCalled());
		const menu = mocks.popupMenu.mock.calls[0][0] as MenuButton[];
		expect(menu.map(item => item.text)).toEqual([i18n.ts.reportAbuse, i18n.ts.block]);
		await menu[1].action(new MouseEvent('click') as PointerEvent);
		expect(mocks.apiWithDialog).toHaveBeenCalledWith('blocking/create', { userId: note.userId });
	});
});
