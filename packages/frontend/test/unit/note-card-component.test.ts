/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import MkNote from '@/components/MkNote.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), reply: vi.fn() }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ pushByPath: mocks.navigate }) }));
vi.mock('@/composables/use-note.js', async () => {
	const { ref } = await import('vue');
	return { useNote: (props: { note: Misskey.entities.Note }) => ({
		note: props.note, appearNote: props.note, $appearNote: props.note,
		reactionNote: props.note, $reactionNote: props.note,
		hideByPlugin: ref(false), isRenote: ref(false), isDeleted: ref(false),
		showContent: ref(true), translating: ref(false), translation: ref(null),
		muted: ref(false), hardMuted: ref(false), isMyRenote: ref(false),
		isRenotedByMe: ref(false), isRenoteTargetDeleted: ref(false),
		displayedRenoteCount: ref(0), collapsed: ref(false), renoteCollapsed: ref(false),
		parsed: ref([]), urls: ref([]), isLong: ref(false), showTicker: ref(false),
		canRenote: ref(true), canBoost: ref(true), liking: ref(false), boostOpen: ref(false),
		reply: mocks.reply, reactViaMfmEmoji: vi.fn(),
	}) };
});

afterEach(() => { vi.clearAllMocks(); document.getSelection()?.removeAllRanges(); });

test('the real note card routes to its displayed note and leaves its reply button action intact', async () => {
	const note = {
		id: 'displayed-note', userId: 'author', user: { id: 'author', username: 'author', host: null },
		text: 'Body', cw: null, files: [], reactions: {}, reactionEmojis: {},
		visibility: 'public', localOnly: false, replyId: null, renoteId: null,
	} as unknown as Misskey.entities.Note;
	const wrapper = render(MkNote, {
		shallow: true,
		props: { note },
		global: {
			directives: { hotkey: {}, tooltip: {}, 'user-preview': {} },
			stubs: { MkAvatar: true, Mfm: true, MkA: true, MkUserName: true, MkLoading: true },
		},
	});
	try {
		await fireEvent.click(wrapper.container.querySelector('[data-note-card]')!, { button: 0 });
		expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith('/notes/displayed-note');
		mocks.navigate.mockClear();
		await fireEvent.click(wrapper.getByRole('button', { name: i18n.ts.reply }), { button: 0 });
		expect(mocks.reply).toHaveBeenCalledOnce();
		expect(mocks.navigate).not.toHaveBeenCalled();
	} finally {
		wrapper.unmount();
	}
});
