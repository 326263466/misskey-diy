/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import { preferState } from '../setup.unit.js';
import MkReactionsViewer from '@/components/MkReactionsViewer.vue';
import { noteEvents } from '@/composables/use-note-capture.js';
import { i18n } from '@/i18n.js';
import { UserPreview } from '@/directives/user-preview.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	confirm: vi.fn(),
	popup: vi.fn(),
	me: { id: 'me', username: 'me', name: 'Me', host: null },
}));

vi.mock('@/i.js', () => ({ $i: mocks.me }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api, misskeyApiGet: vi.fn() }));
vi.mock('@/os.js', () => ({ confirm: mocks.confirm, popup: mocks.popup, alert: vi.fn() }));
vi.mock('@/custom-emojis.js', () => ({ customEmojisMap: new Map([['cat', { name: 'cat', url: '/cat.webp' }]]) }));
vi.mock('@/composables/use-tooltip.js', () => ({ useTooltip: vi.fn() }));
vi.mock('@/composables/use-note-capture.js', async () => {
	const { EventEmitter } = await import('eventemitter3');
	return { noteEvents: new EventEmitter() };
});
vi.mock('@/utility/sound.js', () => ({ playMisskeySfx: vi.fn() }));
vi.mock('@/utility/haptic.js', () => ({ haptic: vi.fn() }));
vi.mock('@/utility/emoji-mute.js', () => ({ mute: vi.fn(), unmute: vi.fn(), checkMuted: vi.fn(() => ({ value: false })) }));
vi.mock('@/utility/emoji-palette.js', () => ({ addToEmojiPalette: vi.fn() }));
vi.mock('@/components/MkReactionsViewer.details.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkCustomEmojiDetailedDialog.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkReactionEffect.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkReactionIcon.vue', () => ({
	default: { props: ['reaction'], template: '<span :data-reaction="reaction">{{ reaction }}</span>' },
}));
vi.mock('@/components/global/MkAvatar.vue', () => ({
	default: {
		props: ['user', 'link', 'preview'],
		template: '<span :data-avatar-user="user.id" :data-avatar-link="String(link)" :data-avatar-preview="String(preview)"/>',
	},
}));

let intersection: IntersectionObserverCallback;
let observed: Element;

function participant(id: string, type: string): Misskey.entities.NoteReaction {
	return {
		id: `reaction-${id}`, type, createdAt: '2026-01-01T00:00:00.000Z',
		user: { id, name: id, username: id, host: null },
	} as Misskey.entities.NoteReaction;
}

function renderViewer(reactions: Record<string, number>, myReaction?: string | null, maxNumber = 16) {
	return render(MkReactionsViewer, {
		props: { noteId: 'post', reactions, reactionEmojis: {}, myReaction, maxNumber },
		global: { directives: { ripple: {}, tooltip: {} } },
	});
}

