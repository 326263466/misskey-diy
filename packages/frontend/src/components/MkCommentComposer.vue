<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<form :class="[$style.root, { [$style.docked]: docked }]" @submit.prevent="submit">
	<template v-if="!inline && !docked">
		<MkAvatar v-if="$i" :user="$i" :class="$style.avatar"/>
		<div v-else :class="[$style.avatar, $style.guestAvatar]" aria-hidden="true"><i class="ti ti-user-filled"></i></div>
	</template>
	<div :class="$style.editorBody">
		<div v-if="docked && !expanded" :class="$style.dockRow">
			<button ref="dockInput" type="button" class="_button" :class="$style.dockInput" :aria-label="label ?? i18n.ts._article.comment" :disabled="disabled || readonly" @click="focus()"><i class="ti ti-pencil" aria-hidden="true"></i><span>{{ text.trim() || placeholder }}</span></button>
			<div v-if="$slots.compactActions" :class="$style.dockActions"><slot name="compactActions"></slot></div>
		</div>
		<div v-show="!docked || expanded">
			<slot name="before"></slot>
			<MkPostFormInput ref="input" v-model="text" v-model:files="files" :maxLength="maxLength" :textLength="textLength" :rows="rows" :disabled="disabled" :readonly="readonly" :label="label" :placeholder="placeholder" :managed="managed" :images="!managed" :emoji="!managed" :autocomplete="autocomplete" @submit="emit('submit')">
				<template v-if="$slots.attachments" #attachments><slot name="attachments"></slot></template>
				<template v-if="$slots.tools" #tools="{ toolClass }"><slot name="tools" :toolClass="toolClass"></slot></template>
				<template #actions="{ valid, busy }">
					<div :class="$style.actions">
						<button v-if="docked" type="button" class="_button" :class="$style.close" :aria-label="i18n.ts.close" :disabled="sending || busy" @click="collapse"><i class="ti ti-chevron-down" aria-hidden="true"></i></button>
						<slot name="actions" :valid="valid" :busy="busy" :optionClass="$style.option">
							<MkButton primary small :disabled="!$i || disabled || !valid" :wait="sending" type="submit">{{ submitLabel }}</MkButton>
						</slot>
					</div>
				</template>
			</MkPostFormInput>
		</div>
	</div>
</form>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { CONTENT_LIMITS } from 'misskey-js';
import type { entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkPostFormInput from '@/components/MkPostFormInput.vue';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	inline?: boolean;
	docked?: boolean;
	maxLength?: number;
	textLength?: number;
	rows?: number;
	disabled?: boolean;
	readonly?: boolean;
	sending?: boolean;
	submitLabel?: string;
	placeholder?: string;
	label?: string;
	managed?: boolean;
	autocomplete?: boolean;
}>(), {
	maxLength: CONTENT_LIMITS.commentText,
	submitLabel: i18n.ts._article.publishComment,
	placeholder: i18n.ts._article.commentPlaceholder,
	autocomplete: true,
});

const text = defineModel<string>({ required: true });
const files = defineModel<entities.DriveFile[]>('files', { default: () => [] });
const emit = defineEmits<{ (event: 'submit'): void }>();
const input = useTemplateRef('input');
const dockInput = useTemplateRef('dockInput');
const expanded = ref(false);
const busy = computed(() => input.value?.busy ?? false);
const valid = computed(() => input.value?.valid ?? false);
const inputElement = computed(() => input.value?.inputElement ?? null);

function focus(options: FocusOptions = { preventScroll: true }) {
	if (props.docked && !expanded.value) {
		expanded.value = true;
		void nextTick(() => { if (props.docked && expanded.value) input.value?.focus(options); });
	} else {
		input.value?.focus(options);
	}
}

function collapse() {
	expanded.value = false;
	void nextTick(() => { if (props.docked && !expanded.value) dockInput.value?.focus({ preventScroll: true }); });
}

function submitted() {
	input.value?.submitted();
	if (props.docked) collapse();
}

watch(() => props.docked, () => { expanded.value = false; });

function submit(event: SubmitEvent) {
	// 摘要输入和附件操作不能触发隐式发表，只接受明确的提交按钮。
	if (event.submitter?.getAttribute('type') !== 'submit') return;
	emit('submit');
}

defineExpose({ focus, submitted, busy, valid, inputElement });
</script>

<style lang="scss" module>
.root { --MI-postForm-inputPadding: 12px; --MI-postForm-inputBorder: transparent; display: flex; align-items: flex-start; gap: 12px; width: 100%; min-width: 0; }
.editorBody { flex: 1 1 auto; width: 100%; min-width: 0; }
.docked { max-height: min(60dvh, 420px); overflow-y: auto; }
.dockRow { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dockInput {
	display: flex;
	flex: 1;
	align-items: center;
	gap: 8px;
	min-width: 0;
	min-height: 44px;
	padding-inline: 12px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panelHighlight);
	color: var(--MI_THEME-fgTransparentWeak);
	text-align: start;

	> span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	&:disabled { opacity: .5; }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}
.dockActions { display: flex; flex-shrink: 0; align-items: center; gap: 2px; }
.close {
	display: grid;
	place-items: center;
	min-width: 36px;
	min-height: 36px;
	border-radius: var(--MI-radius);
	color: var(--MI_THEME-fgTransparentWeak);

	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}
.avatar { flex-shrink: 0; width: 36px; height: 36px; }
.guestAvatar { display: grid; place-items: center; border-radius: 50%; background: var(--MI_THEME-panelHighlight); color: var(--MI_THEME-fgTransparentWeak); font-size: 24px; overflow: hidden; }
.actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; }
.option { display: inline-flex; align-items: center; gap: 6px; min-width: 0; font-size: .85em; color: var(--MI_THEME-fgTransparent); cursor: pointer; }
.option > input { flex-shrink: 0; margin: 0; accent-color: var(--MI_THEME-accent); }
.option > span { overflow-wrap: anywhere; }
</style>
