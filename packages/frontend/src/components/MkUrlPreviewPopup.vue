<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="$style.root" :style="{ zIndex, top: top + 'px', left: left + 'px' }" aria-hidden="true" inert>
	<Transition :name="prefer.s.animation ? '_transition_zoom' : ''" @afterLeave="emit('closed')">
		<div v-if="showing" class="_shadow" :class="$style.preview" :style="{ transformOrigin }">
			<MkUrlPreview :url="url" :showActions="false"/>
		</div>
	</Transition>
</div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import { getScrollContainer } from '@@/js/scroll.js';
import type { TooltipPointerPosition } from '@/composables/use-tooltip.js';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import * as os from '@/os.js';
import { calcDropdownPosition } from '@/utility/menu-position.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{
	showing: boolean;
	url: string;
	anchorElement: HTMLElement;
	pointerPosition?: TooltipPointerPosition | null;
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

	const pointer = props.pointerPosition;
	const anchor = pointer == null ? props.anchorElement.getBoundingClientRect() : {
		left: pointer.x,
		right: pointer.x,
		top: pointer.y,
		bottom: pointer.y,
	};
	const boundary = props.anchorElement.closest<HTMLElement>('[data-popup-boundary], [data-emoji-picker-boundary], ._pageContent')
		?? getScrollContainer(props.anchorElement);
	const result = calcDropdownPosition(
		{ width: rootEl.value.offsetWidth, height: rootEl.value.offsetHeight },
		anchor,
		{ width: window.innerWidth, height: window.innerHeight },
		{ boundary: boundary?.isConnected ? boundary.getBoundingClientRect() : undefined },
	);

	top.value = result.top + window.scrollY;
	left.value = result.left + window.scrollX;
	transformOrigin.value = result.transformOrigin;
}

watch(() => props.pointerPosition, setPosition);

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

.preview {
	--MI-urlPreviewMarginBlock: 0px;
	padding: 0;
	border-radius: calc(var(--MI-radius) * .75);
	max-height: calc(100vh - 32px);
	overflow: hidden;
}
</style>
