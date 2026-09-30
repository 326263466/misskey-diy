/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick, reactive } from 'vue';
import { host as localHost } from '@@/js/config.js';
import MkMention from '@/components/MkMention.vue';
import { prefer } from '@/preferences.js';

const mocks = vi.hoisted(() => ({
	account: null as { id: string; username: string; avatarUrl: string | null } | null,
	staticUrl: vi.fn((url: string | null) => `static:${url ?? ''}`),
}));
vi.mock('@/i.js', () => ({ get $i() { return mocks.account; } }));
vi.mock('@/utility/media-proxy.js', () => ({ getStaticImageUrl: mocks.staticUrl }));
vi.mock('@/preferences.js', async () => {
	const { reactive } = await import('vue');
	return { prefer: { s: reactive({ disableShowingAnimatedImages: false, dataSaver: { avatar: false } }) } };
});

function renderMention(host = localHost) {
	const view = render(MkMention, {
		props: { username: 'self', host },
		global: {
			stubs: { MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' } },
			directives: { 'user-preview': () => {} },
		},
	});
	return { ...view, image: view.container.querySelector('img')! };
}

describe('mention avatars', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.account = reactive({ id: 'self', username: 'self', avatarUrl: 'https://example.test/old-avatar.png' });
		prefer.s.disableShowingAnimatedImages = false;
		prefer.s.dataSaver.avatar = false;
	});

	afterEach(cleanup);

	test('updates the current account mention after changing the account avatar', async () => {
		const view = renderMention();
		expect(view.image.getAttribute('src')).toBe('https://example.test/old-avatar.png');
		mocks.account!.avatarUrl = 'https://example.test/new-avatar.png';
		await nextTick();
		expect(view.image.getAttribute('src')).toBe('https://example.test/new-avatar.png');
	});

	test('preserves the lookup URL for a remote user with the same username', async () => {
		const view = renderMention('remote.example');
		mocks.account!.avatarUrl = 'https://example.test/new-avatar.png';
		await nextTick();
		expect(view.image.getAttribute('src')).toBe('/avatar/@self@remote.example');
	});

	test('preserves the lookup URL when signed out', () => {
		mocks.account = null;
		expect(renderMention().image.getAttribute('src')).toBe(`/avatar/@self@${localHost}`);
	});

	test.each(['disableShowingAnimatedImages', 'dataSaver'] as const)('uses the updated static account avatar with %s', async mode => {
		if (mode === 'dataSaver') prefer.s.dataSaver.avatar = true;
		else prefer.s.disableShowingAnimatedImages = true;
		const view = renderMention();
		mocks.account!.avatarUrl = 'https://example.test/new-avatar.gif';
		await nextTick();
		expect(mocks.staticUrl).toHaveBeenLastCalledWith('https://example.test/new-avatar.gif');
		expect(view.image.getAttribute('src')).toBe('static:https://example.test/new-avatar.gif');
	});
});
