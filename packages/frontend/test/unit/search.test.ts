/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { h, nextTick, Suspense } from 'vue';
import type { Component } from 'vue';
import Search from '@/pages/search.vue';
import NoteSearch from '@/pages/search.note.vue';
import UserSearch from '@/pages/search.user.vue';
import { i18n } from '@/i18n.js';
import type { IPaginator } from '@/utility/paginator.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(), confirm: vi.fn(), lookup: vi.fn(), selectUser: vi.fn(),
	push: vi.fn(), pushByPath: vi.fn(),
}));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/lookup.js', () => ({ apLookup: mocks.lookup }));
vi.mock('@/os.js', () => ({ confirm: mocks.confirm, selectUser: mocks.selectUser, promiseDialog: vi.fn() }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ push: mocks.push, pushByPath: mocks.pushByPath }) }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/instance.js', () => ({ instance: { federation: 'all', noteSearchableScope: 'global' } }));
vi.mock('@/i.js', () => ({ $i: { id: 'self', username: 'self', host: null } }));
vi.mock('@/utility/check-permissions.js', () => ({ notesSearchAvailable: true, usersSearchAvailable: true }));
vi.mock('@/components/MkInput.vue', () => ({ default: {
	props: ['modelValue', 'type'],
	emits: ['update:modelValue', 'enter'],
	template: '<input :type="type || \'text\'" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keydown.enter="$emit(\'enter\', $event)"/>',
} }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/MkRadios.vue', () => ({ default: {
	props: ['modelValue', 'options'],
	emits: ['update:modelValue'],
	template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in options" :value="item.value">{{ item.label }}</option></select>',
} }));
vi.mock('@/components/MkFoldableSection.vue', () => ({ default: {
	props: ['expanded'],
	template: '<section><header><slot name="header"/></header><slot/></section>',
} }));
vi.mock('@/components/MkUserCardMini.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/MkNotesTimeline.vue', () => ({ default: {
	props: ['paginator'],
	setup(props: { paginator: IPaginator }) {
		void props.paginator.init();
	},
	template: '<div data-testid="note-results"/>',
} }));
vi.mock('@/components/MkUserList.vue', () => ({ default: {
	props: ['paginator'],
	setup(props: { paginator: IPaginator }) {
		void props.paginator.init();
	},
	template: '<div data-testid="user-results"/>',
} }));

async function renderSearch(component: Component, props: Record<string, unknown> = {}) {
	const view = render({
		render: () => h('div', [h(Suspense, null, { default: () => h(component, props) })]),
	}, {
		global: {
			stubs: {
				PageWithHeader: {
					props: ['tab', 'tabs'],
					emits: ['update:tab'],
					template: '<main><button v-for="item in tabs" @click="$emit(\'update:tab\', item.key)">{{ item.title }}</button><slot/></main>',
				},
			},
		},
	});
	await waitFor(() => expect(view.getByRole('searchbox')).toBeTruthy());
	return view;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.api.mockResolvedValue([]);
	mocks.confirm.mockResolvedValue({ canceled: true });
	mocks.selectUser.mockResolvedValue({ id: 'selected-user', username: 'selected', host: null });
});

afterEach(cleanup);

const cases = [
	{ type: 'note', component: NoteSearch, endpoint: 'notes/search' },
	{ type: 'user', component: UserSearch, endpoint: 'users/search' },
];

describe.each(cases)('$type 搜索提交', ({ type, component, endpoint }) => {
	test('带关键词进入搜索页立即加载结果，只请求一次', async () => {
		await renderSearch(Search, { query: '  搜索词  ', type });
		await waitFor(() => expect(mocks.api).toHaveBeenCalledExactlyOnceWith(endpoint, expect.objectContaining({ query: '搜索词' })));
		expect(mocks.confirm).not.toHaveBeenCalled();
	});

	test('没有关键词时不请求，输入草稿也不请求，回车后才搜索', async () => {
		const view = await renderSearch(component, { query: '   ' });
		expect(mocks.api).not.toHaveBeenCalled();
		await fireEvent.update(view.getByRole('searchbox'), 'new keyword');
		expect(mocks.api).not.toHaveBeenCalled();
		await fireEvent.keyDown(view.getByRole('searchbox'), { key: 'Enter' });
		await waitFor(() => expect(mocks.api).toHaveBeenCalledExactlyOnceWith(endpoint, expect.objectContaining({ query: 'new keyword' })));
	});

	test.each(['https://example.com/notes/1', '@alice', '#topic'])('自动加载 %s 直接搜索，不弹出特殊跳转确认', async query => {
		await renderSearch(component, { query });
		await waitFor(() => expect(mocks.api).toHaveBeenCalledExactlyOnceWith(endpoint, expect.objectContaining({ query })));
		expect(mocks.confirm).not.toHaveBeenCalled();
		expect(mocks.lookup).not.toHaveBeenCalled();
		expect(mocks.push).not.toHaveBeenCalled();
		expect(mocks.pushByPath).not.toHaveBeenCalled();
	});

	test('主动提交特殊关键词仍保留跳转确认', async () => {
		const view = await renderSearch(component);
		await fireEvent.update(view.getByRole('searchbox'), '@alice');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.search }));
		await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
		await waitFor(() => expect(mocks.api).toHaveBeenCalledExactlyOnceWith(endpoint, expect.objectContaining({ query: '@alice' })));
	});
});

