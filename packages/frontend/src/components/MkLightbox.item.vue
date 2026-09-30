<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	ref="rootEl"
	:class="[$style.root, { [$style.mediaPlayer]: isMediaControlledByMisskey, [$style.videoPlayer]: isVideoPlayer, [$style.expanded]: expanded, [$style.controlsHidden]: expanded && !controlsVisible, [$style.animated]: prefer.s.animation }]"
	:tabindex="active && isMediaControlledByMisskey ? 0 : -1"
	@pointermove.capture.passive="showControls"
	@pointerdown.capture.passive="onPlayerPointerdown"
	@focusin="onPlayerFocus"
	@focusout="onPlayerFocusout"
	@keydown.capture="onPlayerKeydown"
>
	<div
		ref="mainEl"
		:class="$style.main"
		@pointerdown.passive="onPointerdown"
		@pointermove.passive="onPointermove"
		@pointerup.passive="onPointerup"
		@pointercancel.passive="cancelPointerGesture"
		@touchstart.passive="onTouchstart"
		@touchmove="onTouchmove"
		@touchcancel.passive="cancelPointerGesture"
		@contextmenu="onMediaContextMenu"
		@wheel="onWheel"
		@click="onClick"
		@dblclick="onVideoDoubleClick"
	>
		<div
			ref="transformerEl"
			:class="[$style.transformer, { [$style.transition]: enableTransition }]"
			:style="{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }"
			@transitionend.self="enableTransition = false"
			@transitioncancel.self="enableTransition = false"
		>
			<div ref="contentEl" :class="[$style.contentWrapper, { [$style.hideForFallback]: hideForFallback }]">
				<div
					v-if="hide"
					data-gallery-click-action="hidden"
					:class="[$style.hidden, {
						[$style.sensitive]: content.file?.isSensitive && prefer.s.highlightSensitiveMedia,
					}]"
					:style="hiddenStyle"
					@click.stop="onHiddenClick"
				>
					<div :class="$style.hiddenWrapper">
						<MkBlurhash
							v-if="content.type === 'image' && content.file?.blurhash != null"
							:class="$style.hiddenBlurhash"
							:blurhash="content.file.blurhash ?? null"
							:height="content?.height ?? undefined"
							:width="content?.width ?? undefined"
						/>
						<img
							v-else-if="content.type === 'video' && content.thumbnailUrl != null"
							:src="content.thumbnailUrl"
							:class="$style.hiddenThumbnail"
						/>
						<div v-else :class="$style.hiddenPlaceholder"></div>
						<div :class="[$style.hiddenText, { [$style.withBlur]: content.type === 'video' && content.thumbnailUrl != null }]">
							<div :class="$style.hiddenTextWrapper">
								<b v-if="content.file?.isSensitive" style="display: block;"><i class="ti ti-eye-exclamation"></i> {{ i18n.ts.sensitive }}</b>
								<b v-else style="display: block;"><i class="ti" :class="contentHideFileIcon"></i> {{ contentHideFileText }}</b>
								<span style="display: block;">{{ i18n.ts.clickToShow }}</span>
							</div>
						</div>
					</div>
				</div>
				<template v-else>
					<img
						v-if="(!originalContentLoaded || !thumbnailContentLoaded) && (content.thumbnailUrl != null)"
						:class="[$style.content, $style.thumbnail]"
						:src="content.thumbnailUrl"
						draggable="false"
						@load="thumbnailContentLoaded = true"
					>

					<template v-if="activated">
						<img
							v-if="content.type === 'image'"
							:class="[$style.content, { [$style.pixelatedZoom]: pixelatedZoom }]"
							:src="content.url"
							:alt="content.file?.comment ?? undefined"
							draggable="false"
							@load="originalContentLoaded = true"
						>
						<video
							v-else-if="content.type === 'video'"
							ref="videoEl"
							data-gallery-click-action="media"
							:class="[$style.video, { [$style.videoSized]: isVideoPlayer || videoAspectRatio != null }]"
							:src="content.url"
							:alt="content.file?.comment ?? undefined"
							draggable="false"
							:controls="prefer.s.useNativeUiForVideoAudioPlayer"
							:poster="content.thumbnailUrl ?? undefined"
							playsinline
							@loadedmetadata="onVideoLoadedMetadata"
							@loadeddata="originalContentLoaded = true"
							@click.stop="onMediaSurfaceClick"
							@dblclick.stop="onVideoDoubleClick"
						></video>
						<div v-if="content.type === 'video' && !prefer.s.useNativeUiForVideoAudioPlayer && !isMediaPlaying && !isPlaybackPending && !showMediaLoading && !mediaFailed" :class="$style.playIconWrapper">
							<button
								type="button"
								class="_button"
								:class="$style.playIcon"
								:aria-label="i18n.ts._mediaControls.play"
								@pointerdown.stop
								@touchstart.stop
								@click.stop="onMediaSurfaceClick"
							>
								<MkMediaPlayIcon/>
							</button>
						</div>
						<div v-if="content.type === 'audio' && prefer.s.useNativeUiForVideoAudioPlayer" :class="$style.audioRoot">
							<audio
								ref="audioEl"
								:src="content.url"
								:alt="content.file?.comment ?? undefined"
								:class="$style.audio"
								controls
								@loadedmetadata="originalContentLoaded = true"
							></audio>
						</div>
						<XAudioVisualizer
							v-else-if="content.type === 'audio' && !prefer.s.useNativeUiForVideoAudioPlayer"
							ref="audioVisualizer"
							:class="$style.audioVisualizer"
							:content="content"
							:active="active"
							:user="user"
							:isPlaying="isMediaPlaying || isPlaybackPending"
							:playButtonVisible="!mediaFailed"
							:volume="volume"
							@click.stop="onMediaClick"
							@loadedmetadata="originalContentLoaded = true"
							@loadError="failPlayback"
							@playbackError="onPlaybackError"
						/>
					</template>

					<div v-if="mediaFailed" :class="$style.loading">
						<div :class="$style.loadingContent" role="alert">
							<span>{{ i18n.ts._mediaControls.loadFailed }}</span>
							<button type="button" class="_button" :class="$style.retryButton" @pointerdown.stop @click.stop="retryPlayback">{{ i18n.ts.retry }}</button>
						</div>
					</div>
					<div v-else-if="(activated && content.type === 'image' && !originalContentLoaded) || showMediaLoading" :class="$style.loading">
						<div :class="$style.loadingContent" role="status">
							<MkLoading mini/>
							<span>{{ i18n.ts.loading }}</span>
						</div>
					</div>
				</template>
				<div
					v-if="isMediaControlledByMisskey && !hide"
					:class="[$style.footer, { [$style.infoShowing]: controlsVisible }]"
					:inert="!controlsVisible"
					@pointerenter="onControlsPointerenter"
					@pointerleave="controlsHovered = false"
					@pointerdown.stop
					@pointermove.stop
					@pointerup.stop
					@pointercancel.stop
					@touchstart.stop
					@touchmove.stop
					@touchend.stop
					@touchcancel.stop
					@wheel.stop
					@contextmenu.stop="onMediaContextMenu"
					@click.stop
					@dblclick.stop
				>
					<div :class="$style.mediaControl">
						<XControl v-if="mediaEl != null" ref="mediaControl" v-model:volume="volume" v-model:webFullscreen="webFullscreen" :playerEl="rootEl" :externalVolumeControl="isVolumeHandledByVisualizer" :controlsVisible="controlsVisible" :playbackPending="isPlaybackPending" managedPlayback @play="onMediaClick" @pause="cancelPendingPlayback"/>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div :class="[$style.header, { [$style.infoShowing]: controlsVisible }]" :inert="!controlsVisible" @pointerenter="onControlsPointerenter" @pointerleave="controlsHovered = false" @click.self="!expanded && closeThis()">
		<div :class="$style.title" class="_acrylic">
			<button class="_button" :class="$style.titleButton" :aria-label="i18n.ts.menu" @click="openMenu"><i class="ti ti-dots" aria-hidden="true"></i></button>
			<div :class="$style.titleText">
				<MkCondensedLine :minScale="0.5">{{ content.filename }}</MkCondensedLine>
			</div>
			<button class="_button" :class="$style.titleButton" :aria-label="i18n.ts.close" @click="closeThis"><i class="ti ti-x" aria-hidden="true"></i></button>
		</div>
	</div>
