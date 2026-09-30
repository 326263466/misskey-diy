/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue';
import MkLightboxControls from '@/components/MkLightbox.item.controls.vue';
import type { MenuButton, MenuItem, MenuRadio, MenuSwitch } from '@/types/menu.js';
import { DI } from '@/di.js';
import * as os from '@/os.js';

vi.mock('@/os.js', () => ({ popupMenu: vi.fn(), contextMenu: vi.fn() }));
vi.mock('@/utility/media-has-audio.js', () => ({ default: async () => true }));
vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			volume: 'Volume',
			settings: 'Settings',
			_mediaControls: {
				play: 'Play',
				pause: 'Pause',
				seek: 'Playback position',
				mute: 'Mute',
				unmute: 'Unmute',
				enterFullscreen: 'Enter fullscreen',
				exitFullscreen: 'Exit fullscreen',
				enterWebFullscreen: 'Enter webpage fullscreen',
				exitWebFullscreen: 'Exit webpage fullscreen',
				playbackRate: 'Playback speed',
				loop: 'Loop',
			},
		},
		tsx: { _mediaControls: { buffered: ({ percent }: { percent: number }) => `${percent}% buffered` } },
	},
}));

const fullscreenEnabledDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenEnabled');
const fullscreenElementDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
const exitFullscreenDescriptor = Object.getOwnPropertyDescriptor(document, 'exitFullscreen');
const haveFutureDataDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement, 'HAVE_FUTURE_DATA');
const haveCurrentDataDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement, 'HAVE_CURRENT_DATA');
let fullscreenElement: Element | null = null;
let enterFullscreen: ReturnType<typeof vi.fn>;
let leaveFullscreen: ReturnType<typeof vi.fn>;
let media: HTMLMediaElement;
let player: HTMLDivElement;

function renderControls(type: 'video' | 'audio', externalVolumeControl = false) {
	player = document.createElement('div');
	Object.defineProperty(player, 'requestFullscreen', { configurable: true, value: enterFullscreen });
	media = document.createElement(type);
	const controlsHost = document.createElement('div');
	player.append(media, controlsHost);
	document.body.appendChild(player);
	const volume = ref(0.5);
	const webFullscreen = ref(false);
	const controlsVisible = ref(true);
	const playbackPending = ref(false);
	const controls = shallowRef<InstanceType<typeof MkLightboxControls> | null>(null);
	const view = render(defineComponent({
		setup: () => () => h(MkLightboxControls, {
			ref: controls,
			volume: volume.value,
			'onUpdate:volume': (to: number) => { volume.value = to; },
			webFullscreen: webFullscreen.value,
			'onUpdate:webFullscreen': (to: boolean) => { webFullscreen.value = to; },
			playerEl: player,
			controlsVisible: controlsVisible.value,
			playbackPending: playbackPending.value,
			externalVolumeControl,
		}),
	}), {
		container: controlsHost,
		global: { provide: { [DI.mkLightboxItemMediaEl as symbol]: shallowRef(media) } },
	});
	return { ...view, volume, webFullscreen, controlsVisible, playbackPending, controls };
}

function menuAction(items: MenuItem[], text: string) {
	const item = items.find(item => 'text' in item && item.text === text) as MenuButton;
	expect(item).toBeTruthy();
	return item.action;
}

function restoreProperty(target: object, key: string, descriptor: PropertyDescriptor | undefined) {
	if (descriptor) {
		Object.defineProperty(target, key, descriptor);
	} else {
		Reflect.deleteProperty(target, key);
	}
}

beforeEach(() => {
	vi.mocked(os.popupMenu).mockReset().mockResolvedValue(undefined);
	vi.mocked(os.contextMenu).mockReset().mockResolvedValue(undefined);
	// Happy DOM does not implement the media readiness constants.
	Object.defineProperty(HTMLMediaElement, 'HAVE_FUTURE_DATA', { configurable: true, value: 3 });
	Object.defineProperty(HTMLMediaElement, 'HAVE_CURRENT_DATA', { configurable: true, value: 2 });
	fullscreenElement = null;
	Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
	Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement });
	enterFullscreen = vi.fn(async () => {
		fullscreenElement = player;
		document.dispatchEvent(new Event('fullscreenchange'));
	});
	leaveFullscreen = vi.fn(async () => {
		fullscreenElement = null;
		document.dispatchEvent(new Event('fullscreenchange'));
	});
	Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: leaveFullscreen });
});

