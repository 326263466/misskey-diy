/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/vue';
import { nextTick } from 'vue';
import { CONTENT_LIMITS } from 'misskey-js';
import FeedbackPage from '@/pages/feedback.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), popupMenu: vi.fn(), login: vi.fn(), confirm: vi.fn(), select: vi.fn(), toast: vi.fn(), user: { id: 'self', isAdmin: false, isModerator: false } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/i.js', () => ({ $i: mocks.user }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/instance.js', () => ({ instance: { maintainerEmail: 'help@example.invalid' } }));
vi.mock('@/utility/please-login.js', () => ({ pleaseLogin: mocks.login }));
vi.mock('@/os.js', () => ({ confirm: mocks.confirm, popupMenu: mocks.popupMenu, select: mocks.select, toast: mocks.toast }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { detach() {} } }));
vi.mock('@/utility/emoji-picker.js', () => ({ emojiPicker: { show: vi.fn() } }));
vi.mock('@/components/MkPostFormAttaches.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkUploaderItems.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/composables/use-uploader.js', async () => {
	const { ref } = await import('vue');
	return { useUploader: () => ({ items: ref([]), readyForUpload: ref(false), events: { on: vi.fn() }, reset: vi.fn() }) };
});
vi.mock('@@/js/user.js', () => ({ userPage: () => '/@alice' }));
vi.mock('@/components/MkButton.vue', () => ({ default: { props: { type: { default: 'button' }, disabled: Boolean }, template: '<button :type="type" :disabled="disabled"><slot/></button>' } }));

const entry = (overrides = {}) => ({ id: 'feedback-1', userId: 'self', user: { id: 'self', username: 'alice', name: 'Alice' }, title: 'Search is slow', description: 'Search is slow\nSteps to reproduce', files: [], category: 'bug', status: 'open', response: null, responseFiles: [], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...overrides });
const listing = (items = [entry()], total = items.length) => ({ items, total, counts: { all: total, open: total, inProgress: 0, resolved: 0, closed: 0 } });

function mount() {
	return render(FeedbackPage, { global: { stubs: { PageWithHeader: { template: '<div data-page-body><slot/></div>' }, MkLoading: true, MkAvatar: true, MkTime: true, MkA: { template: '<a><slot/></a>' }, MkUserName: { props: ['user'], template: '<span>{{ user.name ?? user.username }}</span>' }, Mfm: { props: ['text'], template: '<span>{{ text }}</span>' } } } });
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.user.isModerator = false;
	mocks.user.isAdmin = false;
	mocks.api.mockReset();
	mocks.api.mockResolvedValue(listing());
	mocks.login.mockResolvedValue(true);
	mocks.confirm.mockResolvedValue({ canceled: false });
	mocks.select.mockResolvedValue({ canceled: true });
	Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

test('loads the board and filters by status and own feedback', async () => {
	const view = mount();
	await waitFor(() => expect(view.getByText(/^Search is slow/)).toBeTruthy());
	expect(mocks.api).toHaveBeenCalledOnce();
	expect(view.getAllByRole('button', { name: i18n.ts._feedback.publish })).toHaveLength(1);
	await fireEvent.click(within(view.getByTestId('feedback-status-filters')).getByRole('button', { name: new RegExp(i18n.ts._feedback.resolved) }));
	await waitFor(() => expect(mocks.api.mock.lastCall?.[1]).toMatchObject({ status: 'resolved', offset: 0 }));
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._feedback.mine }));
	await waitFor(() => expect(mocks.api.mock.lastCall?.[1]).toMatchObject({ mine: true }));
});

