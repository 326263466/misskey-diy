<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="el" :class="$style.root">
	<div :class="$style.bridge" :style="bridgeStyle" aria-hidden="true" @mouseenter="onBridgeMove" @mousemove="onBridgeMove"></div>
	<MkMenu
		:items="items"
		:align="align"
		:width="width"
		:asDrawer="false"
		:guardInitialPointer="guardInitialPointer"
		:focusOnMount="focusOnMount"
		:debugDisablePredictionCone="debugDisablePredictionCone"
		:debugShowPredictionCone="debugShowPredictionCone"
		@close="onChildClosed"
	/>
</div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, onUnmounted, provide, ref, useTemplateRef, watch } from 'vue';
import MkMenu from './MkMenu.vue';
import type { MenuItem } from '@/types/menu.js';
import { calcMenuPosition, MENU_PADDING_Y } from '@/utility/menu-position.js';

const props = defineProps<{
	items: MenuItem[];
	anchorElement: HTMLElement;
	rootElement: HTMLElement;
	width?: number;
	focusOnMount?: boolean;
	debugDisablePredictionCone?: boolean;
	debugShowPredictionCone?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
	(ev: 'actioned'): void;
}>();

provide('isNestingMenu', true);

const el = useTemplateRef('el');
const guardInitialPointer = ref(false);
const bridgeStyle = ref({});
const align = 'left';

function setPosition() {
	if (el.value == null) return;
	const rootRect = props.rootElement.getBoundingClientRect();
	const parentRect = props.anchorElement.getBoundingClientRect();
	const position = calcMenuPosition(
		{ width: el.value.offsetWidth, height: el.value.offsetHeight },
		{ left: rootRect.left, right: rootRect.right, top: parentRect.top, bottom: parentRect.bottom },
		{ width: window.innerWidth, height: window.innerHeight },
		true,
		// 首项与父菜单项对齐。
		-MENU_PADDING_Y,
	);
	el.value.style.left = `${position.left - rootRect.left}px`;
	el.value.style.top = `${position.top - rootRect.top}px`;
	el.value.style.transformOrigin = position.transformOrigin;
	guardInitialPointer.value = position.overlapsAnchor;

	// 只覆盖菜单之间的空隙，进入其他父菜单项仍会立即关闭子菜单。
	const childRight = position.left + el.value.offsetWidth;
	const childBottom = position.top + el.value.offsetHeight;
	const horizontal = position.left >= rootRect.right || childRight <= rootRect.left;
	const bridgeLeft = horizontal
		? position.left >= rootRect.right ? rootRect.right : childRight
		: Math.max(parentRect.left, position.left);
	const bridgeRight = horizontal
		? position.left >= rootRect.right ? position.left : rootRect.left
		: Math.min(parentRect.right, childRight);
	const bridgeTop = horizontal
		? Math.min(parentRect.top, position.top)
		: position.top >= parentRect.bottom ? parentRect.bottom : childBottom;
	const bridgeBottom = horizontal
		? Math.max(parentRect.bottom, childBottom)
		: position.top >= parentRect.bottom ? position.top : parentRect.top;
	bridgeStyle.value = {
		left: `${bridgeLeft - position.left}px`,
		top: `${bridgeTop - position.top}px`,
		width: `${Math.max(0, bridgeRight - bridgeLeft)}px`,
		height: `${Math.max(0, bridgeBottom - bridgeTop)}px`,
	};
}

function onBridgeMove(ev: MouseEvent) {
	// 上下回退时空隙可能落在另一个父菜单项上，不能替该项吞掉 hover。
	const item = window.document.elementsFromPoint(ev.clientX, ev.clientY)
		.find(element => props.rootElement.contains(element))
		?.closest('[role^="menuitem"]');
	if (item && item !== props.anchorElement) emit('closed');
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

function onViewportChange() {
	nextTick(setPosition);
}

onMounted(() => {
	if (el.value) ro.observe(el.value);
	window.document.addEventListener('scroll', onViewportChange, { capture: true, passive: true });
	window.addEventListener('resize', onViewportChange, { passive: true });
	setPosition();
	nextTick(() => {
		setPosition();
	});
});

onUnmounted(() => {
	ro.disconnect();
	window.document.removeEventListener('scroll', onViewportChange, true);
	window.removeEventListener('resize', onViewportChange);
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
	z-index: 2;
}

.bridge {
	position: absolute;
}
</style>
