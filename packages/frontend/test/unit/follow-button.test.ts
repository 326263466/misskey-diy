/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import MkFollowButton from '@/components/MkFollowButton.vue';
import { i18n } from '@/i18n.js';
import { publishUserStatistics } from '@/composables/use-user-statistics.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	confirm: vi.fn(),
	pleaseLogin: vi.fn(),
	claimAchievement: vi.fn(),
	connection: { on: vi.fn(), dispose: vi.fn() },
}));

vi.mock('@/os.js', () => ({ confirm: mocks.confirm }));
vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/stream.js', () => ({ useStream: () => ({
	useChannel: () => mocks.connection,
	state: 'connected', on: vi.fn(), off: vi.fn(), send: vi.fn(),
}) }));
vi.mock('@/store.js', async () => {
	const { ref } = await import('vue');
	return { store: { s: { realtimeMode: true }, r: { realtimeMode: ref(true) } } };
});
vi.mock('@/utility/please-login.js', () => ({ pleaseLogin: mocks.pleaseLogin }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: mocks.claimAchievement }));
vi.mock('@/utility/haptic.js', () => ({ haptic: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: { id: 'self', followingCount: 0 } }));
vi.mock('@/preferences.js', () => ({
	prefer: { s: { defaultFollowWithReplies: true } },
}));

function renderButton(user: Partial<Misskey.entities.UserDetailed> = {}) {
	return render(MkFollowButton, {
		props: {
			user: {
				id: 'other',
				username: 'other',
				name: 'Other',
				host: null,
				isFollowing: false,
				hasPendingFollowRequestFromYou: false,
				isLocked: false,
				...user,
			} as Misskey.entities.UserDetailed,
			full: true,
		},
		global: { stubs: { MkLoading: true }, directives: { tooltip: () => {} } },
	});
}

function buttonAppearance(button: HTMLButtonElement) {
	return {
		text: button.textContent,
		label: button.getAttribute('aria-label'),
		icon: button.querySelector('i')?.className,
		classes: button.className,
	};
}

