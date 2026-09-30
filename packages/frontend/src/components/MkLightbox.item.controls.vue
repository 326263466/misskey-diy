<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.animated]: prefer.s.animation, [$style.videoControls]: isVideo }]" @keydown.left.stop @keydown.right.stop>
	<div :class="[$style.seekbar]">
		<MkMediaRange
			v-model="rangePercent"
			:buffer="bufferedDataRatio"
			:durationMs="durationMs"
			:label="i18n.ts._mediaControls.seek"
		/>
	</div>

	<div :class="[$style.controlsChild, $style.controlsLeft]">
		<button class="_button" :class="$style.controlButton" :aria-label="playPauseActive ? i18n.ts._mediaControls.pause : i18n.ts._mediaControls.play" @click="togglePlayPause">
			<i v-if="playPauseActive" class="ti ti-player-pause"></i>
			<i v-else class="ti ti-player-play"></i>
		</button>
	</div>
	<div v-if="isVideo" :class="$style.controlsTime">{{ hms(elapsedTimeMs) }} / {{ hms(durationMs) }}</div>
	<div :class="[$style.controlsChild, $style.controlsVolume]">
		<button class="_button" :class="$style.controlButton" :aria-label="volume === 0 ? i18n.ts._mediaControls.unmute : i18n.ts._mediaControls.mute" @click="toggleMute">
			<i v-if="volume === 0" class="ti ti-volume-3"></i>
			<i v-else class="ti ti-volume"></i>
		</button>
		<MkMediaRange
			v-model="volume"
			:class="$style.volumeSeekbar"
			:label="i18n.ts.volume"
			:valueText="volumeText"
			:step="0.01"
		/>
		<span :class="$style.volumeValue" aria-hidden="true">{{ volumeText }}</span>
	</div>
	<div v-if="!isVideo" :class="$style.controlsTime">{{ hms(elapsedTimeMs) }} / {{ hms(durationMs) }}</div>
	<div :class="[$style.controlsChild, $style.controlsRight]">
		<button class="_button" :class="[$style.controlButton, $style.settingsButton]" :aria-label="i18n.ts.settings" :aria-expanded="menuShowing" @click="showMenu">
			<i class="ti ti-settings"></i>
		</button>
		<button
			v-if="isVideo && !fullscreen"
			class="_button"
			:class="$style.controlButton"
			:aria-label="webFullscreen ? i18n.ts._mediaControls.exitWebFullscreen : i18n.ts._mediaControls.enterWebFullscreen"
			:title="webFullscreen ? i18n.ts._mediaControls.exitWebFullscreen : i18n.ts._mediaControls.enterWebFullscreen"
			:aria-pressed="webFullscreen"
			@click="webFullscreen = !webFullscreen"
		>
			<i :class="webFullscreen ? 'ti ti-layout-navbar' : 'ti ti-browser-maximize'" aria-hidden="true"></i>
		</button>
		<button
			v-if="fullscreenSupported"
			class="_button"
			:class="$style.controlButton"
			:aria-label="fullscreen ? i18n.ts._mediaControls.exitFullscreen : i18n.ts._mediaControls.enterFullscreen"
			:title="fullscreen ? i18n.ts._mediaControls.exitFullscreen : i18n.ts._mediaControls.enterFullscreen"
			:disabled="fullscreenPending"
			@click="toggleFullscreen"
		>
			<i :class="fullscreen ? 'ti ti-arrows-minimize' : 'ti ti-arrows-maximize'"></i>
		</button>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, shallowRef, inject, computed, watch, onBeforeUnmount } from 'vue';
import type { MenuItem } from '@/types/menu.js';
import { DI } from '@/di.js';
import { hms } from '@/filters/hms.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import * as os from '@/os.js';
import MkMediaRange from '@/components/MkMediaRange.vue';

const props = withDefaults(defineProps<{
	/** 音量をメディア要素に適用しない（ビジュアライザー用） */
	externalVolumeControl?: boolean;
	playerEl?: HTMLElement | null;
	controlsVisible?: boolean;
	playbackPending?: boolean;
	managedPlayback?: boolean;
}>(), {
	externalVolumeControl: false,
	playerEl: null,
	controlsVisible: true,
	playbackPending: false,
	managedPlayback: false,
});

const emit = defineEmits<{
	(ev: 'pause'): void;
	(ev: 'play'): void;
}>();