</div>
</template>

<script lang="ts">
import * as Misskey from 'misskey-js';

type Size = {
	width: number;
	height: number;
};

type Rect = Size & {
	left: number;
	top: number;
};

export type Content = {
	id: string;
	type: 'image' | 'video' | 'audio';
	url: string;
	thumbnailUrl?: string | null;
	width?: number | null;
	height?: number | null;
	filename?: string | null;
	file?: Misskey.entities.DriveFile;
	sourceElement?: HTMLElement | null;
};

export function calculateSourceTransform({
	fit,
	contentRenderingRect,
	sourceRect,
}: {
	fit: string;
	contentRenderingRect: Rect;
	sourceRect: Rect;
}): { x: number; y: number; scale: number } {
	const scale = fit === 'cover'
		? Math.max(sourceRect.width / contentRenderingRect.width, sourceRect.height / contentRenderingRect.height)
		: Math.min(sourceRect.width / contentRenderingRect.width, sourceRect.height / contentRenderingRect.height);

	const sourceContentWidth = contentRenderingRect.width * scale;
	const sourceContentHeight = contentRenderingRect.height * scale;
	const sourceContentLeft = sourceRect.left + (sourceRect.width - sourceContentWidth) / 2;
	const sourceContentTop = sourceRect.top + (sourceRect.height - sourceContentHeight) / 2;

	return {
		x: sourceContentLeft - contentRenderingRect.left * scale,
		y: sourceContentTop - contentRenderingRect.top * scale,
		scale,
	};
}
</script>

<script lang="ts" setup>
import MkMediaPlayIcon from '@/components/MkMediaPlayIcon.vue';
import { computed, nextTick, ref, useTemplateRef, markRaw, watch, provide, onBeforeUnmount } from 'vue';
import MkBlurhash from '@/components/MkBlurhash.vue';
import XControl from './MkLightbox.item.controls.vue';
import XAudioVisualizer from './MkLightbox.item.audio-visualizer.vue';
import XFileInfo from './MkLightbox.item.fileinfo.vue';
import type { MenuItem } from '@/types/menu.js';
import { DI } from '@/di.js';
import * as os from '@/os.js';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';
import { shouldHideFileByDefault, canRevealFile } from '@/utility/sensitive-file.js';
import { makeDoubleTapDetector } from '@/utility/double-tap.js';
import { deviceKind } from '@/utility/device-kind.js';
import { isTouchUsing } from '@/utility/touch.js';
import { getFileMenu } from '@/utility/get-file-menu.js';

const props = withDefaults(defineProps<{
	content: Content;
	user?: Misskey.entities.User | null; // DriveFileのuserはnullになることがある。その場合に使用する所有者情報
	activated: boolean;
	initiallyRevealed?: boolean;
}>(), {
	initiallyRevealed: false,
});

const emit = defineEmits<{
	(ev: 'close'): void;
	(ev: 'horizontalSwipe', offset: number): void;
	(ev: 'next'): void;
	(ev: 'prev'): void;
	(ev: 'cancelHorizontalSwipe'): void;
	(ev: 'expandedChange', expanded: boolean): void;
}>();

// 一回のビューワー操作内では状態を維持するためにmodelで親に伝えて親で状態を保持する
// TODO: drivefileのproperties側にピクセルアートかどうかのフラグを立ててそちらを元にデフォルトの挙動を決めるようにする
const pixelatedZoom = defineModel<boolean>('pixelatedZoom', { required: true });

const rootEl = useTemplateRef('rootEl');
const mainEl = useTemplateRef('mainEl');
const transformerEl = useTemplateRef('transformerEl');
const contentEl = useTemplateRef('contentEl');
const videoEl = useTemplateRef('videoEl');
const audioEl = useTemplateRef('audioEl'); // ネイティブUI時
const audioVisualizer = useTemplateRef<InstanceType<typeof XAudioVisualizer>>('audioVisualizer'); // ネイティブUIじゃない場合
const mediaControl = useTemplateRef<InstanceType<typeof XControl>>('mediaControl');

const mediaEl = computed<HTMLVideoElement | HTMLAudioElement | null>(() => {
	if (props.content.type === 'video') {
		return videoEl.value;
	} else if (props.content.type === 'audio') {
		if (prefer.s.useNativeUiForVideoAudioPlayer) {
			return audioEl.value;
		} else {
			return audioVisualizer.value?.audioEl ?? null;
		}
	} else {
		return null;
	}
});

provide(DI.mkLightboxItemMediaEl, mediaEl);

const originalContentLoaded = ref(false);
const thumbnailContentLoaded = ref(false);
const enableTransition = ref(false);
const infoShowing = ref(false);
const active = ref(props.activated);
const controlsHovered = ref(false);
const controlsFocused = ref(false);
const fileMenuShowing = ref(false);
const controlsVisible = computed(() => active.value && infoShowing.value && !isZooming.value);
const hide = ref(true);
const isMediaControlledByMisskey = computed(() => ['video', 'audio'].includes(props.content.type) && !prefer.s.useNativeUiForVideoAudioPlayer);
const isVideoPlayer = computed(() => props.content.type === 'video' && isMediaControlledByMisskey.value);
// ビジュアライザー使用時は音量の適用をGainNode側が担当する (メディア要素は100%固定にして、波形が音量レベルに依存しないようにするため)
const isVolumeHandledByVisualizer = computed(() => props.content.type === 'audio' && !prefer.s.useNativeUiForVideoAudioPlayer);
const volume = ref(0.5);
const isMediaPlaying = computed(() => mediaControl.value?.isPlaying ?? false);
// onActive() より前の初回描画も、自動再生の結果が確定するまでは再生ボタンを出さない。
const isPlaybackPending = ref(props.activated && ['video', 'audio'].includes(props.content.type));
const mediaFailed = ref(false);
const isMediaActuallyPlaying = computed(() => mediaControl.value?.isActuallyPlaying ?? false);
const mediaLoadingRequested = computed(() => active.value && !hide.value && !mediaFailed.value && isMediaControlledByMisskey.value && (isPlaybackPending.value || (isMediaPlaying.value && !isMediaActuallyPlaying.value)));
const showMediaLoading = ref(false);
watch([mediaLoadingRequested, mediaEl], ([loading, media], _oldLoading, onCleanup) => {
	showMediaLoading.value = false;
	if (!loading || media == null) return;
	// 要素の準備時間を再生待ちに含めず、
	// CORSフォールバックで要素を差し替えた場合も同じ猶予を設ける。
	// 短い再生開始待ちでは点滅させず、実際に待ち時間が生じた場合のみ知らせる。
	const timer = window.setTimeout(() => { showMediaLoading.value = true; }, 500);
	onCleanup(() => window.clearTimeout(timer));
}, { immediate: true, flush: 'sync' });
const menuShowing = computed(() => fileMenuShowing.value || (mediaControl.value?.menuShowing ?? false));
const webFullscreen = ref(false);
const closingExpanded = ref(false);
const expanded = computed(() => props.content.type === 'video' && (closingExpanded.value || webFullscreen.value || (mediaControl.value?.fullscreen ?? false)));
watch(expanded, value => {
	// 全画面へのサイズ変更時は、ズーム用の強制 reflow と transform アニメーションを避ける。
	cancelMotion();
	isZooming.value = false;
	enableTransition.value = false;
	transform.value = { x: 0, y: 0, scale: 1 };
	emit('expandedChange', value);
});
// 全画面ボタンから舞台へ即座にフォーカスを戻す。Web 全画面から native 全画面への切替も対象。
watch([expanded, () => mediaControl.value?.fullscreen ?? false], () => {
	if (!expanded.value) return;
	void nextTick(() => {
		if (active.value && expanded.value) rootEl.value?.focus({ preventScroll: true });
	});
});
let canOpenAnimation = false;
let openingStarted = false;
let controlsHideTimer: number | null = null;

function clearControlsHideTimer() {
	if (controlsHideTimer == null) return;
	window.clearTimeout(controlsHideTimer);
	controlsHideTimer = null;
}