describe('follow button', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.api.mockImplementation(async endpoint => endpoint === 'users/show-partial-bulk' ? [] : {});
		mocks.pleaseLogin.mockResolvedValue(true);
		mocks.confirm.mockResolvedValue({ canceled: true });
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	test.each([
		{ action: 'follow', user: {}, endpoint: 'following/create', parameters: { userId: 'other', withReplies: true } },
		{ action: 'unfollow', user: { isFollowing: true }, endpoint: 'following/delete', parameters: { userId: 'other' } },
		{ action: 'cancel a follow request', user: { hasPendingFollowRequestFromYou: true, isLocked: true }, endpoint: 'following/requests/cancel', parameters: { userId: 'other' } },
		{ action: 'cancel a pending remote follow', user: { hasPendingFollowRequestFromYou: true, host: 'remote.test' }, endpoint: 'following/requests/cancel', parameters: { userId: 'other' } },
	])('$action on the first click without confirmation', async ({ user, endpoint, parameters }) => {
		const view = renderButton(user);
		await fireEvent.click(view.getByRole('button'));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith(endpoint, parameters));
		await waitFor(() => expect((view.getByRole('button') as HTMLButtonElement).disabled).toBe(false));
		expect(mocks.confirm).not.toHaveBeenCalled();
	});

	test.each([
		{ action: 'follow', user: {} },
		{ action: 'unfollow', user: { isFollowing: true } },
		{ action: 'cancel a follow request', user: { hasPendingFollowRequestFromYou: true } },
	])('ignores repeated clicks to $action while the request is pending', async ({ user }) => {
		let complete: () => void = () => {};
		mocks.api.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
		const view = renderButton(user);
		const button = view.getByRole('button') as HTMLButtonElement;
		const original = buttonAppearance(button);

		button.click();
		button.click();
		await nextTick();
		await nextTick();
		expect(mocks.api).toHaveBeenCalledTimes(1);
		expect(button.disabled).toBe(true);
		expect(button.getAttribute('aria-busy')).toBe('true');
		expect(buttonAppearance(button)).toEqual(original);
		expect(view.container.querySelector('mk-loading-stub')).toBeNull();

		complete();
		await waitFor(() => expect(button.disabled).toBe(false));
		expect(button.getAttribute('aria-busy')).toBe('false');
	});

	test('shows the unfollowed state after success without waiting for a stream event', async () => {
		const view = renderButton({ isFollowing: true });
		await fireEvent.click(view.getByRole('button'));
		await waitFor(() => expect(view.getByRole('button').textContent).toBe(i18n.ts.follow));
		expect(mocks.claimAchievement).not.toHaveBeenCalled();
	});

	test('preserves a newer follow stream event while an unfollow response is in flight', async () => {
		let complete: () => void = () => {};
		mocks.api.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
		const view = renderButton({ isFollowing: true });
		await fireEvent.click(view.getByRole('button'));
		const onFollow = mocks.connection.on.mock.calls.find(([event]) => event === 'follow')?.[1];
		onFollow({ id: 'other', isFollowing: true, hasPendingFollowRequestFromYou: false });
		complete();
		await waitFor(() => expect(view.getByRole('button').textContent).toBe(i18n.ts.youFollowing));
		expect(mocks.claimAchievement).not.toHaveBeenCalled();
	});

	test('requires login before sending a follow request', async () => {
		mocks.pleaseLogin.mockResolvedValue(false);
		const view = renderButton();
		await fireEvent.click(view.getByRole('button'));
		expect(mocks.pleaseLogin).toHaveBeenCalledOnce();
		expect(mocks.api).not.toHaveBeenCalled();
	});

	test('does not claim following achievements while loading an existing relationship', async () => {
		mocks.api.mockResolvedValueOnce([{
			id: 'other',
			isFollowing: true,
			hasPendingFollowRequestFromYou: false,
		}]);
		renderButton({ isFollowing: undefined, hasPendingFollowRequestFromYou: undefined });
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('users/show-partial-bulk', { userIds: expect.arrayContaining(['other', 'self']) }));
		await nextTick();
		expect(mocks.claimAchievement).not.toHaveBeenCalled();
	});

	test.each([
		{ action: 'follow', user: {}, endpoint: 'following/create' },
		{ action: 'unfollow', user: { isFollowing: true }, endpoint: 'following/delete' },
		{ action: 'cancel a follow request', user: { hasPendingFollowRequestFromYou: true }, endpoint: 'following/requests/cancel' },
	])('keeps the original appearance and allows retry after a failed $action', async ({ user, endpoint }) => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		mocks.api.mockRejectedValueOnce(new Error('network unavailable'));
		const view = renderButton(user);
		const button = view.getByRole('button') as HTMLButtonElement;
		const original = buttonAppearance(button);
		await fireEvent.click(button);
		await waitFor(() => expect(button.disabled).toBe(false));
		expect(button.getAttribute('aria-busy')).toBe('false');
		expect(buttonAppearance(button)).toEqual(original);
		await fireEvent.click(button);
		await waitFor(() => expect(mocks.api.mock.calls.filter(([calledEndpoint]) => calledEndpoint === endpoint)).toHaveLength(2));
		await waitFor(() => expect(button.disabled).toBe(false));
		expect(mocks.api).toHaveBeenCalledWith('users/show-partial-bulk', { userIds: expect.arrayContaining(['other', 'self']) });
	});

	test.each([
		{ isLocked: true, host: null },
		{ isLocked: false, host: 'remote.test' },
	])('keeps an unaccepted request pending for $host (locked: $isLocked)', async (user) => {
		mocks.api.mockResolvedValueOnce({ id: 'other' }).mockResolvedValueOnce([{
			id: 'other', isFollowing: false, hasPendingFollowRequestFromYou: true,
		}]);
		const view = renderButton(user);
		await fireEvent.click(view.getByRole('button'));
		await waitFor(() => expect(view.getByRole('button').textContent).toBe(i18n.ts.followRequestPending));
		expect(view.getByRole('button').querySelector('i')?.classList.contains('ti-hourglass-empty')).toBe(true);
		expect(view.queryByText(i18n.ts.youFollowing)).toBeNull();
		expect(mocks.claimAchievement).not.toHaveBeenCalled();
	});

	test.each([
		{ kind: 'public local user', user: {} },
		{ kind: 'locked local user', user: { isLocked: true } },
		{ kind: 'remote user', user: { host: 'remote.test' } },
		{ kind: 'bot', user: { isBot: true } },
	])('keeps the original appearance for a $kind until the server confirms following', async ({ user }) => {
		let complete: (users: object[]) => void = () => {};
		mocks.api.mockResolvedValueOnce({ id: 'other' }).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
		const view = renderButton(user);
		const button = view.getByRole('button') as HTMLButtonElement;
		const original = buttonAppearance(button);
		await fireEvent.click(button);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('users/show-partial-bulk', { userIds: expect.arrayContaining(['other', 'self']) }));
		expect(button.disabled).toBe(true);
		expect(buttonAppearance(button)).toEqual(original);
		expect(view.queryByText(i18n.ts.followRequestPending)).toBeNull();
		expect(mocks.claimAchievement).not.toHaveBeenCalled();

		complete([{ id: 'other', isFollowing: true, hasPendingFollowRequestFromYou: false }]);
		await waitFor(() => expect(button.textContent).toBe(i18n.ts.youFollowing));
		await waitFor(() => expect(button.disabled).toBe(false));
		expect(button.querySelector('i')?.classList.contains('ti-minus')).toBe(true);
		expect(mocks.claimAchievement).toHaveBeenCalledExactlyOnceWith('following1');
	});

	test.each([{ response: [] }, { response: [{ id: 'other' }] }])('keeps the original appearance when a relationship response is incomplete ($response)', async ({ response }) => {
		mocks.api.mockResolvedValueOnce(null).mockResolvedValueOnce(response);
		const view = renderButton({ isLocked: true });
		const button = view.getByRole('button') as HTMLButtonElement;
		const original = buttonAppearance(button);
		await fireEvent.click(button);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('users/show-partial-bulk', { userIds: expect.arrayContaining(['other', 'self']) }));
		await waitFor(() => expect(button.disabled).toBe(false));
		expect(buttonAppearance(button)).toEqual(original);
		expect(view.queryByText(i18n.ts.followRequestPending)).toBeNull();
		expect(mocks.claimAchievement).not.toHaveBeenCalled();
	});

	test('changes a pending request to following when approval arrives on the stream', async () => {
		const view = renderButton({ isLocked: true, hasPendingFollowRequestFromYou: true });
		const onFollow = mocks.connection.on.mock.calls.find(([event]) => event === 'follow')?.[1];
		onFollow({ id: 'other', isFollowing: true, hasPendingFollowRequestFromYou: false });
		await nextTick();
		expect(view.getByRole('button').textContent).toBe(i18n.ts.youFollowing);
		expect(mocks.claimAchievement).toHaveBeenCalledExactlyOnceWith('following1');
	});

	test('does not replace a newer stream approval with a pending relationship snapshot', async () => {
		let complete: (users: object[]) => void = () => {};
		mocks.api.mockResolvedValueOnce({ id: 'other' }).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
		const view = renderButton({ isLocked: true });
		await fireEvent.click(view.getByRole('button'));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('users/show-partial-bulk', { userIds: expect.arrayContaining(['other', 'self']) }));
		const onFollow = mocks.connection.on.mock.calls.find(([event]) => event === 'follow')?.[1];
		publishUserStatistics({ id: 'other', isFollowing: true, hasPendingFollowRequestFromYou: false });
		onFollow({ id: 'other', isFollowing: true, hasPendingFollowRequestFromYou: false });
		complete([{ id: 'other', isFollowing: false, hasPendingFollowRequestFromYou: true }]);
		await waitFor(() => expect(view.getByRole('button').textContent).toBe(i18n.ts.youFollowing));
		expect(mocks.claimAchievement).toHaveBeenCalledExactlyOnceWith('following1');
	});

	test('ignores an initial relationship lookup after a follow request has been sent', async () => {
		let completeInitial: (users: object[]) => void = () => {};
		let completeLatest: (users: object[]) => void = () => {};
		mocks.api
			.mockImplementationOnce(() => new Promise(resolve => { completeInitial = resolve; }))
			.mockResolvedValueOnce({ id: 'other' })
			.mockImplementationOnce(() => new Promise(resolve => { completeLatest = resolve; }));
		const view = renderButton({ isFollowing: undefined, isLocked: true });
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('users/show-partial-bulk', { userIds: expect.arrayContaining(['other', 'self']) }));
		await fireEvent.click(view.getByRole('button'));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('following/create', { userId: 'other', withReplies: true }));
		completeInitial([{ id: 'other', isFollowing: false, hasPendingFollowRequestFromYou: false }]);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(3));
		completeLatest([{ id: 'other', isFollowing: false, hasPendingFollowRequestFromYou: true }]);
		await waitFor(() => expect(view.getByRole('button').textContent).toBe(i18n.ts.followRequestPending));
		expect(mocks.claimAchievement).not.toHaveBeenCalled();
	});
});
