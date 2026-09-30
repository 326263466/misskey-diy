/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { UserPreview } from '@/directives/user-preview.js';
import { claimUserPopup } from '@/utility/user-popup.js';

const mocks = vi.hoisted(() => ({ popup: vi.fn() }));

vi.mock('@/os.js', () => ({ popup: mocks.popup }));
vi.mock('@/utility/touch.js', () => ({ isTouchUsing: false }));

let source: HTMLButtonElement;
let preview: UserPreview;

beforeEach(() => {
	vi.useFakeTimers();
	mocks.popup.mockReset().mockReturnValue({ dispose: vi.fn() });
	source = window.document.createElement('button');
	window.document.body.appendChild(source);
	preview = new UserPreview(source, 'alice');
});

afterEach(() => {
	preview.detach();
	source.remove();
	claimUserPopup(() => {})();
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe('user preview ownership', () => {
	test('closes immediately when its popup requests dismissal after a menu action', async () => {
		source.dispatchEvent(new MouseEvent('mouseover'));
		await vi.advanceTimersByTimeAsync(500);
		const [, props, events] = mocks.popup.mock.calls[0];
		expect(props.showing.value).toBe(true);

		events.close();
		expect(props.showing.value).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});

	test('cancels a pending hover when a clicked popup takes over', async () => {
		source.dispatchEvent(new MouseEvent('mouseover'));
		await vi.advanceTimersByTimeAsync(250);
		const closeClickedPopup = vi.fn();
		claimUserPopup(closeClickedPopup);
		await vi.advanceTimersByTimeAsync(1000);

		expect(mocks.popup).not.toHaveBeenCalled();
		expect(closeClickedPopup).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	test('closes a visible hover on takeover and allows it to open again', async () => {
		source.dispatchEvent(new MouseEvent('mouseover'));
		await vi.advanceTimersByTimeAsync(500);
		const showing = mocks.popup.mock.calls[0][1].showing;
		expect(showing.value).toBe(true);

		const closeClickedPopup = vi.fn();
		claimUserPopup(closeClickedPopup);
		expect(showing.value).toBe(false);
		expect(vi.getTimerCount()).toBe(0);

		source.dispatchEvent(new MouseEvent('mouseover'));
		await vi.advanceTimersByTimeAsync(500);
		expect(closeClickedPopup).toHaveBeenCalledOnce();
		expect(mocks.popup).toHaveBeenCalledTimes(2);
		expect(mocks.popup.mock.calls[1][1].showing.value).toBe(true);
		expect(showing.value).toBe(false);
	});

	test.each([false, true])('detaches with no popup or timers left (shown: %s)', async shown => {
		source.dispatchEvent(new MouseEvent('mouseover'));
		if (shown) {
			await vi.advanceTimersByTimeAsync(500);
			source.dispatchEvent(new MouseEvent('mouseleave'));
		}

		preview.detach();
		expect(vi.getTimerCount()).toBe(0);
		if (shown) expect(mocks.popup.mock.calls[0][1].showing.value).toBe(false);

		source.dispatchEvent(new MouseEvent('mouseover'));
		await vi.advanceTimersByTimeAsync(1000);
		expect(mocks.popup).toHaveBeenCalledTimes(shown ? 1 : 0);
		expect(vi.getTimerCount()).toBe(0);
	});

	test('does not release a newer owner through an older release callback', () => {
		const closeFirst = vi.fn();
		const closeSecond = vi.fn();
		const closeThird = vi.fn();
		const releaseFirst = claimUserPopup(closeFirst);
		claimUserPopup(closeSecond);
		expect(closeFirst).toHaveBeenCalledOnce();

		releaseFirst();
		const releaseThird = claimUserPopup(closeThird);
		expect(closeSecond).toHaveBeenCalledOnce();
		expect(closeFirst).toHaveBeenCalledOnce();
		expect(closeThird).not.toHaveBeenCalled();
		releaseThird();
	});
});
