/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import MkNoteDetailed from '@/components/MkNoteDetailed.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	like: vi.fn(), favorite: vi.fn(), share: vi.fn(), reply: vi.fn(), report: vi.fn(), renote: vi.fn(), react: vi.fn(),
}));

vi.mock('@/i.js', () => ({ $i: { id: 'reader' } }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ pushByPath: vi.fn(), useListener: vi.fn() }) }));
vi.mock('@/events.js', () => ({ useGlobalEvent: vi.fn(), globalEvents: { on: vi.fn(), emit: vi.fn() } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn().mockResolvedValue([]) }));
vi.mock('@/utility/get-note-menu.js', () => ({ getAbuseNoteMenu: () => ({ action: mocks.report }) }));
vi.mock('@/utility/paginator.js', () => ({ Paginator: class { init = vi.fn(); } }));
vi.mock('@/components/MkPostForm.vue', async () => {
	const { defineComponent, h, ref } = await import('vue');
	return { default: defineComponent({
		props: ['reply', 'commentMode', 'fixed', 'autofocus', 'initialRows'],
		setup(props, { expose }) {
			const input = ref<HTMLTextAreaElement>();
			expose({ focus: () => input.value?.focus() });
			return () => h('textarea', { ref: input, 'aria-label': 'Comment', 'data-reply-id': props.reply.id });
		},
	}) };
});
vi.mock('@/composables/use-note.js', async () => {
	const { ref } = await import('vue');
	return { useNote: (props: { note: Misskey.entities.Note }) => ({
		note: props.note, appearNote: props.note, $appearNote: props.note,
		reactionNote: props.note, $reactionNote: props.note,
		hideByPlugin: ref(false), isRenote: false, isDeleted: ref(false),
		showContent: ref(true), translating: ref(false), translation: ref(null),
		muted: ref(false), isMyRenote: false, isRenotedByMe: ref(false),
		isRenoteTargetDeleted: ref(false), displayedRenoteCount: ref(0),
		parsed: ref([]), urls: ref([]), showTicker: false,
		canRenote: true, liking: ref(false),
		isFavorited: ref(false), favoriting: ref(false),
		reply: mocks.reply, toggleLike: mocks.like, toggleFavorite: mocks.favorite,
		share: mocks.share, reactViaMfmEmoji: vi.fn(),
		toggleRenote: mocks.renote, toggleReact: mocks.react,
	}) };
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

function renderDetail(sideActions = true, isHidden = false) {
	const note = {
		id: 'note', userId: 'author', user: { id: 'author', username: 'author', host: null },
		text: 'Body', cw: null, files: [], reactions: {}, reactionEmojis: {},
		visibility: 'public', localOnly: false, replyId: null, renoteId: null,
		likeCount: 3, repliesCount: 2, viewsCount: 8, isHidden,
	} as unknown as Misskey.entities.Note;
	return render(MkNoteDetailed, {
		props: { note, separateActivity: true, sideActions },
		global: {
			directives: { hotkey: {}, tooltip: {}, 'user-preview': {} },
			stubs: {
				MkAvatar: true, Mfm: true, MkA: true, MkUserName: true, MkLoading: true, MkResult: true,
				MkNoteHeader: true, MkReactionsViewer: true, MkLikeSummary: true, MkNoteTags: true,
				MkRollingNumber: true, MkPagination: true,
			},
		},
	});
}

test('detail side actions reuse like, favorite, share and report actions', async () => {
	const view = renderDetail();
	const actions = within(view.getByRole('complementary'));
	await fireEvent.click(actions.getByRole('button', { name: i18n.ts.like }));
	await fireEvent.click(actions.getByRole('button', { name: i18n.ts.favorite }));
	await fireEvent.click(actions.getByRole('button', { name: i18n.ts.share }));
	await fireEvent.click(actions.getByRole('button', { name: i18n.ts.reportAbuse }));
	await fireEvent.click(actions.getByRole('button', { name: i18n.ts.renote }));
	await fireEvent.click(actions.getByRole('button', { name: i18n.ts._chat.addReaction }));
	expect(mocks.like).toHaveBeenCalledOnce();
	expect(mocks.favorite).toHaveBeenCalledOnce();
	expect(mocks.share).toHaveBeenCalledOnce();
	expect(mocks.report).toHaveBeenCalledOnce();
	expect(mocks.renote).toHaveBeenCalledOnce();
	expect(mocks.react).toHaveBeenCalledOnce();
	expect(view.getAllByRole('button', { name: i18n.ts.like })).toHaveLength(1);
	expect(view.getAllByRole('button', { name: i18n.ts.share })).toHaveLength(1);
});

test('the side comment button returns to the persistent draft and focuses the inline composer', async () => {
	const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
	const view = renderDetail();
	const actions = within(view.getByRole('complementary'));
	const input = view.getByRole('textbox', { name: 'Comment' }) as HTMLTextAreaElement;
	expect(input.getAttribute('data-reply-id')).toBe('note');
	await fireEvent.update(input, 'A comment draft');
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.renotes }));
	expect(view.getByRole('textbox', { name: 'Comment' })).toBe(input);
	await fireEvent.click(actions.getByRole('button', { name: i18n.ts.replies }));
	await waitFor(() => expect(document.activeElement).toBe(input));
	expect(scroll).toHaveBeenCalledOnce();
	expect(view.getByRole('textbox', { name: 'Comment' })).toBe(input);
	expect(input.value).toBe('A comment draft');
	expect(mocks.reply).not.toHaveBeenCalled();
});

test('embedded detail views keep a persistent composer without a side toolbar', async () => {
	vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
	const view = renderDetail(false);
	expect(view.queryByRole('complementary')).toBeNull();
	expect(view.getByRole('button', { name: i18n.ts.like })).toBeTruthy();
	const input = view.getByRole('textbox', { name: 'Comment' });
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.reply }));
	await waitFor(() => expect(document.activeElement).toBe(input));
	expect(mocks.reply).not.toHaveBeenCalled();
});

test.each([true, false])('a signed-in reader cannot open the inline composer for an inaccessible note (sideActions=%s)', sideActions => {
	const view = renderDetail(sideActions, true);
	expect(view.queryByRole('textbox', { name: 'Comment' })).toBeNull();
	expect(view.queryByRole('button', { name: i18n.ts._article.signInToComment })).toBeNull();
});
