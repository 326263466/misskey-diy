/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue';
import MkLightboxControls from '@/components/MkLightbox.item.controls.vue';
import type { MenuRadio, MenuSwitch } from '@/types/menu.js';
import { DI } from '@/di.js';
import * as os from '@/os.js';
import hasAudio from '@/utility/media-has-audio.js';

vi.mock('@/os.js', () => ({ popupMenu: vi.fn() }));
vi.mock('@/utility/media-has-audio.js', () => ({ default: vi.fn(async () => true) }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { _mediaControls: { playbackRate: 'Playback speed', loop: 'Loop' } } } }));

const haveFutureDataDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement, 'HAVE_FUTURE_DATA');
let media: HTMLMediaElement;
let player: HTMLDivElement;

function renderControls(type: 'video' | 'audio', externalVolumeControl = false) {
	player = document.createElement('div');
	media = document.createElement(type);
	const controlsHost = document.createElement('div');
	player.append(media, controlsHost);
	document.body.appendChild(player);
	const volume = ref(0.5);
	const controls = shallowRef<InstanceType<typeof MkLightboxControls> | null>(null);
	const view = render(defineComponent({
		setup: () => () => h(MkLightboxControls, {
			ref: controls,
			volume: volume.value,
			'onUpdate:volume': (to: number) => { volume.value = to; },
			externalVolumeControl,
		}),
	}), {
		container: controlsHost,
		global: { provide: { [DI.mkLightboxItemMediaEl as symbol]: shallowRef(media) } },
	});
	return { ...view, volume, controls };
}

beforeEach(() => {
	vi.mocked(os.popupMenu).mockReset().mockResolvedValue(undefined);
	vi.mocked(hasAudio).mockReset().mockResolvedValue(true);
	Object.defineProperty(HTMLMediaElement, 'HAVE_FUTURE_DATA', { configurable: true, value: 3 });
});

afterEach(() => {
	cleanup();
	player.remove();
	vi.restoreAllMocks();
	if (haveFutureDataDescriptor) {
		Object.defineProperty(HTMLMediaElement, 'HAVE_FUTURE_DATA', haveFutureDataDescriptor);
	} else {
		Reflect.deleteProperty(HTMLMediaElement, 'HAVE_FUTURE_DATA');
	}
});

describe('lightbox media controls', () => {
	test('autoplays a confirmed silent video muted and looped', async () => {
		vi.mocked(hasAudio).mockResolvedValue(false);
		renderControls('video');
		const play = vi.spyOn(media, 'play').mockResolvedValue();
		await nextTick();
		expect(media.muted).toBe(true);
		expect(media.loop).toBe(true);
		expect(play).toHaveBeenCalledOnce();
	});

	test.each(['video', 'audio'] as const)('updates %s volume while dragging before release', async type => {
		const view = renderControls(type, type === 'audio');
		const slider = view.getAllByRole('slider')[1];
		await fireEvent.input(slider, { target: { value: '0.73' } });
		expect(Number(view.volume.value)).toBe(0.73);
		expect(media.volume).toBe(type === 'audio' ? 1 : 0.73);
		await fireEvent.input(slider, { target: { value: '0' } });
		expect(Number(view.volume.value)).toBe(0);
	});

	test('updates the volume slider when native media controls change volume', async () => {
		const view = renderControls('video');
		media.volume = 0.27;
		media.dispatchEvent(new Event('volumechange'));
		await nextTick();
		expect((view.getAllByRole('slider')[1] as HTMLInputElement).value).toBe('0.27');
	});

	test.each(['video', 'audio'] as const)('seeks %s through the range control', async type => {
		const view = renderControls(type, type === 'audio');
		Object.defineProperty(media, 'duration', { configurable: true, value: 120 });
		await fireEvent(media, new Event('loadedmetadata'));
		await fireEvent.input(view.getAllByRole('slider')[0], { target: { value: '0.5' } });
		expect(media.currentTime).toBe(60);
	});

	test('synchronizes playback progress and stops interpolation when paused', async () => {
		const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(101);
		const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
		const view = renderControls('video');
		Object.defineProperty(media, 'duration', { configurable: true, value: 100 });
		media.currentTime = 5;
		await fireEvent(media, new Event('loadedmetadata'));
		await fireEvent(media, new Event('timeupdate'));
		await fireEvent(media, new Event('play'));
		await fireEvent(media, new Event('playing'));
		const seek = view.getAllByRole('slider')[0] as HTMLInputElement;
		expect(Number(seek.value)).toBe(0.05);
		expect(requestFrame).toHaveBeenCalledOnce();
		await fireEvent(media, new Event('pause'));
		expect(cancelFrame).toHaveBeenCalledWith(101);
		media.currentTime = 40;
		await fireEvent(media, new Event('timeupdate'));
		expect(Number(seek.value)).toBe(0.4);
		expect(requestFrame).toHaveBeenCalledOnce();
	});

	test('opens the standard playback menu and applies its reactive settings', async () => {
		const view = renderControls('video');
		const settings = view.container.querySelector('.ti-settings')!.closest('button')!;
		await fireEvent.click(settings);
		const [items, anchor, options] = vi.mocked(os.popupMenu).mock.lastCall!;
		const loop = items.find(item => item != null && 'type' in item && item.type === 'switch') as MenuSwitch;
		const speed = items.find(item => item != null && 'type' in item && item.type === 'radio') as MenuRadio;
		expect(anchor).toBe(settings);
		expect(options?.align).toBe('right');
		expect(loop.text).toBe('Loop');
		expect(loop.ref.value).toBe(false);
		expect(speed.text).toBe('Playback speed');
		expect(speed.ref.value).toBe(1);
		expect(speed.options.map(option => option.value)).toEqual([0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]);
		speed.ref.value = 1.5;
		loop.ref.value = true;
		await nextTick();
		expect(media.playbackRate).toBe(1.5);
		expect(media.loop).toBe(true);
	});
});
