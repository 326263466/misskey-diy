<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal
	ref="modal"
	:preferType="'dialog'"
	@click="onBgClick()"
	@closed="onModalClosed()"
	@esc="onEsc"
>
	<MkPostForm
		ref="form"
		v-model:maximized="maximized"
		:class="[$style.form, { [$style.maximized]: maximized }]"
		class="_popup"
		v-bind="props"
		autofocus
		freezeAfterPosted
		canMaximize
		@posted="onPosted"
		@cancel="_close()"
		@esc="_close()"
	/>
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
	modal.value?.close({
		useSendAnimation: true,
	});
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

function onBgClick() {
	_close();
}

function onModalClosed() {
	// Reset after the close transition so the disappearing form does not repaint with cleared values.
	form.value?.clear();
	emit('closed');
}
</script>

<style lang="scss" module>
.form {
	width: 100%;
	max-width: 520px;
	margin: 0 auto auto auto;
}

// 最大化时铺满 MkModal 的 dialog 容器（该容器自带 32px 内边距）
// 这里不能用 overflow: auto，否则整块面板会长出滚动条、操作栏也跟着被推下去
.maximized {
	max-width: none;
	height: 100%;
	min-height: 0;
	margin: 0;
	overflow: clip;
}
</style>
