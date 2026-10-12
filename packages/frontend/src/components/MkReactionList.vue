<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component
	:is="prefer.s.animation ? TransitionGroup : 'div'"
	:enterActiveClass="$style.enterActive"
	:enterFromClass="$style.enterFrom"
	:moveClass="$style.enterActive"
	tag="div"
	:class="$style.root"
	@leave="finishLeave"
>
	<slot></slot>
	<button v-if="canAdd" key="add-reaction" type="button" class="_button" :class="$style.addButton" :aria-label="i18n.ts._chat.addReaction" :disabled="addDisabled" @click.stop="emit('add', $event)"><i class="ti ti-mood-happy" aria-hidden="true"></i></button>
</component>
</template>

<script lang="ts" setup>
import { TransitionGroup } from 'vue';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';

defineProps<{ canAdd?: boolean; addDisabled?: boolean }>();
const emit = defineEmits<{ (event: 'add', mouseEvent: MouseEvent): void }>();

function finishLeave(_element: Element, done: () => void) {
	// 点击撤回的 chip 已在请求前完成淡出，移除时不再让其他项播放离场。
	done();
}
</script>

<style lang="scss" module>
@use "../styles/reaction-chip.scss";

.root { @include reaction-chip.list; }
.addButton {
	@include reaction-chip.chip;
	width: 28px;
	padding: 0;
	font-size: 14px;
}
.enterActive { @include reaction-chip.enterActive; }
.enterFrom { @include reaction-chip.enterFrom; }
</style>
