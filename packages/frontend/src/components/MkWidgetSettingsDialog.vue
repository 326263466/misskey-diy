<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="1000"
	:height="600"
	:scroll="false"
	@close="cancel()"
	@closed="emit('closed')"
	@click="cancel()"
>
	<template #header><i class="ti ti-icons"></i> {{ widgetName === 'chat' ? i18n.ts.chat : (i18n.ts._widgets[widgetName] ?? widgetName) }}</template>

	<MkPreviewWithControls>
		<template #preview>
			<div :class="[$style.previewWrapper, { [$style.previewInteractive]: widgetName === 'pomodoro' }]">
				<div class="_acrylic" :class="$style.previewTitle">{{ i18n.ts.preview }}</div>

				<div ref="resizerRootEl" :class="$style.previewResizerRoot" :inert="widgetName !== 'pomodoro'">
					<div
						ref="resizerEl"
						:class="$style.previewResizer"
						:style="{ transform: widgetStyle }"
					>
						<component
							:is="`widget-${widgetName}`"
							:widget="{ name: widgetName, id: '__PREVIEW__', data: settings }"
						></component>
					</div>
				</div>
			</div>
		</template>

		<template #controls>
			<div class="_spacer _spacerCard _gaps_m">
				<MkForm :key="formKey" v-model="settings" :form="form" @canSaveStateChange="onCanSaveStateChanged"/>
				<div :class="$style.footer">
					<MkButton v-if="canReset" :class="$style.footerButton" @click="resetToDefault"><i class="ti ti-restore" aria-hidden="true"></i> {{ i18n.ts.resetToDefaultValue }}</MkButton>
					<MkButton primary :class="$style.footerButton" :disabled="!canSave" @click="save()">{{ i18n.ts.confirm }} <i class="ti ti-check" aria-hidden="true"></i></MkButton>
				</div>
			</div>
		</template>
	</MkPreviewWithControls>
</MkModalWindow>
</template>

<script setup lang="ts">
import { useTemplateRef, ref, computed, onBeforeUnmount, onMounted } from 'vue';
import MkPreviewWithControls from './MkPreviewWithControls.vue';
import type { FormWithDefault } from '@/utility/form.js';
import { getDefaultFormValues } from '@/utility/form.js';
import type { WidgetName } from '@/widgets/index.js';
import { deepClone } from '@/utility/clone.js';
import { i18n } from '@/i18n.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkForm from '@/components/MkForm.vue';
import MkButton from '@/components/MkButton.vue';

const props = defineProps<{
	widgetName: WidgetName;
	form: FormWithDefault;
	currentSettings: Record<string, any>;
}>();

const emit = defineEmits<{
	(ev: 'saved', settings: Record<string, any>): void;
	(ev: 'canceled'): void;
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');

const settings = ref<Record<string, any>>(deepClone(props.currentSettings));
const formKey = ref(0);
const canReset = computed(() => Object.values(props.form).some(item => item.hidden !== true && item.type !== 'button'));

const canSave = ref(true);

function onCanSaveStateChanged(newCanSave: boolean) {
	canSave.value = newCanSave;
}

function resetToDefault() {
	const defaults: Record<string, any> = getDefaultFormValues(props.form);
	const resetSettings = deepClone(settings.value);
	for (const key of Object.keys(defaults)) {
		// Hidden fields hold user content and running timers, rather than form settings.
		if (props.form[key].hidden === true || props.form[key].type === 'button') continue;
		resetSettings[key] = deepClone(defaults[key]);
	}
	settings.value = resetSettings;
	// Discard unsaved input drafts and let the new form validate the defaults.
	formKey.value++;
}

function save() {
	if (!canSave.value) return;
	emit('saved', deepClone(settings.value));
	dialog.value?.close();
}

function cancel() {
	emit('canceled');
	dialog.value?.close();
}

//#region プレビューのリサイズ
const resizerRootEl = useTemplateRef('resizerRootEl');
const resizerEl = useTemplateRef('resizerEl');
const widgetHeight = ref(0);
const widgetScale = ref(1);
const widgetStyle = computed(() => {
	return `translate(-50%, -50%) scale(${widgetScale.value})`;
});
const ro1 = new ResizeObserver(() => {
	widgetHeight.value = resizerEl.value!.clientHeight;
	calcScale();
});
const ro2 = new ResizeObserver(() => {
	calcScale();
});

function calcScale() {
	if (!resizerRootEl.value) return;
	const previewWidth = resizerRootEl.value.clientWidth - 40; // 左右の余白 20pxずつ
	const previewHeight = resizerRootEl.value.clientHeight - 40; // 上下の余白 20pxずつ
	const widgetWidth = 280;
	const scale = Math.min(previewWidth / widgetWidth, previewHeight / widgetHeight.value, 1); // 拡大はしないので1を上限に
	widgetScale.value = scale;
}

onMounted(() => {
	if (resizerEl.value) {
		ro1.observe(resizerEl.value);
	}
	if (resizerRootEl.value) {
		ro2.observe(resizerRootEl.value);
	}
	calcScale();
});

onBeforeUnmount(() => {
	ro1.disconnect();
	ro2.disconnect();
});
//#endregion
</script>

<style module>
.previewContainer {
	display: flex;
	flex-direction: column;
	height: 100%;
	user-select: none;
	-webkit-user-drag: none;
}

.previewTitle {
	position: absolute;
	z-index: 100;
	top: 8px;
	left: 8px;
	padding: 6px 10px;
	border-radius: 6px;
	font-size: 85%;
}

.previewWrapper {
	display: flex;
	flex-direction: column;
	height: 100%;
	pointer-events: none;
	user-select: none;
	-webkit-user-drag: none;
}

.previewInteractive {
	pointer-events: auto;
}

.previewResizerRoot {
	position: relative;
	flex: 1 0;
}

.previewResizer {
	position: absolute;
	container-type: inline-size;
	top: 50%;
	left: 50%;
	width: 280px;
}

.footer {
	display: flex;
	gap: 8px;
}

.footerButton {
	flex: 1;
	margin: 0;
}
</style>
