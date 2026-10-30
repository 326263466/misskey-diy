<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Teleport :to="popupHost ?? 'body'" :disabled="!isFloating">
<div
	v-if="!store.r.tips.value[props.k] && (!isFloating || !inModal || popupHost)"
	ref="rootEl"
	v-bind="$attrs"
	:class="[$style.root, { _alert: !isFloating, [$style.warn]: warn, [$style.mascot]: isFloating, [$style.mascotEnd]: isFloating && mascotSide === 'end' }, arrowSide ? $style[`arrow_${arrowSide}`] : undefined]"
	:style="isFloating ? floatingStyle : undefined"
	:role="isFloating ? 'group' : undefined"
	:aria-labelledby="isFloating && title ? titleId : undefined"
	class="_selectable _gaps_s"
>
	<template v-if="isFloating">
		<div :class="$style.character" aria-hidden="true">
			<img :class="$style.characterImage" :src="mascot" alt="" width="192" height="252">
		</div>
		<div ref="bubbleEl" :class="$style.bubble">
			<div v-if="arrowSide" :class="$style.arrow" aria-hidden="true"></div>
			<!-- 只有操作文字可点击，标题和气泡空白处不触发跳转。 -->
			<div v-if="actionLabel" :class="$style.bubbleContent">
				<div v-if="title" :id="titleId" :class="$style.bubbleTitle">{{ title }}</div>
				<button type="button" class="_button" :class="$style.action" @click="activate">{{ actionLabel }}<i class="ti ti-arrow-right" aria-hidden="true"></i></button>
			</div>
			<div v-else :class="$style.bubbleContent">
				<div v-if="title" :id="titleId" :class="$style.bubbleTitle">{{ title }}</div>
				<div :class="$style.bubbleBody"><slot></slot></div>
			</div>
			<button type="button" class="_button" :class="$style.bubbleButton" :aria-label="i18n.ts.close" @click="_closeTip()">
				<i class="ti ti-x" aria-hidden="true"></i>
			</button>
		</div>
	</template>
	<template v-else>
		<div style="font-weight: bold;"><i class="ti ti-bulb"></i> {{ i18n.ts.tip }}:</div>
		<div :class="$style.body"><slot></slot></div>
		<div>
			<MkButton inline primary rounded small @click="_closeTip()"><i class="ti ti-check"></i> {{ i18n.ts.gotIt }}</MkButton>
		</div>
	</template>
</div>
</Teleport>
</template>

<script lang="ts" setup>
import { computed, inject, onActivated, onDeactivated, ref, useId, useTemplateRef, watch } from 'vue';
import type { CtaPosition } from '@/utility/cta-position.js';
import { i18n } from '@/i18n.js';
import { store } from '@/store.js';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { DI } from '@/di.js';
import { calcCtaPosition } from '@/utility/cta-position.js';
import { TIPS, closeTip } from '@/tips.js';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
	k: typeof TIPS[number];
	warn?: boolean;
	mascot?: string;
	title?: string;
	actionLabel?: string;
	anchorElement?: HTMLElement | null;
}>(), {
	warn: false,
	anchorElement: null,
});

const emit = defineEmits<{
	(ev: 'action'): void;
}>();

const rootEl = useTemplateRef<HTMLElement>('rootEl');
const bubbleEl = useTemplateRef<HTMLElement>('bubbleEl');
const titleId = useId();
const popupHost = inject(DI.popupHost, ref(null));
const inModal = inject(DI.inModal, false);
const pageActive = inject(DI.pageActive, ref(true));
const active = ref(true);
const dismissed = ref(false);
const zIndex = os.claimZIndex('low');
const isFloating = computed(() => props.mascot != null && !props.warn);
const arrowSide = ref<CtaPosition['arrow'] | null>(null);
const mascotSide = ref<CtaPosition['mascot']>('start');
const floatingStyle = ref<Record<string, string>>({ visibility: 'hidden' });
// 与样式中 .character 的宽度和 .bubble 的人物侧外边距一致。
const MASCOT_WIDTH = 80;
const BUBBLE_INSET = 12;

function _closeTip() {
	closeTip(props.k);
}

function activate() {
	_closeTip();
	emit('action');
}

onActivated(() => { active.value = true; });
onDeactivated(() => { active.value = false; });