function showControls() {
	clearControlsHideTimer();
	if (!active.value) return;
	infoShowing.value = true;
	if (!expanded.value || !isMediaActuallyPlaying.value || controlsHovered.value || controlsFocused.value || menuShowing.value || hide.value) return;
	controlsHideTimer = window.setTimeout(() => {
		controlsHideTimer = null;
		// マウスで押したボタンを inert にする前に、Space 操作を受ける舞台へフォーカスを戻す。
		const focused = window.document.activeElement;
		// ネイティブ全画面への遷移で body にフォーカスが移るブラウザにも対応する。
		if (rootEl.value != null && focused !== rootEl.value && (focused == null || focused === window.document.body || focused === window.document.documentElement || rootEl.value.contains(focused))) {
			rootEl.value.focus({ preventScroll: true });
			clearControlsHideTimer();
		}
		infoShowing.value = false;
	}, 2500);
}

function onControlsPointerenter(ev: PointerEvent) {
	if (ev.pointerType === 'touch') return;
	controlsHovered.value = true;
}

function onPlayerPointerdown() {
	controlsFocused.value = false;
	showControls();
}

function onPlayerFocus(ev: FocusEvent) {
	controlsFocused.value = ev.target instanceof HTMLElement && ev.target !== rootEl.value && ev.target.matches(':focus-visible');
	showControls();
}

function onPlayerFocusout() {
	void nextTick(() => {
		const focused = window.document.activeElement;
		controlsFocused.value = focused instanceof HTMLElement && focused !== rootEl.value && !!rootEl.value?.contains(focused) && focused.matches(':focus-visible');
	});
}

function onPlayerKeydown(ev: KeyboardEvent) {
	if (!active.value || !isMediaControlledByMisskey.value || hide.value || menuShowing.value) return;
	showControls();
	if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
	if (ev.key === 'Escape' && exitFullscreen()) {
		ev.preventDefault();
		ev.stopPropagation();
		return;
	}
	if (ev.target instanceof HTMLElement && ev.target.closest('input, textarea, select, [role="slider"], [role="menu"], [contenteditable]:not([contenteditable="false"])')) return;
	if (expanded.value && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) {
		ev.preventDefault();
		ev.stopPropagation();
		if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
			volume.value = Math.max(0, Math.min(1, Math.round((volume.value + (ev.key === 'ArrowUp' ? 0.05 : -0.05)) * 100) / 100));
		} else {
			const el = mediaEl.value;
			if (el != null && Number.isFinite(el.duration)) {
				el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + (ev.key === 'ArrowRight' ? 5 : -5)));
			}
		}
		return;
	}
	if (ev.code !== 'Space' && ev.key !== ' ') return;
	if (ev.target instanceof HTMLElement && ev.target.closest('button, input, textarea, select, a, [role="button"], [role="slider"], [contenteditable]:not([contenteditable="false"])')) return;
	ev.preventDefault();
	ev.stopPropagation();
	if (!ev.repeat) onMediaClick();
}

watch([expanded, isMediaActuallyPlaying, controlsHovered, controlsFocused, menuShowing, active, hide], showControls);

const contentHideFileIcon = computed(() => {
	switch (props.content.type) {
		case 'image':
			return 'ti-photo';
		case 'video':
			return 'ti-movie';
		case 'audio':
			return 'ti-music';
		default:
			return '';
	}
});
const contentHideFileText = computed(() => {
	switch (props.content.type) {
		case 'image':
			return i18n.ts.image;
		case 'video':
			return i18n.ts.video;
		case 'audio':
			return i18n.ts.audio;
		default:
			return '';
	}
});

const videoAspectRatio = ref<number | null>(
	props.content.width != null && props.content.height != null && props.content.width > 0 && props.content.height > 0
		? props.content.width / props.content.height
		: null
);
const playerAspectRatio = computed(() => props.content.type === 'audio' ? 16 / 9 : videoAspectRatio.value ?? 16 / 9);

function onVideoLoadedMetadata() {
	// ドライブ上のメタデータが無い場合に限り、動画自体の初期サイズから縦横比を確定させる
	if (videoAspectRatio.value != null) return;
	if (videoEl.value == null || videoEl.value.videoWidth === 0 || videoEl.value.videoHeight === 0) return;
	videoAspectRatio.value = videoEl.value.videoWidth / videoEl.value.videoHeight;
}

const headerSize = 30;
const footerSize = 80;

const padding = deviceKind === 'smartphone' ? {
	top: Math.max(0, headerSize + 10),
	right: 0,
	bottom: 10,
	left: 0,
} : {
	top: Math.max(30, headerSize + 10),
	right: 30,
	bottom: 30,
	left: 30,
};

type TransformState = { x: number; y: number; scale: number };
type FrameState = TransformState & { opacity: number };
const neutralTransform: TransformState = { x: 0, y: 0, scale: 1 };
const neutralFrame: FrameState = { ...neutralTransform, opacity: 1 };
const motionEasing = 'cubic-bezier(0.22, 1, 0.36, 1)';
// MkLightbox の leave duration と揃え、親の削除でアニメーションが切れないようにする。
const motionDuration = 200;
let frameAnimation: Animation | null = null;
let frameAnimationFrom = neutralFrame;
let frameAnimationTo = neutralFrame;
let sourceAnimation: Animation | null = null;
let sourceAnimationFrom = neutralTransform;
let sourceAnimationTo = neutralTransform;

function transformCss(value: TransformState) {
	return `translate(${value.x}px, ${value.y}px) scale(${value.scale})`;
}

function interpolateTransform(from: TransformState, to: TransformState, progress: number): TransformState {
	return {
		x: from.x + (to.x - from.x) * progress,
		y: from.y + (to.y - from.y) * progress,
		scale: from.scale + (to.scale - from.scale) * progress,
	};
}

function currentFrameState(): FrameState {
	if (frameAnimation == null) return neutralFrame;
	const progress = frameAnimation.effect?.getComputedTiming().progress ?? 0;
	return {
		...interpolateTransform(frameAnimationFrom, frameAnimationTo, progress),
		opacity: frameAnimationFrom.opacity + (frameAnimationTo.opacity - frameAnimationFrom.opacity) * progress,
	};
}

function cancelFrameAnimation() {
	frameAnimation?.cancel();
	frameAnimation = null;
}

function animateFrame(from: FrameState, to: FrameState, duration = motionDuration) {
	cancelFrameAnimation();
	const frame = contentEl.value;
	if (!prefer.s.animation || frame == null || typeof frame.animate !== 'function') return;
	frameAnimationFrom = from;
	frameAnimationTo = to;
	const animation = frame.animate([
		{ transform: transformCss(from), opacity: from.opacity },
		{ transform: transformCss(to), opacity: to.opacity },
	], { duration, easing: motionEasing });
	frameAnimation = animation;
	animation.addEventListener('finish', () => {
		if (frameAnimation === animation) frameAnimation = null;
	}, { once: true });
}

function currentSourceTransform(): TransformState {
	if (sourceAnimation == null) return { ...transform.value };
	const progress = sourceAnimation.effect?.getComputedTiming().progress ?? 0;
	return interpolateTransform(sourceAnimationFrom, sourceAnimationTo, progress);
}

function cancelSourceAnimation() {
	sourceAnimation?.cancel();
	sourceAnimation = null;
}

function animateSourceTransform(to: TransformState, from = currentSourceTransform()) {
	cancelSourceAnimation();
	enableTransition.value = false;
	transform.value = { ...to };
	const element = transformerEl.value;
	if (!prefer.s.animation || element == null || typeof element.animate !== 'function') return;
	sourceAnimationFrom = from;
	sourceAnimationTo = to;
	const animation = element.animate([
		{ transform: transformCss(from) },
		{ transform: transformCss(to) },
	], { duration: motionDuration, easing: motionEasing });
	sourceAnimation = animation;
	animation.addEventListener('finish', () => {
		if (sourceAnimation === animation) sourceAnimation = null;
	}, { once: true });
}

function cancelMotion() {
	cancelFrameAnimation();
	cancelSourceAnimation();
}

