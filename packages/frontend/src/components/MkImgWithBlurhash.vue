<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="root" :class="['chromatic-ignore', $style.root, { [$style.cover]: cover }]" :style="{ aspectRatio }" :title="title ?? ''">
	<TransitionGroup v-bind="imageTransition">
		<MkBlurhash
			v-if="useBlurhash"
			key="canvas"
			:class="$style.canvas"
			:blurhash="hash ?? null"
			:height="props.height"
			:width="props.width"
			:onlyAvgColor="props.onlyAvgColor"
			:show="hide"
		/>
		<div v-else v-show="hide" key="placeholder" :class="[$style.canvas, $style.placeholder]"></div>
		<img
			v-show="!hide"
			key="img"
			ref="img"
			data-image-fade="managed"
			:height="imgHeight ?? undefined"
			:width="imgWidth ?? undefined"
			:class="[$style.img, { [$style.concealed]: hide && props.transition == null }]"
			:src="source ?? undefined"
			:title="title ?? undefined"
			:alt="alt ?? undefined"
			:data-marker="marker ?? undefined"
			loading="eager"
			decoding="async"
			draggable="false"
			tabindex="-1"
			style="-webkit-user-drag: none;"
			@error="onError"
		/>
	</TransitionGroup>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, useCssModule, useTemplateRef, watch, ref } from 'vue';
import { waitForImageReveal } from '@@/js/image-fade.js';
import { prefer } from '@/preferences.js';
import MkBlurhash from '@/components/MkBlurhash.vue';
import { useImagePreload } from '@/composables/use-image-preload.js';

const props = withDefaults(defineProps<{
	transition?: {
		duration?: number | { enter: number; leave: number; };
		enterActiveClass?: string;
		leaveActiveClass?: string;
		enterFromClass?: string;
		leaveToClass?: string;
		enterToClass?: string;
		leaveFromClass?: string;
	} | null;
	src?: string | null;
	hash?: string | null;
	alt?: string | null;
	title?: string | null;
	height?: number;
	width?: number;
	cover?: boolean;
	forceBlurhash?: boolean;
	onlyAvgColor?: boolean; // 軽量化のためにBlurhashを使わずに平均色だけを描画
	useBlurhash?: boolean;
	loading?: 'lazy' | 'eager';
	marker?: string;
}>(), {
	transition: null,
	src: null,
	alt: '',
	title: null,
	height: 64,
	width: 64,
	cover: true,
	forceBlurhash: false,
	onlyAvgColor: false,
	useBlurhash: true,
	loading: 'lazy',
});

const emit = defineEmits<{
	(event: 'error'): void;
}>();

const style = useCssModule();
const root = useTemplateRef('root');
const img = useTemplateRef('img');
const preload = useImagePreload(root, () => props.loading === 'eager');
const source = computed(() => preload.value ? props.src : null);
const loaded = ref(false);
const imgWidth = ref(props.width);
const imgHeight = ref(props.height);
const hide = computed(() => !loaded.value || props.forceBlurhash);
const aspectRatio = computed(() => props.width > 0 && props.height > 0 ? `${props.width} / ${props.height}` : '1 / 1');
const imageTransition = computed(() => {
	if (!prefer.s.animation) return { css: false };
	if (props.transition != null) return { leaveActiveClass: style.transition_leaveActive, ...props.transition };
	return {
		enterActiveClass: style.transition_fade,
		leaveActiveClass: `${style.transition_fade} ${style.transition_leaveActive}`,
		enterFromClass: style.transition_transparent,
		leaveToClass: style.transition_transparent,
	};
});

function onError() {
	loaded.value = false;
	emit('error');
}

watch([() => props.width, () => props.height, root], () => {
	const ratio = props.width > 0 && props.height > 0 ? props.width / props.height : 1;
	const clientWidth = root.value?.clientWidth || props.width || 300;
	imgWidth.value = clientWidth;
	imgHeight.value = Math.round(clientWidth / ratio);
}, {
	immediate: true,
});

watch(source, async (currentSource, _previous, onCleanup) => {
	loaded.value = false;
	if (!currentSource) return;
	let active = true;
	let stopListening: (() => void) | undefined;
	onCleanup(() => {
		active = false;
		stopListening?.();
	});
	await nextTick();
	const element = img.value;
	if (!active || element == null) return;
	let decoding = false;
	const reveal = async () => {
		if (decoding) return;
		decoding = true;
		try {
			await element.decode();
		} catch {
			// decode 可能先于 load 失败；保留 load 回调，让可显示的格式继续揭示。
		}
		decoding = false;
		if (!active || !element.complete || element.naturalWidth === 0) return;
		if (prefer.s.animation && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			await waitForImageReveal(element);
		}
		if (active && source.value === currentSource && img.value === element && element.complete && element.naturalWidth > 0) loaded.value = true;
	};
	element.addEventListener('load', reveal);
	stopListening = () => element.removeEventListener('load', reveal);
	await reveal();
}, {
	immediate: true,
});
</script>

<style lang="scss" module>
.transition_fade {
	transition: opacity 400ms ease;

	@media (prefers-reduced-motion: reduce) {
		transition: none;
	}
}

.transition_transparent {
	opacity: 0;
}

.transition_leaveActive {
	position: absolute;
	top: 0;
	left: 0;
}
.root {
	position: relative;
	width: 100%;
	height: 100%;

	&.cover {
		> .canvas,
		> .img {
			object-fit: cover;
		}
	}
}

.canvas,
.img {
	display: block;
	width: 100%;
	height: 100%;
}

.canvas {
	object-fit: contain;
}

.img {
	object-fit: contain;
}

.placeholder {
	background: var(--MI_THEME-panelHighlight);
}

.concealed {
	// 隐藏敏感内容或更换图片时立即遮住原图，不等待淡出完成。
	visibility: hidden;
}
</style>