const volume = defineModel<number>('volume', { required: true });
const webFullscreen = defineModel<boolean>('webFullscreen', { default: false });
const volumeText = computed(() => `${Math.round(volume.value * 100)}%`);

const mediaEl = inject(DI.mkLightboxItemMediaEl, shallowRef<HTMLVideoElement | HTMLAudioElement | null>(null));
const isVideo = computed(() => mediaEl.value instanceof HTMLVideoElement);
const fullscreen = ref(false);
const fullscreenPending = ref(false);
let fullscreenToggleQueued = false;
let fullscreenRequestGeneration = 0;
let fullscreenCancelled = false;
const fullscreenSupported = computed(() => isVideo.value && props.playerEl != null && window.document.fullscreenEnabled);

function syncFullscreen() {
	const isCurrentPlayer = props.playerEl != null && window.document.fullscreenElement === props.playerEl;
	fullscreen.value = isCurrentPlayer && !fullscreenCancelled;
	if (isCurrentPlayer && fullscreenCancelled) void leaveFullscreen();
}

async function leaveFullscreen() {
	if (props.playerEl == null || window.document.fullscreenElement !== props.playerEl) return;
	try {
		await window.document.exitFullscreen();
	} catch (err) {
		if (_DEV_) console.warn('Failed to exit fullscreen:', err);
	}
}

function exitFullscreenIfActive() {
	if (!fullscreen.value && !fullscreenPending.value) return false;
	cancelFullscreen();
	return true;
}

function cancelFullscreen() {
	fullscreenToggleQueued = false;
	fullscreenRequestGeneration++;
	fullscreenCancelled = true;
	fullscreen.value = false;
	void leaveFullscreen();
}

async function toggleFullscreen() {
	if (!fullscreenSupported.value || props.playerEl == null) return;
	if (fullscreenPending.value) {
		fullscreenToggleQueued = !fullscreenToggleQueued;
		return;
	}
	const player = props.playerEl;
	const signal = abortController?.signal;
	const generation = ++fullscreenRequestGeneration;
	fullscreenCancelled = false;
	fullscreenPending.value = true;
	try {
		if (fullscreen.value) {
			await leaveFullscreen();
		} else {
			await player.requestFullscreen();
			if (signal?.aborted || generation !== fullscreenRequestGeneration) {
				if (window.document.fullscreenElement === player) await window.document.exitFullscreen();
				return;
			}
		}
		syncFullscreen();
	} catch (err) {
		fullscreenToggleQueued = false;
		if (_DEV_) console.warn('Failed to toggle fullscreen:', err);
	} finally {
		fullscreenPending.value = false;
		if (fullscreenToggleQueued && !signal?.aborted && generation === fullscreenRequestGeneration) {
			fullscreenToggleQueued = false;
			void toggleFullscreen();
		}
	}
}

// Menu
const menuShowing = ref(false);

function getSettingsMenu(): MenuItem[] {
	return [
		// TODO: 再生キューに追加
		{
			type: 'switch',
			text: i18n.ts._mediaControls.loop,
			icon: 'ti ti-repeat',
			ref: loop,
		},
		{
			type: 'radio',
			text: i18n.ts._mediaControls.playbackRate,
			icon: 'ti ti-clock-play',
			ref: speed,
			options: [{
				label: '0.25x',
				value: 0.25,
			}, {
				label: '0.5x',
				value: 0.5,
			}, {
				label: '0.75x',
				value: 0.75,
			}, {
				label: '1.0x',
				value: 1,
			}, {
				label: '1.25x',
				value: 1.25,
			}, {
				label: '1.5x',
				value: 1.5,
			}, {
				label: '2.0x',
				value: 2,
			}],
		},
		...(window.document.pictureInPictureEnabled && isVideo.value ? [{
			text: i18n.ts._mediaControls.pip,
			icon: 'ti ti-picture-in-picture',
			action: togglePictureInPicture,
		}] : []),
	];
}

function showMenu(ev: PointerEvent) {
	menuShowing.value = true;
	os.popupMenu(getSettingsMenu(), ev.currentTarget ?? ev.target, {
		align: 'right',
		onClosing: () => {
			menuShowing.value = false;
		},
	});
}

