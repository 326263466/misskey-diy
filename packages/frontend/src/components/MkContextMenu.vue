<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Teleport :to="fullscreenTarget ?? 'body'" :disabled="fullscreenTarget == null">
<Transition
	appear
	:enterActiveClass="prefer.s.animation ? $style.transition_fade_enterActive : ''"
	:leaveActiveClass="prefer.s.animation ? $style.transition_fade_leaveActive : ''"
	:enterFromClass="prefer.s.animation ? $style.transition_fade_enterFrom : ''"
	:leaveToClass="prefer.s.animation ? $style.transition_fade_leaveTo : ''"
>
	<div ref="rootEl" v-bind="$attrs" :class="[$style.root, { [$style.fullscreen]: fullscreenTarget != null }]" :style="{ zIndex }" @contextmenu.prevent.stop="() => {}">
		<MkMenu :items="items" :align="'left'" :guardInitialPointer="guardInitialPointer" @close="emit('closed')"/>
	</div>
</Transition>
</Teleport>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, useTemplateRef, ref } from 'vue';
import MkMenu from './MkMenu.vue';
import type { MenuItem } from '@/types/menu.js';
import { usePopupDismissal } from '@/composables/use-popup-dismissal.js';
import { calcMenuPosition } from '@/utility/menu-position.js';
import { prefer } from '@/preferences.js';
import * as os from '@/os.js';

defineOptions({ inheritAttrs: false });
const fullscreenTarget = window.document.fullscreenElement;

const props = withDefaults(defineProps<{
	items: MenuItem[];
	ev: PointerEvent;
	closeOnBackdrop?: boolean;
}>(), {
	closeOnBackdrop: true,
});

const emit = defineEmits<{
	(ev: 'closed', restoreFocus?: boolean): void;
}>();

const rootEl = useTemplateRef('rootEl');
const guardInitialPointer = ref(false);

const zIndex = ref<number>(os.claimZIndex('high'));

usePopupDismissal({
	element: () => rootEl.value,
	isShowing: () => true,
	onEscape: () => emit('closed'),
	onClickOutside: () => {
		if (props.closeOnBackdrop) emit('closed');
	},
	onContextMenuOutside: () => {
		if (props.closeOnBackdrop) emit('closed', false);
	},
});

function align() {
	if (rootEl.value == null) return;
	const x = props.ev.pageX - window.scrollX;
	const y = props.ev.pageY - window.scrollY;
	const position = calcMenuPosition(
		{ width: rootEl.value.offsetWidth, height: rootEl.value.offsetHeight },
		{ left: x, right: x, top: y, bottom: y },
		{ width: window.innerWidth, height: window.innerHeight },
	);
	rootEl.value.style.top = `${position.top + (fullscreenTarget == null ? window.scrollY : 0)}px`;
	rootEl.value.style.left = `${position.left + (fullscreenTarget == null ? window.scrollX : 0)}px`;
	rootEl.value.style.transformOrigin = position.transformOrigin;
	guardInitialPointer.value = position.overlapsAnchor;
}

const alignObserver = new ResizeObserver(align);

function onFullscreenChange() {
	if (window.document.fullscreenElement !== fullscreenTarget) emit('closed');
}

onMounted(() => {
	if (fullscreenTarget != null) window.document.addEventListener('fullscreenchange', onFullscreenChange);
	align();
	if (rootEl.value) alignObserver.observe(rootEl.value);
	window.addEventListener('resize', align, { passive: true });
});

onBeforeUnmount(() => {
	window.document.removeEventListener('fullscreenchange', onFullscreenChange);
	alignObserver.disconnect();
	window.removeEventListener('resize', align);
});
</script>

<style lang="scss" module>
.transition_fade_enterActive,
.transition_fade_leaveActive {
	transition: opacity 0.1s cubic-bezier(0, 0, 0.2, 1);
}
.transition_fade_enterFrom,
.transition_fade_leaveTo {
	pointer-events: none;
	opacity: 0;
}

.root {
	position: absolute;
}

.fullscreen {
	position: fixed;
}
</style>
