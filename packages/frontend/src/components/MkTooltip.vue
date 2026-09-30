<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Transition
	:enterActiveClass="prefer.s.animation ? $style.tooltipEnterActive : ''"
	appear :css="prefer.s.animation"
	@afterLeave="emit('closed')"
>
	<div v-show="showing" ref="el" role="tooltip" :class="$style.root" :style="{ zIndex, maxWidth: maxWidth + 'px' }">
		<slot>
			<template v-if="text">
				<Mfm v-if="asMfm" :text="text"/>
				<span v-else>{{ text }}</span>
			</template>
		</slot>
		<div ref="arrow" :class="[$style.arrow, $style[arrowClass]]"></div>
	</div>
</Transition>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import * as os from '@/os.js';
import { calcPopupPosition } from '@/utility/popup-position.js';
import { prefer } from '@/preferences.js';

type ArrowClass = 'arrowTop' | 'arrowBottom' | 'arrowLeft' | 'arrowRight';

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

function setPosition() {
	if (el.value == null) return;
	const data = calcPopupPosition(el.value, {
		anchorElement: props.anchorElement,
		direction: props.direction,
		align: 'center',
		innerMargin: props.innerMargin,
		x: props.x,
		y: props.y,
	});

	el.value.style.left = data.left + 'px';
	el.value.style.top = data.top + 'px';

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
}

let loopHandler: number | null = null;

onMounted(() => {
	nextTick(() => {
		setPosition();

		const loop = () => {
			setPosition();
			loopHandler = window.requestAnimationFrame(loop);
		};

		loop();
	});
});

onUnmounted(() => {
	if (loopHandler != null) window.cancelAnimationFrame(loopHandler);
});
</script>

<style lang="scss" module>
$arrowSize: 6px;
$arrowOffset: 3px;
$arrowRadius: 2px;

.tooltipEnterActive {
	animation: tooltipEnter 150ms ease-out both;
}

@keyframes tooltipEnter {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

.root {
	position: absolute;
	box-sizing: border-box;
	min-width: $arrowSize;
	min-height: 20px;
	width: max-content;
	padding: 4px 8px;
	font-size: 11px;
	line-height: 12px;
	font-weight: 400;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	border-radius: 4px;
	// 前景色と背景色を入れ替えた表示。テーマを問わず本文との対比が最大になる
	color: var(--MI_THEME-bg);
	background: var(--MI_THEME-fg);
	overflow-wrap: break-word;
	word-break: break-all;
	pointer-events: none;
}

.arrow {
	position: absolute;
	z-index: -1;
	box-sizing: border-box;
	width: $arrowSize;
	height: $arrowSize;
	background: var(--MI_THEME-fg);
	transform: rotate(45deg);
}

// 回転により、左上の角は上を、右上は右を、右下は下を、左下は左を向く。
// 尖端になる角だけ丸めるので、辺ごとに丸める角が変わる
.arrowTop {
	top: -$arrowOffset;
	left: var(--MI-tooltip-arrow-position, 50%);
	margin-left: -$arrowOffset;
	border-top-left-radius: $arrowRadius;
}

.arrowBottom {
	bottom: -$arrowOffset;
	left: var(--MI-tooltip-arrow-position, 50%);
	margin-left: -$arrowOffset;
	border-bottom-right-radius: $arrowRadius;
}

.arrowLeft {
	left: -$arrowOffset;
	top: var(--MI-tooltip-arrow-position, 50%);
	margin-top: -$arrowOffset;
	border-bottom-left-radius: $arrowRadius;
}

.arrowRight {
	right: -$arrowOffset;
	top: var(--MI-tooltip-arrow-position, 50%);
	margin-top: -$arrowOffset;
	border-top-right-radius: $arrowRadius;
}
</style>