function showContextMenu(ev: PointerEvent) {
	const menu: MenuItem[] = [{
		text: playPauseActive.value ? i18n.ts._mediaControls.pause : i18n.ts._mediaControls.play,
		icon: playPauseActive.value ? 'ti ti-player-pause' : 'ti ti-player-play',
		action: togglePlayPause,
	}, {
		text: volume.value === 0 ? i18n.ts._mediaControls.unmute : i18n.ts._mediaControls.mute,
		icon: volume.value === 0 ? 'ti ti-volume' : 'ti ti-volume-3',
		action: toggleMute,
	}];
	if (fullscreenSupported.value) {
		menu.push({
			text: fullscreen.value ? i18n.ts._mediaControls.exitFullscreen : i18n.ts._mediaControls.enterFullscreen,
			icon: fullscreen.value ? 'ti ti-arrows-minimize' : 'ti ti-arrows-maximize',
			action: toggleFullscreen,
		});
	}
	if (isVideo.value && !fullscreen.value) {
		menu.push({
			text: webFullscreen.value ? i18n.ts._mediaControls.exitWebFullscreen : i18n.ts._mediaControls.enterWebFullscreen,
			icon: webFullscreen.value ? 'ti ti-layout-navbar' : 'ti ti-browser-maximize',
			action: () => { webFullscreen.value = !webFullscreen.value; },
		});
	}
	menu.push({ type: 'divider' }, ...getSettingsMenu());
	menuShowing.value = true;
	void os.contextMenu(menu, ev).finally(() => { menuShowing.value = false; });
}

// MediaControl: Common State
const oncePlayed = ref(false);
const isReady = ref(false);
const isPlaying = ref(false); // ユーザーが再生中であることを期待する状態か
const playPauseActive = computed(() => isPlaying.value || props.playbackPending);
const isActuallyPlaying = ref(false); // 実際に再生中か (バッファリング等で一時停止している場合は false)
const elapsedTimeMs = ref(0);
const durationMs = ref(0);
const rangePercent = computed({
	get: () => {
		return (elapsedTimeMs.value / durationMs.value) || 0;
	},
	set: (to) => {
		if (mediaEl.value == null) return;
		mediaEl.value.currentTime = to * durationMs.value / 1000;
	},
});
const speed = ref(1);
const loop = ref(false); // TODO: ドライブファイルのフラグに置き換える
const bufferedEnd = ref(0);
const bufferedDataRatio = computed(() => {
	if (durationMs.value === 0) return 0;
	return bufferedEnd.value / (durationMs.value / 1000);
});

// state の更新はすべてメディア要素のイベント側に任せる
function togglePlayPause() {
	if (mediaEl.value == null) return;

	if (playPauseActive.value) {
		emit('pause');
		mediaEl.value.pause();
	} else if (props.managedPlayback) {
		emit('play');
	} else {
		// 自動再生のブロック等で reject しうるが、再生ボタンが出たままになるだけなので握りつぶす
		mediaEl.value?.play().catch(err => {
			if (_DEV_) console.warn('Failed to play media:', err);
		});
	}
}

function togglePictureInPicture() {
	// ブラウザ側で許可されていない場合等にrejectしうるが、表示が変わらないだけなので握りつぶす
	if (window.document.pictureInPictureElement) {
		window.document.exitPictureInPicture().catch(err => {
			if (_DEV_) console.warn('Failed to exit picture-in-picture:', err);
		});
	} else if (isVideo.value) {
		(mediaEl.value as HTMLVideoElement).requestPictureInPicture().catch(err => {
			if (_DEV_) console.warn('Failed to enter picture-in-picture:', err);
		});
	}
}

const volumeBeforeMute = ref(volume.value > 0 ? volume.value : 0.5);
watch(volume, value => {
	if (value > 0) volumeBeforeMute.value = value;
});

function toggleMute() {
	if (volume.value === 0) {
		volume.value = volumeBeforeMute.value;
	} else {
		volumeBeforeMute.value = volume.value;
		volume.value = 0;
	}
}

let abortController: AbortController | null = null;
let loopObserver: MutationObserver | null = null;

// currentTime だけは進捗を通知するイベントが timeupdate しかなく、
// これは 4Hz 程度でしか発火しないためシークバーがカクつく。
// そのため再生中に限り requestAnimationFrame で補間する
let elapsedTickFrameId: number | null = null;

function syncElapsedTime() {
	if (!props.controlsVisible) return;
	if (mediaEl.value == null) return;
	elapsedTimeMs.value = mediaEl.value.currentTime * 1000;
}

