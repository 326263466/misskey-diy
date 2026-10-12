/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick } from 'vue';
import type { Component } from 'vue';
import type * as Misskey from 'misskey-js';
import Announcements from '@/pages/admin/announcements.vue';
import Ads from '@/pages/admin/ads.vue';
import LocalEmojis from '@/pages/admin/custom-emojis-manager.local.list.vue';
import RemoteEmojis from '@/pages/admin/custom-emojis-manager.remote.vue';
import MkResult from '@/components/global/MkResult.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn(), apiWithDialog: vi.fn(), alert: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => mocks);
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/instance.js', () => ({ instance: {} }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/MkInput.vue', () => ({ default: { props: ['modelValue'], template: '<input :value="modelValue"/>' } }));
vi.mock('@/components/MkTextarea.vue', () => ({ default: { props: ['modelValue'], template: '<textarea :value="modelValue"/>' } }));
vi.mock('@/components/MkSelect.vue', () => ({ default: {
	props: ['modelValue', 'items'],
	emits: ['update:modelValue'],
	template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.value">{{ item.label }}</option></select>',
} }));
vi.mock('@/components/MkFolder.vue', () => ({ default: { template: '<section><slot name="label"/><slot/><slot name="footer"/></section>' } }));
vi.mock('@/components/MkRadios.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkSwitch.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/form/split.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/grid/MkGrid.vue', () => ({ default: { props: ['data'], template: '<div><p v-for="item in data" :key="item.id">{{ item.name }}</p></div>' } }));
vi.mock('@/components/MkRemoteEmojiEditDialog.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkSortOrderEditor.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/utility/drive.js', () => ({ selectFile: vi.fn() }));

const sentinels = new Map<HTMLElement, () => Promise<void>>();

function renderPage(component: Component) {
	return render(component, {
		global: {
			components: { MkResult },
			stubs: {
				MkStickyContainer: { template: '<main><slot name="header"/><slot/><slot name="footer"/></main>' },
				MkPageHeader: true,
				PageWithHeader: { props: ['actions'], template: '<main><button v-for="action in actions" @click="action.handler">{{ action.text }}</button><slot/></main>' },
				MkLoading: { template: '<div role="status"/>' },
				MkError: { emits: ['retry'], template: '<button @click="$emit(\'retry\')">retry</button>' },
				MkAd: true,
				MkSystemIcon: true,
			},
			directives: {
				appear: {
					mounted: (element, binding) => sentinels.set(element, binding.value),
					beforeUnmount: element => sentinels.delete(element),
				},
			},
		},
	});
}

function makeAnnouncement(id: string): Misskey.entities.AdminAnnouncementsListResponse[number] {
	return {
		id, title: id, text: '', imageUrl: null, icon: 'info', display: 'normal',
		isActive: true, forExistingUsers: false, silence: false, needConfirmationToRead: false,
		userId: null, reads: 0, createdAt: '2026-09-09T00:00:00.000Z', updatedAt: null,
	};
}

function makeAd(id: string): Misskey.entities.Ad {
	return {
		id, memo: id, url: '', imageUrl: '', place: 'square', priority: 'middle', ratio: 1,
		expiresAt: '2026-09-10T12:00:00.000Z', startsAt: '2026-09-09T12:00:00.000Z',
		dayOfWeek: 0, isSensitive: false,
	};
}

const cases = [
	{ name: '公告', component: Announcements, endpoint: 'admin/announcements/list', initialParams: { status: 'active' }, nextParams: { status: 'archived' }, nextFilter: 'archived', makeItem: makeAnnouncement },
	{ name: '广告', component: Ads, endpoint: 'admin/ad/list', initialParams: { publishing: null }, nextParams: { publishing: true }, nextFilter: 'publishing', makeItem: makeAd },
];

