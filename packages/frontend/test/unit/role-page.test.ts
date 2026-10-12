/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import { nextTick } from 'vue';
import RolePage from '@/pages/role.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/components/MkUserList.vue', () => ({ default: { props: { pageEmpty: Boolean }, template: '<div data-users :data-page="pageEmpty"/>' } }));
vi.mock('@/components/MkStreamingNotesTimeline.vue', () => ({ default: { props: { pageEmpty: Boolean }, template: '<div data-timeline :data-page="pageEmpty"/>' } }));

const role = (overrides = {}) => ({ id: 'role-1', name: 'Public role', description: 'Role description', isExplorable: true, isPublic: true, ...overrides });

function mount(initialTab = 'users') {
	return render(RolePage, {
		props: { roleId: 'role-1', initialTab },
		global: { stubs: {
			PageWithHeader: { template: '<main><slot/></main>' },
			MkLoading: { props: { page: Boolean }, template: '<div role="status" :data-page="page"/>' },
			MkResult: { props: { type: String, text: String, page: Boolean }, template: '<div :data-state="type" :data-page="page">{{ text }}</div>' },
		} },
	});
}

beforeEach(() => {
	mocks.api.mockReset();
});
afterEach(cleanup);

test.each(['users', 'timeline'])('keeps the %s role state loading until its visibility is known', async tab => {
	const pending = Promise.withResolvers<ReturnType<typeof role>>();
	mocks.api.mockReturnValue(pending.promise);
	const view = mount(tab);
	expect(view.getByRole('status').getAttribute('data-page')).toBe('true');
	expect(view.container.querySelector('[data-state]')).toBeNull();
	expect(view.container.querySelector('[data-users], [data-timeline]')).toBeNull();
	expect(mocks.api).toHaveBeenCalledExactlyOnceWith('roles/show', { roleId: 'role-1' });

	pending.resolve(role());
	await waitFor(() => expect(view.container.querySelector(tab === 'users' ? '[data-users]' : '[data-timeline]')?.getAttribute('data-page')).toBe('true'));
	expect(view.queryByRole('status')).toBeNull();
	expect(view.container.querySelector('[data-state="empty"]')).toBeNull();
});

test.each([{ isExplorable: false }, { isPublic: false }])('shows empty only after the role is confirmed unavailable (%#)', async unavailable => {
	mocks.api.mockResolvedValue(role(unavailable));
	const view = mount();
	await waitFor(() => expect(view.container.querySelector('[data-state="empty"]')?.getAttribute('data-page')).toBe('true'));
	expect(view.queryByRole('status')).toBeNull();
	expect(view.container.querySelector('[data-users]')).toBeNull();
});

test.each([
	{ code: 'NO_SUCH_ROLE', text: () => i18n.ts.roleNotFound },
	{ code: 'INTERNAL_ERROR', text: () => i18n.ts.somethingHappened },
])('shows the role error instead of an empty state for $code', async ({ code, text }) => {
	mocks.api.mockRejectedValue({ code });
	const view = mount();
	await waitFor(() => expect(view.container.querySelector('[data-state="error"]')?.textContent).toBe(text()));
	expect(view.container.querySelector('[data-state="empty"]')).toBeNull();
	expect(view.queryByRole('status')).toBeNull();
});

test.each(['success', 'error'])('ignores a stale role request after navigation (%s)', async outcome => {
	const previous = Promise.withResolvers<ReturnType<typeof role>>();
	const current = Promise.withResolvers<ReturnType<typeof role>>();
	mocks.api.mockReturnValueOnce(previous.promise).mockReturnValueOnce(current.promise);
	const view = mount();
	await view.rerender({ roleId: 'role-2' });
	expect(mocks.api.mock.calls).toEqual([
		['roles/show', { roleId: 'role-1' }],
		['roles/show', { roleId: 'role-2' }],
	]);

	current.resolve(role({ id: 'role-2', description: 'Current role' }));
	await waitFor(() => expect(view.getByText('Current role')).toBeTruthy());
	if (outcome === 'success') {
		previous.resolve(role({ description: 'Previous role', isPublic: false }));
	} else {
		previous.reject({ code: 'NO_SUCH_ROLE' });
	}
	await previous.promise.catch(() => undefined);
	await Promise.resolve();
	await nextTick();
	expect(view.getByText('Current role')).toBeTruthy();
	expect(view.container.querySelector('[data-users]')).not.toBeNull();
	expect(view.container.querySelector('[data-state]')).toBeNull();
});
