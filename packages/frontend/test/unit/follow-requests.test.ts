/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick } from 'vue';
import FollowRequestsPage from '@/pages/follow-requests.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	confirm: vi.fn(),
	reload: vi.fn(),
	account: { id: 'self', isLocked: false },
}));

vi.mock('@/os.js', () => ({ apiWithDialog: mocks.api, confirm: mocks.confirm }));
vi.mock('@/i.js', () => ({ $i: mocks.account }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/utility/paginator.js', () => ({
	Paginator: class { reload = mocks.reload; },
}));
vi.mock('@/components/MkPagination.vue', async () => {
	const { defineComponent, h } = await import('vue');
	const user = { id: 'other', username: 'other', host: null };
	return { default: defineComponent({
		setup(_props, { slots }) {
			return () => h('div', slots.default?.({ items: [{ id: 'request', follower: user, followee: user }] }));
		},
	}) };
});
vi.mock('@/components/MkButton.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		props: { wait: Boolean },
		emits: ['click'],
		setup(props, { slots, emit }) {
			return () => h('button', {
				disabled: props.wait,
				onClick: (event: MouseEvent) => emit('click', event),
			}, slots.default?.());
		},
	}) };
});

function renderRequests() {
	return render(FollowRequestsPage, {
		global: {
			config: { errorHandler: vi.fn() },
			stubs: {
				PageWithHeader: { template: '<div><slot/></div>' },
				MkAvatar: true,
				MkA: { template: '<a><slot/></a>' },
				MkUserName: true,
			},
			directives: { 'user-preview': () => {} },
		},
	});
}

describe('follow requests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.api.mockResolvedValue({});
		mocks.confirm.mockResolvedValue({ canceled: true });
		mocks.account.isLocked = false;
	});

	afterEach(cleanup);

	test('cancels a sent request directly and only once while pending', async () => {
		let complete: () => void = () => {};
		mocks.api.mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
		const view = renderRequests();
		const button = view.getByRole('button', { name: i18n.ts.cancel }) as HTMLButtonElement;

		button.click();
		button.click();
		await nextTick();
		expect(mocks.confirm).not.toHaveBeenCalled();
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('following/requests/cancel', { userId: 'other' });
		expect(button.disabled).toBe(true);
		expect(mocks.reload).not.toHaveBeenCalled();

		complete();
		await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce());
		expect(button.disabled).toBe(false);
	});

	test('allows retry after a failed cancellation', async () => {
		mocks.api.mockRejectedValueOnce(new Error('network unavailable'));
		const view = renderRequests();
		const button = view.getByRole('button', { name: i18n.ts.cancel }) as HTMLButtonElement;
		await fireEvent.click(button);
		await waitFor(() => expect(button.disabled).toBe(false));
		expect(mocks.reload).not.toHaveBeenCalled();
		await fireEvent.click(button);
		await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce());
		expect(mocks.api).toHaveBeenCalledTimes(2);
	});

	test('still confirms before rejecting someone else’s request', async () => {
		mocks.account.isLocked = true;
		const view = renderRequests();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.reject }));
		expect(mocks.confirm).toHaveBeenCalledOnce();
		expect(mocks.api).not.toHaveBeenCalled();
	});
});
