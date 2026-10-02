<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :class="$style.root" :width="420" :height="520" autoHeight @close="close" @click="close" @esc="close" @closed="emit('closed')">
	<template #header>{{ i18n.ts._onlineStatus.customStatus }}</template>
	<form :class="$style.content" @submit.prevent>
		<div :class="$style.preview" :aria-label="i18n.ts.preview">
			<MkStatusIcon status="custom" :icon="icon" :class="$style.previewIcon"/>
			<div :class="$style.textEditor">
				<input
					v-if="editing"
					ref="inputEl"
					:value="text"
					:class="$style.input"
					type="text"
					:placeholder="i18n.ts._onlineStatus.customStatusPlaceholder"
					:disabled="saving"
					:aria-label="i18n.ts.text"
					:aria-invalid="tooLong || invalidCharacters"
					autocomplete="off"
					@input="onInput"
					@compositionstart="composing = true"
					@compositionend="onCompositionEnd"
					@keydown.enter="onEnter"
					@keydown.esc="onEscape"
					@blur="finishEditing()"
				>
				<button v-else ref="textButton" type="button" class="_button" :class="$style.textButton" :aria-label="i18n.ts.text" :disabled="saving" @click="startEditing">
					<span>{{ text || i18n.ts._onlineStatus.customStatusPlaceholder }}</span>
				</button>
			</div>
		</div>
		<fieldset :class="$style.icons" :disabled="saving" :aria-label="i18n.ts.icon">
			<label v-for="value in customStatusIcons" :key="value" :class="[$style.iconOption, { [$style.selected]: icon === value }]">
				<input type="radio" :name="iconName" :value="value" :checked="icon === value" @change="selectIcon(value)">
				<MkStatusIcon status="custom" :icon="value" :class="$style.optionIcon"/>
				<span>{{ i18n.ts._onlineStatus._icons[value] }}</span>
			</label>
		</fieldset>
	</form>
	<template #footer>
		<div :class="$style.actions">
			<MkButton v-if="initialStatus" danger :class="$style.remove" :disabled="saving" @click="saveValue(null)">{{ i18n.ts.remove }}</MkButton>
			<MkButton primary :disabled="!valid || saving" :wait="saving" @click="submit">{{ i18n.ts._onlineStatus.useStatus }}</MkButton>
		</div>
	</template>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import MkStatusIcon from '@/components/MkStatusIcon.vue';
import { i18n } from '@/i18n.js';
import { CUSTOM_STATUS_TEXT_LIMIT, customStatusIcons } from '@/utility/status-icons.js';
import type { CustomStatus, CustomStatusIcon } from '@/utility/status-icons.js';

