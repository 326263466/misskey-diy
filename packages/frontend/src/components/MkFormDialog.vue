<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:closeOnBackdrop="closeOnBackdrop"
	:width="450"
	autoHeight
	:canClose="false"
	:withOkButton="true"
	:okButtonDisabled="!canSave"
	@ok="ok()"
	@close="cancel()"
	@esc="cancel()"
	@closed="emit('closed')"
>
	<template #header>
		{{ title }}
	</template>

	<div class="_spacer _spacerCard">
		<MkForm v-model="values" :form="form" @canSaveStateChange="onCanSaveStateChanged"/>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef } from 'vue';
import type { Form } from '@/utility/form.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkForm from '@/components/MkForm.vue';

const props = withDefaults(defineProps<{
	title: string;
	form: Form;
	closeOnBackdrop?: boolean;
}>(), {
	closeOnBackdrop: false,
});

const emit = defineEmits<{
	(ev: 'done', v: {
		canceled: true;
	} | {
		result: Record<string, any>;
	}): void;
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');

const values = ref((() => {
	const obj: Record<string, any> = {};
	for (const item in props.form) {
		if ('default' in props.form[item]) {
			obj[item] = props.form[item].default ?? null;
		} else {
			obj[item] = null;
		}
	}
	return obj;
})());

const canSave = ref(true);

function onCanSaveStateChanged(newCanSave: boolean) {
	canSave.value = newCanSave;
}

function ok() {
	if (!canSave.value) return;

	emit('done', {
		result: values.value,
	});
	dialog.value?.close();
}

function cancel() {
	emit('done', {
		canceled: true,
	});
	dialog.value?.close();
}
</script>