test('回复编辑期间禁止刷新，取消后重新获取管理员修改的内容', async () => {
	mocks.user.isModerator = true;
	mocks.api.mockResolvedValueOnce(listing()).mockResolvedValueOnce(listing([entry({ status: 'resolved', response: 'Fixed by another moderator' })]));
	const view = mount();
	await fireEvent.click(await view.findByRole('button', { name: i18n.ts.reply }));
	await fireEvent.update(view.getByPlaceholderText(i18n.ts._feedback.responsePlaceholder), 'Unsaved reply');
	const reload = view.getByRole('button', { name: i18n.ts.reload }) as HTMLButtonElement;
	expect(reload.disabled).toBe(true);
	await fireEvent.click(reload);
	expect(mocks.api).toHaveBeenCalledOnce();
	expect((view.getByPlaceholderText(i18n.ts._feedback.responsePlaceholder) as HTMLTextAreaElement).value).toBe('Unsaved reply');
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.cancel }));
	await fireEvent.click(reload);
	await fireEvent.click(await view.findByRole('button', { name: i18n.ts.edit }));
	const form = view.getByRole('form', { name: i18n.ts._feedback.officialResponse });
	expect(within(view.getByRole('article')).getByText(i18n.ts._feedback.resolved)).toBeTruthy();
	expect((within(form).getByPlaceholderText(i18n.ts._feedback.responsePlaceholder) as HTMLTextAreaElement).value).toBe('Fixed by another moderator');
	expect((within(form).getByRole('button', { name: i18n.ts.save }) as HTMLButtonElement).disabled).toBe(true);
});

test('publishes trimmed content once and keeps a failed draft for retry', async () => {
	let reject = true;
	mocks.api.mockImplementation(async (endpoint: string) => {
		if (endpoint === 'feedback/create') { if (reject) throw new Error('offline'); return entry(); }
		return listing();
	});
	const view = mount();
	await fireEvent.update(view.getByPlaceholderText(i18n.ts._feedback.publishDescription), '  Search is slow\nSteps to reproduce  ');
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._feedback.publish }));
	await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(i18n.ts._feedback.publishFailed, 'error'));
	expect((view.getByPlaceholderText(i18n.ts._feedback.publishDescription) as HTMLTextAreaElement).value).toBe('  Search is slow\nSteps to reproduce  ');
	reject = false;
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._feedback.publish }));
	await waitFor(() => expect((view.getByPlaceholderText(i18n.ts._feedback.publishDescription) as HTMLTextAreaElement).value).toBe(''));
	expect(view.queryByRole('alert')).toBeNull();
	await waitFor(() => expect(view.getByText(/^Search is slow/)).toBeTruthy());
	expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'feedback/create').map(([, params]) => params)).toEqual(Array(2).fill({ title: 'Search is slow', description: 'Search is slow\nSteps to reproduce', category: 'bug', fileIds: [] }));
});

test('prevents duplicate publishing while the request is pending', async () => {
	const pending = Promise.withResolvers<ReturnType<typeof entry>>();
	mocks.api.mockImplementation((endpoint: string) => endpoint === 'feedback/create' ? pending.promise : Promise.resolve(listing()));
	const view = mount();
	await fireEvent.update(view.getByPlaceholderText(i18n.ts._feedback.publishDescription), 'Description');
	const form = view.getByPlaceholderText(i18n.ts._feedback.publishDescription).closest('form')!;
	await fireEvent.submit(form);
	await fireEvent.submit(form);
	expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'feedback/create')).toHaveLength(1);
	pending.resolve(entry());
});

test('moderators can resolve feedback and publish a response', async () => {
	mocks.user.isModerator = true;
	let current = entry();
	mocks.api.mockImplementation(async (endpoint: string, params: Record<string, unknown>) => endpoint === 'feedback/update' ? (current = entry({ ...current, ...params })) : listing([current]));
	mocks.select.mockResolvedValue({ canceled: false, result: 'resolved' });
	const view = mount();
	await fireEvent.click(await view.findByRole('button', { name: i18n.ts._feedback.manage }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('feedback/update', { feedbackId: 'feedback-1', status: 'resolved' }));
	expect(mocks.select).toHaveBeenCalledWith(expect.objectContaining({ default: 'open', items: expect.arrayContaining([{ value: 'resolved', label: i18n.ts._feedback.resolved }]) }));
	await waitFor(() => expect(within(view.getByRole('article')).getByText(i18n.ts._feedback.resolved)).toBeTruthy());
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.reply }));
	const form = view.getByRole('form', { name: i18n.ts._feedback.officialResponse });
	await fireEvent.update(within(form).getByPlaceholderText(i18n.ts._feedback.responsePlaceholder), ' Fixed in the next release ');
	await fireEvent.submit(form);
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('feedback/update', { feedbackId: 'feedback-1', response: 'Fixed in the next release', responseFileIds: [] }));
	await waitFor(() => expect(view.getByText('Fixed in the next release')).toBeTruthy());
	expect(view.queryByRole('form', { name: i18n.ts._feedback.officialResponse })).toBeNull();
});

