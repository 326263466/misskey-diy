<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal
	ref="modal"
	v-slot="{ type, maxHeight }"
	:class="$style.modal"
	:waitForPosition="true"
	:zPriority="'middle'"
	:preferType="prefer.s.emojiPickerStyle"
	:hasInteractionWithOtherFocusTrappedEls="true"
	:transparentBg="true"
	:manualShowing="manualShowing"
	:anchorElement="anchorElement"
	:boundaryElement="boundaryElement"
	@click="close"
	@esc="close"
	@opening="opening"
	@close="onClose"
	@closed="emit('closed')"
>
	<MkEmojiPicker
		ref="picker"
		class="_popup _shadow"
		:class="{ [$style.drawer]: type === 'drawer' }"
		:showPinned="showPinned"
		:pinnedEmojis="pinnedEmojis"
		:asReactionPicker="asReactionPicker"
		:targetNote="targetNote"
		:asDrawer="type === 'drawer'"
		:max-height="maxHeight"
		@chosen="chosen"
		@esc="close"
	/>
</MkModal>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { computed, onBeforeUnmount, useTemplateRef } from 'vue';
import MkModal from '@/components/MkModal.vue';
import MkEmojiPicker from '@/components/MkEmojiPicker.vue';
import { prefer } from '@/preferences.js';

const props = withDefaults(defineProps<{
	manualShowing?: boolean | null;
	anchorElement?: HTMLElement | null;
	showPinned?: boolean;
	pinnedEmojis?: string[],
	asReactionPicker?: boolean;
	targetNote?: Misskey.entities.Note | null;
	choseAndClose?: boolean;
}>(), {
	manualShowing: null,
	showPinned: true,
	pinnedEmojis: undefined,
	asReactionPicker: false,
	choseAndClose: true,
});

const emit = defineEmits<{
	(ev: 'done', v: string): void;
	(ev: 'close'): void;
	(ev: 'closed'): void;
}>();

const modal = useTemplateRef('modal');
const picker = useTemplateRef('picker');
const boundaryElement = computed(() => props.anchorElement?.closest<HTMLElement>('[data-popup-boundary], [data-emoji-picker-boundary], ._pageContent') ?? null);
let chosenOnce = false;
let focusTimer: number | undefined;

function close() {
	modal.value?.close();
}

function onClose() {
	window.clearTimeout(focusTimer);
	emit('close');
}

function chosen(emoji: string) {
	if (props.choseAndClose && chosenOnce) return;
	chosenOnce = true;
	emit('done', emoji);
	if (props.choseAndClose) {
		close();
	}
}

function opening() {
	chosenOnce = false;
	picker.value?.reset();
	picker.value?.focus();

	// 何故かちょっと待たないとフォーカスされない
	window.clearTimeout(focusTimer);
	focusTimer = window.setTimeout(() => {
		picker.value?.focus();
	}, 10);
}

onBeforeUnmount(() => window.clearTimeout(focusTimer));

defineExpose({ close });
</script>

<style lang="scss" module>
.modal :global(._modalBg) {
	-webkit-backdrop-filter: none;
	backdrop-filter: none;
}

.drawer {
	border-radius: 24px;
	border-bottom-right-radius: 0;
	border-bottom-left-radius: 0;
}
</style>