function elapsedTick() {
	syncElapsedTime();
	elapsedTickFrameId = window.requestAnimationFrame(elapsedTick);
}

function startElapsedTick() {
	if (!props.controlsVisible || elapsedTickFrameId != null) return;
	elapsedTickFrameId = window.requestAnimationFrame(elapsedTick);
}

function stopElapsedTick() {
	if (elapsedTickFrameId == null) return;
	window.cancelAnimationFrame(elapsedTickFrameId);
	elapsedTickFrameId = null;
}

function syncDuration() {
	const duration = mediaEl.value?.duration;
	// メタデータ読み込み前は NaN、ライブストリームでは Infinity になりうる
	durationMs.value = duration != null && Number.isFinite(duration) ? duration * 1000 : 0;
}

function syncBuffered() {
	const buffered = mediaEl.value?.buffered;
	if (buffered == null || buffered.length === 0) {
		bufferedEnd.value = 0;
		return;
	}

	// シークすると読み込み済みの範囲が複数に分かれるため、最も先まで到達している位置を採用する
	let end = 0;
	for (let i = 0; i < buffered.length; i++) {
		if (buffered.end(i) > end) end = buffered.end(i);
	}
	bufferedEnd.value = end;
}

function syncReady() {
	const el = mediaEl.value;
	isReady.value = el != null && el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
}

