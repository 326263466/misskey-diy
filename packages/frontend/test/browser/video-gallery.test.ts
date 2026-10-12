/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import type { Content } from '@/components/MkLightbox.item.vue';
import '@/style.scss';
import 'virtual:tabler-icons.css';
import MkLightbox from '@/components/MkLightbox.vue';
import { hotkeyDirective } from '@/directives/hotkey.js';
import * as os from '@/os.js';

const preferences = vi.hoisted(() => ({ animation: false, useNativeUiForVideoAudioPlayer: false, menuStyle: 'popup' }));

vi.mock('misskey-js', () => ({}));
vi.mock('@/os.js', () => ({ claimZIndex: () => 1000, popupMenu: vi.fn() }));
vi.mock('@/preferences.js', () => ({ prefer: { s: preferences } }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/utility/touch.js', () => ({ isTouchUsing: false }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release: vi.fn() }) }));
vi.mock('@/utility/get-file-menu.js', () => ({ getFileMenu: () => [] }));
vi.mock('@/utility/sensitive-file.js', () => ({ shouldHideFileByDefault: () => false, canRevealFile: async () => true }));
vi.mock('@/utility/media-has-audio.js', () => ({ default: async () => true }));
vi.mock('@/components/MkBlurhash.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkLightbox.item.audio-visualizer.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', () => ({
	i18n: { ts: { _mediaControls: { playbackRate: 'Playback speed', loop: 'Loop', pip: 'Picture in picture' } } },
}));

let app: App | undefined;
let host: HTMLElement | undefined;
let originalUrl: string;
let originalState: unknown;
const resizeErrors: string[] = [];
const onWindowError = (ev: ErrorEvent) => {
	if (ev.message.startsWith('ResizeObserver loop')) resizeErrors.push(ev.message);
};

async function nextFrame() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
}

beforeEach(async () => {
	originalUrl = window.location.href;
	originalState = window.history.state;
	resizeErrors.length = 0;
	window.addEventListener('error', onWindowError);
	preferences.animation = false;
	preferences.useNativeUiForVideoAudioPlayer = false;
	vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
	vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
	vi.mocked(os.popupMenu).mockReset().mockResolvedValue();
	await page.viewport(1200, 800);
});

afterEach(async () => {
	app?.unmount();
	host?.remove();
	await expect.poll(() => window.history.state?.__misskeyPopup?.guard ?? false).toBe(false);
	window.history.replaceState(originalState, '', originalUrl);
	vi.restoreAllMocks();
	await nextFrame();
	window.removeEventListener('error', onWindowError);
	expect(resizeErrors).toEqual([]);
});

async function mountGallery(contents: Content[], defaultIndex = 0) {
	host = document.createElement('div');
	host.style.cssText = '--MI_THEME-fg:#dadada;--MI_THEME-accent:#86b300;--MI_THEME-panel:#25282e;--MI_THEME-modalBg:#000c;--MI_THEME-fgOnAccent:#fff';
	document.body.append(host);
	const closed = vi.fn();
	const showing = ref(true);
	app = createApp({ render: () => showing.value ? h(MkLightbox, {
		contents,
		defaultIndex,
		onClosed: () => { closed(); showing.value = false; },
	}) : null });
	app.directive('hotkey', hotkeyDirective);
	app.component('MkLoading', { render: () => null });
	app.component('MkCondensedLine', defineComponent({ render() { return h('span', this.$slots.default?.()); } }));
	app.mount(host);
	await nextFrame();
	return { closed, showing };
}

async function mountVideos() {
	const result = await mountGallery(Array.from({ length: 3 }, (_, index) => ({
		id: `video-${index}`, type: 'video', url: `data:video/webm;base64,#${index}`,
		width: 1920, height: 1080, filename: `Gallery video ${index + 1}.webm`,
	})), 1);
	const video = host!.querySelector<HTMLVideoElement>('video')!;
	Object.defineProperties(video, {
		duration: { value: 120 },
		readyState: { value: HTMLMediaElement.HAVE_ENOUGH_DATA },
	});
	video.dispatchEvent(new Event('loadedmetadata'));
	video.dispatchEvent(new Event('canplay'));
	await nextFrame();
	expect(host!.querySelectorAll('video')).toHaveLength(1);
	expect(video.src).toContain('#1');
	const player = video.closest<HTMLElement>('[class*="contentWrapper"]')!.parentElement!.parentElement!.parentElement!;
	return { ...result, video, player };
}

function mockPlayback(video: HTMLVideoElement) {
	let paused = true;
	Object.defineProperty(video, 'paused', { get: () => paused });
	const play = vi.mocked(HTMLMediaElement.prototype.play).mockClear().mockImplementation(async function (this: HTMLMediaElement) {
		if (this === video) paused = false;
		this.dispatchEvent(new Event('play'));
		this.dispatchEvent(new Event('playing'));
	});
	const pause = vi.mocked(HTMLMediaElement.prototype.pause).mockClear().mockImplementation(function (this: HTMLMediaElement) {
		if (this === video) paused = true;
		this.dispatchEvent(new Event('pause'));
	});
	return { play, pause };
}

test('普通图片内容正常初始化、显示并可用 Escape 关闭', async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 200;
	canvas.height = 200;
	const { closed } = await mountGallery([{ id: 'image', type: 'image', url: canvas.toDataURL(), width: 200, height: 200 }]);
	const image = host!.querySelector('img')!;
	await image.decode();
	await expect.poll(() => getComputedStyle(image).opacity).toBe('1');
	expect(image.naturalWidth).toBe(200);
	expect(closed).not.toHaveBeenCalled();
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => closed.mock.calls.length).toBe(1);
});

