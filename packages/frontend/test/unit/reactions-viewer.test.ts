/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { getEmojiName } from '@@/js/emojilist.js';
import { preferState } from '../setup.unit.js';
import MkReactionsViewer from '@/components/MkReactionsViewer.vue';
import { noteEvents } from '@/composables/use-note-capture.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn(), popup: vi.fn(), toast: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: { id: 'me' } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api, misskeyApiGet: vi.fn() }));
vi.mock('@/os.js', () => ({ confirm: mocks.confirm, popup: mocks.popup, toast: mocks.toast }));
vi.mock('@/custom-emojis.js', () => ({ customEmojisMap: new Map() }));
vi.mock('@/composables/use-tooltip.js', () => ({ useTooltip: vi.fn() }));
vi.mock('@/composables/use-note-capture.js', async () => {
	const { EventEmitter } = await import('eventemitter3');
	return { noteEvents: new EventEmitter() };
});
vi.mock('@/utility/sound.js', () => ({ playMisskeySfx: vi.fn() }));
vi.mock('@/utility/haptic.js', () => ({ haptic: vi.fn() }));
vi.mock('@/utility/emoji-mute.js', () => ({ mute: vi.fn(), unmute: vi.fn(), checkMuted: () => ({ value: false }) }));
vi.mock('@/utility/emoji-palette.js', () => ({ addToEmojiPalette: vi.fn() }));
vi.mock('@/components/MkCustomEmojiDetailedDialog.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkReactionEffect.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkReactionIcon.vue', () => ({ default: { props: ['reaction'], template: '<span>{{ reaction }}</span>' } }));

function reactionLabel(reaction: string, count: number) {
	return i18n.tsx._chat.reactionLabel({ reaction: getEmojiName(reaction), count });
}

function renderViewer(reactions: Record<string, number>, mine: string | string[] | null = null) {
	return render(MkReactionsViewer, {
		props: { noteId: 'post', reactions, reactionEmojis: {}, myReactions: Array.isArray(mine) ? mine : mine ? [mine] : [] },
		global: { directives: { ripple: {} } },
	});
}