describe.each(cases)('$name分页', ({ component, endpoint, initialParams, nextParams, nextFilter, makeItem }) => {
	const page = (prefix: string, count = 11) => Array.from({ length: count }, (_, index) => makeItem(`${prefix}-${100 - index}`));

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.api.mockResolvedValue([]);
		mocks.confirm.mockResolvedValue({ canceled: false });
		mocks.apiWithDialog.mockResolvedValue(undefined);
	});

	afterEach(() => {
		cleanup();
		sentinels.clear();
	});

	test.each([0, 3, 10])('首批返回 %i 条时结束分页，不显示加载更多', async count => {
		mocks.api.mockResolvedValueOnce(page('first', count));
		const view = renderPage(component);
		await waitFor(() => expect(view.queryByRole('status')).toBeNull());
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith(endpoint, { ...initialParams, limit: 11 });
		expect(view.queryByRole('button', { name: i18n.ts.more })).toBeNull();
		expect(sentinels.size).toBe(0);
	});

	test('首载和切换筛选等待接口返回后才显示空状态', async () => {
		const initial = Promise.withResolvers<ReturnType<typeof page>>();
		mocks.api.mockReturnValueOnce(initial.promise);
		const view = renderPage(component);
		expect(view.getByRole('status')).toBeTruthy();
		expect(view.container.querySelector('mk-system-icon-stub')).toBeNull();
		initial.resolve([]);
		await waitFor(() => expect(view.queryByRole('status')).toBeNull());
		expect(view.container.querySelector('mk-system-icon-stub')).not.toBeNull();
		const refresh = Promise.withResolvers<ReturnType<typeof page>>();
		mocks.api.mockReturnValueOnce(refresh.promise);
		await fireEvent.update(view.getByRole('combobox'), nextFilter);
		expect(view.getByRole('status')).toBeTruthy();
		expect(view.container.querySelector('mk-system-icon-stub')).toBeNull();
		expect(mocks.api).toHaveBeenCalledTimes(2);
		refresh.resolve([]);
		await waitFor(() => expect(view.queryByRole('status')).toBeNull());
		expect(view.container.querySelector('mk-system-icon-stub')).not.toBeNull();
	});

	test('触底只发起一个请求，使用服务端游标并在最后一页停止', async () => {
		mocks.api.mockResolvedValueOnce(page('first'));
		const view = renderPage(component);
		await waitFor(() => expect(sentinels.size).toBe(1));
		expect(view.queryByRole('button', { name: i18n.ts.more })).toBeNull();
		const pending = Promise.withResolvers<ReturnType<typeof page>>();
		mocks.api.mockReturnValueOnce(pending.promise);
		const more = [...sentinels.values()][0];
		const firstRequest = more();
		await more();
		expect(mocks.api).toHaveBeenCalledTimes(2);
		expect(mocks.api).toHaveBeenLastCalledWith(endpoint, { ...initialParams, limit: 11, untilId: 'first-91' });
		pending.resolve(page('last', 1));
		await firstRequest;
		await waitFor(() => expect(view.getByDisplayValue('last-100')).toBeTruthy());
		expect(sentinels.size).toBe(0);
	});

	test('成功后更新触底观察点，失败后保留观察点以免连续重试', async () => {
		mocks.api.mockResolvedValueOnce(page('first'));
		renderPage(component);
		await waitFor(() => expect(sentinels.size).toBe(1));
		const [firstSentinel, more] = [...sentinels.entries()][0];
		mocks.api.mockRejectedValueOnce(new Error('网络错误'));
		await more();
		await nextTick();
		expect([...sentinels.keys()]).toEqual([firstSentinel]);
		mocks.api.mockResolvedValueOnce(page('second'));
		await more();
		await nextTick();
		expect(sentinels.size).toBe(1);
		expect(sentinels.has(firstSentinel)).toBe(false);
		expect(mocks.api).toHaveBeenLastCalledWith(endpoint, { ...initialParams, limit: 11, untilId: 'first-91' });
	});

	test('切换筛选后忽略旧分页结果', async () => {
		mocks.api.mockResolvedValueOnce(page('first'));
		const view = renderPage(component);
		await waitFor(() => expect(sentinels.size).toBe(1));
		const pending = Promise.withResolvers<ReturnType<typeof page>>();
		mocks.api.mockReturnValueOnce(pending.promise);
		const oldRequest = [...sentinels.values()][0]();
		mocks.api.mockResolvedValueOnce(page('filtered', 1));
		await fireEvent.update(view.getByRole('combobox'), nextFilter);
		await waitFor(() => expect(view.getByDisplayValue('filtered-100')).toBeTruthy());
		pending.resolve(page('stale', 1));
		await oldRequest;
		await nextTick();
		expect(view.queryByDisplayValue('stale-100')).toBeNull();
		expect(view.getByDisplayValue('filtered-100')).toBeTruthy();
		expect(mocks.api).toHaveBeenLastCalledWith(endpoint, { ...nextParams, limit: 11 });
		expect(sentinels.size).toBe(0);
	});

	test('筛选的初始请求乱序返回时只显示最新结果', async () => {
		const pending = Promise.withResolvers<ReturnType<typeof page>>();
		mocks.api.mockReturnValueOnce(pending.promise);
		const view = renderPage(component);
		mocks.api.mockResolvedValueOnce(page('filtered', 1));
		await fireEvent.update(view.getByRole('combobox'), nextFilter);
		await waitFor(() => expect(view.getByDisplayValue('filtered-100')).toBeTruthy());
		pending.resolve(page('stale', 1));
		await pending.promise;
		await nextTick();
		await waitFor(() => expect(view.queryByRole('status')).toBeNull());
		expect(view.queryByDisplayValue('stale-100')).toBeNull();
		expect(view.getByDisplayValue('filtered-100')).toBeTruthy();
	});
});

