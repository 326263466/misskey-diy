/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import MkPoll from '@/components/MkPoll.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), login: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => ({ apiWithDialog: mocks.api }));
vi.mock('@/utility/please-login.js', () => ({ pleaseLogin: mocks.login }));

const stubs = { Mfm: { props: ['text'], template: '<span>{{ text }}</span>' } };
const choices: NonNullable<Misskey.entities.Note['poll']>['choices'] = [
	{ text: '有兴趣', votes: 0, isVoted: false },
	{ text: '没兴趣', votes: 0, isVoted: false },
	{ text: '路过', votes: 0, isVoted: false },
];

function mountPoll(overrides: Record<string, unknown> = {}) {
	return render(MkPoll, {
		props: { noteId: 'poll-note', multiple: false, expiresAt: null, choices, ...overrides },
		global: { stubs },
	});
}

beforeEach(() => {
	mocks.api.mockReset().mockResolvedValue(undefined);
	mocks.login.mockReset().mockResolvedValue(true);
});

afterEach(cleanup);

test('单选先选择再提交，等待响应时阻止重复提交并立即保留成功状态', async () => {
	let resolveVote!: () => void;
	mocks.api.mockReturnValue(new Promise<void>(resolve => { resolveVote = resolve; }));
	const view = mountPoll();
	const submit = view.getByRole('button', { name: i18n.ts._poll.vote });
	expect((submit as HTMLButtonElement).disabled).toBe(true);
	await fireEvent.click(view.getByRole('radio', { name: '有兴趣' }));
	expect(mocks.api).not.toHaveBeenCalled();
	await fireEvent.click(submit);
	await fireEvent.click(submit);
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
	expect(mocks.api).toHaveBeenCalledWith('notes/polls/vote', { noteId: 'poll-note', choice: 0 });
	resolveVote();
	await waitFor(() => expect(view.getByText(i18n.ts._poll.voted)).toBeDefined());
	expect(view.getByText(i18n.tsx._poll.participants({ n: 1 }))).toBeDefined();
	expect((view.getByRole('radio', { name: /有兴趣/ }) as HTMLInputElement).checked).toBe(true);
	expect(view.queryByRole('button', { name: i18n.ts._poll.vote })).toBeNull();
	expect(choices[0].votes).toBe(0);
	await view.rerender({ choices: choices.map((choice, index) => index === 0 ? { ...choice, votes: 1, isVoted: true } : choice) });
	expect(view.getByText(i18n.tsx._poll.participants({ n: 1 }))).toBeDefined();
});

test('多选串行提交，部分失败后保留已成功项并只重试剩余选项', async () => {
	let resolveFirst!: () => void;
	mocks.api
		.mockReturnValueOnce(new Promise<void>(resolve => { resolveFirst = resolve; }))
		.mockRejectedValueOnce(new Error('network'))
		.mockResolvedValueOnce({ poll: { choices: choices.map((choice, index) => index === 0 ? { ...choice, votes: 1, isVoted: true } : choice) } });
	const view = mountPoll({ multiple: true });
	await fireEvent.click(view.getByRole('checkbox', { name: '有兴趣' }));
	await fireEvent.click(view.getByRole('checkbox', { name: '没兴趣' }));
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._poll.vote }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
	resolveFirst();
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(3));
	await waitFor(() => expect((view.getByRole('button', { name: i18n.ts._poll.vote }) as HTMLButtonElement).disabled).toBe(false));
	const successful = view.getByRole('checkbox', { name: '有兴趣' }) as HTMLInputElement;
	const pending = view.getByRole('checkbox', { name: '没兴趣' }) as HTMLInputElement;
	expect(successful.checked).toBe(true);
	expect(successful.disabled).toBe(true);
	expect(pending.checked).toBe(true);
	expect(pending.disabled).toBe(false);
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._poll.vote }));
	await waitFor(() => expect(view.getByText(i18n.tsx._poll.totalVotes({ n: 2 }))).toBeDefined());
	expect(mocks.api.mock.calls.filter(call => call[0] === 'notes/polls/vote').map(call => call[1].choice)).toEqual([0, 1, 1]);
});

test('请求报错后从服务端恢复已落库的选项，不再次投同一项', async () => {
	mocks.api
		.mockRejectedValueOnce(new Error('timeout'))
		.mockResolvedValueOnce({ poll: { choices: choices.map((choice, index) => index === 0 ? { ...choice, votes: 1, isVoted: true } : choice) } });
	const view = mountPoll();
	await fireEvent.click(view.getByRole('radio', { name: '有兴趣' }));
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._poll.vote }));
	await waitFor(() => expect(view.getByText(i18n.ts._poll.voted)).toBeDefined());
	expect(view.queryByRole('button', { name: i18n.ts._poll.vote })).toBeNull();
	expect(mocks.api.mock.calls.filter(call => call[0] === 'notes/polls/vote')).toHaveLength(1);
});