test('结果页提交新词后切换分类，始终使用最近已提交的关键词', async () => {
	const view = await renderSearch(Search, { query: 'initial', type: 'user' });
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
	await fireEvent.update(view.getByRole('searchbox'), '  latest  ');
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.search }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
	await fireEvent.update(view.getByRole('searchbox'), 'unsubmitted');
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.notes }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(3));
	expect(mocks.api).toHaveBeenLastCalledWith('notes/search', expect.objectContaining({ query: 'latest' }));
	expect(view.getByRole('searchbox')).toHaveProperty('value', 'latest');
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.users }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(4));
	expect(mocks.api).toHaveBeenLastCalledWith('users/search', expect.objectContaining({ query: 'latest' }));
});

test('用户来源筛选即时刷新，使用已提交词并保留输入中的草稿', async () => {
	const view = await renderSearch(UserSearch, { query: 'submitted' });
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
	await fireEvent.update(view.getByRole('searchbox'), 'draft');
	await fireEvent.update(view.getByRole('combobox'), 'local');
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
	expect(mocks.api).toHaveBeenLastCalledWith('users/search', expect.objectContaining({ query: 'submitted', origin: 'local' }));
	expect(view.getByRole('searchbox')).toHaveProperty('value', 'draft');
});

test('帖子范围与日期筛选即时刷新，不把输入中的草稿当作已提交词', async () => {
	const view = await renderSearch(NoteSearch, { query: 'submitted' });
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
	await fireEvent.update(view.getByRole('searchbox'), 'draft');
	await fireEvent.update(view.getByRole('combobox'), 'local');
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
	expect(mocks.api).toHaveBeenLastCalledWith('notes/search', expect.objectContaining({ query: 'submitted', host: '.' }));
	const dateInputs = view.container.querySelectorAll('input[type="datetime-local"]');
	await fireEvent.update(dateInputs[0], '2026-09-01T12:00');
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(3));
	expect(mocks.api).toHaveBeenLastCalledWith('notes/search', expect.objectContaining({ query: 'submitted', rangeStartAt: new Date('2026-09-01T12:00').getTime() }));
	await fireEvent.update(dateInputs[1], '2026-09-20T12:00');
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(4));
	expect(mocks.api).toHaveBeenLastCalledWith('notes/search', expect.objectContaining({ query: 'submitted', rangeEndAt: new Date('2026-09-20T12:00').getTime() }));
	expect(view.getByRole('searchbox')).toHaveProperty('value', 'draft');
});

test('服务器筛选等待有效主机名，输入后自动刷新', async () => {
	const view = await renderSearch(NoteSearch, { query: 'submitted' });
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
	expect(view.getByTestId('note-results')).toBeTruthy();
	await fireEvent.update(view.getByRole('combobox'), 'server');
	await nextTick();
	expect(mocks.api).toHaveBeenCalledTimes(1);
	expect(view.queryByTestId('note-results')).toBeNull();
	await fireEvent.update(view.getByRole('textbox'), 'https://remote.example/path');
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
	expect(mocks.api).toHaveBeenLastCalledWith('notes/search', expect.objectContaining({ query: 'submitted', host: 'remote.example' }));
	expect(view.getByTestId('note-results')).toBeTruthy();
	await fireEvent.update(view.getByRole('textbox'), '');
	await nextTick();
	expect(mocks.api).toHaveBeenCalledTimes(2);
	expect(view.queryByTestId('note-results')).toBeNull();
	await fireEvent.update(view.getByRole('textbox'), 'another.example');
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(3));
	expect(mocks.api).toHaveBeenLastCalledWith('notes/search', expect.objectContaining({ query: 'submitted', host: 'another.example' }));
	expect(view.getByTestId('note-results')).toBeTruthy();
});

test('用户范围等待选择用户，选择后自动刷新', async () => {
	const view = await renderSearch(NoteSearch, { query: 'submitted' });
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
	expect(view.getByTestId('note-results')).toBeTruthy();
	await fireEvent.update(view.getByRole('combobox'), 'user');
	await nextTick();
	expect(mocks.api).toHaveBeenCalledTimes(1);
	expect(view.queryByTestId('note-results')).toBeNull();
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.selectUser }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
	expect(mocks.api).toHaveBeenLastCalledWith('notes/search', expect.objectContaining({ query: 'submitted', userId: 'selected-user', host: '.' }));
	expect(view.getByTestId('note-results')).toBeTruthy();
});