test('ordinary users cannot manage or delete somebody else’s feedback', async () => {
	mocks.api.mockResolvedValue(listing([entry({ userId: 'other' })]));
	const view = mount();
	await view.findByText(/^Search is slow/);
	expect(view.queryByRole('button', { name: i18n.ts._feedback.manage })).toBeNull();
	expect(view.queryByRole('button', { name: i18n.ts.reply })).toBeNull();
	expect(view.queryByRole('button', { name: i18n.ts._feedback.delete })).toBeNull();
});

test('requires confirmation before deleting own feedback', async () => {
	mocks.confirm.mockResolvedValue({ canceled: true });
	const view = mount();
	await fireEvent.click(await view.findByRole('button', { name: i18n.ts._feedback.delete }));
	await nextTick();
	expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'feedback/delete')).toBe(false);
	mocks.confirm.mockResolvedValue({ canceled: false });
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._feedback.delete }));
	await waitFor(() => expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'feedback/delete')).toBe(true));
});

test('discarded list requests cannot replace a newer filter result', async () => {
	const old = Promise.withResolvers<ReturnType<typeof listing>>();
	mocks.api.mockReturnValueOnce(old.promise).mockResolvedValueOnce(listing([entry({ title: 'Latest result', description: 'Latest result' })]));
	const view = mount();
	await fireEvent.click(within(view.getByTestId('feedback-status-filters')).getByRole('button', { name: new RegExp(i18n.ts._feedback.resolved) }));
	await waitFor(() => expect(view.getByText('Latest result')).toBeTruthy());
	old.resolve(listing());
	await nextTick();
	expect(view.queryByText(/^Search is slow/)).toBeNull();
});

test('composes inside the header without navigation and shows official replies in the feed', async () => {
	mocks.api.mockResolvedValue(listing([entry({ response: 'Fixed in the next release' })]));
	const view = mount();
	const url = window.location.href;
	await waitFor(() => expect(view.getByText('Fixed in the next release')).toBeTruthy());
	const header = within(view.getByTestId('feedback-header'));
	const input = header.getByPlaceholderText(i18n.ts._feedback.publishDescription);
	await fireEvent.click(input);
	await fireEvent.update(input, 'Keep this draft');
	expect(view.queryByText(i18n.ts._feedback.newFeedback)).toBeNull();
	expect(window.location.href).toBe(url);
	expect((input as HTMLTextAreaElement).value).toBe('Keep this draft');
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._feedback.updated }));
	await waitFor(() => expect(mocks.api.mock.lastCall?.[1]).toMatchObject({ sort: 'updated' }));
});

test('publishes directly from the persistent input and keeps the page in place', async () => {
	mocks.api.mockImplementation(async (endpoint: string) => endpoint === 'feedback/create' ? entry() : listing());
	const view = mount();
	const input = view.getByPlaceholderText(i18n.ts._feedback.publishDescription);
	const url = window.location.href;
	await fireEvent.update(input, 'A'.repeat(125) + '\nDetails');
	await fireEvent.click(view.getByTestId('feedback-publish'));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('feedback/create', { title: 'A'.repeat(CONTENT_LIMITS.feedbackTitle), description: 'A'.repeat(125) + '\nDetails', category: 'bug', fileIds: [] }));
	await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(''));
	expect(view.getByPlaceholderText(i18n.ts._feedback.publishDescription)).toBe(input);
	expect(window.location.href).toBe(url);
});

test('uses the shared popup menu for the feedback category', async () => {
	const view = mount();
	expect(view.container.querySelector('select')).toBeNull();
	await fireEvent.click(within(view.getByTestId('feedback-header')).getByRole('button', { name: i18n.ts._feedback.category }));
	expect(mocks.popupMenu).toHaveBeenCalledOnce();
	mocks.popupMenu.mock.lastCall![0].find((item: { text: string }) => item.text === i18n.ts._feedback.feature).action();
	await fireEvent.update(view.getByPlaceholderText(i18n.ts._feedback.publishDescription), 'Feature request');
	await fireEvent.click(view.getByTestId('feedback-publish'));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('feedback/create', { title: 'Feature request', description: 'Feature request', category: 'feature', fileIds: [] }));
});
