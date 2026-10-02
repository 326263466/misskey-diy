<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="380" :height="620" autoHeight @close="close" @click="close" @esc="close" @closed="emit('closed')">
	<template #header>
		<span :class="$style.status">
			<MkStatusIcon :status="status" :class="$style.statusIcon" plain/>
			<span>{{ i18n.tsx._onlineStatus.switchTo({ status: statusText }) }}</span>
		</span>
	</template>
	<form :class="$style.content" @submit.prevent="submit">
		<div class="_gaps_s">
			<span :id="selectionLabelId" :class="$style.label">{{ i18n.ts._onlineStatus.autoReply }}</span>
			<button
				:id="selectionId"
				ref="selectionEl"
				type="button"
				class="_button"
				:class="[$style.select, { [$style.open]: opening }]"
				:disabled="saving"
				:aria-labelledby="selectionLabelId"
				:aria-describedby="selectedTextId"
				aria-haspopup="menu"
				:aria-expanded="opening"
				@click="showOptions"
				@keydown.down.up.prevent="showOptions"
			>
				<span :id="selectedTextId" :class="$style.selectedText">{{ selectedText }}</span>
				<i class="ti ti-chevron-down" :class="$style.chevron" aria-hidden="true"></i>
			</button>
		</div>
		<div v-if="selection === 'custom'" class="_gaps_s">
			<label :for="textId">{{ i18n.ts._onlineStatus.autoReplyContent }}</label>
			<textarea :id="textId" ref="textEl" v-model="text" :class="$style.input" :disabled="saving" :aria-describedby="hintId" :aria-invalid="length > AUTO_REPLY_TEXT_LIMIT" :placeholder="i18n.ts._onlineStatus.autoReplyPlaceholder" rows="3"></textarea>
			<div :id="hintId" :class="[$style.hint, { [$style.error]: length > AUTO_REPLY_TEXT_LIMIT }]">
				<span>{{ i18n.tsx._onlineStatus.autoReplyLimit({ max: AUTO_REPLY_TEXT_LIMIT }) }}</span>
				<span>{{ length }} / {{ AUTO_REPLY_TEXT_LIMIT }}</span>
			</div>
		</div>
	</form>
	<template #footer>
		<div :class="$style.actions">
			<MkButton :disabled="saving" @click="close">{{ i18n.ts.cancel }}</MkButton>
			<MkButton primary :disabled="!valid || saving" :wait="saving" @click="submit">{{ i18n.ts.ok }}</MkButton>
		</div>
	</template>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, useId, useTemplateRef } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import MkStatusIcon from '@/components/MkStatusIcon.vue';
import { i18n } from '@/i18n.js';
import { popupMenu } from '@/os.js';
import { AUTO_REPLY_TEXT_LIMIT, getAutoReplyPresets } from '@/utility/status-auto-reply.js';
import type { AutoReplyPreset, AutoReplyStatus } from '@/utility/status-auto-reply.js';

const props = defineProps<{
	status: AutoReplyStatus;
	initialReply?: string | null;
	save: (reply: string | null) => Promise<void>;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const dialogEl = useTemplateRef('dialogEl');
const selectionEl = useTemplateRef('selectionEl');
const textEl = useTemplateRef('textEl');
const selectionId = useId();
const selectionLabelId = useId();
const selectedTextId = useId();
const textId = useId();
const hintId = useId();
const presets = getAutoReplyPresets();
const options = [
	...presets,
	{ value: 'none', text: i18n.ts.none },
	{ value: 'custom', text: i18n.ts._onlineStatus.customAutoReply },
] as const;
const savedPreset = presets.find(preset => preset.text === props.initialReply);
const selection = ref<AutoReplyPreset | 'none' | 'custom'>(props.initialReply === undefined
	? props.status === 'away' ? 'away' : 'work'
	: props.initialReply === null ? 'none' : savedPreset?.value ?? 'custom');
const text = ref(savedPreset ? '' : props.initialReply ?? '');
const saving = ref(false);
const opening = ref(false);
const selectedText = computed(() => options.find(option => option.value === selection.value)!.text);
const statusText = computed(() => i18n.ts._onlineStatus[props.status]);
const reply = computed(() => selection.value === 'none' ? null
	: selection.value === 'custom' ? text.value.trim()
		: presets.find(preset => preset.value === selection.value)!.text);
const length = computed(() => [...(reply.value ?? '')].length);
const valid = computed(() => reply.value === null || (length.value > 0 && length.value <= AUTO_REPLY_TEXT_LIMIT));

function focusInput(): void {
	if (selection.value === 'custom') textEl.value?.focus();
	else selectionEl.value?.focus();
}

onMounted(focusInput);

async function showOptions(): Promise<void> {
	if (saving.value || opening.value || !selectionEl.value) return;
	opening.value = true;
	try {
		await popupMenu(options.map(option => ({
			text: option.text,
			active: computed(() => selection.value === option.value),
			action: () => { selection.value = option.value; },
		})), selectionEl.value, {
			matchAnchorWidth: true,
			width: selectionEl.value.getBoundingClientRect().width,
			onClosing: () => { opening.value = false; },
		});
	} finally {
		opening.value = false;
		await nextTick();
		focusInput();
	}
}

function close(): void {
	if (!saving.value) dialogEl.value?.close();
}

async function submit(): Promise<void> {
	if (saving.value || !valid.value) return;
	saving.value = true;
	try {
		await props.save(reply.value);
		dialogEl.value?.close();
	} catch {
		saving.value = false;
		await nextTick();
		focusInput();
	} finally {
		saving.value = false;
	}
}
</script>

<style lang="scss" module>
.content {
	display: flex;
	flex-direction: column;
	gap: 16px;
	padding: var(--MI-cardPadding);
}

.status {
	display: flex;
	align-items: center;
	gap: 8px;
}

.statusIcon {
	--MI-statusIconSize: 24px;
}

.label {
	font-size: 0.85em;
	font-weight: 600;
}

.select {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	width: 100%;
	min-height: 46px;
	padding: 12px 14px;
	box-sizing: border-box;
	border: 1px solid var(--MI_THEME-inputBorder);
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-bg);
	text-align: start;
	line-height: 1.5;
	transition: border-color 0.15s, background-color 0.15s;

	&:not(:disabled):hover {
		border-color: var(--MI_THEME-inputBorderHover);
		background: var(--MI_THEME-buttonHoverBg);
	}

	&.open {
		border-color: var(--MI_THEME-accent);

		> .chevron {
			transform: rotate(180deg);
		}
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}

	&:disabled {
		opacity: 0.5;
		cursor: wait;
	}
}

.selectedText {
	min-width: 0;
	overflow-wrap: anywhere;
}

.chevron {
	flex-shrink: 0;
	font-size: 0.85em;
	color: var(--MI_THEME-fg);
	transition: transform 0.15s;
}

.input {
	display: block;
	width: 100%;
	min-width: 0;
	box-sizing: border-box;
	padding: 12px;
	border: 1px solid var(--MI_THEME-inputBorder);
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-bg);
	color: var(--MI_THEME-fg);
	font: inherit;
	resize: none;
	line-height: 1.6;

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
	}
}

.hint {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.8em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.error {
	color: var(--MI_THEME-error);
}

.actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}
</style>