// 全画面はブラウザーの表示領域へ即時切り替える。縦横比の異なる舞台間に
// 拡縮を挟むと映像や操作バーが跳ねるため、メディア自体には追加の効果を掛けない。
watch(() => mediaControl.value?.fullscreen ?? false, cancelFrameAnimation, { flush: 'sync' });
watch(() => prefer.s.animation, cancelMotion);
window.addEventListener('resize', cancelMotion, { passive: true });

// maxからはみ出す場合は縮小、maxに満たない場合は拡大する(contain)
function calcContentRenderingSize(content: Content, full = expanded.value) {
	const ratio = content.type === 'image'
		? content.width != null && content.height != null && content.width > 0 && content.height > 0 ? content.width / content.height : null
		: playerAspectRatio.value;
	if (ratio == null) return null;

	const maxWidth = window.innerWidth - (full ? 0 : padding.left + padding.right);
	const maxHeight = window.innerHeight - (full ? 0 : padding.top + padding.bottom);
	const width = Math.min(maxWidth, maxHeight * ratio);
	const height = width / ratio;

	return { width, height };
}

function getContentRenderingRect(): Rect | null {
	const size = calcContentRenderingSize(props.content);
	if (size == null) return null;
	return {
		left: (window.innerWidth - size.width + (expanded.value ? 0 : padding.left - padding.right)) / 2,
		top: (window.innerHeight - size.height + (expanded.value ? 0 : padding.top - padding.bottom)) / 2,
		...size,
	};
}

const hiddenStyle = computed(() => {
	const contentRenderingSize = calcContentRenderingSize(props.content, false);
	if (contentRenderingSize == null) {
		return {
			width: '100%',
			height: '100%',
		};
	}

	return {
		width: `${contentRenderingSize.width}px`,
		height: `${contentRenderingSize.height}px`,
	};
});

function shouldHideInGallery(content: Content): boolean {
	if (content.file == null) return false;
	const hiddenByDefault = shouldHideFileByDefault(content.file, true);
	if (!hiddenByDefault) return false;

	// 呼び出し元で既にぼかしが解除されているものは初期表示で隠さない
	if (props.initiallyRevealed) {
		return false;
	}

	return true;
}

function isValidRect(rect: Rect | null): rect is Rect {
	return rect != null && rect.width > 0 && rect.height > 0;
}

const transform = ref({ x: 0, y: 0, scale: 1 });

// 元のimg要素の位置・サイズ(とobject-fitの設定値)を取得して、そこからneutralの位置にアニメーションするためのscaleとtranslationを計算する
function getScaleAndTranslationForSourceElement() {
	const sourceElement = props.content.sourceElement;
	const contentRenderingRect = getContentRenderingRect();
	if (sourceElement == null || !isValidRect(contentRenderingRect)) return null;
	const sourceElementRect = sourceElement.getBoundingClientRect();
	if (!isValidRect(sourceElementRect)) return null;

	return calculateSourceTransform({
		fit: window.getComputedStyle(sourceElement).objectFit,
		contentRenderingRect,
		sourceRect: sourceElementRect,
	});
}

if (prefer.s.animation && props.content.sourceElement != null && props.activated) {
	const sourceTransform = getScaleAndTranslationForSourceElement();
	if (sourceTransform != null) {
		transform.value.scale = sourceTransform.scale;
		transform.value.x = sourceTransform.x;
		transform.value.y = sourceTransform.y;
		canOpenAnimation = true;
	}
}

const hideForFallback = ref(prefer.s.animation && !canOpenAnimation);

const isZooming = ref(false);

function clampZoomTransform(nextTransform: { x: number; y: number; scale: number }) {
	if (mainEl.value == null || nextTransform.scale <= 1) {
		return {
			x: 0,
			y: 0,
			scale: nextTransform.scale,
		};
	}

	const panMargin = 24;
	const rect = mainEl.value.getBoundingClientRect();
	const minX = rect.width - rect.width * nextTransform.scale - panMargin;
	const minY = rect.height - rect.height * nextTransform.scale - panMargin;
	const maxX = panMargin;
	const maxY = panMargin;

	return {
		x: Math.min(maxX, Math.max(minX, nextTransform.x)),
		y: Math.min(maxY, Math.max(minY, nextTransform.y)),
		scale: nextTransform.scale,
	};
}

function zoomInTo(x: number, y: number, factor = 1.1, withAnimation = false, clamp = true) {
	if (mainEl.value == null) return;

	const newScale = transform.value.scale * factor;
	isZooming.value = true;

	const rect = mainEl.value.getBoundingClientRect();
	const offsetX = x - rect.left;
	const offsetY = y - rect.top;

	const newTranslationX = offsetX - (offsetX - transform.value.x) * factor;
	const newTranslationY = offsetY - (offsetY - transform.value.y) * factor;

	if (withAnimation) {
		enableTransition.value = true;
	}

	transform.value = clamp
		? clampZoomTransform({
			x: newTranslationX,
			y: newTranslationY,
			scale: newScale,
		})
		: {
			x: newTranslationX,
			y: newTranslationY,
			scale: newScale,
		};
}

function resetToNeutral() {
	if (rootEl.value == null) return;

	isZooming.value = false;
	animateSourceTransform(neutralTransform);
}

function closeThis() {
	if (!active.value) return;
	const sourceFrom = currentSourceTransform();
	const frameFrom = currentFrameState();
	const sourceTransform = getScaleAndTranslationForSourceElement();
	closingExpanded.value = expanded.value;
	cancelVideoSurfaceClick();
	active.value = false;
	cancelMotion();
	clearControlsHideTimer();
	// 閉じるアニメーション中もコンポーネントは残るため、unmount を待たず停止する。
	cancelPendingPlayback();
	mediaEl.value?.pause();
	mediaControl.value?.cancelFullscreen();
	emit('close');

	infoShowing.value = false;

	if (rootEl.value == null) return;

	if (sourceTransform != null) {
		// 全画面への遷移中に閉じた場合も、現在の共通フレームを起点にする。
		const centerX = window.innerWidth / 2 + (expanded.value ? 0 : (padding.left - padding.right) / 2);
		const centerY = window.innerHeight / 2 + (expanded.value ? 0 : (padding.top - padding.bottom) / 2);
		animateSourceTransform(sourceTransform, {
			x: sourceFrom.x + sourceFrom.scale * (frameFrom.x + centerX * (1 - frameFrom.scale)),
			y: sourceFrom.y + sourceFrom.scale * (frameFrom.y + centerY * (1 - frameFrom.scale)),
			scale: sourceFrom.scale * frameFrom.scale,
		});
	} else {
		hideForFallback.value = true;
		animateFrame(frameFrom, { ...neutralFrame, scale: 0.98, opacity: 0 });
	}
}

function onWheel(event: WheelEvent) {
	event.preventDefault();
	if (expanded.value) return;

	const delta = event.deltaY;

	const scaleFactor = 1.1;
	const scale = delta > 0 ? 1 / scaleFactor : scaleFactor;

	const newScale = transform.value.scale * scale;

	if (newScale < 1) {
		transform.value.scale = 1;
		transform.value.x = 0;
		transform.value.y = 0;
		isZooming.value = false;
		return;
	}

	zoomInTo(event.clientX, event.clientY, scale);
}

function onZoomGesture(ev: { delta: number; centerX: number; centerY: number }) {
	zoomInTo(ev.centerX, ev.centerY, 1 + ev.delta / 200, false, false);
}

function onZoomGestureEnd() {
	if (transform.value.scale < 1) {
		isZooming.value = false;
		resetToNeutral();
		return;
	}

	const clampedTransform = clampZoomTransform(transform.value);
	if (clampedTransform.x === transform.value.x && clampedTransform.y === transform.value.y && clampedTransform.scale === transform.value.scale) {
		return;
	}

	enableTransition.value = true;
	transform.value = clampedTransform;
}

/** 縦・横どちらのスワイプかを確定させるのに必要な、開始点からの移動量 (px) */
const AXIS_SWIPE_HYSTERISIS = 10;
/** スワイプが成立する速度 (px/ms) */
const MIN_VELOCITY_TO_SWIPE = 0.5;
/**縦スワイプで閉じるのに必要な移動量の、ビューポート高の1/3に対する比 */
const MIN_RATIO_TO_CLOSE = 0.4;
/** 横スワイプで前後のコンテンツに移動するのに必要な移動量 (px) */
const HORIZONTAL_SWIPE_DISTANCE_THRESHOLD = 150;
/** 速度を平均する時間窓 (ms) */
const VELOCITY_WINDOW = 100;