function init() {
	const el: HTMLMediaElement | null = mediaEl.value;
	if (el == null) return;

	abortController = new AbortController();
	const signal = abortController.signal;
	window.document.addEventListener('fullscreenchange', syncFullscreen, { signal });
	syncFullscreen();

	const on = (type: keyof HTMLMediaElementEventMap, listener: () => void) => {
		el.addEventListener(type, listener, { signal });
	};
	let audioTracksChecked = false;
	const checkAudioTracks = () => {
		if (audioTracksChecked || !(el instanceof HTMLVideoElement) || el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
		const video = el as HTMLVideoElement & {
			audioTracks?: { length: number };
			mozHasAudio?: boolean;
			webkitAudioDecodedByteCount?: number;
		};
		// デコード量が 0 でも、まだ音声をデコードしていないだけかもしれない。
		// 音声の不在はトラック情報で確定できた場合だけ扱う。
		if ((video.audioTracks?.length ?? 0) > 0 || video.mozHasAudio === true || (video.webkitAudioDecodedByteCount ?? 0) > 0) {
			audioTracksChecked = true;
			return;
		}
		if (video.audioTracks?.length !== 0 && video.mozHasAudio !== false) return;
		audioTracksChecked = true;
		// 再生中の要素をそのまま調べ、ユーザーの pause や loop 設定を後から上書きしない。
		el.loop = el.muted = true;
	};
	on('loadeddata', checkAudioTracks);

	on('play', () => {
		isPlaying.value = true;
		oncePlayed.value = true;
		startElapsedTick();
	});

	on('playing', () => {
		checkAudioTracks();
		isActuallyPlaying.value = true;
		startElapsedTick();
	});

	on('waiting', () => {
		isActuallyPlaying.value = false;
		stopElapsedTick();
	});

	on('pause', () => {
		isPlaying.value = false;
		isActuallyPlaying.value = false;
		stopElapsedTick();
	});

	on('ended', () => {
		oncePlayed.value = false;
		isPlaying.value = false;
		isActuallyPlaying.value = false;
		stopElapsedTick();
		syncElapsedTime();
	});

	on('timeupdate', syncElapsedTime);
	on('seeking', syncElapsedTime);
	on('seeked', () => {
		syncElapsedTime();
		syncBuffered();
	});

	on('durationchange', syncDuration);
	on('loadstart', syncReady);
	on('canplay', syncReady);
	on('canplaythrough', syncReady);
	on('loadedmetadata', () => {
		syncDuration();
		syncBuffered();
		syncReady();
	});
	on('progress', syncBuffered);
	on('emptied', () => {
		audioTracksChecked = false;
		isReady.value = false;
		isPlaying.value = false;
		isActuallyPlaying.value = false;
		oncePlayed.value = false;
		stopElapsedTick();
		syncDuration();
		syncBuffered();
		syncElapsedTime();
	});

	// ネイティブUIやブラウザのコンテキストメニューから変更されうるもの
	// (externalVolumeControl時は要素の音量を100%に固定しているので、取り込むと表示が壊れる)
	if (!props.externalVolumeControl) {
		on('volumechange', () => {
			const to = el.muted ? 0 : el.volume;
			if (volume.value !== to) volume.value = to;
		});
	}

	on('ratechange', () => {
		if (speed.value !== el.playbackRate) speed.value = el.playbackRate;
	});

	// loop には変更イベントが無いが、属性の変化を監視すればネイティブUI経由の変更も拾える
	loopObserver = new MutationObserver(() => {
		if (loop.value !== el.loop) loop.value = el.loop;
	});
	loopObserver.observe(el, { attributes: true, attributeFilter: ['loop'] });

	// 現在の要素の状態を state に取り込む
	// (コントロール表示前に再生が始まっている場合等)
	syncReady();
	syncDuration();
	syncBuffered();
	syncElapsedTime();
	loop.value = el.loop;
	speed.value = el.playbackRate;
	isPlaying.value = !el.paused;
	if (!el.paused) {
		oncePlayed.value = true;
		startElapsedTick();
	}

	if (!props.externalVolumeControl) {
		el.volume = volume.value;
	}

	checkAudioTracks();
}

function teardown() {
	abortController?.abort();
	abortController = null;
	loopObserver?.disconnect();
	loopObserver = null;
	stopElapsedTick();
	isReady.value = false;
	menuShowing.value = false;
	// メディア要素を差し替えた場合、古い要素のイベントはもう届かないのでここで戻しておく
	// (isPlaying / loop / speed 等は init() が新しい要素から取り込み直す)
	isActuallyPlaying.value = false;
	oncePlayed.value = false;
}

watch(volume, (to) => {
	if (props.externalVolumeControl) return; // 適用は音量を受け取った側 (Web Audio経路) が行う
	if (mediaEl.value == null) return;
	mediaEl.value.volume = to;
	mediaEl.value.muted = to === 0;
});

watch(speed, (to) => {
	if (mediaEl.value == null) return;
	mediaEl.value.playbackRate = to;
});

watch(loop, (to) => {
	if (mediaEl.value == null) return;
	mediaEl.value.loop = to;
});

watch(mediaEl, () => {
	teardown();
	init();
}, { immediate: true });

watch(() => props.controlsVisible, (visible) => {
	if (!visible) {
		stopElapsedTick();
		return;
	}
	syncElapsedTime();
	if (isActuallyPlaying.value) startElapsedTick();
});

onBeforeUnmount(() => {
	cancelFullscreen();
	teardown();
});

defineExpose({
	isPlaying,
	isReady,
	isActuallyPlaying,
	fullscreen,
	menuShowing,
	showContextMenu,
	toggleFullscreen,
	cancelFullscreen,
	exitFullscreen: exitFullscreenIfActive,
});
</script>

<style lang="scss" module>
.root {
	--MI-mediaSeekFg: var(--MI_THEME-accent);
	--MI-mediaRangeThumbSize: 12px;
	--MI-mediaRangeThumbBg: currentColor;
	--MI-mediaRangeThumbShadow: none;
	--MI-mediaRangeBufferFg: color-mix(in srgb, var(--MI-mediaStageFg, var(--MI_THEME-fg)) 45%, transparent);
	display: grid;
	grid-template-areas:
		"seekbar seekbar seekbar seekbar seekbar"
		"left volume time center right";
	grid-template-columns: auto auto auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 0 8px;
	width: 100%;
	min-width: 0;
	color: var(--MI-mediaStageFg, var(--MI_THEME-fg));
}

.controlsChild {
	display: flex;
	align-items: center;
	gap: 4px;
}

.controlsLeft {
	grid-area: left;
}

.controlsRight {
	grid-area: right;
}

.controlsVolume {
	grid-area: volume;
}

.controlButton {
	display: grid;
	place-items: center;
	flex: 0 0 36px;
	width: 36px;
	height: 36px;
	box-sizing: border-box;
	padding: 0;
	border-radius: 50%;
	font-size: 21px;

	> i {
		display: inline-block;
	}

	&:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	&:not(:disabled):is(:hover, :focus-visible) {
		background: color-mix(in srgb, currentColor 18%, transparent);
		color: inherit;
	}

	&:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 2px;
	}
}

.animated .controlButton {
	transition: color 160ms ease, background-color 160ms ease;

	> i {
		transition: scale 160ms ease, rotate 160ms ease;
	}

	&:not(:disabled):is(:hover, :focus-visible) > i {
		scale: 1.15;
	}

	&:not(:disabled):active > i {
		scale: 0.94;
	}
}

