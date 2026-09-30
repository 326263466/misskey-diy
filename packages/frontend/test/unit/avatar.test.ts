/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick, reactive } from 'vue';
import type * as Misskey from 'misskey-js';
import MkAvatar from '@/components/global/MkAvatar.vue';
import { getUserAvatar } from '@/utility/get-user-avatar.js';
import { prefer } from '@/preferences.js';

const mocks = vi.hoisted(() => ({
	account: null as (Omit<Misskey.entities.UserLite, 'avatarUrl'> & { avatarUrl: string | null }) | null,
	staticUrl: vi.fn((url: string | null) => `static:${url ?? ''}`),
}));
vi.mock('@/i.js', () => ({ get $i() { return mocks.account; } }));
vi.mock('@/utility/media-proxy.js', () => ({ getStaticImageUrl: mocks.staticUrl }));
vi.mock('@/preferences.js', async () => {
	const { reactive } = await import('vue');
	return { prefer: { s: reactive({
		animation: false, squareAvatars: false, showAvatarDecorations: true,
		enableHighQualityImagePlaceholders: false, disableShowingAnimatedImages: false,
		dataSaver: { avatar: false },
	}) } };
});
vi.mock('@/components/global/MkA.vue', () => ({ default: { props: ['to'], template: '<a :href="to"><slot/></a>' } }));
vi.mock('@/components/MkUserOnlineIndicator.vue', () => ({ default: { template: '<span/>' } }));
vi.mock('@/components/MkImgWithBlurhash.vue', () => ({
	default: { props: ['src', 'hash'], template: '<img :src="src" :data-hash="hash" alt=""/>' },
}));

function makeUser(overrides: Partial<Misskey.entities.UserLite> = {}): Misskey.entities.UserLite {
	return {
		id: 'self', username: 'self', host: null, name: 'Self',
		avatarUrl: 'https://example.test/old-avatar.png', avatarBlurhash: '000000',
		avatarDecorations: [], isCat: false,
		...overrides,
	} as Misskey.entities.UserLite;
}

function renderAvatar(user: Misskey.entities.UserLite, props: { decorations?: { url: string }[] } = {}) {
	const view = render(MkAvatar, {
		props: { user, ...props },
		global: { directives: { 'user-preview': () => {} } },
	});
	return { ...view, image: view.container.querySelector('img')! };
}

describe('current account avatars', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.account = reactive(makeUser());
		prefer.s.enableHighQualityImagePlaceholders = false;
		prefer.s.disableShowingAnimatedImages = false;
		prefer.s.dataSaver.avatar = false;
	});

	afterEach(cleanup);

	test.each([false, true])('updates a mounted avatar from an old user snapshot with placeholders=%s', async placeholders => {
		prefer.s.enableHighQualityImagePlaceholders = placeholders;
		const snapshot = makeUser();
		const view = renderAvatar(snapshot);
		expect(view.image.getAttribute('src')).toBe(snapshot.avatarUrl);
		mocks.account!.avatarUrl = 'https://example.test/new-avatar.png';
		mocks.account!.avatarBlurhash = '00TSUA';
		await nextTick();
		expect(view.image.getAttribute('src')).toBe('https://example.test/new-avatar.png');
		if (placeholders) expect(view.image.getAttribute('data-hash')).toBe('00TSUA');
		expect(snapshot.avatarUrl).toBe('https://example.test/old-avatar.png');
		expect(snapshot.avatarBlurhash).toBe('000000');
	});

	test.each([
		{ id: 'other', host: null },
		{ id: 'self', host: 'remote.example' },
	])('keeps the avatar of $id on $host separate from the current account', async identity => {
		prefer.s.enableHighQualityImagePlaceholders = true;
		const user = makeUser(identity);
		const view = renderAvatar(user);
		mocks.account!.avatarUrl = 'https://example.test/new-avatar.png';
		mocks.account!.avatarBlurhash = '00TSUA';
		await nextTick();
		expect(view.image.getAttribute('src')).toBe(user.avatarUrl);
		expect(view.image.getAttribute('data-hash')).toBe(user.avatarBlurhash);
	});

	test.each([
		{ signedIn: false, id: 'self' },
		{ signedIn: false, id: undefined },
		{ signedIn: true, id: undefined },
		{ signedIn: true, id: '' },
	])('uses the supplied avatar with signedIn=$signedIn and id=$id', ({ signedIn, id }) => {
		if (!signedIn) mocks.account = null;
		const user = { ...makeUser(), id } as Misskey.entities.UserLite;
		expect(getUserAvatar(user)).toBe(user);
		expect(renderAvatar(user).image.getAttribute('src')).toBe(user.avatarUrl);
	});

	test.each(['disableShowingAnimatedImages', 'dataSaver'] as const)('updates the static avatar when %s is enabled', async mode => {
		if (mode === 'dataSaver') prefer.s.dataSaver.avatar = true;
		else prefer.s.disableShowingAnimatedImages = true;
		const view = renderAvatar(makeUser());
		mocks.account!.avatarUrl = 'https://example.test/new-avatar.gif';
		await nextTick();
		expect(mocks.staticUrl).toHaveBeenLastCalledWith('https://example.test/new-avatar.gif');
		expect(view.image.getAttribute('src')).toBe('static:https://example.test/new-avatar.gif');
	});

	test.each([
		{ decorations: undefined, expected: ['https://example.test/new-decoration.png'] },
		{ decorations: [{ url: 'https://example.test/preview-decoration.png' }], expected: ['https://example.test/preview-decoration.png'] },
		{ decorations: [], expected: [] },
	])('updates account decorations while preserving the explicit preview $expected', async ({ decorations, expected }) => {
		const view = renderAvatar(makeUser(), { decorations });
		mocks.account!.avatarDecorations = [{ id: 'new-decoration', url: 'https://example.test/new-decoration.png' }];
		await nextTick();
		expect(Array.from(view.container.querySelectorAll('img')).slice(1).map(image => image.getAttribute('src'))).toEqual(expected);
	});

	test('clears an old avatar and placeholder when the current account clears them', async () => {
		prefer.s.enableHighQualityImagePlaceholders = true;
		const view = renderAvatar(makeUser());
		mocks.account!.avatarUrl = null;
		mocks.account!.avatarBlurhash = null;
		await nextTick();
		expect(view.image.hasAttribute('src')).toBe(false);
		expect(view.image.hasAttribute('data-hash')).toBe(false);
	});
});