let isDragging = false;
let isClick = false;
let clickAction: 'hidden' | 'media' | null = null;
let lastX = 0;
let lastY = 0;
let currentPointerId: number | null = null;
let currentPointerStartOffset = { x: 0, y: 0 };
let isVerticalSwiping = false;
let isHorizontalSwiping = false;
let horizontalSwipeDelta = 0;
/** 軸が確定した時点のポインタ位置。ここを基準にスワイプ量を測ることで、確定時に描画が飛ぶのを防ぐ */
let swipeOrigin = { x: 0, y: 0 };

const pointerEventCache = new Map<number, PointerEvent>();
let pointerVec = { x: 0, y: 0 };

// 単発のpointermoveの増分から速度を求めると、表示のリフレッシュレートを超える頻度で
// pointermoveを発火する環境では値が暴れるため、直近VELOCITY_WINDOW msの平均を取る
let velocitySamples: { time: number; x: number; y: number }[] = [];

function pushVelocitySample(time: number, x: number, y: number) {
	velocitySamples.push({ time, x, y });
	while (velocitySamples.length > 2 && time - velocitySamples[0].time > VELOCITY_WINDOW) {
		velocitySamples.shift();
	}
}

function getVelocity(now: number): { x: number; y: number } {
	if (velocitySamples.length < 2) return { x: 0, y: 0 };

	const latest = velocitySamples[velocitySamples.length - 1];

	// 指を止めたまま離した場合、pointermoveが発火しなくなる環境 (iOS・マウス) では直前のフリックの速度が
	// 残り続けてしまい、静止状態で離したのにスワイプが成立してしまう。最後のサンプルが古ければ速度なしとして扱う
	if (now - latest.time > VELOCITY_WINDOW) return { x: 0, y: 0 };

	const oldest = velocitySamples[0];
	const duration = latest.time - oldest.time;
	if (duration <= 0) return { x: 0, y: 0 };

	return {
		x: (latest.x - oldest.x) / duration,
		y: (latest.y - oldest.y) / duration,
	};
}

function resolveClickAction(target: EventTarget | null): 'hidden' | 'media' | null {
	if (!(target instanceof Element)) return null;

	const action = target.closest('[data-gallery-click-action]')?.getAttribute('data-gallery-click-action');
	if (action === 'hidden' || action === 'media') {
		return action;
	}

	return null;
}

function onPointerdown(ev: PointerEvent) {
	if (expanded.value) return;
	if (mainEl.value == null) return;
	pointerEventCache.set(ev.pointerId, ev);
	mainEl.value.setPointerCapture(ev.pointerId);

	isDragging = true;
	isClick = true;
	clickAction = resolveClickAction(ev.target);
	lastX = ev.clientX;
	lastY = ev.clientY;
	pointerVec = { x: 0, y: 0 };
	velocitySamples = [];
	horizontalSwipeDelta = 0;
	// スワイプで閉じた直後はitemがv-showで残ったままなので (MkLightbox.vue参照)、閉じるアニメーション中に
	// 触るとロック済みの軸が引き継がれてヒステリシスを経ずにスワイプが始まってしまう。ここで必ず解除する
	isVerticalSwiping = false;
	isHorizontalSwiping = false;
	swipeOrigin = { x: ev.clientX, y: ev.clientY };
	if (currentPointerId == null) {
		currentPointerId = ev.pointerId;
		currentPointerStartOffset = {
			x: ev.clientX,
			y: ev.clientY,
		};
		// pointerdown自体を最初のサンプルとして積む。これがないとpointermoveが1回しか発生しないような
		// 素早いフリックでサンプルが1つしか溜まらず、速度が常に0と評価されてスワイプが成立しない
		pushVelocitySample(ev.timeStamp, ev.clientX, ev.clientY);
	}
}

let prevTwoTouchPointsDistance = 0;

function onPointermove(ev: PointerEvent) {
	const currentTime = ev.timeStamp;

	if (pointerEventCache.size === 0) {
		return;
	}

	pointerEventCache.set(ev.pointerId, ev);

	if (pointerEventCache.size > 1) { // 2本指での操作
		pointerVec = { x: 0, y: 0 };
		currentPointerId = null;
		isVerticalSwiping = false;
		isHorizontalSwiping = false;
		isClick = false;
		const a = Array.from(pointerEventCache.values())[0];
		const b = Array.from(pointerEventCache.values())[1];
		const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
		if (prevTwoTouchPointsDistance > 0) {
			const delta = distance - prevTwoTouchPointsDistance;
			onZoomGesture({ delta, centerX: (a.clientX + b.clientX) / 2, centerY: (a.clientY + b.clientY) / 2 });
		}
		prevTwoTouchPointsDistance = distance;
		return;
	}

	prevTwoTouchPointsDistance = 0;

	if (currentPointerId === ev.pointerId) {
		const deltaX = ev.clientX - lastX;
		const deltaY = ev.clientY - lastY;

		if (Math.abs(ev.clientX - currentPointerStartOffset.x) > 5 || Math.abs(ev.clientY - currentPointerStartOffset.y) > 5) {
			isClick = false;
		}

		if (isZooming.value) {
			transform.value = clampZoomTransform({
				x: transform.value.x + deltaX,
				y: transform.value.y + deltaY,
				scale: transform.value.scale,
			});
		} else {
			if (isVerticalSwiping) {
				transform.value.y += deltaY;
			} else if (isHorizontalSwiping) {
				horizontalSwipeDelta = ev.clientX - swipeOrigin.x;
				emit('horizontalSwipe', horizontalSwipeDelta);
			} else {
				// 軸を確定させるまでは、開始点からの累積移動量で毎回評価し直す。
				const totalX = ev.clientX - currentPointerStartOffset.x;
				const totalY = ev.clientY - currentPointerStartOffset.y;
				const diff = Math.abs(totalX) - Math.abs(totalY);

				if (diff !== 0) {
					// 完全に同値の場合はどちらにもロックしない
					const isVerticalVector = diff < 0;
					const dominantDelta = isVerticalVector ? totalY : totalX;

					// 意図が読み取れる程度に動いてからロックする
					if (Math.abs(dominantDelta) >= AXIS_SWIPE_HYSTERISIS) {
						swipeOrigin = { x: ev.clientX, y: ev.clientY };
						if (isVerticalVector) {
							isVerticalSwiping = true;
						} else {
							isHorizontalSwiping = true;
						}
					}
				}
			}
		}

		pushVelocitySample(currentTime, ev.clientX, ev.clientY);
		pointerVec = getVelocity(currentTime);

		lastX = ev.clientX;
		lastY = ev.clientY;
	}

	return false;
}

function onPointerup(ev: PointerEvent) {
	if (mainEl.value == null) return;
	pointerEventCache.delete(ev.pointerId);
	mainEl.value.releasePointerCapture(ev.pointerId);
	prevTwoTouchPointsDistance = 0;
	isDragging = false;
	if (currentPointerId === ev.pointerId) {
		currentPointerId = null;

		// 離した時点で取り直す。指を止めたまま離した場合はここで速度が0になり、
		// 直前のフリックの速度で誤ってスワイプが成立するのを防ぐことができる
		pointerVec = getVelocity(ev.timeStamp);

		// 判定にはジェスチャー開始点からの総移動量を使う。描画用のdelta (transform.y / horizontalSwipeDelta) は
		// 軸が確定した地点を基準にしており、確定までのヒステリシス分と確定したpointermove自体の移動量を含まないため、
		// pointermoveが1回しか発生しないような素早いフリックがそのまま握り潰されてしまう
		const totalSwipeX = ev.clientX - currentPointerStartOffset.x;
		const totalSwipeY = ev.clientY - currentPointerStartOffset.y;

		if (isVerticalSwiping) {
			const closeThreshold = (window.innerHeight / 3) * MIN_RATIO_TO_CLOSE;
			const shouldCloseByUpwardSwipe = totalSwipeY < -closeThreshold || (totalSwipeY < 0 && pointerVec.y < -MIN_VELOCITY_TO_SWIPE); // 上の方で離された、または上に向かって強めに弾かれた
			const shouldCloseByDownwardSwipe = totalSwipeY > closeThreshold || (totalSwipeY > 0 && pointerVec.y > MIN_VELOCITY_TO_SWIPE); // 下の方で離された、または下に向かって強めに弾かれた
			if (shouldCloseByUpwardSwipe || shouldCloseByDownwardSwipe) {
				closeThis();
				return;
			}

			resetToNeutral();
		} else if (isHorizontalSwiping) {
			const shouldNext = totalSwipeX < -HORIZONTAL_SWIPE_DISTANCE_THRESHOLD || (totalSwipeX < 0 && pointerVec.x < -MIN_VELOCITY_TO_SWIPE); // 左の方で離された、または左に向かって強めに弾かれた
			const shouldPrev = totalSwipeX > HORIZONTAL_SWIPE_DISTANCE_THRESHOLD || (totalSwipeX > 0 && pointerVec.x > MIN_VELOCITY_TO_SWIPE); // 右の方で離された、または右に向かって強めに弾かれた
			if (shouldNext) {
				emit('next');
			} else if (shouldPrev) {
				emit('prev');
			} else {
				emit('cancelHorizontalSwipe');
			}
		}
	}
	isVerticalSwiping = false;
	isHorizontalSwiping = false;

	onZoomGestureEnd();
}

