<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Transition
	:enterActiveClass="prefer.s.animation ? $style.transition_tooltip_enterActive : ''"
	:leaveActiveClass="prefer.s.animation ? $style.transition_tooltip_leaveActive : ''"
	:enterFromClass="prefer.s.animation ? $style.transition_tooltip_enterFrom : ''"
	:leaveToClass="prefer.s.animation ? $style.transition_tooltip_leaveTo : ''"
	appear :css="prefer.s.animation"
	@afterLeave="emit('closed')"
>
	<div v-show="showing" ref="el" :class="$style.root" :style="{ zIndex, maxWidth: maxWidth + 'px' }">
		<slot>
			<template v-if="text">
				<Mfm v-if="asMfm" :text="text"/>
				<span v-else>{{ text }}</span>
			</template>
		</slot>
		<div :class="[$style.arrow, $style[arrowClass]]"></div>
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
	anchorElement?: HTMLElement;
	x?: number;
	y?: number;
	text?: string;
	asMfm?: boolean;
	maxWidth?: number;
	direction?: 'top' | 'bottom' | 'right' | 'left';
	innerMargin?: number;
}>(), {
	maxWidth: 250,
	direction: 'bottom',
	innerMargin: 12,
});

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

// タイミングによっては最初から showing = false な場合があり、その場合に closed 扱いにしないと永久にDOMに残ることになる
if (!props.showing) emit('closed');

const el = useTemplateRef('el');
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
$arrowSize: 10px;
$arrowOffset: 5px;
$arrowRadius: 2px;

.transition_tooltip_enterActive,
.transition_tooltip_leaveActive {
	opacity: 1;
	transition: opacity 200ms linear;
}
.transition_tooltip_enterFrom,
.transition_tooltip_leaveTo {
	opacity: 0;
}

.root {
	position: absolute;
	box-sizing: border-box;
	min-width: $arrowSize;
	padding: 5px 11px;
	font-size: 12px;
	line-height: 20px;
	border-radius: 4px;
	// 前景色と背景色を入れ替えた表示。テーマを問わず本文との対比が最大になる
	color: var(--MI_THEME-bg);
	background: var(--MI_THEME-fg);
	// 背景と同色なので見た目は縁なし。外寸を32pxに揃えるためだけに置く
	border: solid 1px var(--MI_THEME-fg);
	overflow-wrap: break-word;
	word-break: normal;
	pointer-events: none;
}

// 45度回転させた正方形の、外を向く角を尖端として使う。
// 中心が本体の辺上に来るため、尖端は辺から半対角線ぶん(約7px)突き出る
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
	left: 50%;
	margin-left: -$arrowOffset;
	border-top-left-radius: $arrowRadius;
}

.arrowBottom {
	bottom: -$arrowOffset;
	left: 50%;
	margin-left: -$arrowOffset;
	border-bottom-right-radius: $arrowRadius;
}

.arrowLeft {
	left: -$arrowOffset;
	top: 50%;
	margin-top: -$arrowOffset;
	border-bottom-left-radius: $arrowRadius;
}

.arrowRight {
	right: -$arrowOffset;
	top: 50%;
	margin-top: -$arrowOffset;
	border-top-right-radius: $arrowRadius;
}
</style>
