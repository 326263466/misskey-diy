<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<!-- durationは子Itemコンポーネントがフェードイン/アウトするdurationと合わせる -->
<Transition
	:enterActiveClass="prefer.s.animation ? $style.transition_root_enterActive : ''"
	:leaveActiveClass="prefer.s.animation ? $style.transition_root_leaveActive : ''"
	:enterFromClass="prefer.s.animation ? $style.transition_root_enterFrom : ''"
	:leaveToClass="prefer.s.animation ? $style.transition_root_leaveTo : ''"
	:duration="{ enter: prefer.s.animation ? openAnimDuration : 0, leave: prefer.s.animation ? closeAnimDuration : 0 }"
	appear
	@afterLeave="onAfterLeave"
>
	<!-- v-ifを使うとfalseになったとき(transitionが行われている間)子コンポーネントの更新が停止するのか子コンポーネントがアニメーションされなくなる -->
	<div v-show="showing" ref="rootEl" v-hotkey.global="keymap" :class="[$style.root, { [$style.animated]: prefer.s.animation, [$style.instantBackdrop]: ['video', 'audio'].includes(contents[currentIndex]?.type ?? '') }]" :style="{ zIndex }">
		<div :class="[$style.bg]" class="_modalBg"></div>
		<div ref="mainEl" :class="$style.main">
			<div
				ref="itemsEl"
				:class="[$style.items, { [$style.itemsTransition]: enableSlideTransition }]"
				:style="{ translate: `${contentsOffset}px 0` }"
				@transitionend.self="onSlideTransitionFinished"
				@transitioncancel.self="onSlideTransitionFinished"
			>
				<div v-for="(content, i) in contents" :key="content.url" ref="itemEl" :class="$style.item">
					<XItem
						:ref="(comp) => { items.set(i, comp as InstanceType<typeof XItem>); }"
						v-model:pixelatedZoom="pixelatedZoom"
						:content="content"
						:user="user"
						:initiallyRevealed="props.initiallyRevealedContentIds?.includes(content.id) ?? false"
						:activated="activatedIndexes.has(i)"
						@close="onItemClose"
						@horizontalSwipe="onHorizontalSwipe"
						@prev="onPrev"
						@next="onNext"
						@cancelHorizontalSwipe="onCancelHorizontalSwipe"
						@expandedChange="expanded = $event"
					/>
				</div>
			</div>

			<button v-if="!expanded && !isTouchUsing && (currentIndex > 0 || navigationFeedback === 'prev')" type="button" class="_button" :class="[$style.prevButton, { [$style.feedback]: navigationFeedback === 'prev', [$style.pressed]: navigationFeedback === 'prev' && navigationPressed }]" :disabled="currentIndex === 0" :aria-label="i18n.ts.goBack" @click="onPrev"><span :class="$style.buttonIcon"><i class="ti ti-arrow-left" aria-hidden="true"></i></span></button>
			<button v-if="!expanded && !isTouchUsing && (currentIndex < contents.length - 1 || navigationFeedback === 'next')" type="button" class="_button" :class="[$style.nextButton, { [$style.feedback]: navigationFeedback === 'next', [$style.pressed]: navigationFeedback === 'next' && navigationPressed }]" :disabled="currentIndex === contents.length - 1" :aria-label="i18n.ts.next" @click="onNext"><span :class="$style.buttonIcon"><i class="ti ti-arrow-right" aria-hidden="true"></i></span></button>
		</div>
	</div>
</Transition>
</template>