.animated .settingsButton:not(:disabled):is(:hover, :focus-visible) > i {
	rotate: 45deg;
}

.controlsTime {
	grid-area: time;
	font-size: 12px;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

.volumeSeekbar {
	--MI-mediaRangeFg: var(--MI-mediaStageFg, var(--MI_THEME-fg));
	--MI-mediaRangeThumbSize: 10px;
	width: 72px;
}

.volumeValue {
	width: 4ch;
	font-size: 11px;
	text-align: right;
	font-variant-numeric: tabular-nums;
}

.seekbar {
	--MI-mediaRangeFg: var(--MI-mediaSeekFg);
	grid-area: seekbar;
	min-width: 0;
}

.videoControls {
	grid-template-areas:
		"seekbar seekbar seekbar seekbar seekbar"
		"left time center volume right";
	grid-template-columns: auto auto minmax(0, 1fr) auto auto;

	.controlsVolume {
		position: relative;
	}

	.controlsTime {
		font-size: 13px;
	}

	.volumeSeekbar {
		width: 56px;
	}

	.volumeValue {
		display: none;
	}

	.seekbar {
		--MI-mediaRangeTrackHeight: 3px;
	}
}

@media (hover: hover) and (pointer: fine) {
	.videoControls .seekbar {
		--MI-mediaRangeThumbScale: 0;

		&:is(:hover, :focus-within) {
			--MI-mediaRangeTrackHeight: 5px;
			--MI-mediaRangeThumbScale: 1;
		}
	}
}

.animated.videoControls .seekbar {
	--MI-mediaRangeTransition: 160ms ease;
}

@container (max-width: 560px) {
	.volumeValue {
		display: none;
	}

	.volumeSeekbar {
		width: 56px;
	}

	.videoControls {
		column-gap: 4px;

		.volumeSeekbar {
			position: absolute;
			bottom: calc(100% + 12px);
			right: 0;
			width: 88px;
			padding: 6px 12px;
			border-radius: 6px;
			background: var(--MI-mediaStageBg, var(--MI_THEME-panel));
			opacity: 0;
			pointer-events: none;
		}

		.controlsVolume:is(:hover, :focus-within) .volumeSeekbar {
			opacity: 1;
			pointer-events: auto;
		}

		.controlsVolume:is(:hover, :focus-within)::before {
			content: "";
			position: absolute;
			bottom: 100%;
			right: 0;
			width: 112px;
			height: 12px;
		}
	}
}

@container (max-width: 440px) {
	.root {
		grid-template-areas:
			"seekbar seekbar seekbar seekbar"
			"left volume center right";
		grid-template-columns: auto auto minmax(0, 1fr) auto;
		column-gap: 4px;

		.controlsTime {
			display: none;
		}
	}

	.videoControls {
		grid-template-areas:
			"seekbar seekbar seekbar seekbar seekbar"
			"left time center volume right";
		grid-template-columns: auto auto minmax(0, 1fr) auto auto;
		column-gap: 2px;

		.controlsTime {
			display: block;
			font-size: 11px;
		}

		.controlButton {
			flex-basis: 30px;
			width: 30px;
			font-size: 19px;
		}
	}
}

@container (max-width: 300px) {
	.root {
		column-gap: 2px;

		.controlsChild {
			gap: 2px;
		}

		.controlButton {
			flex-basis: 30px;
			width: 30px;
			height: 30px;
			font-size: 19px;
		}

		.volumeSeekbar {
			width: 40px;
		}
	}

	.videoControls {
		grid-template-areas:
			"seekbar seekbar seekbar seekbar seekbar"
			"left time center volume right";
		grid-template-columns: auto auto minmax(0, 1fr) auto auto;
		column-gap: 0;

		.controlsTime {
			font-size: 10px;
		}

		.volumeSeekbar {
			width: 88px;
		}
	}
}

@media (prefers-reduced-motion: reduce) {
	.animated.videoControls .seekbar {
		--MI-mediaRangeTransition: none;
	}

	.animated .controlButton,
	.animated .controlButton > i {
		transition: none;
	}

	.animated .controlButton:not(:disabled):is(:hover, :focus-visible, :active) > i {
		scale: 1;
		rotate: none;
	}
}
</style>