afterEach(() => {
	cleanup();
	player.remove();
	vi.restoreAllMocks();
	restoreProperty(document, 'fullscreenEnabled', fullscreenEnabledDescriptor);
	restoreProperty(document, 'fullscreenElement', fullscreenElementDescriptor);
	restoreProperty(document, 'exitFullscreen', exitFullscreenDescriptor);
	restoreProperty(HTMLMediaElement, 'HAVE_FUTURE_DATA', haveFutureDataDescriptor);
	restoreProperty(HTMLMediaElement, 'HAVE_CURRENT_DATA', haveCurrentDataDescriptor);
});

describe('lightbox media controls', () => {
	test.each(['audioTracks', 'mozHasAudio'])('handles a confirmed silent video through %s without replaying or overriding later loop choices', async capability => {
		renderControls('video');
		const play = vi.spyOn(media, 'play').mockResolvedValue();
		Object.defineProperty(media, 'readyState', { configurable: true, value: 4 });
		Object.defineProperty(media, capability, { configurable: true, value: capability === 'audioTracks' ? { length: 0 } : false });
		await fireEvent(media, new Event('loadeddata'));
		expect(media.muted).toBe(true);
		expect(media.loop).toBe(true);
		media.loop = false;
		await nextTick();
		await fireEvent(media, new Event('pause'));
		await fireEvent(media, new Event('loadeddata'));
		await fireEvent(media, new Event('playing'));
		expect(media.loop).toBe(false);
		expect(play).not.toHaveBeenCalled();
	});

	test.each([undefined, 0, 1024])('does not mute or loop video based only on decoded byte count %s', async decodedBytes => {
		renderControls('video');
		const play = vi.spyOn(media, 'play').mockResolvedValue();
		Object.defineProperty(media, 'readyState', { configurable: true, value: 4 });
		if (decodedBytes !== undefined) Object.defineProperty(media, 'webkitAudioDecodedByteCount', { configurable: true, value: decodedBytes });
		await fireEvent(media, new Event('loadeddata'));
		await fireEvent(media, new Event('playing'));
		expect(media.muted).toBe(false);
		expect(media.loop).toBe(false);
		expect(play).not.toHaveBeenCalled();
	});

	test('shows pause while autoplay is pending and allows cancellation before media is ready', async () => {
		const view = renderControls('video');
		const pause = vi.spyOn(media, 'pause').mockImplementation(() => {});
		view.playbackPending.value = true;
		await nextTick();
		expect(view.queryByRole('button', { name: 'Play' })).toBeNull();
		const button = view.getByRole('button', { name: 'Pause' }) as HTMLButtonElement;
		expect(button.disabled).toBe(false);
		await fireEvent.click(button);
		expect(pause).toHaveBeenCalledOnce();
		view.playbackPending.value = false;
		await nextTick();
		expect(view.getByRole('button', { name: 'Play' })).toBeTruthy();
	});

	test.each(['video', 'audio'] as const)('updates the %s volume and percentage while dragging before release', async type => {
		const view = renderControls(type, type === 'audio');
		const slider = view.getByRole('slider', { name: 'Volume' });
		expect(view.getByText('50%')).toBeTruthy();
		await fireEvent.input(slider, { target: { value: '0.73' } });
		expect(view.volume.value).toBe(0.73);
		expect(view.getByText('73%')).toBeTruthy();
		expect(slider.getAttribute('aria-valuetext')).toBe('73%');
		expect(media.volume).toBe(type === 'audio' ? 1 : 0.73);
		await fireEvent.input(slider, { target: { value: '0' } });
		expect(view.getByRole('button', { name: 'Unmute' })).toBeTruthy();
		expect(view.getByText('0%')).toBeTruthy();
	});

	test('updates displayed volume when native media controls change it', async () => {
		const view = renderControls('video');
		media.volume = 0.27;
		media.dispatchEvent(new Event('volumechange'));
		await nextTick();
		expect(view.getByText('27%')).toBeTruthy();
	});

	test.each(['video', 'audio'] as const)('previews %s seek time without seeking or showing time over volume', async type => {
		const view = renderControls(type, type === 'audio');
		Object.defineProperty(media, 'duration', { configurable: true, value: 120 });
		media.currentTime = 12;
		await fireEvent(media, new Event('loadedmetadata'));
		const seek = view.getByRole('slider', { name: 'Playback position' }) as HTMLInputElement;
		vi.spyOn(seek, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 60, 480, 24));
		seek.style.setProperty('--thumbSize', '17px');
		await fireEvent.pointerMove(seek, { clientX: 240, pointerType: 'mouse' });
		expect(view.getByRole('tooltip').textContent).toBe('01:00');
		expect(media.currentTime).toBe(12);
		await fireEvent.pointerLeave(seek);
		await fireEvent.pointerMove(view.getByRole('slider', { name: 'Volume' }), { clientX: 240, pointerType: 'mouse' });
		expect(view.queryByRole('tooltip')).toBeNull();
		expect(media.currentTime).toBe(12);
	});

	test('suspends hidden progress updates and catches up immediately when controls return', async () => {
		const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(101);
		const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
		const view = renderControls('video');
		Object.defineProperty(media, 'duration', { configurable: true, value: 100 });
		media.currentTime = 5;
		await fireEvent(media, new Event('loadedmetadata'));
		await fireEvent(media, new Event('timeupdate'));
		await fireEvent(media, new Event('play'));
		await fireEvent(media, new Event('playing'));
		const seek = view.getByRole('slider', { name: 'Playback position' }) as HTMLInputElement;
		expect(Number(seek.value)).toBe(0.05);
		expect(requestFrame).toHaveBeenCalledOnce();

		view.controlsVisible.value = false;
		await nextTick();
		expect(cancelFrame).toHaveBeenCalledWith(101);
		media.currentTime = 40;
		await fireEvent(media, new Event('timeupdate'));
		await fireEvent(media, new Event('playing'));
		expect(Number(seek.value)).toBe(0.05);
		expect(requestFrame).toHaveBeenCalledOnce();

		view.controlsVisible.value = true;
		await nextTick();
		expect(Number(seek.value)).toBe(0.4);
		expect(requestFrame).toHaveBeenCalledTimes(2);
	});

	test('refreshes paused progress without restarting animation after controls return', async () => {
		const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(101);
		const view = renderControls('video');
		Object.defineProperty(media, 'duration', { configurable: true, value: 100 });
		await fireEvent(media, new Event('loadedmetadata'));
		view.controlsVisible.value = false;
		await nextTick();
		media.currentTime = 60;
		await fireEvent(media, new Event('pause'));
		view.controlsVisible.value = true;
		await nextTick();
		const seek = view.getByRole('slider', { name: 'Playback position' }) as HTMLInputElement;
		expect(Number(seek.value)).toBe(0.6);
		expect(requestFrame).not.toHaveBeenCalled();
	});

	test('enters and exits fullscreen, retaining controls and following Escape changes', async () => {
		const view = renderControls('video');
		await fireEvent.click(view.getByRole('button', { name: 'Enter fullscreen' }));
		await waitFor(() => expect((view.getByRole('button', { name: 'Exit fullscreen' }) as HTMLButtonElement).disabled).toBe(false));
		expect(enterFullscreen).toHaveBeenCalledOnce();
		expect(fullscreenElement).toBe(player);
		expect(fullscreenElement?.contains(media)).toBe(true);
		expect(fullscreenElement?.contains(view.getByRole('slider', { name: 'Volume' }))).toBe(true);
		expect(view.queryByRole('button', { name: 'Enter webpage fullscreen' })).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: 'Exit fullscreen' }));
		await waitFor(() => expect((view.getByRole('button', { name: 'Enter fullscreen' }) as HTMLButtonElement).disabled).toBe(false));
		expect(leaveFullscreen).toHaveBeenCalledOnce();
		await fireEvent.click(view.getByRole('button', { name: 'Enter fullscreen' }));
		await waitFor(() => expect((view.getByRole('button', { name: 'Exit fullscreen' }) as HTMLButtonElement).disabled).toBe(false));
		fullscreenElement = null;
		document.dispatchEvent(new Event('fullscreenchange'));
		await nextTick();
		expect(view.getByRole('button', { name: 'Enter fullscreen' })).toBeTruthy();
	});

	test('toggles webpage fullscreen independently of the browser fullscreen API', async () => {
		const view = renderControls('video');
		await fireEvent.click(view.getByRole('button', { name: 'Enter webpage fullscreen' }));
		expect(view.webFullscreen.value).toBe(true);
		expect(view.getByRole('button', { name: 'Enter fullscreen' })).toBeTruthy();
		await fireEvent.click(view.getByRole('button', { name: 'Exit webpage fullscreen' }));
		expect(view.webFullscreen.value).toBe(false);
		expect(view.getByRole('button', { name: 'Enter webpage fullscreen' })).toBeTruthy();
		expect(enterFullscreen).not.toHaveBeenCalled();
		expect(leaveFullscreen).not.toHaveBeenCalled();
	});

	test('opens the standard playback menu and applies its reactive settings', async () => {
		const view = renderControls('video');
		await fireEvent.click(view.getByRole('button', { name: 'Enter fullscreen' }));
		const settings = view.getByRole('button', { name: 'Settings' });
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
		expect(settings.getAttribute('aria-expanded')).toBe('true');
		expect(leaveFullscreen).not.toHaveBeenCalled();
	});

	test('clears the settings expanded state when the popup begins closing', async () => {
		const view = renderControls('video');
		await fireEvent.click(view.getByRole('button', { name: 'Enter fullscreen' }));
		const settings = view.getByRole('button', { name: 'Settings' });
		await fireEvent.click(settings);
		expect(settings.getAttribute('aria-expanded')).toBe('true');
		vi.mocked(os.popupMenu).mock.lastCall![2]?.onClosing?.();
		await nextTick();
		expect(settings.getAttribute('aria-expanded')).toBe('false');
		expect(leaveFullscreen).not.toHaveBeenCalled();
		expect(fullscreenElement).toBe(player);
	});

	test.each(['video', 'audio'] as const)('uses the shared %s settings and current playback state in the context menu', async type => {
		const view = renderControls(type, type === 'audio');
		const play = vi.spyOn(media, 'play').mockResolvedValue(undefined);
		const pause = vi.spyOn(media, 'pause').mockImplementation(() => {});
		Object.defineProperty(media, 'readyState', { configurable: true, value: 4 });
		await fireEvent(media, new Event('loadedmetadata'));
		let closeMenu!: () => void;
		vi.mocked(os.contextMenu).mockImplementation(() => new Promise<void>(resolve => { closeMenu = resolve; }));
		const event = new PointerEvent('contextmenu', { clientX: 100, clientY: 80, cancelable: true });
		view.controls.value!.showContextMenu(event);
		const [items, sourceEvent] = vi.mocked(os.contextMenu).mock.lastCall!;
		expect(sourceEvent).toBe(event);
		expect(view.controls.value!.menuShowing).toBe(true);
		menuAction(items, 'Play')(event);
		expect(play).toHaveBeenCalledOnce();
		menuAction(items, 'Mute')(event);
		await nextTick();
		expect(view.volume.value).toBe(0);
		const loop = items.find(item => 'type' in item && item.type === 'switch') as MenuSwitch;
		const speed = items.find(item => 'type' in item && item.type === 'radio') as MenuRadio;
		loop.ref.value = true;
		speed.ref.value = 1.5;
		await nextTick();
		expect(media.loop).toBe(true);
		expect(media.playbackRate).toBe(1.5);
		if (type === 'audio') {
			expect(items.filter(item => 'text' in item && String(item.text).includes('fullscreen'))).toHaveLength(0);
		}
		closeMenu();
		await nextTick();
		expect(view.controls.value!.menuShowing).toBe(false);
		await fireEvent(media, new Event('play'));
		view.controls.value!.showContextMenu(event);
		const reopenedItems = vi.mocked(os.contextMenu).mock.lastCall![0];
		menuAction(reopenedItems, 'Pause')(event);
		menuAction(reopenedItems, 'Unmute')(event);
		await nextTick();
		expect(pause).toHaveBeenCalledOnce();
		expect(view.volume.value).toBe(0.5);
		closeMenu();
	});

	test('offers the matching browser and webpage fullscreen context actions', async () => {
		const view = renderControls('video');
		const event = new PointerEvent('contextmenu');
		const openContextMenu = () => {
			view.controls.value!.showContextMenu(event);
			return vi.mocked(os.contextMenu).mock.lastCall![0];
		};
		menuAction(openContextMenu(), 'Enter webpage fullscreen')(event);
		await nextTick();
		expect(view.webFullscreen.value).toBe(true);
		menuAction(openContextMenu(), 'Exit webpage fullscreen')(event);
		await nextTick();
		expect(view.webFullscreen.value).toBe(false);
		menuAction(openContextMenu(), 'Enter fullscreen')(event);
		await waitFor(() => expect(fullscreenElement).toBe(player));
		await nextTick();
		const fullscreenItems = openContextMenu();
		expect(fullscreenItems.filter(item => 'text' in item && String(item.text).includes('webpage'))).toHaveLength(0);
		menuAction(fullscreenItems, 'Exit fullscreen')(event);
		await waitFor(() => expect(fullscreenElement).toBeNull());
	});

	test('leaves fullscreen when closing the player', async () => {
		const view = renderControls('video');
		await fireEvent.click(view.getByRole('button', { name: 'Enter fullscreen' }));
		await waitFor(() => expect((view.getByRole('button', { name: 'Exit fullscreen' }) as HTMLButtonElement).disabled).toBe(false));
		view.unmount();
		expect(leaveFullscreen).toHaveBeenCalledOnce();
	});

	test('allows retrying when the browser rejects fullscreen', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		enterFullscreen.mockRejectedValueOnce(new Error('Not permitted'));
		const view = renderControls('video');
		await fireEvent.click(view.getByRole('button', { name: 'Enter fullscreen' }));
		await waitFor(() => expect((view.getByRole('button', { name: 'Enter fullscreen' }) as HTMLButtonElement).disabled).toBe(false));
		await fireEvent.click(view.getByRole('button', { name: 'Enter fullscreen' }));
		expect(view.getByRole('button', { name: 'Exit fullscreen' })).toBeTruthy();
	});

	test.each([1, 2])('preserves %s rapid fullscreen toggles while entry is pending', async additionalToggles => {
		let finishEntry!: () => void;
		enterFullscreen.mockImplementation(() => new Promise<void>(resolve => {
			finishEntry = () => {
				fullscreenElement = player;
				document.dispatchEvent(new Event('fullscreenchange'));
				resolve();
			};
		}));
		const view = renderControls('video');
		const request = view.controls.value!.toggleFullscreen();
		for (let i = 0; i < additionalToggles; i++) await view.controls.value!.toggleFullscreen();
		expect(enterFullscreen).toHaveBeenCalledOnce();
		finishEntry();
		await request;
		await waitFor(() => expect(fullscreenElement).toBe(additionalToggles % 2 === 1 ? null : player));
		expect(leaveFullscreen).toHaveBeenCalledTimes(additionalToggles % 2);
	});

	test('cleans up a fullscreen request that finishes after the player closes', async () => {
		let finishFullscreen!: () => void;
		enterFullscreen.mockImplementationOnce(() => new Promise<void>(resolve => {
			finishFullscreen = () => {
				fullscreenElement = player;
				resolve();
			};
		}));
		const view = renderControls('video');
		await fireEvent.click(view.getByRole('button', { name: 'Enter fullscreen' }));
		view.unmount();
		finishFullscreen();
		await waitFor(() => expect(leaveFullscreen).toHaveBeenCalledOnce());
	});

	test('does not show fullscreen for audio', () => {
		const view = renderControls('audio', true);
		expect(view.queryByRole('button', { name: 'Enter fullscreen' })).toBeNull();
		expect(view.queryByRole('button', { name: 'Enter webpage fullscreen' })).toBeNull();
	});

	test('keeps webpage fullscreen available when the browser disables native fullscreen', async () => {
		Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
		const view = renderControls('video');
		expect(view.queryByRole('button', { name: 'Enter fullscreen' })).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: 'Enter webpage fullscreen' }));
		expect(view.webFullscreen.value).toBe(true);
		expect(view.getByRole('button', { name: 'Exit webpage fullscreen' })).toBeTruthy();
		expect(enterFullscreen).not.toHaveBeenCalled();
	});
});