test('未登录时不提交，查看结果后仍能返回继续选择', async () => {
	mocks.login.mockResolvedValue(false);
	const view = mountPoll();
	await fireEvent.click(view.getByRole('radio', { name: '有兴趣' }));
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._poll.vote }));
	await waitFor(() => expect(mocks.login).toHaveBeenCalledTimes(1));
	expect(mocks.api).not.toHaveBeenCalled();
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._poll.showResult }));
	expect((view.getByRole('radio', { name: /有兴趣/ }) as HTMLInputElement).disabled).toBe(true);
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._poll.vote }));
	expect((view.getByRole('radio', { name: '有兴趣' }) as HTMLInputElement).checked).toBe(true);
	expect(mocks.api).not.toHaveBeenCalled();
});

test('登录等待期间截止时不再投票', async () => {
	let resolveLogin!: (value: boolean) => void;
	mocks.login.mockReturnValue(new Promise<boolean>(resolve => { resolveLogin = resolve; }));
	const view = mountPoll();
	await fireEvent.click(view.getByRole('radio', { name: '有兴趣' }));
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._poll.vote }));
	await view.rerender({ expiresAt: new Date(Date.now() - 1000).toISOString() });
	resolveLogin(true);
	await waitFor(() => expect(view.getByText(i18n.ts._poll.closed)).toBeDefined());
	expect(mocks.api).not.toHaveBeenCalled();
	expect(view.queryByRole('button')).toBeNull();
});

test.each(['切换投票', '卸载'])('登录等待期间%s，不提交旧投票或切换新投票结果', async action => {
	let resolveLogin!: (value: boolean) => void;
	mocks.login.mockReturnValue(new Promise<boolean>(resolve => { resolveLogin = resolve; }));
	const view = mountPoll();
	await fireEvent.click(view.getByRole('radio', { name: '有兴趣' }));
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._poll.vote }));
	if (action === '卸载') view.unmount();
	else await view.rerender({ noteId: 'another-poll' });
	resolveLogin(true);
	await Promise.resolve();
	await nextTick();
	if (action === '切换投票') {
		expect((view.getByRole('radio', { name: '有兴趣' }) as HTMLInputElement).disabled).toBe(false);
		expect(view.getByRole('button', { name: i18n.ts._poll.showResult })).toBeDefined();
	}
	expect(mocks.api).not.toHaveBeenCalled();
});

test('切换投票后旧请求完成，不释放新请求锁或继续提交旧多选', async () => {
	let resolveOldVote!: () => void;
	let resolveNewVote!: () => void;
	mocks.api
		.mockReturnValueOnce(new Promise<void>(resolve => { resolveOldVote = resolve; }))
		.mockReturnValueOnce(new Promise<void>(resolve => { resolveNewVote = resolve; }));
	const view = mountPoll({ multiple: true });
	await fireEvent.click(view.getByRole('checkbox', { name: '有兴趣' }));
	await fireEvent.click(view.getByRole('checkbox', { name: '没兴趣' }));
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._poll.vote }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
	await view.rerender({ noteId: 'another-poll' });
	await fireEvent.click(view.getByRole('checkbox', { name: '路过' }));
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._poll.vote }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
	resolveOldVote();
	await Promise.resolve();
	await nextTick();
	expect((view.getByRole('button', { name: i18n.ts._poll.vote }) as HTMLButtonElement).disabled).toBe(true);
	expect(mocks.api.mock.calls).toEqual([
		['notes/polls/vote', { noteId: 'poll-note', choice: 0 }],
		['notes/polls/vote', { noteId: 'another-poll', choice: 2 }],
	]);
	resolveNewVote();
	await waitFor(() => expect(view.getByText(i18n.tsx._poll.totalVotes({ n: 1 }))).toBeDefined());
	expect((view.getByRole('checkbox', { name: /有兴趣/ }) as HTMLInputElement).checked).toBe(false);
});

test('只读及已截止投票禁止写入，零票结果正常显示', () => {
	const view = mountPoll({ readOnly: true });
	expect(view.queryByRole('button')).toBeNull();
	expect(view.getAllByRole('radio').every(input => (input as HTMLInputElement).disabled)).toBe(true);
	expect(view.getByText(i18n.tsx._poll.participants({ n: 0 }))).toBeDefined();
	expect(view.container.innerHTML).not.toContain('NaN');
	expect(mocks.api).not.toHaveBeenCalled();
});