const doubleTapDetector = makeDoubleTapDetector((ev) => {
	pointerVec = { x: 0, y: 0 };

	if (isZooming.value) {
		isZooming.value = false;
		resetToNeutral();
	} else {
		isZooming.value = true;
		zoomInTo(ev.touches[0].clientX, ev.touches[0].clientY, 2, true);
	}
});

// これがないと例えばiOSで画像長押しでのコンテキストメニューを表示させた後にそれを閉じるとタッチ判定が残ったままになり不具合の原因になる
function cancelPointerGesture() {
	const wasVerticalSwiping = isVerticalSwiping;
	const wasHorizontalSwiping = isHorizontalSwiping;

	pointerEventCache.clear();
	prevTwoTouchPointsDistance = 0;
	currentPointerId = null;
	isDragging = false;
	isClick = false;
	clickAction = null;
	pointerVec = { x: 0, y: 0 };
	velocitySamples = [];
	horizontalSwipeDelta = 0;
	swipeOrigin = { x: 0, y: 0 };
	isVerticalSwiping = false;
	isHorizontalSwiping = false;
	doubleTapDetector.reset();

	if (wasVerticalSwiping) resetToNeutral();
	if (wasHorizontalSwiping) emit('cancelHorizontalSwipe');
}

function onTouchstart(ev: TouchEvent) {
	if (expanded.value) return;
	doubleTapDetector.onTouchstart(ev);
}

function onTouchmove(ev: TouchEvent) {
	doubleTapDetector.onTouchmove(ev);

	// スワイプ操作中は、ブラウザがタッチを慣性スクロールとして認識するのを防ぐためにpreventDefaultする必要がある
	// touch-action: noneが指定されているが、それだけではブラウザによっては慣性スクロールが発生した扱いになり、
	// その後のタップが慣性スクロールを止めるためのタップという扱いで握りつぶされてしまうことがあるので必要
	if (isVerticalSwiping || isHorizontalSwiping || isZooming.value || pointerEventCache.size > 1) {
		ev.preventDefault();
	}
}

//#region inertia
let rafHandle: ReturnType<typeof window['requestAnimationFrame']> | null = null;
let latestInertiaTimeStamp = 0;
const inertiaFactor = 0.9;

function updateInertia(timeStamp: number) {
	rafHandle = window.requestAnimationFrame(updateInertia);
	const timeDelta = timeStamp - latestInertiaTimeStamp;
	latestInertiaTimeStamp = timeStamp;
	if (timeDelta > 100) return;

	if (isDragging) return;
	if (!isZooming.value) return;
	if (Math.abs(pointerVec.x) < 0.01 && Math.abs(pointerVec.y) < 0.01) return;
	transform.value = clampZoomTransform({
		x: transform.value.x + pointerVec.x * timeDelta,
		y: transform.value.y + pointerVec.y * timeDelta,
		scale: transform.value.scale,
	});
	pointerVec.x *= inertiaFactor ** (timeDelta / 16.67);
	pointerVec.y *= inertiaFactor ** (timeDelta / 16.67);
}

watch(isZooming, () => {
	pointerVec = { x: 0, y: 0 };
	if (isZooming.value) {
		rafHandle = window.requestAnimationFrame(updateInertia);
	} else {
		if (rafHandle != null) window.cancelAnimationFrame(rafHandle);
	}
});
//#endregion

function animateFromSourceToNeutral() {
	if (openingStarted || !active.value || contentEl.value == null) return;
	openingStarted = true;
	const wasHidden = hideForFallback.value;
	hideForFallback.value = false;
	const sourceElement = props.content.sourceElement;
	if (canOpenAnimation) {
		animateSourceTransform(neutralTransform);
	} else if (wasHidden) {
		animateFrame({ ...neutralFrame, scale: 0.98, opacity: 0 }, neutralFrame);
	}
	if (sourceElement != null) sourceElement.style.visibility = 'hidden';
}

watch(() => props.content, (newContent) => {
	hide.value = shouldHideInGallery(newContent);
}, { deep: true, immediate: true });

watch(contentEl, (frame) => {
	if (frame == null) return;
	infoShowing.value = true;
	if (active.value) animateFromSourceToNeutral();
	else hideForFallback.value = false;
}, { flush: 'post' });

function onClick(ev: MouseEvent) {
	if (!isClick) return;

	const action = clickAction ?? resolveClickAction(ev.target);
	clickAction = null;

	if (action === 'hidden') {
		void onHiddenClick();
		return;
	}

	if (action === 'media') {
		onMediaSurfaceClick(ev);
		return;
	}

	if (expanded.value && !hide.value && isMediaControlledByMisskey.value) {
		onMediaSurfaceClick(ev);
		return;
	}

	if (!isTouchUsing) {
		if (isZooming.value) {
			isZooming.value = false;
			resetToNeutral();
		} else {
			closeThis();
		}
	}
}

// Keep user intent separate from play() promises and media buffering events.
let playbackRequest = 0;
let wantsPlayback = false;
let playInFlight = false;
let stopWaitingForMedia: (() => void) | null = null;

function cancelPendingPlayback() {
	playbackRequest++;
	wantsPlayback = false;
	playInFlight = false;
	stopWaitingForMedia?.();
	stopWaitingForMedia = null;
	isPlaybackPending.value = false;
	audioVisualizer.value?.cancelPlayback();
}

function failPlayback() {
	if (!active.value) return;
	cancelPendingPlayback();
	mediaFailed.value = true;
	mediaEl.value?.pause();
}

function onPlaybackError(err: unknown) {
	if (!active.value) return;
	if (err instanceof Error && err.name === 'NotAllowedError') {
		cancelPendingPlayback();
	} else if (!(err instanceof Error && err.name === 'AbortError')) {
		failPlayback();
	}
}

function safePlay(el: HTMLMediaElement) {
	if (!active.value) return;
	const request = ++playbackRequest;
	wantsPlayback = true;
	playInFlight = true;
	mediaFailed.value = false;
	isPlaybackPending.value = true;
	let interrupted = false;
	el.play().catch(err => {
		interrupted = err instanceof Error && err.name === 'AbortError';
		if (request === playbackRequest && el === mediaEl.value) onPlaybackError(err);
	}).finally(() => {
		if (request !== playbackRequest) return;
		playInFlight = false;
		if (!interrupted && el.error == null && el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) isPlaybackPending.value = false;
	});
}

function retryPlayback() {
	const el = mediaEl.value;
	if (!active.value || el == null) return;
	cancelPendingPlayback();
	mediaFailed.value = false;
	el.load();
	safePlay(el);
}