async function reveal() {
	intersection([{ target: observed, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
	await nextTick();
}

function avatars(container: Element) {
	return Array.from(container.querySelectorAll('[data-avatar-user]'), element => element.getAttribute('data-avatar-user'));
}

describe('Boost reaction bubbles', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.api.mockResolvedValue([]);
		mocks.confirm.mockResolvedValue({ canceled: false });
		mocks.popup.mockImplementation(() => ({ dispose: vi.fn() }));
		vi.stubGlobal('IntersectionObserver', class {
			constructor(callback: IntersectionObserverCallback) { intersection = callback; }
			observe(element: Element) { observed = element; }
			disconnect() {}
		});
	});

	afterEach(() => {
		cleanup();
		delete preferState.confirmOnReact;
		noteEvents.removeAllListeners();
		vi.unstubAllGlobals();
	});

	test('shows my avatar immediately for a single emoji and counts only other participants', async () => {
		const view = renderViewer({ '😀': 1 }, '😀');
		expect(avatars(view.container)).toEqual(['me']);
		expect(view.queryByText('×1')).toBeNull();
		expect(view.getByRole('button', { name: '😀' }).getAttribute('aria-pressed')).toBe('true');
		expect(mocks.api).not.toHaveBeenCalled();

		await view.rerender({ reactions: { '😀': 2 } });
		expect(avatars(view.container)).toEqual(['me']);
		expect(view.getByText('×2')).toBeTruthy();
		await view.rerender({ reactions: { '😀': 1 } });
		expect(view.queryByText('×2')).toBeNull();
		expect(avatars(view.container)).toEqual(['me']);
	});

	test.each([
		[':cat@.:', ':cat:'],
		['❤', '❤️'],
		['👩‍❤️‍👩', '👩‍❤️‍👩'],
	])('loads another user avatar for %s returned as %s', async (reaction, returnedType) => {
		mocks.api.mockResolvedValue([participant('alice', returnedType)]);
		const view = renderViewer({ [reaction]: 1 });
		await reveal();
		await waitFor(() => expect(avatars(view.container)).toEqual(['alice']));
		expect(view.queryByText('×1')).toBeNull();
		expect(mocks.api).toHaveBeenCalledTimes(1);
	});

	test('merges local emoji aliases and prioritizes my avatar over the loaded users', async () => {
		mocks.api.mockResolvedValue([participant('alice', ':cat:'), participant('me', ':cat:')]);
		const view = renderViewer({ ':cat:': 1, ':cat@.:': 1 }, ':cat:');
		await reveal();
		await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
		expect(view.container.querySelectorAll('[data-reaction]')).toHaveLength(1);
		expect(avatars(view.container)).toEqual(['me']);
		expect(view.getByRole('button', { name: ':cat@.: ×2' }).getAttribute('aria-pressed')).toBe('true');
	});

	test('preserves Unicode selectors in text Boost content', () => {
		const view = renderViewer({ 'text:❤️abc': 1 }, 'text:❤️abc');
		expect(view.getByText('text:❤️abc')).toBeTruthy();
		expect(avatars(view.container)).toEqual(['me']);
	});

	test.each(['😀', 'text:测试英文 ABC 和数字 123 和 🧐'])('restores my avatar and own action for %s when a nested note omits myReaction', async reaction => {
		mocks.api.mockResolvedValue([participant('alice', reaction), participant('me', reaction)]);
		const view = renderViewer({ [reaction]: 2 });
		await reveal();
		await waitFor(() => expect(avatars(view.container)).toEqual(['me']));
		if (reaction.startsWith('text:')) {
			await fireEvent.click(view.getByRole('button', { name: reaction }));
			expect(view.getByRole('button', { name: i18n.ts.delete })).toBeTruthy();
			expect(view.queryByRole('button', { name: i18n.ts.reportAbuse })).toBeNull();
		} else {
			expect(view.getByRole('button', { name: `${reaction} ×2` }).getAttribute('aria-pressed')).toBe('true');
		}
		expect(mocks.api).toHaveBeenCalledTimes(1);
	});

	test('keeps an explicit removal authoritative over loaded participants', async () => {
		mocks.api.mockResolvedValue([participant('me', '😀'), participant('alice', '😀')]);
		const view = renderViewer({ '😀': 2 });
		await reveal();
		await waitFor(() => expect(avatars(view.container)).toEqual(['me']));
		await view.rerender({ myReaction: null, reactions: { '😀': 1 } });
		await waitFor(() => expect(avatars(view.container)).toEqual(['alice']));
		expect(view.getByRole('button', { name: '😀' }).getAttribute('aria-pressed')).toBe('false');
	});

	test('discards an in-flight participant response when missing myReaction becomes an explicit removal', async () => {
		let resolveFirst!: (value: Misskey.entities.NoteReaction[]) => void;
		mocks.api.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
		mocks.api.mockResolvedValue([participant('alice', '😀')]);
		const view = renderViewer({ '😀': 1 });
		await reveal();
		const firstSignal = mocks.api.mock.calls[0][3] as AbortSignal;
		await view.rerender({ myReaction: null });
		await waitFor(() => expect(avatars(view.container)).toEqual(['alice']));
		resolveFirst([participant('me', '😀')]);
		await nextTick();
		expect(firstSignal.aborted).toBe(true);
		expect(avatars(view.container)).toEqual(['alice']);
		expect(view.getByRole('button', { name: '😀' }).getAttribute('aria-pressed')).toBe('false');
	});

	test('opens the user panel by clicking the avatar without a hover preview or profile navigation', async () => {
		const view = renderViewer({ '😀': 1 }, '😀');
		const avatar = view.container.querySelector('[data-avatar-user="me"]')!;
		const button = view.getByRole('button', { name: 'me' });
		expect(avatar.getAttribute('data-avatar-preview')).toBe('false');
		expect(avatar.getAttribute('data-avatar-link')).toBe('false');
		await fireEvent.mouseOver(avatar);
		expect(mocks.popup).not.toHaveBeenCalled();
		await fireEvent.click(button);
		expect(mocks.popup).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			q: 'me', source: button, interactive: true,
		}), expect.objectContaining({ close: expect.any(Function), closed: expect.any(Function) }));
		expect(button.getAttribute('aria-expanded')).toBe('true');
		expect(mocks.api).not.toHaveBeenCalled();
		await fireEvent.mouseLeave(button);
		expect(button.getAttribute('aria-expanded')).toBe('true');
	});

	test('can reopen before the asynchronous user panel mounts and ignores stale close events', async () => {
		const view = renderViewer({ 'text:hello': 1 }, 'text:hello');
		const button = view.getByRole('button', { name: 'me' });
		await fireEvent.click(button);
		const events = mocks.popup.mock.calls[0][2];
		const dispose = mocks.popup.mock.results[0].value.dispose;
		await fireEvent.click(button);
		expect(button.getAttribute('aria-expanded')).toBe('false');
		expect(mocks.popup).toHaveBeenCalledTimes(1);
		expect(dispose).toHaveBeenCalledTimes(1);
		await fireEvent.click(button);
		expect(mocks.popup).toHaveBeenCalledTimes(2);
		events.closed();
		expect(button.getAttribute('aria-expanded')).toBe('true');
		expect(dispose).toHaveBeenCalledTimes(1);
		mocks.popup.mock.calls[1][2].close();
		await nextTick();
		expect(button.getAttribute('aria-expanded')).toBe('false');
		expect(mocks.popup.mock.results[1].value.dispose).toHaveBeenCalledTimes(1);
		await fireEvent.click(button);
		view.unmount();
		expect(mocks.popup.mock.results[2].value.dispose).toHaveBeenCalledTimes(1);
	});

	test('closes the clicked author panel before opening a hovered user preview', async () => {
		vi.useFakeTimers();
		const hoverAvatar = document.createElement('span');
		document.body.append(hoverAvatar);
		const preview = new UserPreview(hoverAvatar, 'alice');
		try {
			const view = renderViewer({ 'text:hello': 1 }, 'text:hello');
			const button = view.getByRole('button', { name: 'me' });
			await fireEvent.click(button);
			const dispose = mocks.popup.mock.results[0].value.dispose;
			expect(button.getAttribute('aria-expanded')).toBe('true');
			await fireEvent.mouseOver(hoverAvatar);
			expect(button.getAttribute('aria-expanded')).toBe('false');
			expect(dispose).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(499);
			expect(mocks.popup).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);
			expect(mocks.popup).toHaveBeenCalledTimes(2);
			expect(mocks.popup).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
				q: 'alice', source: hoverAvatar,
			}), expect.anything());
			expect(button.getAttribute('aria-expanded')).toBe('false');
		} finally {
			preview.detach();
			hoverAvatar.remove();
			vi.useRealTimers();
		}
	});

	test('cancels a pending hover preview when the author panel is clicked open', async () => {
		vi.useFakeTimers();
		const hoverAvatar = document.createElement('span');
		document.body.append(hoverAvatar);
		const preview = new UserPreview(hoverAvatar, 'alice');
		try {
			const view = renderViewer({ 'text:hello': 1 }, 'text:hello');
			const button = view.getByRole('button', { name: 'me' });
			await fireEvent.mouseOver(hoverAvatar);
			await vi.advanceTimersByTimeAsync(250);
			expect(mocks.popup).not.toHaveBeenCalled();
			await fireEvent.click(button);
			await vi.advanceTimersByTimeAsync(1000);
			expect(mocks.popup).toHaveBeenCalledTimes(1);
			expect(mocks.popup).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
				q: 'me', source: button, interactive: true,
			}), expect.anything());
			expect(button.getAttribute('aria-expanded')).toBe('true');
		} finally {
			preview.detach();
			hoverAvatar.remove();
			vi.useRealTimers();
		}
	});

	test('fetches only missing visible authors when a popular emoji fills the participant page', async () => {
		mocks.api.mockImplementation((_endpoint, params) => Promise.resolve(params.type
			? [participant('alice', params.type)]
			: Array.from({ length: 100 }, (_, i) => participant(`fan-${i}`, '😀'))));
		const view = renderViewer({ '😀': 100, ':cat@.:': 1, '🎉': 1 }, null, 2);
		await reveal();
		await waitFor(() => expect(avatars(view.container)).toEqual(['fan-0', 'alice']));
		expect(mocks.api).toHaveBeenCalledTimes(2);
		expect(mocks.api).toHaveBeenLastCalledWith('notes/reactions', { noteId: 'post', type: ':cat@.:', limit: 1 }, undefined, expect.any(AbortSignal));
	});

	test('refreshes the author after a streamed replacement even when the reaction count is unchanged', async () => {
		mocks.api.mockResolvedValueOnce([participant('alice', '😀')]).mockResolvedValue([participant('bob', '😀')]);
		const view = renderViewer({ '😀': 1 });
		await reveal();
		await waitFor(() => expect(avatars(view.container)).toEqual(['alice']));
		noteEvents.emit('unreacted:post', { userId: 'alice', reaction: '😀' });
		noteEvents.emit('reacted:post', { userId: 'bob', reaction: '😀' });
		await waitFor(() => expect(avatars(view.container)).toEqual(['bob']));
		expect(mocks.api).toHaveBeenCalledTimes(2);
	});

	test('ignores obsolete requests and removes listeners when a viewer is reused for another note', async () => {
		let resolveFirst!: (value: Misskey.entities.NoteReaction[]) => void;
		mocks.api.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
		mocks.api.mockResolvedValue([participant('bob', '😀')]);
		const view = renderViewer({ '😀': 1 });
		await reveal();
		const firstSignal = mocks.api.mock.calls[0][3] as AbortSignal;
		await view.rerender({ noteId: 'other-post' });
		await waitFor(() => expect(avatars(view.container)).toEqual(['bob']));
		resolveFirst([participant('alice', '😀')]);
		await nextTick();
		expect(firstSignal.aborted).toBe(true);
		expect(avatars(view.container)).toEqual(['bob']);
		expect(noteEvents.listenerCount('reacted:post')).toBe(0);
		view.unmount();
		expect(noteEvents.listenerCount('reacted:other-post')).toBe(0);
	});

	test.each([1, 2])('keeps a %i-person emoji reaction clickable for adding a response', async count => {
		const view = renderViewer({ '😀': count });
		await fireEvent.click(view.getByRole('button', { name: count === 1 ? '😀' : '😀 ×2' }));
		expect(mocks.api).toHaveBeenCalledWith('notes/reactions/create', { noteId: 'post', reaction: '😀' });
	});

	test('removes my local custom emoji when the API used a different local alias', async () => {
		const view = renderViewer({ ':cat@.:': 1 }, ':cat:');
		await fireEvent.click(view.getByRole('button', { name: ':cat@.:' }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('notes/reactions/delete', { noteId: 'post' }));
		expect(mocks.api).not.toHaveBeenCalledWith('notes/reactions/create', expect.anything());
		expect(mocks.confirm).not.toHaveBeenCalled();
	});

	test.each(['😀', 'text:hello'])('removes %s immediately and prevents duplicate requests while pending', async reaction => {
		preferState.confirmOnReact = true;
		let finish!: () => void;
		mocks.api.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
		const unreacted = vi.fn();
		noteEvents.on('unreacted:post', unreacted);
		const view = renderViewer({ [reaction]: 1 }, reaction);
		let button = view.getByRole('button', { name: reaction });
		if (reaction.startsWith('text:')) {
			await fireEvent.click(button);
			button = view.getByRole('button', { name: i18n.ts.delete });
		}
		await fireEvent.click(button);
		await fireEvent.click(button);
		expect(mocks.confirm).not.toHaveBeenCalled();
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('notes/reactions/delete', { noteId: 'post' });
		expect(unreacted).not.toHaveBeenCalled();
		finish();
		await waitFor(() => expect(unreacted).toHaveBeenCalledExactlyOnceWith({ userId: 'me', reaction }));
	});
});