test('视频表面点击只切换一次播放，控制条可立即暂停', async () => {
	const { player, video, closed } = await mountVideos();
	const { play, pause } = mockPlayback(video);
	await page.elementLocator(video).click();
	expect(play).toHaveBeenCalledOnce();
	expect(video.paused).toBe(false);
	expect(closed).not.toHaveBeenCalled();
	const playbackButton = player.querySelector<HTMLButtonElement>('[class*="mediaControl"] button')!;
	await page.elementLocator(playbackButton).click();
	expect(pause).toHaveBeenCalledOnce();
	expect(video.paused).toBe(true);
	await page.elementLocator(video).click();
	expect(play).toHaveBeenCalledTimes(2);
	expect(closed).not.toHaveBeenCalled();
});

test.each(['空白处', '关闭按钮', 'Escape'])('视频图库通过%s关闭一次', async action => {
	const { player, video, closed } = await mountVideos();
	if (action === 'Escape') {
		await userEvent.keyboard('{Escape}');
	} else if (action === '关闭按钮') {
		const buttons = player.querySelectorAll<HTMLButtonElement>('[class*="title"] button');
		await page.elementLocator(buttons[buttons.length - 1]).click();
	} else {
		const stage = player.querySelector<HTMLElement>('[class*="main"]')!;
		const header = player.querySelector<HTMLElement>('[class*="header"]')!;
		await expect.poll(() => header.getAnimations().filter(animation => animation.playState === 'running').length).toBe(0);
		const stageBox = stage.getBoundingClientRect();
		const videoBox = video.getBoundingClientRect();
		const headerBox = header.getBoundingClientRect();
		await page.elementLocator(stage).click({ position: {
			x: videoBox.left + videoBox.width / 2 - stageBox.left,
			y: (headerBox.bottom + videoBox.top) / 2 - stageBox.top,
		} });
	}
	await expect.poll(() => closed.mock.calls.length).toBe(1);
});

test.each(['previous', 'next'])('图库 %s 按钮切换媒体并暂停原视频', async direction => {
	const { video, closed } = await mountVideos();
	const { pause } = mockPlayback(video);
	await page.elementLocator(video).click();
	const button = host!.querySelector<HTMLButtonElement>(`[class*="${direction === 'previous' ? 'prevButton' : 'nextButton'}"]`)!;
	await page.elementLocator(button).click();
	await expect.poll(() => host!.querySelectorAll('video').length).toBe(2);
	expect([...host!.querySelectorAll('video')].some(item => item.src.endsWith(direction === 'previous' ? '#0' : '#2'))).toBe(true);
	expect(pause.mock.contexts.filter(context => context === video)).toHaveLength(1);
	expect(closed).not.toHaveBeenCalled();
});

test('调整窗口后保留当前视频和播放位置，左右键仍可切换', async () => {
	const { video, closed } = await mountVideos();
	const { play } = mockPlayback(video);
	await page.elementLocator(video).click();
	video.currentTime = 45;
	const loadstart = vi.fn();
	video.addEventListener('loadstart', loadstart);
	await page.viewport(720, 600);
	await nextFrame();
	expect(host!.querySelector('video')).toBe(video);
	expect(video.currentTime).toBe(45);
	expect(video.paused).toBe(false);
	expect(play).toHaveBeenCalledOnce();
	expect(loadstart).not.toHaveBeenCalled();
	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => host!.querySelectorAll('video').length).toBe(2);
	expect(closed).not.toHaveBeenCalled();
});

test('设置按钮打开现有播放菜单且不会关闭图库', async () => {
	const { player, closed } = await mountVideos();
	const buttons = player.querySelectorAll<HTMLButtonElement>('[class*="mediaControl"] button');
	await page.elementLocator(buttons[buttons.length - 1]).click();
	expect(os.popupMenu).toHaveBeenCalledOnce();
	expect(vi.mocked(os.popupMenu).mock.calls[0][0]).toEqual(expect.arrayContaining([
		expect.objectContaining({ type: 'switch', text: 'Loop' }),
		expect.objectContaining({ type: 'radio', text: 'Playback speed' }),
	]));
	expect(closed).not.toHaveBeenCalled();
});

test('启用浏览器原生控件时保留原生视频控件', async () => {
	preferences.useNativeUiForVideoAudioPlayer = true;
	const { player, video } = await mountVideos();
	expect(video.controls).toBe(true);
	expect(player.querySelector('[class*="mediaControl"]')).toBeNull();
});