watch(mediaEl, (el, _oldEl, onCleanup) => {
	if (el == null) return;
	const controller = new AbortController();
	const on = (name: string, handler: () => void) => el.addEventListener(name, handler, { signal: controller.signal });
	on('canplay', () => {
		if (active.value && !hide.value && wantsPlayback && !playInFlight && el.paused && !mediaFailed.value) safePlay(el);
	});
	on('playing', () => { isPlaybackPending.value = false; mediaFailed.value = false; });
	on('ended', cancelPendingPlayback);
	on('pause', () => { if (!isPlaybackPending.value && el.error == null) wantsPlayback = false; });
	// The visualizer handles its first CORS failure before emitting a terminal load error.
	if (props.content.type !== 'audio' || prefer.s.useNativeUiForVideoAudioPlayer) on('error', () => { if (el.error != null) failPlayback(); });
	onCleanup(() => controller.abort());
}, { flush: 'post' });

function playWhenAvailable() {
	if (!active.value) return;
	cancelPendingPlayback();
	if (!['video', 'audio'].includes(props.content.type)) return;
	isPlaybackPending.value = true;
	if (mediaEl.value != null) {
		safePlay(mediaEl.value);
		return;
	}

	// 非表示メディアを公開した直後は、Vue の描画前で要素が無い可能性がある。
	stopWaitingForMedia = watch(mediaEl, (newMediaEl) => {
		if (newMediaEl == null) return;
		safePlay(newMediaEl);
		stopWaitingForMedia?.();
		stopWaitingForMedia = null;
	});
}

async function onHiddenClick() {
	if (!active.value || !hide.value) return;
	const request = playbackRequest;
	const allowed = props.content.file == null || await canRevealFile(props.content.file);
	// 確認ダイアログを待つ間に閉じたり別の項目へ移った場合、古い結果で再生を開始しない。
	if (!allowed || !active.value || request !== playbackRequest || !hide.value) return;
	hide.value = false;
	if (['audio', 'video'].includes(props.content.type)) {
		playWhenAvailable();
	}
}

let videoClickTimer: number | null = null;

function cancelVideoSurfaceClick() {
	if (videoClickTimer == null) return;
	window.clearTimeout(videoClickTimer);
	videoClickTimer = null;
}

function onMediaSurfaceClick(ev: MouseEvent) {
	if (!active.value) return;
	const el = mediaEl.value;
	if (props.content.type === 'video' && el != null && !prefer.s.useNativeUiForVideoAudioPlayer) {
		cancelVideoSurfaceClick();
		showControls();
		if (ev.detail === 0) {
			// キーボード・支援技術によるクリックは待たずに実行する。
			onMediaClick();
		} else if (ev.detail === 1) {
			// 全画面のダブルクリックで一時停止・再生を繰り返さない。
			// 中央ボタンも判定が終わるまで残るので、同じ要素で dblclick を受け取れる。
			videoClickTimer = window.setTimeout(() => {
				videoClickTimer = null;
				if (active.value && mediaEl.value === el) onMediaClick();
			}, 250);
		}
	} else {
		onMediaClick();
	}
	if (isMediaControlledByMisskey.value) rootEl.value?.focus({ preventScroll: true });
}

function onVideoDoubleClick(ev: MouseEvent) {
	if (!active.value || hide.value || props.content.type !== 'video' || prefer.s.useNativeUiForVideoAudioPlayer) return;
	ev.preventDefault();
	ev.stopPropagation();
	cancelVideoSurfaceClick();
	showControls();
	void mediaControl.value?.toggleFullscreen();
}

function onMediaClick() {
	cancelVideoSurfaceClick();
	if (!active.value || hide.value) return;
	showControls();
	if (!prefer.s.useNativeUiForVideoAudioPlayer) {
		if (mediaEl.value == null) return;
		if (mediaFailed.value) { retryPlayback(); return; }

		if (mediaEl.value.paused && !isPlaybackPending.value) {
			safePlay(mediaEl.value);
		} else {
			cancelPendingPlayback();
			mediaEl.value.pause();
		}
	}
}

function onMediaContextMenu(ev: PointerEvent) {
	cancelPointerGesture();
	if (!isMediaControlledByMisskey.value || hide.value || mediaControl.value == null) return;
	ev.stopPropagation();
	mediaControl.value.showContextMenu(ev);
}

function openMenu(ev: PointerEvent) {
	const menu: MenuItem[] = [];

	// isTouchUsingにする？
	menu.push({
		type: 'component',
		component: markRaw(XFileInfo),
		props: {
			content: props.content,
		},
	}, {
		type: 'divider',
	});

	if (props.content.type === 'image') {
		menu.push({
			type: 'switch',
			text: i18n.ts.pixelatedZoom,
			icon: 'ti ti-grain',
			ref: pixelatedZoom,
		});
	}

	menu.push({
		text: i18n.ts.hide,
		icon: 'ti ti-eye-off',
		action: () => {
			hide.value = true;
		},
	});

	if (props.content.file != null) {
		const fileMenu = getFileMenu(props.content.file);
		if (fileMenu.length > 0) {
			menu.push({ type: 'divider' });
			menu.push(...fileMenu);
		}
	}

	fileMenuShowing.value = true;
	os.popupMenu(menu, (ev.currentTarget ?? ev.target ?? undefined) as HTMLElement | undefined, {
		onClosing: () => { fileMenuShowing.value = false; },
	});
}

function onActive() {
	cancelVideoSurfaceClick();
	active.value = true;
	closingExpanded.value = false;
	showControls();
	playWhenAvailable();
	void nextTick(() => {
		if (active.value && isMediaControlledByMisskey.value) rootEl.value?.focus({ preventScroll: true });
	});
}

function exitFullscreen() {
	if (mediaControl.value?.exitFullscreen()) return true;
	if (!webFullscreen.value) return false;
	webFullscreen.value = false;
	return true;
}

function onDeactive() {
	cancelVideoSurfaceClick();
	active.value = false;
	cancelMotion();
	closingExpanded.value = false;
	controlsHovered.value = false;
	controlsFocused.value = false;
	clearControlsHideTimer();
	cancelPendingPlayback();
	webFullscreen.value = false;
	mediaControl.value?.cancelFullscreen();
	if (isZooming.value) {
		isZooming.value = false;
		resetToNeutral();
	}
	if (mediaEl.value != null && props.activated) {
		mediaEl.value.pause();
	}
}

onBeforeUnmount(() => {
	cancelVideoSurfaceClick();
	active.value = false;
	cancelMotion();
	window.removeEventListener('resize', cancelMotion);
	clearControlsHideTimer();
	cancelPendingPlayback();
	mediaEl.value?.pause();
	mediaControl.value?.cancelFullscreen();
	if (rafHandle) {
		window.cancelAnimationFrame(rafHandle);
	}
});

defineExpose({
	menuShowing,
	onActive,
	onDeactive,
	closeThis,
	exitFullscreen,
});
</script>

<style lang="scss" module>
.root {
	position: absolute;
	width: 100%;
	height: 100%;
	container-type: size;
}

.main {
	position: absolute;
	touch-action: none;
	width: 100%;
	height: 100%;
}

.content {
	display: block;
	user-select: none;
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	margin: auto;
	width: 100%;
	height: 100%;
	object-fit: contain;
	cursor: pointer;
}

.pixelatedZoom {
	image-rendering: pixelated;
}

.video {
	display: block;
	user-select: none;
	position: absolute;
	top: 50%;
	left: 50%;
	translate: -50% -50%;
	width: 100%;
	height: 100%;
	object-fit: contain;
	transform-origin: center;
	// 画面全体がクリック（再生/一時停止）・ダブルクリック（全画面）の対象なので手型にする
	cursor: pointer;
	border-radius: 2px;
}

.videoSized {
	width: min(100cqw, calc(100cqh * v-bind("videoAspectRatio ?? 16 / 9")));
	height: auto;
	background-color: #000;
	aspect-ratio: v-bind("videoAspectRatio ?? 16 / 9");
}

.audioRoot {
	width: 100%;
	height: 100%;
	margin: 0 auto;
	max-width: calc(100vw - 140px);
	display: flex;
	align-items: center;
	justify-content: center;
}

.audio {
	width: 100%;
}

.mediaPlayer .audioVisualizer {
	border-radius: var(--MI-radius);
}

.loading {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	z-index: 2;
	display: grid;
	place-items: center;
	pointer-events: none;
}

