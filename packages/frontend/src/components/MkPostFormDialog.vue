<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal
	ref="modal"
	:preferType="'dialog'"
	:fullScreen="maximized"
	:closeOnBackdrop="false"
	@closed="onModalClosed()"
	@esc="onEsc"
>
	<div :class="[$style.form, { [$style.maximized]: maximized }]" class="_popup">
		<MkPostForm
			ref="form"
			v-model:maximized="maximized"
			:class="$style.editor"
			v-bind="props"
			:autofocus="false"
			freezeAfterPosted
			canMaximize
			@posted="onPosted"
			@cancel="_close()"
			@esc="_close()"
		/>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef } from 'vue';
import type { PostFormProps } from '@/types/post-form.js';
import MkModal from '@/components/MkModal.vue';
import MkPostForm from '@/components/MkPostForm.vue';

const props = withDefaults(defineProps<PostFormProps & {
	instant?: boolean;
	fixed?: boolean;
	autofocus?: boolean;
}>(), {
	initialLocalOnly: undefined,
});

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const modal = useTemplateRef('modal');
const form = useTemplateRef('form');

// 最大化时要解除这里的宽度上限，所以状态与表单双向共享
const maximized = ref(false);
let closing = false;

function onPosted() {
	void _close();
}

async function _close() {
	if (closing) return;
	closing = true;
	try {
		const canClose = await form.value?.canClose();
		if (!canClose) {
			closing = false;
			return;
		}
		form.value?.abortUploader();
		modal.value?.close();
	} catch (error) {
		closing = false;
		throw error;
	}
}

function onEsc() {
	_close();
}

function onModalClosed() {
	// Reset after the close transition so the disappearing form does not repaint with cleared values.
	if (!props.editingNote) form.value?.clear();
	emit('closed');
}
</script>

<style lang="scss" module>
.form {
	display: flex;
	flex-direction: column;
	width: 100%;
	max-width: 520px;
	margin: 0 auto auto auto;
}

.editor { min-height: 0; }
.maximized > .editor { flex: 1; height: auto; }

// The modal removes its insets so the composer reaches every edge of the viewport.
.form.maximized {
	max-width: none;
	height: 100%;
	min-height: 0;
	margin: 0;
	border-radius: 0;
	overflow: clip;
}
</style>