watch([isFloating, rootEl, () => props.anchorElement], ([floating, root, anchor], _, onCleanup) => {
	if (!floating || root == null || anchor == null) {
		floatingStyle.value = { ...floatingStyle.value, visibility: 'hidden' };
		return;
	}
	const element = root;
	const target = anchor;
	let frame: number | null = null;
	let intersecting = false;

	function hide() {
		floatingStyle.value = { ...floatingStyle.value, visibility: 'hidden' };
	}

	function updatePosition() {
		frame = null;
		const bubble = bubbleEl.value;
		if (!bubble || !intersecting || !active.value || !pageActive.value || dismissed.value || !target.isConnected || target.closest('[inert]')) {
			hide();
			return;
		}
		const visualViewport = window.visualViewport;
		const pageTop = target.closest('._pageLayout')?.getBoundingClientRect().top ?? 0;
		const viewport = {
			left: (visualViewport?.offsetLeft ?? 0) + 12,
			top: Math.max(visualViewport?.offsetTop ?? 0, pageTop) + 12,
			right: (visualViewport?.offsetLeft ?? 0) + (visualViewport?.width ?? window.innerWidth) - 12,
			bottom: (visualViewport?.offsetTop ?? 0) + (visualViewport?.height ?? window.innerHeight) - 12,
		};
		const anchorRect = target.getBoundingClientRect();
		// 宽度随文字收缩（样式里 max-content，上限 300px），这里只量取实际尺寸。
		element.style.width = '';
		const width = element.offsetWidth;
		const height = element.offsetHeight;
		const position = calcCtaPosition({ anchor: anchorRect, viewport, width, height, mascotWidth: MASCOT_WIDTH });
		if (!position) {
			hide();
			return;
		}
		// 人物换边后气泡的外边距随之换边，这里按最终位置推算气泡，不等 DOM 更新。
		const bubbleLeft = position.left + (position.mascot === 'start' ? BUBBLE_INSET : 0);
		const bubbleWidth = width - BUBBLE_INSET;
		const vertical = position.arrow === 'top' || position.arrow === 'bottom';
		const anchorInset = Math.min(18, anchorRect.width / 2);
		const arrowPosition = vertical
			? Math.max(anchorRect.left + anchorInset, Math.min(anchorRect.right - anchorInset, bubbleLeft + bubbleWidth / 2)) - bubbleLeft
			: (anchorRect.top + anchorRect.bottom) / 2 - position.top;
		// 上下方向时箭头不进入人物所在的一段，避免被人物挡住。
		const mascotZone = MASCOT_WIDTH - BUBBLE_INSET;
		const arrowMin = vertical && position.mascot === 'start' ? mascotZone + 10 : 18;
		const arrowMax = (vertical ? bubbleWidth - (position.mascot === 'end' ? mascotZone + 10 : 18) : height - 18);
		element.style.setProperty('--MI-tip-arrow-position', `${Math.max(arrowMin, Math.min(arrowMax, arrowPosition))}px`);
		arrowSide.value = position.arrow;
		mascotSide.value = position.mascot;
		floatingStyle.value = { zIndex: String(zIndex), left: `${position.left}px`, top: `${position.top}px`, visibility: 'visible' };
	}

	function schedulePosition() {
		if (frame == null) frame = requestAnimationFrame(updatePosition);
	}

	function dismissOnEditing(event: FocusEvent) {
		if (!(event.target instanceof HTMLElement) || !event.target.matches('input, textarea, [contenteditable="true"]')) return;
		dismissed.value = true;
		hide();
	}

	const resizeObserver = new ResizeObserver(schedulePosition);
	for (const el of [element, target]) resizeObserver.observe(el);
	const intersectionObserver = new IntersectionObserver(([entry]) => {
		intersecting = entry.isIntersecting;
		schedulePosition();
	});
	intersectionObserver.observe(target);
	const inertObserver = new MutationObserver(schedulePosition);
	inertObserver.observe(window.document.body, { attributes: true, attributeFilter: ['inert'], subtree: true });
	const stopWatching = watch([active, pageActive, dismissed], schedulePosition);
	window.document.addEventListener('focusin', dismissOnEditing);
	window.addEventListener('resize', schedulePosition, { passive: true });
	window.addEventListener('scroll', schedulePosition, { capture: true, passive: true });
	window.document.addEventListener('transitionend', schedulePosition, true);
	window.visualViewport?.addEventListener('resize', schedulePosition, { passive: true });
	window.visualViewport?.addEventListener('scroll', schedulePosition, { passive: true });

	onCleanup(() => {
		if (frame != null) cancelAnimationFrame(frame);
		resizeObserver.disconnect();
		intersectionObserver.disconnect();
		inertObserver.disconnect();
		stopWatching();
		window.document.removeEventListener('focusin', dismissOnEditing);
		window.removeEventListener('resize', schedulePosition);
		window.removeEventListener('scroll', schedulePosition, true);
		window.document.removeEventListener('transitionend', schedulePosition, true);
		window.visualViewport?.removeEventListener('resize', schedulePosition);
		window.visualViewport?.removeEventListener('scroll', schedulePosition);
	});
}, { flush: 'post' });
</script>

