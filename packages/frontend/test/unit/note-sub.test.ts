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
import { DI } from '@/di.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn<(endpoint: string, params?: { noteId?: string }) => Promise<Misskey.entities.Note[]>>(async () => []), apiWithDialog: vi.fn(), post: vi.fn(),
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
vi.mock('@/components/MkReactionsViewer.vue', () => ({ default: { props: ['reactions'], template: '<div data-testid="reactions">{{ reactions }}</div>' } }));

function makeNote(id: string, overrides: Partial<Misskey.entities.Note> = {}): Misskey.entities.Note {
	return {
		id, createdAt: '2026-09-05T01:00:00.000Z', userId: 'self',
		user: { id: 'self', username: 'self', host: null } as Misskey.entities.UserLite,
		text: id, cw: null, visibility: 'public', localOnly: false,
		reactionCount: 0, reactions: {}, reactionEmojis: {}, repliesCount: 0, renoteCount: 0, replyId: 'original',
		reactionAcceptance: null,
		likeCount: 0, isLiked: false, likeUsers: [],
		viewsCount: 0, favoritesCount: 0,
		...overrides,
	};
}

function renderComment(note: Misskey.entities.Note) {
	return render(MkNoteSub, {
		props: { note, detail: true },
		global: {
			provide: { [DI.mock]: true },
			stubs: {
				MkAvatar: { props: ['user'], template: '<img :alt="user.username" :src="user.avatarUrl" />' },
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

	test('replaces a deleted parent with a placeholder and preserves its children', async () => {
		const parent = makeNote('deleted-parent', { repliesCount: 1 });
		const child = makeNote('retained-child', { replyId: parent.id });
		mocks.api.mockResolvedValue([child]);
		const view = renderComment(parent);
		await waitFor(() => expect(view.getByText(child.text!)).toBeTruthy());
		globalEvents.emit('noteDeleted', parent.id, parent.replyId);
		await nextTick();
		expect(view.queryByText(parent.text!)).toBeNull();
		expect(view.getByRole('status').textContent).toBe(i18n.ts.deletedComment);
		expect(view.getAllByRole('img', { name: parent.user.username })).toHaveLength(2);
		expect(view.getByText(child.text!)).toBeTruthy();
		expect(view.getAllByRole('button', { name: i18n.ts.more })).toHaveLength(1);
	});

	test('loads retained descendants beneath a deleted comment after refresh', async () => {
		const parent = makeNote('deleted-parent', { isDeleted: true, text: null, repliesCount: 1 });
		const child = makeNote('retained-child', { replyId: parent.id });
		mocks.api.mockResolvedValue([child]);
		const view = renderComment(parent);
		await waitFor(() => expect(view.getByText(child.text!)).toBeTruthy());
		expect(view.getByRole('status').textContent).toBe(i18n.ts.deletedComment);
	});

	test('renders deleted comments as placeholders without their action controls', async () => {
		const parent = makeNote('parent-with-deleted-child', { repliesCount: 1 });
		mocks.api.mockResolvedValue([makeNote('deleted-child', { isDeleted: true, text: null, replyId: parent.id })]);
		const view = renderComment(parent);
		await waitFor(() => expect(view.getByRole('status').textContent).toBe(i18n.ts.deletedComment));
		expect(view.queryByRole('button', { name: i18n.ts.loadMore })).toBeNull();
		expect(view.getAllByRole('button', { name: i18n.ts.more })).toHaveLength(1);
	});

	test.each(['author', 'community'] as const)('shows source %s after refresh and preserves it across older deletion events', async deletedBy => {
		const note = makeNote(`deleted-by-${deletedBy}`, { isDeleted: true, deletedBy, text: null });
		const view = renderComment(note);
		const expected = deletedBy === 'author' ? i18n.ts.deletedCommentByAuthor : i18n.ts.deletedCommentByCommunity;
		expect(view.getByRole('status').textContent).toBe(expected);
		globalEvents.emit('noteDeleted', note.id, note.replyId);
		await nextTick();
		expect(view.getByRole('status').textContent).toBe(expected);
		expect(view.queryByRole('button', { name: i18n.ts.more })).toBeNull();
	});

	test('renders actions beneath both parent and child comments', async () => {
		const parent = makeNote('parent', { repliesCount: 1 });
		const child = makeNote('child', { replyId: parent.id });
		mocks.api.mockImplementation(async (endpoint: string) => endpoint === 'notes/replies' ? [child] : []);
		const view = renderComment(parent);
		await waitFor(() => expect(view.container.querySelectorAll('footer time')).toHaveLength(2));
		expect(view.getAllByRole('button', { name: i18n.ts.like })).toHaveLength(2);
		for (const menu of view.getAllByRole('button', { name: i18n.ts.more })) expect(menu.closest('footer')).toBeNull();
		await fireEvent.click(view.getAllByRole('button', { name: i18n.ts.reply })[1]);
		await waitFor(() => expect(mocks.post).toHaveBeenCalledWith({ reply: child, channel: undefined }));
	});

	test('toggles independent likes without replacing an existing reaction', async () => {
		const note = makeNote('liked-comment', { reactions: { '\u2764': 7 }, reactionCount: 7, myReaction: '\u2764' });
		const view = renderComment(note);
		const like = view.getByRole('button', { name: i18n.ts.like });
		const reactions = view.getByTestId('reactions').textContent;
		expect(like.getAttribute('aria-pressed')).toBe('false');
		expect(like.textContent?.trim()).toBe('');
		mocks.apiWithDialog.mockResolvedValueOnce({ likeCount: 1, isLiked: true, likeUsers: [note.user] });
		await fireEvent.click(like);
		await waitFor(() => expect(like.getAttribute('aria-pressed')).toBe('true'));
		expect(like.textContent).toContain('1');
		expect(mocks.apiWithDialog).toHaveBeenCalledExactlyOnceWith('notes/likes/create', { noteId: 'liked-comment' });
		mocks.apiWithDialog.mockResolvedValueOnce({ likeCount: 0, isLiked: false, likeUsers: [] });
		await fireEvent.click(like);
		await waitFor(() => expect(like.getAttribute('aria-pressed')).toBe('false'));
		expect(like.textContent?.trim()).toBe('');
		expect(mocks.apiWithDialog).toHaveBeenLastCalledWith('notes/likes/delete', { noteId: 'liked-comment' });
		expect(view.getByTestId('reactions').textContent).toBe(reactions);
		expect(note.reactionCount).toBe(7);
		expect(note.myReaction).toBe('\u2764');
	});

	test('adds descendants once and shows edits without losing their children or likes', async () => {
		const parent = makeNote('live-parent', { likeCount: 12, reactions: { '\u2764': 7 }, reactionCount: 7 });
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
		mocks.apiWithDialog.mockResolvedValue(note);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.more }));
		await waitFor(() => expect(mocks.popupMenu).toHaveBeenCalled());
		const menu = mocks.popupMenu.mock.calls[0][0] as MenuButton[];
		expect(menu.map(item => item.text)).toEqual([i18n.ts.delete, i18n.ts.edit]);
		await menu[1].action(new MouseEvent('click') as PointerEvent);
		expect(mocks.apiWithDialog).toHaveBeenCalledExactlyOnceWith('notes/show', { noteId: note.id });
		expect(mocks.post).toHaveBeenCalledExactlyOnceWith({ editingNote: note });
		globalEvents.emit('noteEdited', note.id, { text: 'Edited comment', cw: null });
		await nextTick();
		expect(view.getByText('Edited comment')).toBeTruthy();
	});

	test('keeps deleted comments out of late list responses and post events', async () => {
		const parent = makeNote('pending-parent', { repliesCount: 1 });
		const child = makeNote('pending-child', { replyId: parent.id });
		let finish!: (notes: Misskey.entities.Note[]) => void;
		const response = new Promise<Misskey.entities.Note[]>(resolve => { finish = resolve; });
		mocks.api.mockImplementation(async endpoint => endpoint === 'notes/replies' ? response : [parent]);
		const view = renderComment(parent);
		globalEvents.emit('noteDeleted', child.id, parent.id);
		finish([child]);
		await waitFor(() => expect(view.getByRole('status').textContent).toBe(i18n.ts.deletedComment));
		expect(view.queryByText(child.text!)).toBeNull();
		expect(view.queryByRole('button', { name: i18n.ts.loadMore })).toBeNull();

		globalEvents.emit('notePosted', child);
		await nextTick();
		expect(view.queryByText(child.text!)).toBeNull();
		expect(view.getAllByRole('button', { name: i18n.ts.more })).toHaveLength(1);
	});

	test('keeps other people\'s replies and mentions when their parent comment is deleted', async () => {
		const parent = makeNote('retained-parent', { repliesCount: 3 });
		const child = makeNote('removed-child', { replyId: parent.id, repliesCount: 1 });
		const grandchild = makeNote('retained-grandchild', { replyId: child.id, text: '@self This reply stays' });
		const sibling = makeNote('retained-sibling', { replyId: parent.id });
		mocks.api.mockImplementation(async (endpoint, params) => {
			if (endpoint !== 'notes/replies') return [parent, child, grandchild];
			return params?.noteId === parent.id ? [child, sibling] : [grandchild];
		});
		const view = renderComment(parent);
		await waitFor(() => expect(view.getByText(grandchild.text!)).toBeTruthy());
		globalEvents.emit('noteDeleted', child.id, parent.id);
		await nextTick();
		expect(view.queryByText(child.text!)).toBeNull();
		expect(view.getByText(grandchild.text!)).toBeTruthy();
		expect(view.getByRole('status').textContent).toBe(i18n.ts.deletedComment);
		expect(view.getByText(parent.text!)).toBeTruthy();
		expect(view.getByText(sibling.text!)).toBeTruthy();
		globalEvents.emit('notePosted', grandchild);
		globalEvents.emit('notePosted', makeNote('late-descendant', { replyId: grandchild.id }));
		await nextTick();
		expect(view.getAllByText(grandchild.text!)).toHaveLength(1);
		expect(view.getByText('late-descendant')).toBeTruthy();
	});

	test('shows a placeholder only after deletion succeeds', async () => {
		const parent = makeNote('delete-action-parent', { repliesCount: 1 });
		const child = makeNote('delete-action-child', { replyId: parent.id });
		mocks.api.mockImplementation(async endpoint => endpoint === 'notes/replies' ? [child] : [parent, child]);
		const view = renderComment(parent);
		await waitFor(() => expect(view.getByText(child.text!)).toBeTruthy());
		await fireEvent.click(view.getAllByRole('button', { name: i18n.ts.more })[1]);
		await waitFor(() => expect(mocks.popupMenu).toHaveBeenCalled());
		const menu = mocks.popupMenu.mock.calls[0][0] as MenuButton[];
		mocks.apiWithDialog.mockRejectedValueOnce(new Error('deletion failed'));
		await expect(menu[0].action(new MouseEvent('click') as PointerEvent)).rejects.toThrow('deletion failed');
		expect(view.getByText(child.text!)).toBeTruthy();
		expect(view.getAllByRole('button', { name: i18n.ts.reply })[0].textContent).toContain('1');

		await menu[0].action(new MouseEvent('click') as PointerEvent);
		await nextTick();
		expect(view.queryByText(child.text!)).toBeNull();
		expect(view.getByRole('status').textContent).toBe(i18n.ts.deletedCommentByAuthor);
		expect(mocks.apiWithDialog).toHaveBeenLastCalledWith('notes/delete', { noteId: child.id });
	});

	test('continues loading preserved replies when their parent is deleted', async () => {
		const parent = makeNote('aborted-parent', { repliesCount: 1 });
		const child = makeNote('aborted-child', { replyId: parent.id });
		let finish!: (notes: Misskey.entities.Note[]) => void;
		mocks.api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
		const view = renderComment(parent);
		const signal = (mocks.api.mock.calls[0] as unknown as [string, unknown, unknown, AbortSignal])[3];
		globalEvents.emit('noteDeleted', parent.id, parent.replyId);
		expect(signal.aborted).toBe(false);
		finish([child]);
		await nextTick();
		globalEvents.emit('notePosted', child);
		await nextTick();
		expect(view.getByRole('status').textContent).toBe(i18n.ts.deletedComment);
		expect(view.getAllByText(child.text!)).toHaveLength(1);
	});

	test('keeps the reply record stable when an unrelated deletion event is received', async () => {
		const parent = makeNote('root-deletion-parent', { repliesCount: 1 });
		const child = makeNote('root-deletion-child', { replyId: parent.id });
		mocks.api.mockResolvedValue([child]);
		const view = renderComment(parent);
		await waitFor(() => expect(view.getByText(child.text!)).toBeTruthy());
		globalEvents.emit('noteDeleted', 'unrelated');
		await nextTick();
		expect(view.getByText(parent.text!)).toBeTruthy();
		expect(view.getByText(child.text!)).toBeTruthy();
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
