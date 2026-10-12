/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import NoteRedirect from '@/pages/note-redirect.vue';

const mocks = vi.hoisted(() => ({ api: vi.fn(), replace: vi.fn(), pleaseLogin: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ replaceByPath: mocks.replace }) }));
vi.mock('@/utility/please-login.js', () => ({ pleaseLogin: mocks.pleaseLogin }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: { id: 'reader' } }));

function mount() {
	return render(NoteRedirect, {
		props: { noteId: 'note-1' },
		global: { stubs: {
			PageWithHeader: { template: '<main><slot/></main>' },
			MkLoading: { template: '<div role="status"/>' },
			MkError: { template: '<div role="alert"/>' },
		} },
	});
}

beforeEach(() => {
	mocks.api.mockReset();
	mocks.replace.mockReset();
	mocks.pleaseLogin.mockReset();
});
afterEach(cleanup);

test.each([
	{ user: { username: 'alice', host: null }, path: '/@alice' },
	{ user: { username: 'bob', host: 'remote.example' }, path: '/@bob@remote.example' },
])('旧帖子链接替换为作者主页 $path', async ({ user, path }) => {
	mocks.api.mockResolvedValue({ id: 'note-1', user });
	mount();
	expect(mocks.api).toHaveBeenCalledExactlyOnceWith('notes/show', { noteId: 'note-1' });
	await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(path));
});

test('离开页面后迟到的结果不再跳转', async () => {
	const pending = Promise.withResolvers<unknown>();
	mocks.api.mockReturnValue(pending.promise);
	const view = mount();
	view.unmount();
	pending.resolve({ id: 'note-1', user: { username: 'alice', host: null } });
	await pending.promise;
	await Promise.resolve();
	expect(mocks.replace).not.toHaveBeenCalled();
});

test('需要登录的帖子提示登录并显示错误，不跳转', async () => {
	mocks.api.mockRejectedValue({ id: 'fbcc002d-37d9-4944-a6b0-d9e29f2d33ab' });
	const view = mount();
	await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
	expect(mocks.pleaseLogin).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ path: '/' }));
	expect(mocks.replace).not.toHaveBeenCalled();
});
