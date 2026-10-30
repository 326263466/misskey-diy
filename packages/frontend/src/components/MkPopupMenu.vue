<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal
	ref="modal"
	v-slot="{ type, maxHeight, guardInitialPointer, anchorWidth, ready }"
	:manualShowing="manualShowing"
	:zPriority="'high'"
	:anchorElement="anchorElement"
	:menu="true"
	:menuPlacement="placement"
	:menuAlign="anchorAlign"
	:menuMatchAnchorWidth="matchAnchorWidth"
	:getContentHeight="getContentHeight"
	:transparentBg="true"
	:returnFocusTo="returnFocusTo"
	@click="click"
	@esc="close"
	@close="onModalClose"
	@closed="onModalClosed"
>
	<MkMenu
		ref="menu"
		:items="items"
		:align="align"
		:style="menuStyle"
		:width="matchAnchorWidth ? (anchorWidth ?? width) : width"
		:max-height="maxHeight"
		:guardInitialPointer="guardInitialPointer"
		:focusReady="ready"
		:asDrawer="type === 'drawer'"
		:returnFocusTo="returnFocusTo"
		:debugDisablePredictionCone="debugDisablePredictionCone"
		:debugShowPredictionCone="debugShowPredictionCone"
		:class="{ [$style.drawer]: type === 'drawer' }"
		@close="onMenuClose"
		@hide="hide"
		@actioned="emit('actioned')"
	/>
</MkModal>
</template>

<script lang="ts" setup>
import { onMounted, ref, useTemplateRef, watch } from 'vue';
import type { CSSProperties } from 'vue';
import MkModal from './MkModal.vue';
import MkMenu from './MkMenu.vue';
import type { MenuItem } from '@/types/menu.js';
import type { MenuAlign, MenuSide } from '@/utility/menu-position.js';

const props = defineProps<{
	items: MenuItem[];
	align?: 'center' | string;
	anchorAlign?: MenuAlign;
	placement?: MenuSide;
	/** 菜单宽度跟随触发元素（select 类下拉），默认按内容自适应 */
	matchAnchorWidth?: boolean;
	width?: number;
	menuStyle?: CSSProperties;
	anchorElement?: HTMLElement | null;
	returnFocusTo?: HTMLElement | null;
	/** 打开其他菜单时由外部置为 true，以正常的关闭流程收起。 */
	closeRequested?: boolean;
	debugDisablePredictionCone?: boolean;
	debugShowPredictionCone?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
	(ev: 'closing'): void;
	(ev: 'actioned'): void;
	(ev: 'click', event?: MouseEvent): void;
}>();

const modal = useTemplateRef('modal');
const menu = useTemplateRef('menu');
const manualShowing = ref(true);
const hiding = ref(false);

function getContentHeight() {
	return menu.value?.getContentHeight?.();
}

function click(event?: MouseEvent) {
	emit('click', event);
	close();
}

function onModalClose() {
	emit('closing');
}

function onMenuClose() {
	close();
	if (hiding.value) {
		// hidingであればclosedを発火
		emit('closed');
	}
}

function onModalClosed() {
	if (!hiding.value) {
		// hidingでなければclosedを発火
		emit('closed');
	}
}

function hide() {
	manualShowing.value = false;
	hiding.value = true;

	// closeは呼ぶ必要がある
	modal.value?.close();
}

function close() {
	manualShowing.value = false;

	// closeは呼ぶ必要がある
	modal.value?.close();
}

onMounted(() => {
	watch(() => props.closeRequested, requested => {
		if (requested) close();
	}, { immediate: true });
});
</script>

<style lang="scss" module>
.drawer {
	border-radius: 24px;
	border-bottom-right-radius: 0;
	border-bottom-left-radius: 0;
}
</style>
