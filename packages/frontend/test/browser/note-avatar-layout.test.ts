/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import type * as Misskey from 'misskey-js';
import '@/style.scss';
import MkNote from '@/components/MkNote.vue';
import MkNoteHeader from '@/components/MkNoteHeader.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import MkA from '@/components/global/MkA.vue';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';

const preferences = vi.hoisted(() => ({ s: {
	animation: false, useStickyIcons: true, squareAvatars: false,
	showAvatarDecorations: false, dataSaver: { avatar: false },
} }));
vi.mock('misskey-js', () => ({}));
vi.hoisted(() => {
	vi.stubGlobal('_LANGS_', []);
	vi.stubGlobal('_VERSION_', 'test');
});
vi.mock('@@/js/config.js', () => ({ host: 'localhost', hostname: 'localhost' }));
vi.mock('@/preferences.js', () => ({ prefer: preferences }));
vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ pushByPath: vi.fn() }) }));
vi.mock('@/utility/url-preview.js', () => ({ isEnabledUrlPreview: false }));
vi.mock('@/filters/user.js', () => ({ acct: () => '@author', userPage: () => '/@author' }));
vi.mock('@/utility/media-proxy.js', () => ({ getStaticImageUrl: (url: string) => url }));
vi.mock('@/components/global/MkA.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ setup: (_props, { slots }) => () => h('a', slots.default?.()) }) };
});
vi.mock('@/i18n.js', () => ({ i18n: { ts: { _boost: { title: 'Boost' }, _profile: {} } } }));
vi.mock('@/components/MkNoteSimple.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkReactionsViewer.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkMediaList.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkCwButton.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPoll.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkUrlPreview.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkInstanceTicker.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkRollingNumber.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkLikeSummary.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkNoteTags.vue', () => ({ default: { render: () => null } }));
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
		reactViaMfmEmoji: vi.fn(),
	}) };
});

const fixtures: { app: App; host: HTMLElement }[] = [];
const avatarUrl = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ec4168"/><circle cx="40" cy="30" r="16" fill="white"/><path d="M15 75v-10a25 25 0 0150 0v10z" fill="white"/></svg>')}`;

async function settle() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
}

function mountNotes(width: number, padding: number, sticky: boolean, pinned = false) {
	preferences.s.useStickyIcons = sticky;
	const host = document.createElement('div');
	host.style.cssText = `width:${width}px;height:500px;overflow:auto;container-type:inline-size;--MI-note-padding-top:${padding}px;--MI_THEME-panel:white;--MI_THEME-fg:#555;--MI_THEME-bg:#eee;`;
	document.body.append(host);
	const user = { id: 'author', name: 'Author name', username: 'author', host: null, avatarUrl, avatarDecorations: [], jobTitle: 'Engineer', company: 'Example' };
	const note = {
		id: 'first', userId: 'author', user, text: 'Body', createdAt: new Date().toISOString(),
		cw: null, files: [], reactions: {}, reactionEmojis: {}, visibility: 'public',
		localOnly: false, replyId: null, renoteId: null,
	} as unknown as Misskey.entities.Note;
	const app = createApp({ render: () => h(MkStickyContainer, {}, {
		header: () => h('div', { style: 'height:70px;box-sizing:border-box;padding-bottom:20px;background:white;' }, '# ai'),
		default: () => h('div', { style: 'display:flex;flex-direction:column;gap:16px;' }, [
			h(MkNote, { note, mock: true, pinned, class: '_juejinCard' }),
			h(MkNote, { note: { ...note, id: 'second' }, mock: true, class: '_juejinCard' }),
			h('div', { style: 'height:1000px;' }),
		]),
	}) });
	app.component('MkAvatar', MkAvatar);
	app.component('MkA', MkA);
	for (const name of ['MkLoading', 'I18n']) app.component(name, { render: () => null });
	app.component('MkNoteHeader', MkNoteHeader);
	app.component('MkUserName', { render: () => h('span', 'Author name') });
	app.component('MkAcct', { render: () => h('span', '@author') });
	app.component('MkTime', { render: () => h('span', '2 hours ago') });
	// Match the existing global Mfm registration.
	// eslint-disable-next-line vue/multi-word-component-names
	app.component('Mfm', { name: 'NoteBodyStub', render: () => h('div', { style: 'height:150px;' }, 'Body') });
	for (const directive of ['hotkey', 'user-preview', 'tooltip']) app.directive(directive, () => {});
	app.mount(host);
	fixtures.push({ app, host });
	return host;
}

afterEach(() => {
	for (const { app, host } of fixtures.splice(0)) { app.unmount(); host.remove(); }
});

test.each([
	{ width: 900, padding: 20, sticky: true, pinned: false },
	{ width: 390, padding: 20, sticky: true, pinned: false },
	{ width: 900, padding: 12, sticky: true, pinned: false },
	{ width: 900, padding: 20, sticky: true, pinned: true },
	{ width: 900, padding: 20, sticky: false, pinned: false },
])('aligns every note avatar with its header before scrolling ($width px, padding $padding, sticky $sticky, pinned $pinned)', async ({ width, padding, sticky, pinned }) => {
	await page.viewport(Math.max(width, 900), 700);
	const host = mountNotes(width, padding, sticky, pinned);
	await settle();
	await settle();
	for (const article of host.querySelectorAll('article')) {
		const avatar = article.firstElementChild as HTMLElement;
		const header = article.querySelector('header')!;
		expect(avatar.getBoundingClientRect().top).toBeCloseTo(header.getBoundingClientRect().top, 1);
	}
	await page.screenshot({ element: host, path: `../e2e/artifacts/component-browser/note-avatar-${width}-${padding}-${sticky}-${pinned}.png` });
	if (!sticky) return;
	const firstArticle = host.querySelector('article')!;
	const firstAvatar = firstArticle.firstElementChild as HTMLElement;
	host.scrollTop = 100;
	await settle();
	expect(firstAvatar.getBoundingClientRect().top - host.getBoundingClientRect().top).toBeCloseTo(70 + padding, 1);
	expect(firstAvatar.getBoundingClientRect().top).toBeGreaterThan(firstArticle.querySelector('header')!.getBoundingClientRect().top);
});