.loadingContent {
	padding: 0 16px 12px;
	border-radius: var(--MI-radius);
	background: color-mix(in srgb, var(--MI-mediaStageBg, var(--MI_THEME-panel)) 85%, transparent);
	color: var(--MI-mediaStageFg, var(--MI_THEME-fg));
	font-size: 85%;
	text-align: center;
}

.retryButton {
	display: block;
	margin: 12px auto 0;
	padding: 8px 16px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	pointer-events: auto;
}

.transformer {
	width: 100%;
	height: 100%;
	box-sizing: border-box;
	padding: v-bind("padding.top + 'px'") v-bind("padding.right + 'px'") v-bind("padding.bottom + 'px'") v-bind("padding.left + 'px'");
	transform-origin: left top;
}

.animated .transition {
	transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}

.contentWrapper {
	position: relative;
	width: 100%;
	height: 100%;
	// .videoSizedが使う100cqw / 100cqhの基準 (= paddingを除いた実際の表示領域)
	container-type: size;
}

.hideForFallback {
	transform: scale(0.98);
	opacity: 0;
}

.playIconWrapper {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	display: grid;
	place-items: center;
	pointer-events: none;
}

.playIcon {
	display: grid;
	place-items: center;
	--MI-mediaPlaySize: 64px;
	width: var(--MI-mediaPlaySize);
	height: var(--MI-mediaPlaySize);
	border-radius: 0;
	font-size: var(--MI-mediaPlaySize);
	background: none;
	color: var(--MI_THEME-accent);
	pointer-events: auto;
	cursor: pointer;
	scale: 1;

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 4px;
	}
}

.animated .playIcon {
	> span {
		transition: scale 160ms ease-out;
	}

	&:is(:hover, :focus-visible) > span {
		--MI-mediaPlayHover: 1;
		scale: 1.12;
	}

	&:active > span {
		scale: 0.94;
	}
}

.animated .contentWrapper:has(> .video:hover) .playIcon > span {
	--MI-mediaPlayHover: 1;
	scale: 1.12;
}

.animated .contentWrapper:has(> .video:active) .playIcon > span {
	scale: 0.94;
}

.hidden {
	position: absolute;
	inset: 0;
	margin: auto;
	display: grid;
	place-items: center;
	width: 100%;
	height: 100%;
	overflow: clip;

	&.sensitive::after {
		content: "";
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		border-radius: inherit;
		box-shadow: inset 0 0 0 4px var(--MI_THEME-warn);
	}
}

.hiddenWrapper {
	position: relative;
	width: 100%;
	max-height: 100%;
	min-height: 0;
}

.hiddenBlurhash {
	display: block;
	width: 100%;
	height: 100%;
	filter: brightness(0.7);
}

.hiddenThumbnail {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: contain;
	filter: brightness(0.7);
}

.hiddenPlaceholder {
	width: 100%;
	height: auto;
	aspect-ratio: 16 / 9;
	background: #000;
}

.hiddenText {
	position: absolute;
	left: 0;
	top: 0;
	width: 100%;
	height: 100%;
	z-index: 1;
	display: flex;
	justify-content: center;
	align-items: center;
	text-align: center;
	cursor: pointer;
	color: #fff;

	&.withBlur {
		backdrop-filter: blur(12px);
	}
}

.footer {
	position: absolute;
	height: v-bind("footerSize + 'px'");
	opacity: 1;
}
.header {
	position: absolute;
	top: v-bind("-headerSize + 'px'");
	left: 0;
	right: 0;
	height: v-bind("headerSize + 'px'");
	opacity: 0;
}
.animated .header {
	transition: opacity 200ms ease, top 200ms ease;
}
.header.infoShowing {
	top: 0px;
	opacity: 1;
}

.title {
	display: flex;
	align-items: center;
	width: max-content;
	max-width: calc(100% - 20px);
	margin: auto;
	box-sizing: border-box;
	border-radius: 0 0 10px 10px;
	font-size: 85%;
}

.titleButton {
	flex-shrink: 0;
	width: 32px;
	height: 32px;
}

.titleText {
	flex-grow: 1;
	height: 100%;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	padding: 6px 0px;
}

.mediaControl {
	width: 100%;
	height: 100%;
	box-sizing: border-box;
	margin: auto;
}

.mediaPlayer {
	// 動画と操作バーにはテーマに依存しない共通のメディア色を使う。
	--MI-mediaStageBg: #000;
	--MI-mediaStageFg: #fff;
	--MI-mediaSliderBg: color-mix(in srgb, var(--MI-mediaStageFg) 25%, transparent);
	// 映像と同じ contentWrapper 内で配置し、開閉・全画面のアニメーションも共有する。
	--MI-mediaPlayerWidth: min(100cqw, calc(100cqh * v-bind("playerAspectRatio")));
	--MI-mediaPlayerHeight: calc(var(--MI-mediaPlayerWidth) / v-bind("playerAspectRatio"));

	.video {
		border-radius: var(--MI-radius);
	}

	.footer {
		left: 50%;
		right: auto;
		bottom: calc((100cqh - var(--MI-mediaPlayerHeight)) / 2);
		translate: -50% 0;
		width: var(--MI-mediaPlayerWidth);
		border-radius: 0 0 var(--MI-radius) var(--MI-radius);
		color: var(--MI-mediaStageFg);
		text-shadow: 0 1px 3px var(--MI-mediaStageBg);
	}

	.mediaControl {
		container-type: inline-size;
		max-width: none;
		padding: 0 12px 8px;
		background: transparent;
		color: inherit;
		border-radius: inherit;
	}
}

.videoPlayer {
	.footer {
		z-index: 3;
		background: linear-gradient(to top, color-mix(in srgb, var(--MI-mediaStageBg) 85%, transparent), transparent);
		opacity: 0;

		&.infoShowing { opacity: 1; }
	}

	.playIcon {
		color: var(--MI-mediaStageFg);
		filter: drop-shadow(0 2px 8px var(--MI-mediaStageBg));
	}

	&.animated .mediaControl {
		transition: opacity 180ms ease, transform 180ms ease;
	}

	&.animated .footer { transition: opacity 180ms ease; }

	.footer:not(.infoShowing) .mediaControl {
		opacity: 0;
		transform: translateY(6px);
	}
}

.expanded {
	// 映像の黒帯と操作領域を一体化する。メディア専用色はライトテーマでも固定する。
	--MI-mediaHeaderHeight: calc(v-bind("headerSize + 10 + 'px'") + env(safe-area-inset-top));
	--MI-mediaFooterHeight: calc(v-bind("footerSize + 'px'") + env(safe-area-inset-bottom));

	position: fixed;
	inset: 0;
	z-index: 1;
	background: var(--MI-mediaStageBg);
	color: var(--MI-mediaStageFg);

	.transformer {
		padding: 0;
	}

	.header {
		top: 0;
		height: var(--MI-mediaHeaderHeight);
		background: linear-gradient(to bottom, color-mix(in srgb, var(--MI-mediaStageBg) 85%, transparent), transparent);
	}

	.footer {
		left: 0;
		right: 0;
		bottom: 0;
		translate: none;
		width: 100%;
		height: var(--MI-mediaFooterHeight);
		border-radius: 0;
		opacity: 0;

		&.infoShowing {
			opacity: 1;
		}
	}

	.header, .footer {
		text-shadow: 0 1px 3px var(--MI-mediaStageBg);
	}

	&.animated .header, &.animated .footer {
		transition: opacity 200ms ease;
	}

	&.controlsHidden {
		cursor: none;
	}

	.video {
		width: 100%;
		height: 100%;
		aspect-ratio: auto;
		border-radius: 0;
	}

	.title {
		padding-top: env(safe-area-inset-top);
		background: transparent;
		color: var(--MI-mediaStageFg);
		-webkit-backdrop-filter: none;
		backdrop-filter: none;
	}

	.mediaControl {
		max-width: none;
		padding: 0 max(20px, env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
		background: transparent;
		color: var(--MI-mediaStageFg);
		border-radius: 0;
	}
}

@media (prefers-reduced-motion: reduce) {
	.expanded.animated .header, .videoPlayer.animated .footer, .expanded.animated .footer, .videoPlayer.animated .mediaControl, .animated .playIcon > span {
		transition: none;
	}
}
</style>