<script lang="ts" setup>
import { ref, watch, nextTick, onBeforeUnmount, onMounted, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import XItem from './MkLightbox.item.vue';
import type { Content } from './MkLightbox.item.vue';
import type { Keymap } from '@/utility/hotkey.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { isTouchUsing } from '@/utility/touch.js';
import { focusTrap } from '@/utility/focus-trap.js';

const props = withDefaults(defineProps<{
	defaultIndex?: number;
	contents: Content[];
	initiallyRevealedContentIds?: string[];
	user?: Misskey.entities.User | null; // DriveFileのuserはnullになることがある。その場合に使用する所有者情報
}>(), {
});

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const rootEl = useTemplateRef('rootEl');
const activatedIndexes = ref(new Set<number>());
const items = new Map<number, InstanceType<typeof XItem> | null>();
const currentIndex = ref(props.defaultIndex ?? 0);
const expanded = ref(false);

const pixelatedZoom = ref(false);

watch(currentIndex, (newIndex, oldIndex) => {
	activatedIndexes.value.add(newIndex);

	nextTick(() => {
		if (oldIndex != null && items.has(oldIndex)) {
			items.get(oldIndex)?.onDeactive();
		}
		if (items.has(newIndex)) {
			items.get(newIndex)?.onActive();
		}
	});
}, { immediate: true });

watch(currentIndex, (newIndex) => {
	for (let i = 0; i < props.contents.length; i++) {
		const content = props.contents[i];
		if (content.sourceElement != null) {
			content.sourceElement.style.visibility = i === newIndex ? 'hidden' : '';
		}
	}
}, { immediate: false });

const openAnimDuration = 200;
const closeAnimDuration = 200;
const slideAnimDuration = 300;
const zIndex = os.claimZIndex('high');
const showing = ref(true);
const screenWidth = ref(window.innerWidth);
const contentsOffset = ref(currentIndex.value * -window.innerWidth);
const enableSlideTransition = ref(false);
let currentScrollLeft = contentsOffset.value;

function onResize() {
	screenWidth.value = window.innerWidth;
	enableSlideTransition.value = false;
	currentScrollLeft = currentIndex.value * -screenWidth.value;
	contentsOffset.value = currentScrollLeft;
}

window.addEventListener('resize', onResize, { passive: true });

function onHorizontalSwipe(offset: number) {
	if (currentIndex.value === 0 && offset > 0) { // これ以上戻れない
		contentsOffset.value = currentScrollLeft + (offset / 3);
	} else if (currentIndex.value === props.contents.length - 1 && offset < 0) { // これ以上進めない
		contentsOffset.value = currentScrollLeft + (offset / 3);
	} else {
		contentsOffset.value = currentScrollLeft + offset;
	}
}

function scrollToCurrentIndex() {
	const targetOffset = currentIndex.value * -screenWidth.value;
	currentScrollLeft = targetOffset;

	if (!prefer.s.animation || contentsOffset.value === targetOffset) {
		enableSlideTransition.value = false;
		contentsOffset.value = targetOffset;
		return;
	}

	enableSlideTransition.value = true;
	contentsOffset.value = targetOffset;
}

/** ギャラリーそのものを閉じるための内部処理（閉じる処理を書く場合は `close` か、item内では `closeThis` を使う） */
function closeGallery() {
	showing.value = false;
	if (window.location.hash === '#pswp') {
		window.history.back();
	}
}

function close() {
	const item = items.get(currentIndex.value);
	if (item != null) {
		item.closeThis();
	} else {
		closeGallery();
	}
}

function onSlideTransitionFinished(ev: TransitionEvent) {
	if (ev.propertyName !== 'translate') return;
	enableSlideTransition.value = false;
}

function onCancelHorizontalSwipe() {
	scrollToCurrentIndex();
}

const navigationFeedback = ref<'prev' | 'next' | null>(null);
const navigationPressed = ref(false);
let navigationFeedbackTimer: number | null = null;

function showNavigationFeedback(direction: 'prev' | 'next') {
	if (navigationFeedbackTimer != null) window.clearTimeout(navigationFeedbackTimer);
	navigationFeedback.value = direction;
	navigationPressed.value = true;
	navigationFeedbackTimer = window.setTimeout(() => {
		navigationPressed.value = false;
		navigationFeedbackTimer = window.setTimeout(() => {
			navigationFeedback.value = null;
			navigationFeedbackTimer = null;
		}, 200);
	}, 160);
}

function onNext() {
	if (expanded.value) return;
	if (currentIndex.value < props.contents.length - 1) {
		showNavigationFeedback('next');
		currentIndex.value++;
	}
	scrollToCurrentIndex();
}

function onPrev() {
	if (expanded.value) return;
	if (currentIndex.value > 0) {
		showNavigationFeedback('prev');
		currentIndex.value--;
	}
	scrollToCurrentIndex();
}

function onItemClose() {
	closeGallery();
}

function onAfterLeave() {
	for (const content of props.contents) {
		if (content.sourceElement != null) {
			content.sourceElement.style.visibility = '';
		}
	}
	emit('closed');
}

function onPopState() {
	if (showing.value) {
		close();
	}
}

let releaseFocusTrap: (() => void) | null = null;

onMounted(() => {
	watch([showing], ([showing]) => {
		if (showing === true) {
			if (rootEl.value != null) {
				const { release } = focusTrap(rootEl.value);

				releaseFocusTrap = release;
				rootEl.value.focus();
			}
		} else {
			releaseFocusTrap?.();
			releaseFocusTrap = null;
		}
	}, { immediate: true });

	window.history.pushState(null, '', '#pswp');
	window.addEventListener('popstate', onPopState);
});

const keymap = {
	'esc': () => {
		const currentItem = items.get(currentIndex.value);
		if (currentItem?.menuShowing) return;
		if (currentItem?.exitFullscreen()) return;
		close();
	},
	'arrowleft': {
		allowRepeat: true,
		callback: () => onPrev(),
	},
	'arrowright': {
		allowRepeat: true,
		callback: () => onNext(),
	},
} as const satisfies Keymap;

onBeforeUnmount(() => {
	if (navigationFeedbackTimer != null) window.clearTimeout(navigationFeedbackTimer);
	releaseFocusTrap?.();
	releaseFocusTrap = null;
	for (const content of props.contents) {
		if (content.sourceElement != null) content.sourceElement.style.visibility = '';
	}
	items.clear();
	window.removeEventListener('resize', onResize);
	window.removeEventListener('popstate', onPopState);
});

defineExpose({
	close,
});
</script>

<style lang="scss" module>
.transition_root_enterActive,
.transition_root_leaveActive {
	> .bg {
		transition: opacity v-bind("closeAnimDuration + 'ms'"); // 子Itemコンポーネントがフェードイン/アウトするdurationと合わせる
	}
}
.transition_root_enterFrom,
.transition_root_leaveTo {
	pointer-events: none;
	> .bg {
		opacity: 0;
	}
}

.instantBackdrop.transition_root_enterFrom > .bg {
	opacity: 1;
}

.instantBackdrop.transition_root_enterActive > .bg {
	transition: none;
}

.root {
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
}

.bg {
}

.main {
	position: absolute;
	width: 100%;
	height: 100%;
}

.items {
	position: absolute;
	display: flex;
	width: calc(v-bind("screenWidth + 'px'") * v-bind("contents.length"));
	height: 100dvh;
	overflow: clip;
	contain: strict;
}

.itemsTransition {
	pointer-events: none;
	transition: translate v-bind("slideAnimDuration + 'ms'") cubic-bezier(0.45, 0, 0.55, 1);
}

.item {
	width: 100dvw;
	height: 100dvh;
	overflow: clip;
	contain: strict;
	flex-shrink: 0;
}

.prevButton,
.nextButton {
	position: absolute;
	top: 50%;
	width: 70px;
	height: 70px;
	transform: translateY(-50%);
	display: grid;
	place-items: center;
}
.prevButton {
	--hoverOffset: -4px;
	left: 0;
}
.nextButton {
	--hoverOffset: 4px;
	right: 0;
}

.buttonIcon {
	width: 45px;
	height: 45px;
	display: grid;
	place-items: center;
	background-color: rgba(0, 0, 0, 0.3);
	border-radius: 100%;
	color: #fff;
	scale: 1;
	translate: 0;
}

.prevButton:hover .buttonIcon,
.nextButton:hover .buttonIcon,
.prevButton:focus-visible .buttonIcon,
.nextButton:focus-visible .buttonIcon,
.feedback .buttonIcon {
	background-color: rgba(0, 0, 0, 0.5);
}

.pressed .buttonIcon {
	background-color: color-mix(in srgb, var(--MI_THEME-fg) 65%, transparent);
}

.prevButton:focus-visible,
.nextButton:focus-visible {
	outline: none;

	.buttonIcon {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 3px;
	}
}

.animated {
	.buttonIcon {
		transition: scale 160ms ease-out, translate 160ms ease-out, background-color 160ms ease;
	}

	.prevButton:is(:hover, :focus-visible, .feedback) .buttonIcon,
	.nextButton:is(:hover, :focus-visible, .feedback) .buttonIcon {
		scale: 1.12;
		translate: var(--hoverOffset) 0;
	}

	.prevButton:is(:active, .pressed) .buttonIcon,
	.nextButton:is(:active, .pressed) .buttonIcon {
		scale: 0.94;
		translate: 0;
	}
}
</style>