<style lang="scss" module>
.root {
	padding: var(--MI-cardPadding);
	font-size: 90%;
	background: var(--MI_THEME-infoBg);
	color: var(--MI_THEME-infoFg);
	border-radius: var(--MI-radius);

	&.warn {
		background: var(--MI_THEME-infoWarnBg);
		color: var(--MI_THEME-infoWarnFg);

		.body {
			color: inherit;
		}
	}

	&.mascot {
		position: fixed;
		display: block;
		box-sizing: border-box;
		// 宽度随文字收缩，避免短文案旁留出大片空白。
		width: max-content;
		max-width: min(300px, calc(100vw - var(--MI-margin) * 2));
		padding: 0;
		font-size: 100%;
		background: none;
		color: var(--MI-ctaFg);
		pointer-events: none;
	}

	// 箭头朝左或入口在人物一侧时，人物换到右端，始终在箭头对面。
	&.mascotEnd {
		.character {
			left: auto;
			right: 0;
		}

		.characterImage {
			transform: scaleX(-1);
		}

		.bubble {
			margin-left: 0;
			margin-right: 12px;
			padding: 12px 68px 12px 12px;
		}
	}
}

.body {
	color: var(--MI_THEME-fgTransparentWeak);
}

.character {
	position: absolute;
	z-index: 1;
	bottom: 0;
	left: 0;
	width: 80px;
	height: calc(100% + 16px);
	max-height: 106px;
	overflow: hidden;
	pointer-events: none;
	user-select: none;
}

.characterImage {
	display: block;
	width: 100%;
	height: auto;
}

// 人物所在一侧留出 12px 外边距，让人物略微探出气泡；另一侧紧贴浮窗边缘。
.bubble {
	position: relative;
	display: flex;
	align-items: center;
	gap: 8px;
	box-sizing: border-box;
	min-width: 0;
	min-height: 64px;
	margin-left: 12px;
	padding: 12px 8px 12px 68px;
	border-radius: var(--MI-ctaRadius);
	background: var(--MI-ctaBg);
	color: var(--MI-ctaFg);
	box-shadow: 0 6px 18px color-mix(in srgb, var(--MI-ctaBg) 16%, transparent);
	pointer-events: auto;
}

.arrow {
	position: absolute;
	z-index: 0;
	width: 10px;
	height: 10px;
	border-radius: 2px;
	background: var(--MI-ctaBg);
}

.arrow_top .arrow,
.arrow_bottom .arrow {
	left: var(--MI-tip-arrow-position, 50%);
	transform: translateX(-50%) rotate(45deg);
}

.arrow_top .arrow { top: -4px; }
.arrow_bottom .arrow { bottom: -4px; }

.arrow_left .arrow,
.arrow_right .arrow {
	top: var(--MI-tip-arrow-position, 50%);
	transform: translateY(-50%) rotate(45deg);
}

.arrow_left .arrow { left: -4px; }
.arrow_right .arrow { right: -4px; }

.bubbleContent {
	position: relative;
	z-index: 1;
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
	text-align: start;
	color: inherit;
}

// 人物说的话：与回复同为正文字号、常规字重，只用颜色深浅区分。
.bubbleTitle {
	min-width: 0;
	color: color-mix(in srgb, var(--MI-ctaFg) 75%, transparent);
	font-weight: normal;
	font-size: 1em;
	line-height: 1.4;
	overflow-wrap: anywhere;
}

.bubbleButton {
	position: relative;
	display: grid;
	flex: 0 0 28px;
	place-items: center;
	width: 28px;
	height: 28px;
	box-sizing: border-box;
	border-radius: 50%;
	border: 1px solid color-mix(in srgb, var(--MI-ctaFg) 30%, transparent);
	font-size: 1em;
	color: inherit;

	&:hover {
		background: color-mix(in srgb, var(--MI-ctaFg) 12%, transparent);
	}
}

.action,
.bubbleButton {
	&:focus-visible {
		outline: 2px solid var(--MI-ctaFg);
		outline-offset: 3px;
	}
}

// 用户的回复：纯文字链接，可点区域只包住文字和箭头；悬停反馈沿用全局 ._button 的箭头动画。
.action {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	align-self: flex-start;
	max-width: 100%;
	border-radius: 4px;
	color: var(--MI-ctaFg);
	font-size: 1em;
	font-weight: normal;
	line-height: 1.4;
	text-align: start;
	overflow-wrap: anywhere;
}

.bubbleBody {
	font-size: 1em;
	font-weight: normal;
	line-height: 1.4;
	text-wrap: pretty;
	overflow-wrap: anywhere;
}

@media (pointer: coarse) {
	.bubbleButton {
		flex-basis: 44px;
		width: 44px;
		height: 44px;
	}
}
</style>
