<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="el" :class="$style.root">
	<MkMenu
		:items="items"
		:align="align"
		:width="width"
		:asDrawer="false"
		:debugDisablePredictionCone="debugDisablePredictionCone"
		:debugShowPredictionCone="debugShowPredictionCone"
		@close="onChildClosed"
	/>
</div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, onUnmounted, provide, useTemplateRef, watch } from 'vue';
import MkMenu from './MkMenu.vue';
import type { MenuItem } from '@/types/menu.js';

const props = defineProps<{
	items: MenuItem[];
	anchorElement: HTMLElement;
	rootElement: HTMLElement;
	width?: number;
	debugDisablePredictionCone?: boolean;
	debugShowPredictionCone?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
	(ev: 'actioned'): void;
}>();

provide('isNestingMenu', true);

const el = useTemplateRef('el');
const align = 'left';

const SCROLLBAR_THICKNESS = 16;

function setPosition() {
	if (el.value == null) return;
	const rootRect = props.rootElement.getBoundingClientRect();
	const parentRect = props.anchorElement.getBoundingClientRect();
	const myRect = el.value.getBoundingClientRect();

	let left = props.anchorElement.offsetWidth;
	let top = (parentRect.top - rootRect.top) - 8;

	// 右侧放不下时翻转到左侧，但左侧同样放不下就维持右侧，避免翻过去露出得更少
	const rightSpace = (window.innerWidth - SCROLLBAR_THICKNESS) - (rootRect.left + left);
	if (myRect.width > rightSpace && myRect.width <= rootRect.left) {
		left = -myRect.width;
	}

	// 下方超出时整体上移贴住视口底部，高度本身超过视口的部分交给 MkMenu 的 max-height 滚动
	if (rootRect.top + top + myRect.height >= (window.innerHeight - SCROLLBAR_THICKNESS)) {
		top = top - ((rootRect.top + top + myRect.height) - (window.innerHeight - SCROLLBAR_THICKNESS));
	}
	if (rootRect.top + top < 0) {
		top = -rootRect.top;
	}
	el.value.style.left = left + 'px';
	el.value.style.top = top + 'px';
}

function onChildClosed(actioned?: boolean) {
	if (actioned) {
		emit('actioned');
	} else {
		emit('closed');
	}
}

watch(() => props.anchorElement, () => {
	setPosition();
});

const ro = new ResizeObserver((entries, observer) => {
	setPosition();
});

onMounted(() => {
	if (el.value) ro.observe(el.value);
	setPosition();
	nextTick(() => {
		setPosition();
	});
});

onUnmounted(() => {
	ro.disconnect();
});

defineExpose({
	rootElement: el,
	checkHit: (ev: MouseEvent) => {
		return (ev.target === el.value || el.value?.contains(ev.target as Node));
	},
});
</script>

<style lang="scss" module>
.root {
	position: absolute;
}
</style>
