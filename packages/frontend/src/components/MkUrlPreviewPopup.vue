<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="$style.root" :style="{ zIndex, top: top + 'px', left: left + 'px' }">
	<Transition :name="prefer.s.animation ? '_transition_zoom' : ''" @afterLeave="emit('closed')">
		<MkUrlPreview v-if="showing" class="_popup _shadow" :style="{ transformOrigin }" :url="url" :showActions="false"/>
	</Transition>
</div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import * as os from '@/os.js';
import { calcPopupPosition } from '@/utility/popup-position.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{
	showing: boolean;
	url: string;
	anchorElement: HTMLElement;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const zIndex = os.claimZIndex('middle');
const rootEl = useTemplateRef('rootEl');
const top = ref(0);
const left = ref(0);
const transformOrigin = ref('left top');

function setPosition() {
	if (rootEl.value == null) return;

	const result = calcPopupPosition(rootEl.value, {
		anchorElement: props.anchorElement,
		direction: 'bottom',
		align: 'left',
		innerMargin: 8,
	});

	top.value = result.top;
	left.value = result.left;
	transformOrigin.value = result.transformOrigin;
}

// 预览内容是异步加载的，高度会变，需要重新判断上下翻转
const ro = new ResizeObserver(() => {
	setPosition();
});

onMounted(() => {
	if (rootEl.value) ro.observe(rootEl.value);
	setPosition();
	window.addEventListener('resize', setPosition);
	window.addEventListener('scroll', setPosition, true);
	nextTick(() => {
		setPosition();
	});
});

onUnmounted(() => {
	ro.disconnect();
	window.removeEventListener('resize', setPosition);
	window.removeEventListener('scroll', setPosition, true);
});
</script>

<style lang="scss" module>
.root {
	position: absolute;
	width: 500px;
	max-width: calc(90vw - 12px);
	pointer-events: none;
}
</style>
