/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent } from 'vue';
import MkLikesDialog from '@/components/MkLikesDialog.vue';
import type { Paginator } from '@/utility/paginator.js';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/components/MkPagination.vue', () => ({ default: { name: 'MkPagination', template: '<div/>' } }));
vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: { _likes: { title: 'Liked By' }, noUsers: 'No users' },
		tsx: { _likes: { titleWithCount: ({ n }: { n: number }) => `Liked By (${n})` } },
	},
}));

let modalProps: Record<string, unknown> = {};

function renderDialog(props: Record<string, unknown>, onPaginator?: (paginator: Paginator<'notes/likes'>) => void) {
	return render(MkLikesDialog, {
		props: { noteId: 'selected-note', ...props },
		global: {
			stubs: {
				MkModalWindow: defineComponent({
					props: ['width', 'height', 'autoHeight'],
					setup(props) {
						modalProps = props;
					},
					template: '<div><slot name="header"/><slot/></div>',
				}),
				MkPagination: defineComponent({
					props: ['paginator'],
					setup(props) {
						onPaginator?.(props.paginator as Paginator<'notes/likes'>);
					},
					template: '<div/>',
				}),
			},
		},
	});
}

describe('content likes dialog', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.api.mockResolvedValue([]);
	});
	afterEach(() => cleanup());

	test('shows the total count in the title like the reference design', () => {
		expect(renderDialog({ count: 54 }).getByText('Liked By (54)')).toBeTruthy();
	});

	test('falls back to the plain title when the count is unknown', () => {
		expect(renderDialog({}).getByText('Liked By')).toBeTruthy();
	});

	test('hugs its content and only scrolls past the height limit', () => {
		renderDialog({});
		expect(modalProps.autoHeight).toBe(true);
		expect(modalProps.height).toBeGreaterThan(0);
	});

	test('loads the selected content target and retains it while paging', async () => {
		let paginator!: Paginator<'notes/likes'>;
		renderDialog({}, value => { paginator = value; });
		const like = { id: 'like-id', createdAt: '2026-09-08T00:00:00.000Z', user: { id: 'user-id' } };
		mocks.api.mockResolvedValueOnce([like]).mockResolvedValueOnce([{ ...like, id: 'older-like' }]);
		await paginator.init();
		expect(mocks.api).toHaveBeenNthCalledWith(1, 'notes/likes', { noteId: 'selected-note', limit: 20, allowPartial: true });
		await paginator.fetchOlder();
		expect(mocks.api).toHaveBeenLastCalledWith('notes/likes', { noteId: 'selected-note', limit: 30, untilId: 'like-id' });
	});
});