const props = defineProps<{
	initialStatus?: CustomStatus | null;
	save: (status: CustomStatus | null) => Promise<void>;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const dialogEl = useTemplateRef('dialogEl');
const inputEl = useTemplateRef('inputEl');
const textButton = useTemplateRef('textButton');
const iconName = useId();
const icon = ref<CustomStatusIcon>(props.initialStatus?.icon ?? 'coffee');
const text = ref(props.initialStatus?.text ?? getIconText(icon.value));
const editing = ref(false);
let textBeforeEditing = text.value;
let finishAfterComposition = false;
const saving = ref(false);
const composing = ref(false);
const normalizedText = computed(() => text.value.trim());
const length = computed(() => [...normalizedText.value].length);
const tooLong = computed(() => length.value > CUSTOM_STATUS_TEXT_LIMIT);
const invalidCharacters = computed(() => /[\p{Cc}\p{Zl}\p{Zp}\u202a-\u202e\u2066-\u2069]/u.test(normalizedText.value));
const valid = computed(() => length.value > 0 && !tooLong.value && !invalidCharacters.value && !composing.value);

function getIconText(value: CustomStatusIcon): string {
	return [...i18n.ts._onlineStatus._icons[value]].slice(0, CUSTOM_STATUS_TEXT_LIMIT).join('');
}

async function startEditing(): Promise<void> {
	if (saving.value) return;
	textBeforeEditing = text.value;
	finishAfterComposition = false;
	editing.value = true;
	await nextTick();
	inputEl.value?.focus();
}

async function finishEditing(restoreFocus = false): Promise<void> {
	if (!editing.value || saving.value) return;
	if (composing.value) {
		finishAfterComposition = true;
		return;
	}
	editing.value = false;
	if (restoreFocus) {
		await nextTick();
		textButton.value?.focus();
	}
}

function selectIcon(value: CustomStatusIcon): void {
	if (saving.value || icon.value === value) return;
	icon.value = value;
	text.value = getIconText(value);
	textBeforeEditing = text.value;
}

function onInput(event: Event): void {
	if (saving.value) return;
	const input = event.target as HTMLInputElement;
	if (composing.value || (event instanceof InputEvent && event.isComposing)) {
		text.value = input.value;
		return;
	}

		const value = input.value;
		const isTruncated = [...value.trim()].length > CUSTOM_STATUS_TEXT_LIMIT;
		text.value = isTruncated ? [...value.trim()].slice(0, CUSTOM_STATUS_TEXT_LIMIT).join('') : value;
	if (input.value !== text.value) {
		const leadingSpace = value.length - value.trimStart().length;
		const caret = Math.max(0, Math.min((input.selectionStart ?? value.length) - leadingSpace, text.value.length));
		input.value = text.value;
		input.setSelectionRange(caret, caret);
	}
}

function onCompositionEnd(event: CompositionEvent): void {
	composing.value = false;
	onInput(event);
	if (finishAfterComposition) void finishEditing();
}

function onEnter(event: KeyboardEvent): void {
	event.preventDefault();
	event.stopPropagation();
	if (composing.value || event.isComposing || event.keyCode === 229) return;
	void finishEditing(true);
}

function onEscape(event: KeyboardEvent): void {
	event.preventDefault();
	event.stopPropagation();
	if (composing.value || event.isComposing || event.keyCode === 229) return;
	text.value = textBeforeEditing;
	void finishEditing(true);
}

function close(): void {
	if (!saving.value) dialogEl.value?.close();
}

async function submit(): Promise<void> {
	if (!valid.value || saving.value) return;
	await saveValue({ icon: icon.value, text: normalizedText.value });
}

async function saveValue(value: CustomStatus | null): Promise<void> {
	if (saving.value) return;
	saving.value = true;
	try {
		await props.save(value);
		dialogEl.value?.close();
	} catch {
		saving.value = false;
		await startEditing();
	} finally {
		saving.value = false;
	}
}
</script>

<style lang="scss" module>
.root {
	--MI-cardPadding: 12px;
}

.content {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 12px 12px 8px;
}

.preview {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 16px;
	height: 108px;
	flex-shrink: 0;
	padding: 12px 10px;
	box-sizing: border-box;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
	overflow-wrap: anywhere;
}

.previewIcon {
	--MI-statusIconSize: 40px;

	flex-shrink: 0;
}

.textEditor {
	position: relative;
	width: 100%;
	max-width: 250px;
	min-width: 0;
	height: 24px;
}

.icons {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 8px;
	padding: 0;
	margin: 0;
	border: 0;
	min-width: 0;
	@container (max-width: 400px) {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
}

.iconOption {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	padding: 8px 4px;
	min-height: 64px;
	box-sizing: border-box;
	border-radius: var(--MI-radius);
	font-size: 0.8em;
	text-align: center;
	overflow-wrap: anywhere;

	> input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}

	&:has(input:not(:disabled)):hover {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&.selected {
		background: var(--MI_THEME-accentedBg);
	}

	&:has(input:focus-visible) {
		background: color-mix(in srgb, var(--MI_THEME-accent) 24%, var(--MI_THEME-panel));
		outline: none;
	}

	&:has(input:disabled) {
		opacity: 0.5;

		> input {
			cursor: wait;
		}
	}
}

.optionIcon {
	--MI-statusIconSize: 28px;
}

.input,
.textButton {
	display: block;
	width: 100%;
	height: 100%;
	min-width: 0;
	box-sizing: border-box;
	margin: 0;
	padding: 0 8px;
	border: 0;
	outline: none;
	box-shadow: none;
	background: transparent;
	color: var(--MI_THEME-fg);
	font: inherit;
	font-size: 1.1em;
	line-height: 24px;
	text-align: center;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.input {
	box-shadow: inset 0 -2px 0 0 var(--MI_THEME-accent);
}

.textButton {
	cursor: pointer;

	&:focus-visible {
		box-shadow: inset 0 -2px 0 0 var(--MI_THEME-accent);
	}
}

.actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;

	> button {
		min-width: 0;
	}
}

.remove {
	margin-right: auto;
}
</style>
