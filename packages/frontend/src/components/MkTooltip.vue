<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Teleport :to="fullscreenTarget ?? 'body'">
<Transition
	:enterActiveClass="prefer.s.animation ? $style.tooltipEnterActive : ''"
	:enterFromClass="prefer.s.animation ? $style.tooltipEnterFrom : ''"
	:leaveActiveClass="prefer.s.animation ? $style.tooltipLeaveActive : ''"
	:leaveToClass="prefer.s.animation ? $style.tooltipLeaveTo : ''"
	appear :css="prefer.s.animation"
	@afterLeave="emit('closed')"
>
	<div v-show="showing" ref="el" v-bind="$attrs" role="tooltip" :class="$style.root" :style="{ zIndex, position: fullscreenTarget != null ? 'fixed' : undefined, maxWidth: maxWidth + 'px', visibility: positioned ? undefined : 'hidden', '--MI-tooltip-transition': positioned ? undefined : 'none' }">
		<div :class="$style.surface">
			<slot>
				<template v-if="text">
					<Mfm v-if="asMfm" :text="text"/>
					<span v-else>{{ text }}</span>
				</template>
			</slot>
		</div>
		<div ref="arrow" :class="[$style.arrow, $style[arrowClass]]"></div>
	</div>
</Transition>
</Teleport>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import * as os from '@/os.js';
import { calcPopupPosition } from '@/utility/popup-position.js';
import { prefer } from '@/preferences.js';

defineOptions({ inheritAttrs: false });

type ArrowClass = 'arrowTop' | 'arrowBottom' | 'arrowLeft' | 'arrowRight';

// 脱离页面与弹窗的裁剪层，全屏时仍留在全屏子树。
const fullscreenTarget = window.document.fullscreenElement;

const props = withDefaults(defineProps<{
	showing: boolean;
	anchorElement?: Pick<HTMLElement, 'getBoundingClientRect'>;
	x?: number;
	y?: number;
	text?: string;
	asMfm?: boolean;
	maxWidth?: number;
	direction?: 'top' | 'bottom' | 'right' | 'left';
	innerMargin?: number;
}>(), {
	maxWidth: 300,
	direction: 'bottom',
	innerMargin: 12,
});

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

// タイミングによっては最初から showing = false な場合があり、その場合に closed 扱いにしないと永久にDOMに残ることになる
if (!props.showing) emit('closed');

const el = useTemplateRef('el');
const arrow = useTemplateRef('arrow');
const zIndex = os.claimZIndex('high');

// transformOrigin は展開の起点、つまりアンカーに接している辺を表す。
// 余白が足りず反対側に反転した場合も、矢印はアンカー側の辺に付く
const ARROW_CLASS_BY_ORIGIN: Record<string, ArrowClass> = {
	'center top': 'arrowTop',
	'center bottom': 'arrowBottom',
	'left center': 'arrowLeft',
	'right center': 'arrowRight',
};

const arrowClass = ref<ArrowClass>('arrowTop');
const positioned = ref(false);

function setPosition() {
	if (el.value == null) return;
	if (!props.showing) return;
	const data = calcPopupPosition(el.value, {
		anchorElement: props.anchorElement,
		direction: props.direction,
		align: 'center',
		innerMargin: props.innerMargin,
		x: props.x,
		y: props.y,
	});

	el.value.style.left = (data.left - (fullscreenTarget != null ? window.scrollX : 0)) + 'px';
	el.value.style.top = (data.top - (fullscreenTarget != null ? window.scrollY : 0)) + 'px';

	arrowClass.value = ARROW_CLASS_BY_ORIGIN[data.transformOrigin] ?? 'arrowTop';

	const vertical = data.transformOrigin.startsWith('center');

	if (arrow.value != null) {
		const rect = props.anchorElement?.getBoundingClientRect();
		const center = vertical
			? rect ? rect.left + rect.width / 2 + window.scrollX : props.x
			: rect ? rect.top + rect.height / 2 + window.scrollY : props.y;
		if (center != null) {
			const size = vertical ? el.value.clientWidth : el.value.clientHeight;
			const border = vertical ? el.value.clientLeft : el.value.clientTop;
			const halfArrow = (vertical ? arrow.value.offsetWidth : arrow.value.offsetHeight) / 2;
			const inset = Math.min(size / 2, halfArrow + 5);
			const position = center - (vertical ? data.left : data.top) - border;
			const arrowPosition = `${Math.max(inset, Math.min(size - inset, position))}px`;
			el.value.style.setProperty('--MI-tooltip-arrow-position', arrowPosition);
		}
	}
	// 先完成面板和箭头定位，再显示并启用淡入，避免初始测量位置闪现。
	positioned.value = true;
}