describe.each([
	{ name: '本地表情', component: LocalEmojis },
	{ name: '远程表情', component: RemoteEmojis },
])('$name加载状态', ({ component }) => {
	const emptyText = i18n.ts._customEmojisManager._local._list.emojisNothing;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(cleanup);

	test('首载和失败重试都等待接口成功返回后才显示空状态', async () => {
		const initial = Promise.withResolvers<unknown>();
		mocks.api.mockReturnValueOnce(initial.promise);
		const view = renderPage(component);
		expect(view.getByRole('status')).toBeTruthy();
		expect(view.queryByText(emptyText)).toBeNull();

		initial.reject(new Error('网络错误'));
		await waitFor(() => expect(view.getByRole('button', { name: 'retry' })).toBeTruthy());
		expect(view.queryByText(emptyText)).toBeNull();

		const retry = Promise.withResolvers<unknown>();
		mocks.api.mockReturnValueOnce(retry.promise);
		await fireEvent.click(view.getByRole('button', { name: 'retry' }));
		expect(view.getByRole('status')).toBeTruthy();
		expect(view.queryByText(emptyText)).toBeNull();
		retry.resolve({ emojis: [], allPages: 0 });
		await waitFor(() => expect(view.getByText(emptyText)).toBeTruthy());
		expect(view.queryByRole('status')).toBeNull();
	});

	test('请求返回内容时，更新列表前不闪现空文案', async () => {
		const pending = Promise.withResolvers<unknown>();
		mocks.api.mockReturnValueOnce(pending.promise);
		const view = renderPage(component);
		let showedEmpty = false;
		const observer = new MutationObserver(() => {
			showedEmpty ||= view.queryByText(emptyText) != null;
		});
		observer.observe(view.container, { subtree: true, childList: true, characterData: true });
		try {
			pending.resolve({ emojis: [{
				id: 'emoji-id', name: 'test_emoji', publicUrl: 'https://example.com/emoji.png',
				host: null, aliases: [], license: null, category: null, isSensitive: false,
				localOnly: false, roleIdsThatCanBeUsedThisEmojiAsReaction: [], updatedAt: null, type: null,
			}], allPages: 1 });
			await waitFor(() => expect(view.getByText('test_emoji')).toBeTruthy());
			expect(showedEmpty).toBe(false);
			expect(view.queryByText(emptyText)).toBeNull();
		} finally {
			observer.disconnect();
		}
	});
});
