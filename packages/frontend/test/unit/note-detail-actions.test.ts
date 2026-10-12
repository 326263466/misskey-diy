/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import MkNoteDetailed from '@/components/MkNoteDetailed.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	like: vi.fn(), share: vi.fn(), reply: vi.fn(), renote: vi.fn(), react: vi.fn(),
}));

vi.mock('@/i.js', () => ({ $i: { id: 'reader' } }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ pushByPath: vi.fn(), useListener: vi.fn() }) }));
vi.mock('@/events.js', () => ({ useGlobalEvent: vi.fn(), globalEvents: { on: vi.fn(), emit: vi.fn() } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn().mockResolvedValue([]) }));
vi.mock('@/utility/get-note-menu.js', () => ({ getAbuseNoteMenu: () => ({ action: vi.fn() }) }));
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
		reply: mocks.reply, toggleLike: mocks.like,
		share: mocks.share, reactViaMfmEmoji: vi.fn(),
		toggleRenote: mocks.renote, toggleReact: mocks.react,
	}) };
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

function renderDetail(isHidden = false) {
	const note = {
		id: 'note', userId: 'author', user: { id: 'author', username: 'author', host: null },
		text: 'Body', cw: null, files: [], reactions: {}, reactionEmojis: {},
		visibility: 'public', localOnly: false, replyId: null, renoteId: null,
		likeCount: 3, repliesCount: 2, viewsCount: 8, isHidden,
	} as unknown as Misskey.entities.Note;
	return render(MkNoteDetailed, {
		props: { note },
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

test('the footer reply button returns to the persistent draft and focuses the inline composer', async () => {
	const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
	const view = renderDetail();
	const input = view.getByRole('textbox', { name: 'Comment' }) as HTMLTextAreaElement;
	expect(input.getAttribute('data-reply-id')).toBe('note');
	await fireEvent.update(input, 'A comment draft');
	await fireEvent.click(view.getByText(i18n.ts.renotes));
	expect(view.getByRole('textbox', { name: 'Comment' })).toBe(input);
	await fireEvent.click(view.getByLabelText(i18n.ts.reply));
	await waitFor(() => expect(document.activeElement).toBe(input));
	expect(scroll).toHaveBeenCalledOnce();
	expect(view.getByRole('textbox', { name: 'Comment' })).toBe(input);
	expect(input.value).toBe('A comment draft');
	expect(mocks.reply).not.toHaveBeenCalled();
});

test('a signed-in reader cannot open the inline composer for an inaccessible note', () => {
	const view = renderDetail(true);
	expect(view.queryByRole('textbox', { name: 'Comment' })).toBeNull();
	expect(view.queryByRole('button', { name: i18n.ts._article.signInToComment })).toBeNull();
});
