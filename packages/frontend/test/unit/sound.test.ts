/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { preferState } from '../setup.unit.js';
import { playChatMessageDeleteSfx } from '@/utility/sound.js';

vi.mock('@/preferences/manager.js', () => ({ getInitialPrefValue: vi.fn() }));

function makeSource() {
	return { connect: vi.fn((node: unknown) => node), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), playbackRate: { value: 1 }, buffer: null as AudioBuffer | null, onended: null as (() => void) | null };
}

const sources: ReturnType<typeof makeSource>[] = [];
const gains: { gain: { value: number }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
let now = 0;
let contextState = 'running';

describe('chat message deletion sound', () => {
	beforeEach(() => {
		now += 6000;
		contextState = 'running';
		sources.length = 0;
		gains.length = 0;
		preferState['sound.on.chatMessage'] = { type: 'syuilo/waon', volume: 0.4 };
		preferState['sound.masterVolume'] = 0.5;
		preferState['sound.notUseSound'] = false;
		preferState['sound.useSoundOnlyWhenActive'] = false;
		vi.spyOn(performance, 'now').mockImplementation(() => now);
		vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
		vi.stubGlobal('navigator', { userActivation: { hasBeenActive: true } });
		vi.stubGlobal('AudioContext', class {
			get state() { return contextState; }
			sampleRate = 48000;
			destination = {};
			close = vi.fn();
			createBuffer(_channels: number, length: number, sampleRate: number) {
				const data = new Float32Array(length);
				return { duration: length / sampleRate, getChannelData: () => data };
			}
			createStereoPanner() { return { pan: { value: 0 }, connect: vi.fn((node: unknown) => node), disconnect: vi.fn() }; }
			createGain() {
				const gain = { gain: { value: 0 }, connect: vi.fn((node: unknown) => node), disconnect: vi.fn() };
				gains.push(gain);
				return gain;
			}
			createBufferSource() {
				const source = makeSource();
				sources.push(source);
				return source;
			}
		});
	});

	afterEach(() => {
		for (const source of sources) source.onended?.();
		for (const key of ['sound.on.chatMessage', 'sound.masterVolume', 'sound.notUseSound', 'sound.useSoundOnlyWhenActive']) delete preferState[key];
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	test('uses the chat and master volumes for a short locally generated sound', () => {
		playChatMessageDeleteSfx('audible');
		expect(sources).toHaveLength(1);
		expect(sources[0].start).toHaveBeenCalledOnce();
		expect(gains[0].gain.value).toBeCloseTo(0.2);
		expect(sources[0].buffer!.duration).toBeCloseTo(0.18);
		const samples = sources[0].buffer!.getChannelData(0);
		expect(samples.some(sample => Math.abs(sample) > 0.01)).toBe(true);
		expect(samples.every(sample => Number.isFinite(sample) && Math.abs(sample) < 1)).toBe(true);
	});

	test.each(['disabled', 'master-zero', 'chat-zero', 'no-sound', 'hidden', 'unactivated', 'suspended', 'aborted'])('does not play when %s', condition => {
		const controller = new AbortController();
		if (condition === 'disabled') preferState['sound.notUseSound'] = true;
		if (condition === 'master-zero') preferState['sound.masterVolume'] = 0;
		if (condition === 'chat-zero') preferState['sound.on.chatMessage'] = { type: 'syuilo/waon', volume: 0 };
		if (condition === 'no-sound') preferState['sound.on.chatMessage'] = { type: null, volume: 1 };
		if (condition === 'hidden') vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
		if (condition === 'unactivated') vi.stubGlobal('navigator', { userActivation: { hasBeenActive: false } });
		if (condition === 'suspended') contextState = 'suspended';
		if (condition === 'aborted') controller.abort();
		playChatMessageDeleteSfx(`muted-${condition}`, controller.signal);
		expect(sources).toHaveLength(0);
	});

	test('deduplicates the same message across views and does not overlap a burst of removals', () => {
		playChatMessageDeleteSfx('shared');
		playChatMessageDeleteSfx('shared');
		playChatMessageDeleteSfx('burst');
		expect(sources).toHaveLength(1);
		now += 200;
		playChatMessageDeleteSfx('shared');
		expect(sources).toHaveLength(1);
		playChatMessageDeleteSfx('next');
		expect(sources).toHaveLength(2);
	});

	test('stops when the animation is aborted and disconnects the finished sound', () => {
		const controller = new AbortController();
		playChatMessageDeleteSfx('aborted-animation', controller.signal);
		controller.abort();
		expect(sources[0].stop).toHaveBeenCalledOnce();
		sources[0].onended?.();
		expect(sources[0].disconnect).toHaveBeenCalledOnce();
		expect(gains[0].disconnect).toHaveBeenCalledOnce();
	});
});