let loopHandler: number | null = null;
let disposed = false;

function onFullscreenChange() {
	if (window.document.fullscreenElement !== fullscreenTarget) emit('closed');
}

onMounted(() => {
	window.document.addEventListener('fullscreenchange', onFullscreenChange);
	nextTick(() => {
		if (disposed) return;
		setPosition();

		const loop = () => {
			setPosition();
			loopHandler = window.requestAnimationFrame(loop);
		};

		loop();
	});
});

onUnmounted(() => {
	disposed = true;
	window.document.removeEventListener('fullscreenchange', onFullscreenChange);
	if (loopHandler != null) window.cancelAnimationFrame(loopHandler);
});
</script>

<style lang="scss" module>
$arrowSize: 6px;
$arrowHalfSize: $arrowSize * .5;
// 向面板内重叠 1px，避免旋转边缘在分数像素上形成接缝。
$arrowOffset: $arrowHalfSize - 1px;
$arrowRadius: 2px;

.tooltipEnterActive,
.tooltipLeaveActive {
	transition: var(--MI-tooltip-transition, opacity 150ms ease);
}

.tooltipEnterFrom,
.tooltipLeaveTo {
	opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
	.tooltipEnterActive,
	.tooltipLeaveActive {
		transition: none;
	}
}

.root {
	position: absolute;
	box-sizing: border-box;
	min-width: $arrowSize;
	min-height: 20px;
	width: max-content;
	font-size: 11px;
	line-height: 12px;
	font-weight: 400;
	border-radius: 4px;
	// 深色主题沿用前景色与背景色互换；浅色主题使用纯黑，对比更清楚。
	--MI-tooltipFg: var(--MI_THEME-bg);
	--MI-tooltipBg: var(--MI_THEME-fg);
	color: var(--MI-tooltipFg);
	overflow-wrap: break-word;
	word-break: break-all;
	pointer-events: none;

	:global(html[data-color-scheme=light]) & {
		--MI-tooltipFg: #fff;
		--MI-tooltipBg: #000;
	}
}

.surface {
	position: relative;
	isolation: isolate;
	box-sizing: border-box;
	width: 100%;
	max-width: 100%;
	min-width: 0;
	min-height: inherit;
	padding: var(--MI-tooltip-padding, 4px 8px);
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	border-radius: inherit;
}

.surface::before {
	content: '';
	position: absolute;
	z-index: -1;
	inset: 0;
	border-radius: inherit;
	background: var(--MI-tooltipBg);
}

.arrow {
	position: absolute;
	z-index: -1;
	box-sizing: border-box;
	width: $arrowSize;
	height: $arrowSize;
	background: var(--MI-tooltipBg);
	transform: rotate(45deg);
}

// 回転により、左上の角は上を、右上は右を、右下は下を、左下は左を向く。
// 尖端になる角だけ丸めるので、辺ごとに丸める角が変わる
.arrowTop {
	top: -$arrowOffset;
	left: var(--MI-tooltip-arrow-position, 50%);
	margin-left: -$arrowHalfSize;
	border-top-left-radius: $arrowRadius;
}

.arrowBottom {
	bottom: -$arrowOffset;
	left: var(--MI-tooltip-arrow-position, 50%);
	margin-left: -$arrowHalfSize;
	border-bottom-right-radius: $arrowRadius;
}

.arrowLeft {
	left: -$arrowOffset;
	top: var(--MI-tooltip-arrow-position, 50%);
	margin-top: -$arrowHalfSize;
	border-bottom-left-radius: $arrowRadius;
}

.arrowRight {
	right: -$arrowOffset;
	top: var(--MI-tooltip-arrow-position, 50%);
	margin-top: -$arrowHalfSize;
	border-top-right-radius: $arrowRadius;
}
</style>
