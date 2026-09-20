/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import MkLikeSummary from '@/components/MkLikeSummary.vue';
import MkLikesDialog from '@/components/MkLikesDialog.vue';

const mocks = vi.hoisted(() => ({ popup: vi.fn(), dispose: vi.fn() }));
vi.mock('@/os.js', () => mocks);
vi.mock('@/components/MkLikesDialog.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: { _likes: { liked: 'Liked', likedByOthers: 'and others liked' } },
		tsx: {
			_likes: {
				countOnly: ({ n }: { n: number }) => `${n} people liked this`,
			},
		},
	},
}));

function user(id: string, name: string | null = id): Misskey.entities.UserLite {
	return { id, name, username: id, host: null } as Misskey.entities.UserLite;
}

function renderSummary(count: number, users: Misskey.entities.UserLite[]) {
	return render(MkLikeSummary, {
		props: { noteId: 'liked-post', count, users },
		global: {
			stubs: { MkAvatar: { props: ['user'], template: '<span :data-avatar-user="user.id"/>' } },
		},
	});
}

describe('content like summary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.popup.mockReturnValue({ dispose: mocks.dispose });
	});
	afterEach(() => cleanup());

	test.each([0, -1])('hides the summary when the count is %i', count => {
		const view = renderSummary(count, []);
		expect(view.queryByRole('button')).toBeNull();
	});

	test('shows the only avatar and a short caption without a name', () => {
		const view = renderSummary(1, [user('alice', 'Alice')]);
		expect(view.getByRole('button', { name: '1 people liked this' }).textContent?.trim()).toBe('Liked');
		expect(view.container.querySelectorAll('[data-avatar-user]')).toHaveLength(1);
	});

	test('shows both avatars without displaying names or usernames', () => {
		const view = renderSummary(2, [user('alice', 'Alice'), user('bob', null)]);
		expect(view.getByRole('button', { name: '2 people liked this' }).textContent?.trim()).toBe('Liked');
		expect(view.container.querySelectorAll('[data-avatar-user]')).toHaveLength(2);
	});

	test('shows every avatar without the "and others" caption when the count is fully covered', () => {
		const users = [user('alice', 'Alice'), user('bob', 'Bob'), user('carol', 'Carol')];
		const view = renderSummary(3, users);
		expect(view.getByRole('button', { name: '3 people liked this' }).textContent?.trim()).toBe('Liked');
		expect(Array.from(view.container.querySelectorAll('[data-avatar-user]'), element => element.getAttribute('data-avatar-user'))).toEqual(['alice', 'bob', 'carol']);
	});

	test.each([4, 100])('summarizes %i people as "and others" behind at most three avatars', count => {
		const users = [user('alice', 'Alice'), user('bob', 'Bob'), user('carol', 'Carol'), user('dave', 'Dave')];
		const view = renderSummary(count, users);
		expect(view.getByRole('button', { name: `${count} people liked this` }).textContent?.trim()).toBe('and others liked');
		expect(Array.from(view.container.querySelectorAll('[data-avatar-user]'), element => element.getAttribute('data-avatar-user'))).toEqual(['alice', 'bob', 'carol']);
	});

	test('keeps the count accessible with a plain caption when no avatar is available', () => {
		const view = renderSummary(30, []);
		expect(view.getByRole('button', { name: '30 people liked this' }).textContent?.trim()).toBe('Liked');
		expect(view.container.querySelectorAll('[data-avatar-user]')).toHaveLength(0);
	});

	test('opens the target like list without propagating to content navigation', async () => {
		const view = renderSummary(1, [user('alice', 'Alice')]);
		const navigate = vi.fn();
		view.container.addEventListener('click', navigate);
		const button = view.getByRole('button');
		expect(button.getAttribute('aria-haspopup')).toBe('dialog');
		await fireEvent.click(button);
		expect(mocks.popup).toHaveBeenCalledExactlyOnceWith(MkLikesDialog, { noteId: 'liked-post', count: 1 }, { closed: expect.any(Function) });
		mocks.popup.mock.calls[0][2].closed();
		expect(mocks.dispose).toHaveBeenCalledTimes(1);
		expect(navigate).not.toHaveBeenCalled();
	});
});
