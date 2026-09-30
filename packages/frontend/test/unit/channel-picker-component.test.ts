/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { cleanup, fireEvent, render } from '@testing-library/vue';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import MkChannelPicker from '@/components/MkChannelPicker.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), close: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/i.js', () => ({ $i: { id: 'self' } }));
vi.mock('@/components/MkModal.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		emits: ['closed', 'opened', 'click', 'esc'],
		setup(_props, { slots, expose, emit }) {
			expose({ close: () => { mocks.close(); emit('closed'); } });
			return () => h('div', slots.default?.({ type: 'popup', maxHeight: 500 }));
		},
	}) };
});

function channel(id: string, archived = false): Misskey.entities.Channel {
	return { id, name: id, usersCount: 2, notesCount: 3, isArchived: archived, isSensitive: false, bannerUrl: null } as Misskey.entities.Channel;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(done => { resolve = done; });
	return { promise, resolve };
}

async function settle(): Promise<void> { await Promise.resolve(); await nextTick(); }

describe('channel picker', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.resetAllMocks();
		mocks.api.mockResolvedValue([]);
	});
	afterEach(() => { cleanup(); vi.useRealTimers(); });

	test('chooses a real active channel, shows its selected state and closes once', async () => {
		const active = channel('Photography');
		mocks.api.mockResolvedValue([active, channel('Archived', true)]);
		const view = render(MkChannelPicker, { props: { selectedId: active.id } });
		await settle();
		expect(mocks.api).toHaveBeenCalledWith('channels/featured', {});
		expect(view.queryByRole('button', { name: /Archived/ })).toBeNull();
		const option = view.getByRole('button', { name: /Photography/ });
		expect(option.getAttribute('aria-pressed')).toBe('true');
		await fireEvent.click(option);
		await fireEvent.click(option);
		expect(view.emitted().choose).toEqual([[active]]);
		expect(view.emitted().closed).toHaveLength(1);
		expect(mocks.close).toHaveBeenCalledOnce();
	});

	test('merges owned and followed channels, deduplicates, and paginates past archived followed channels', async () => {
		const page = Array.from({ length: 20 }, (_, index) => channel(`followed-${index}`, true));
		page[0] = channel('Shared');
		mocks.api.mockImplementation((endpoint, params) => Promise.resolve(endpoint === 'channels/followed' ? params.untilId ? [channel('Later active'), channel('Shared')] : page : endpoint === 'channels/owned' ? [channel('Owned'), channel('Shared')] : []));
		const view = render(MkChannelPicker);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._channelPicker.mine }));
		await settle();
		expect(mocks.api).toHaveBeenCalledWith('channels/owned', { limit: 20 });
		expect(mocks.api).toHaveBeenCalledWith('channels/followed', { limit: 20 });
		expect(view.getAllByRole('button', { name: /Shared/ })).toHaveLength(1);
		expect(view.getByRole('button', { name: /^Owned / })).toBeTruthy();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.loadMore }));
		await settle();
		expect(mocks.api).toHaveBeenLastCalledWith('channels/followed', { limit: 20, untilId: 'followed-19' });
		expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'channels/owned')).toHaveLength(1);
		expect(view.getByRole('button', { name: /Later active/ })).toBeTruthy();
		expect(view.getAllByRole('button', { name: /Shared/ })).toHaveLength(1);
		expect(view.queryByRole('button', { name: i18n.ts.loadMore })).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._channelPicker.other }));
		await settle();
		expect(mocks.api).toHaveBeenLastCalledWith('channels/search', { query: '', type: 'nameOnly', limit: 20 });
		expect(view.queryByRole('button', { name: /Later active/ })).toBeNull();
	});

	test('keeps both mine cursors on partial failure and resumes each source independently', async () => {
		const owned = Array.from({ length: 20 }, (_, index) => channel(`Owned-${index}`));
		const followed = Array.from({ length: 20 }, (_, index) => channel(`Followed-${index}`));
		let failFollowing = true;
		mocks.api.mockImplementation((endpoint, params) => {
			if (endpoint === 'channels/owned') return Promise.resolve(params.untilId ? [channel('Last owned')] : owned);
			if (endpoint === 'channels/followed') {
				if (params.untilId && failFollowing) return Promise.reject(new Error('offline'));
				return Promise.resolve(params.untilId ? [channel('Last followed')] : followed);
			}
			return Promise.resolve([]);
		});
		const view = render(MkChannelPicker);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._channelPicker.mine }));
		await settle();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.loadMore }));
		await settle();
		expect(view.queryByRole('button', { name: /Last owned/ })).toBeNull();
		failFollowing = false;
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await settle();
		expect(mocks.api.mock.calls.filter(([endpoint, params]) => endpoint === 'channels/owned' && params.untilId === 'Owned-19')).toHaveLength(2);
		expect(mocks.api.mock.calls.filter(([endpoint, params]) => endpoint === 'channels/followed' && params.untilId === 'Followed-19')).toHaveLength(2);
		expect(view.getByRole('button', { name: /Last owned/ })).toBeTruthy();
		expect(view.getByRole('button', { name: /Last followed/ })).toBeTruthy();
		expect(view.queryByRole('button', { name: i18n.ts.loadMore })).toBeNull();
	});

	test('other excludes owned and followed channels without losing later discoverable pages', async () => {
		const own = { ...channel('My channel'), userId: 'self' };
		const followed = Array.from({ length: 19 }, (_, index) => ({ ...channel(`Followed-${index}`), isFollowing: true }));
		mocks.api.mockImplementation((endpoint, params) => Promise.resolve(endpoint === 'channels/search' ? params.query ? [own] : params.untilId ? [channel('Discoverable')] : [own, ...followed] : []));
		const view = render(MkChannelPicker);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._channelPicker.other }));
		await settle();
		expect(view.queryByRole('button', { name: /My channel/ })).toBeNull();
		expect(view.queryByRole('button', { name: /Followed-/ })).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.loadMore }));
		await settle();
		expect(mocks.api).toHaveBeenLastCalledWith('channels/search', { query: '', type: 'nameOnly', limit: 20, untilId: 'Followed-18' });
		expect(view.getByRole('button', { name: /Discoverable/ })).toBeTruthy();
		await fireEvent.update(view.getByRole('textbox'), 'My');
		await vi.advanceTimersByTimeAsync(250);
		expect(view.getByRole('button', { name: /My channel/ })).toBeTruthy();
	});

	test('debounces name search, suppresses composition requests, and restores browsing when cleared', async () => {
		const view = render(MkChannelPicker);
		const input = view.getByRole('textbox');
		await settle();
		await fireEvent.update(input, 'v');
		await vi.advanceTimersByTimeAsync(150);
		await fireEvent.update(input, 'vue');
		await vi.advanceTimersByTimeAsync(249);
		expect(mocks.api).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(mocks.api).toHaveBeenLastCalledWith('channels/search', { query: 'vue', type: 'nameOnly', limit: 20 });
		await fireEvent.compositionStart(input);
		await fireEvent.update(input, 'に');
		const imeEnter = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true });
		input.dispatchEvent(imeEnter);
		expect(imeEnter.defaultPrevented).toBe(false);
		await vi.advanceTimersByTimeAsync(500);
		expect(mocks.api).toHaveBeenCalledTimes(2);
		await fireEvent.update(input, '日本');
		await fireEvent.compositionEnd(input);
		await vi.advanceTimersByTimeAsync(250);
		expect(mocks.api).toHaveBeenLastCalledWith('channels/search', { query: '日本', type: 'nameOnly', limit: 20 });
		const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		input.dispatchEvent(enter);
		expect(enter.defaultPrevented).toBe(true);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._channelPicker.mine }));
		await settle();
		expect((input as HTMLInputElement).value).toBe('');
		expect(mocks.api).toHaveBeenLastCalledWith('channels/followed', { limit: 20 });
	});

	test('ignores stale searches and late completions after unmount', async () => {
		const old = deferred<Misskey.entities.Channel[]>();
		mocks.api.mockImplementation((endpoint, params) => endpoint === 'channels/search' && params.query === 'old' ? old.promise : Promise.resolve([channel('Current')]));
		const view = render(MkChannelPicker);
		const input = view.getByRole('textbox');
		await fireEvent.update(input, 'old');
		await vi.advanceTimersByTimeAsync(250);
		await fireEvent.update(input, 'current');
		await vi.advanceTimersByTimeAsync(250);
		old.resolve([channel('Stale')]);
		await settle();
		expect(view.queryByRole('button', { name: /Stale/ })).toBeNull();
		expect(view.getByRole('button', { name: /Current/ })).toBeTruthy();
		const pending = deferred<Misskey.entities.Channel[]>();
		mocks.api.mockReturnValue(pending.promise);
		await fireEvent.update(input, 'unmount');
		await vi.advanceTimersByTimeAsync(250);
		view.unmount();
		pending.resolve([channel('Late')]);
		await settle();
		expect(view.emitted().choose).toBeUndefined();
	});

	test('retries the failed next page without discarding already loaded options', async () => {
		const page = Array.from({ length: 20 }, (_, index) => channel(`Page-${index}`));
		mocks.api.mockImplementation((endpoint, params) => params.untilId ? Promise.reject(new Error('offline')) : Promise.resolve(endpoint === 'channels/owned' ? page : []));
		const view = render(MkChannelPicker);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._channelPicker.mine }));
		await settle();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.loadMore }));
		await settle();
		expect(view.getByRole('button', { name: /^Page-0 / })).toBeTruthy();
		mocks.api.mockResolvedValue([channel('Last page')]);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await settle();
		expect(mocks.api).toHaveBeenLastCalledWith('channels/owned', { limit: 20, untilId: 'Page-19' });
		expect(view.getByRole('button', { name: /Last page/ })).toBeTruthy();
		expect(view.getByRole('button', { name: /^Page-0 / })).toBeTruthy();
	});

	test('allows removing the channel from an empty picker and supports Escape without selection', async () => {
		const view = render(MkChannelPicker);
		await settle();
		expect(view.getByText(i18n.ts._channelPicker.empty)).toBeTruthy();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._channelPicker.noChannel }));
		expect(view.emitted().choose).toEqual([[null]]);
		view.unmount();
		const second = render(MkChannelPicker);
		await settle();
		await vi.advanceTimersByTimeAsync(1);
		await fireEvent.keyDown(second.getByRole('textbox'), { key: 'Escape' });
		expect(second.emitted().choose).toBeUndefined();
		expect(second.emitted().closed).toHaveLength(1);
	});

	test('closes and blocks choices when the composer becomes disabled', async () => {
		mocks.api.mockResolvedValue([channel('Existing')]);
		const view = render(MkChannelPicker);
		await settle();
		await view.rerender({ disabled: true });
		expect(mocks.close).toHaveBeenCalledOnce();
		await fireEvent.click(view.getByRole('button', { name: /Existing/ }));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._channelPicker.noChannel }));
		expect(view.emitted().choose).toBeUndefined();
	});
});