describe('emoji reactions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.api.mockImplementation((endpoint: string, params: { reaction?: string }) => Promise.resolve(endpoint === 'notes/reactions/create' ? { reaction: params.reaction } : undefined));
		mocks.confirm.mockResolvedValue({ canceled: false });
		mocks.popup.mockReturnValue({ dispose: vi.fn() });
		preferState.animation = false;
		preferState.confirmOnReact = false;
	});
	afterEach(() => {
		cleanup();
		noteEvents.removeAllListeners();
		delete preferState.animation;
		delete preferState.confirmOnReact;
	});

	test('updates the count without replacing the emoji button', async () => {
		const view = renderViewer({ '😀': 1 });
		const button = view.getByRole('button', { name: reactionLabel('😀', 1) });
		await view.rerender({ reactions: { '😀': 2 } });
		expect(view.getByRole('button', { name: reactionLabel('😀', 2) })).toBe(button);
		expect(mocks.api).not.toHaveBeenCalled();
		await view.rerender({ canAdd: true });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._chat.addReaction }));
		expect(view.emitted('add')).toHaveLength(1);
		expect(mocks.api).not.toHaveBeenCalled();
		await view.rerender({ reactions: {} });
		expect(view.queryByRole('button', { name: i18n.ts._chat.addReaction })).toBeNull();
	});

	test('按服务器给出的时间顺序显示，计数变化和新增种类不打乱已有位置', async () => {
		const order = () => view.getAllByRole('button').map(button => button.getAttribute('data-reaction'));
		const view = renderViewer({ '🎉': 1, '😀': 3, '👍': 2 });
		expect(order()).toEqual(['🎉', '😀', '👍']);
		await view.rerender({ reactions: { '🎉': 5, '😀': 1, '👍': 2 } });
		expect(order()).toEqual(['🎉', '😀', '👍']);
		await view.rerender({ reactions: { '🎉': 5, '😀': 1, '👍': 2, '🔥': 9 } });
		expect(order()).toEqual(['🎉', '😀', '👍', '🔥']);
	});

	test('displays only emoji reactions and excludes invalid records from the display limit', () => {
		const view = renderViewer({ 'old text 😀': 5, '😀': 1 }, 'old text 😀');
		expect(view.getAllByRole('button')).toHaveLength(1);
		expect(view.getByRole('button', { name: reactionLabel('😀', 1) })).toBeTruthy();
		expect(view.queryByText('old text 😀')).toBeNull();
	});

	test('adds an emoji through the original reaction API', async () => {
		const view = renderViewer({ '😀': 1 });
		await fireEvent.click(view.getByRole('button'));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('notes/reactions/create', { noteId: 'post', reaction: '😀' }));
	});

	test('点击已有表情时按服务器接受的表情更新选中状态', async () => {
		mocks.api.mockResolvedValueOnce({ reaction: '❤' });
		const reacted = vi.fn();
		noteEvents.on('reacted:post', reacted);
		const view = renderViewer({ '😀': 1 });
		await fireEvent.click(view.getByRole('button'));
		await waitFor(() => expect(reacted).toHaveBeenCalledWith(expect.objectContaining({ reaction: '❤' })));
		expect(reacted).not.toHaveBeenCalledWith(expect.objectContaining({ reaction: '😀' }));
	});

	test('只撤回点击的表情，其他自己的回应保持选中', async () => {
		const unreacted = vi.fn();
		noteEvents.on('unreacted:post', unreacted);
		const view = renderViewer({ '😀': 1, '🎉': 2 }, ['😀', '🎉']);
		await fireEvent.click(view.getByRole('button', { name: reactionLabel('😀', 1) }));
		await waitFor(() => expect(unreacted).toHaveBeenCalledWith({ userId: 'me', reaction: '😀' }));
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('notes/reactions/delete', { noteId: 'post', reaction: '😀' });
		expect(view.getByRole('button', { name: reactionLabel('🎉', 2), pressed: true })).toBeTruthy();
		expect(mocks.confirm).not.toHaveBeenCalled();
	});

	test('启用确认时取消添加不发送请求', async () => {
		preferState.confirmOnReact = true;
		mocks.confirm.mockResolvedValue({ canceled: true });
		const view = renderViewer({ '😀': 1 });
		await fireEvent.click(view.getByRole('button'));
		expect(mocks.confirm).toHaveBeenCalledOnce();
		expect(mocks.api).not.toHaveBeenCalled();
	});

	test('添加其他表情保留原回应，不发撤回请求', async () => {
		const view = renderViewer({ '😀': 1, '🎉': 1 }, '🎉');
		await fireEvent.click(view.getByRole('button', { name: reactionLabel('😀', 1) }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledExactlyOnceWith('notes/reactions/create', { noteId: 'post', reaction: '😀' }));
		expect(view.getByRole('button', { name: reactionLabel('🎉', 1), pressed: true })).toBeTruthy();
	});

	test('retains my reaction when the display limit is reached', () => {
		const view = renderViewer({ '😀': 10, '🎉': 1, '👍': 2 }, ['🎉', '👍']);
		expect(view.getAllByRole('button')).toHaveLength(3);
		expect(view.getByRole('button', { name: reactionLabel('🎉', 1), pressed: true })).toBeTruthy();
		expect(view.getByRole('button', { name: reactionLabel('👍', 2), pressed: true })).toBeTruthy();
	});

	test('撤回失败保留选中状态并允许再次提交', async () => {
		mocks.api.mockRejectedValueOnce(new Error('failed'));
		const view = renderViewer({ '😀': 1 }, ['😀']);
		const button = view.getByRole('button', { pressed: true });
		await fireEvent.click(button);
		await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(i18n.ts.somethingHappened, 'error'));
		expect(button).toHaveProperty('disabled', false);
		expect(button.getAttribute('aria-pressed')).toBe('true');
		await fireEvent.click(button);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
	});

	test('同一项请求未完成时重复点击只提交一次', async () => {
		let finish!: (value: { reaction: string }) => void;
		mocks.api.mockReturnValueOnce(new Promise<{ reaction: string }>(resolve => { finish = resolve; }));
		const view = renderViewer({ '😀': 1 });
		const button = view.getByRole('button');
		await fireEvent.click(button);
		await fireEvent.click(button);
		expect(mocks.api).toHaveBeenCalledTimes(1);
		finish({ reaction: '😀' });
		await waitFor(() => expect(button).toHaveProperty('disabled', false));
	});
});
