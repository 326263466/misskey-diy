<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="root" :class="['chromatic-ignore', $style.root, { [$style.cover]: cover }]" :title="title ?? ''">
	<canvas key="canvas" ref="canvas" :class="[$style.canvas, { [$style.transparent]: !hide }]" :width="canvasWidth" :height="canvasHeight" :title="title ?? undefined" tabindex="-1"></canvas>
	<img key="img" ref="img" data-image-fade="managed" :height="imgHeight ?? undefined" :width="imgWidth ?? undefined" :class="[$style.img, { [$style.concealed]: hide }]" :src="source ?? undefined" :title="title ?? undefined" :alt="alt ?? undefined" loading="eager" decoding="async" tabindex="-1" @error="loaded = false"/>
</div>
</template>

<script lang="ts">
import DrawBlurhash from '@/workers/draw-blurhash?worker';
import TestWebGL2 from '@/workers/test-webgl2?worker';
import { WorkerMultiDispatch } from '@@/js/worker-multi-dispatch.js';
import { extractAvgColorFromBlurhash } from '@@/js/extract-avg-color-from-blurhash.js';

const canvasPromise = new Promise<WorkerMultiDispatch | HTMLCanvasElement>(resolve => {
	// テスト環境で Web Worker インスタンスは作成できない
	if (import.meta.env.MODE === 'test') {
		const canvas = window.document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		resolve(canvas);
		return;
	}
	const testWorker = new TestWebGL2();
	testWorker.addEventListener('message', event => {
		if (event.data.result) {
			const workers = new WorkerMultiDispatch(
				() => new DrawBlurhash(),
				Math.min(navigator.hardwareConcurrency - 1, 4),
			);
			resolve(workers);
		} else {
			const canvas = window.document.createElement('canvas');
			canvas.width = 64;
			canvas.height = 64;
			resolve(canvas);
		}
		testWorker.terminate();
	});
});
</script>

<script lang="ts" setup>
import { computed, nextTick, onMounted, onUnmounted, shallowRef, watch, ref } from 'vue';
import { v4 as uuid } from 'uuid';
import { render } from 'buraha';
import { waitForImageReveal } from '@@/js/image-fade.js';
import { useImagePreload } from '@@/js/image-visibility.js';

const props = withDefaults(defineProps<{
	src?: string | null;
	hash?: string | null;
	alt?: string | null;
	title?: string | null;
	height?: number;
	width?: number;
	cover?: boolean;
	forceBlurhash?: boolean;
	onlyAvgColor?: boolean; // 軽量化のためにBlurhashを使わずに平均色だけを描画
	loading?: 'lazy' | 'eager';
}>(), {
	src: null,
	alt: '',
	title: null,
	height: 64,
	width: 64,
	cover: true,
	forceBlurhash: false,
	onlyAvgColor: false,
	loading: 'lazy',
});

const viewId = uuid();
const canvas = shallowRef<HTMLCanvasElement>();
const root = shallowRef<HTMLDivElement | null>(null);
const img = shallowRef<HTMLImageElement>();
const preload = useImagePreload(root, () => props.loading === 'eager');
const source = computed(() => preload.value ? props.src : null);
const loaded = ref(false);
const canvasWidth = ref(64);
const canvasHeight = ref(64);
const imgWidth = ref(props.width);
const imgHeight = ref(props.height);
const bitmapTmp = ref<CanvasImageSource | undefined>();
const hide = computed(() => !loaded.value || props.forceBlurhash);

watch([() => props.width, () => props.height, root], () => {
	const ratio = props.width / props.height;
	if (ratio > 1) {
		canvasWidth.value = Math.round(64 * ratio);
		canvasHeight.value = 64;
	} else {
		canvasWidth.value = 64;
		canvasHeight.value = Math.round(64 / ratio);
	}

	const clientWidth = root.value?.clientWidth ?? 300;
	imgWidth.value = clientWidth;
	imgHeight.value = Math.round(clientWidth / ratio);
}, {
	immediate: true,
});

function drawImage(bitmap: CanvasImageSource) {
	// canvasがない（mountedされていない）場合はTmpに保存しておく
	if (!canvas.value) {
		bitmapTmp.value = bitmap;
		return;
	}

	// canvasがあれば描画する
	bitmapTmp.value = undefined;
	const ctx = canvas.value.getContext('2d');
	if (!ctx) return;
	ctx.drawImage(bitmap, 0, 0, canvasWidth.value, canvasHeight.value);
}

function drawAvg() {
	if (!canvas.value) return;

	const color = (props.hash != null && extractAvgColorFromBlurhash(props.hash)) || '#888';

	const ctx = canvas.value.getContext('2d');
	if (!ctx) return;

	// avgColorでお茶をにごす
	ctx.beginPath();
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, canvasWidth.value, canvasHeight.value);
}

async function draw() {
	if (import.meta.env.MODE === 'test' && props.hash == null) return;

	drawAvg();

	if (props.hash == null) return;

	if (props.onlyAvgColor) return;

	const work = await canvasPromise;
	if (work instanceof WorkerMultiDispatch) {
		work.postMessage(
			{
				id: viewId,
				hash: props.hash,
			},
			undefined,
		);
	} else {
		try {
			render(props.hash, work);
			drawImage(work);
		} catch (error) {
			console.error('Error occurred during drawing blurhash', error);
		}
	}
}

function workerOnMessage(event: MessageEvent) {
	if (event.data.id !== viewId) return;
	drawImage(event.data.bitmap as ImageBitmap);
}

canvasPromise.then(work => {
	if (work instanceof WorkerMultiDispatch) {
		work.addListener(workerOnMessage);
	}

	draw();
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
		if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) await waitForImageReveal(element);
		if (active && source.value === currentSource && img.value === element && element.complete && element.naturalWidth > 0) {
			loaded.value = true;
		}
	};
	element.addEventListener('load', reveal);
	stopListening = () => element.removeEventListener('load', reveal);
	await reveal();
}, {
	immediate: true,
});

watch(() => props.hash, () => {
	draw();
});

onMounted(() => {
	// drawImageがmountedより先に呼ばれている場合はここで描画する
	if (bitmapTmp.value) {
		drawImage(bitmapTmp.value);
	}
});

onUnmounted(() => {
	canvasPromise.then(work => {
		if (work instanceof WorkerMultiDispatch) {
			work.removeListener(workerOnMessage);
		}
	});
});
</script>

<style lang="scss" module>
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
	transition: opacity 400ms ease;

	@media (prefers-reduced-motion: reduce) {
		transition: none;
	}
}

.canvas {
	position: absolute;
	inset: 0;
	object-fit: contain;
	pointer-events: none;
}

.img {
	object-fit: contain;
}

.transparent,
.concealed {
	opacity: 0;
}

.concealed {
	// 更换源或遮住敏感内容时立即隐藏旧图，不等待淡出。
	visibility: hidden;
}
</style>
