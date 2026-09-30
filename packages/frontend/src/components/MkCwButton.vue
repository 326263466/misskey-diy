<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.expanded]: modelValue }]">
	<div :class="$style.summary">
		<i :class="[modelValue ? 'ti ti-eye' : 'ti ti-eye-off', $style.icon]" :title="modelValue ? i18n.ts._cw.contentShown : i18n.ts._cw.contentHidden" aria-hidden="true"></i>
		<div :class="$style.summaryText" class="_selectable"><slot>{{ modelValue ? i18n.ts._cw.contentShown : i18n.ts._cw.contentHidden }}</slot></div>
	</div>
	<div :class="$style.footer">
		<span v-if="label" :class="$style.label" :title="label">{{ label }}</span>
		<button
			type="button"
			class="_button"
			:class="[$style.toggle, { [$style.animated]: prefer.s.animation }]"
			:aria-expanded="modelValue"
			@click.stop="toggle"
			@keydown.enter.stop
			@keydown.space.stop
		>
			<span>{{ modelValue ? i18n.ts._cw.hideContent : i18n.ts._cw.showContent }}</span>
			<i :class="modelValue ? 'ti ti-chevron-up' : 'ti ti-chevron-down'" aria-hidden="true"></i>
		</button>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import type { PollEditorModelValue } from '@/components/MkPollEditor.vue';
import { concat } from '@/utility/array.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{
	modelValue: boolean;
	text: string | null;
	renote?: Misskey.entities.Note | null;
	files?: Misskey.entities.DriveFile[];
	poll?: Misskey.entities.Note['poll'] | PollEditorModelValue | null;
}>();

const emit = defineEmits<{
	(ev: 'update:modelValue', v: boolean): void;
}>();

const label = computed(() => {
	return concat([
		props.text ? [i18n.tsx._cw.chars({ count: props.text.length })] : [],
		props.renote ? [i18n.ts.quote] : [],
		props.files && props.files.length !== 0 ? [i18n.tsx._cw.files({ count: props.files.length })] : [],
		props.poll != null ? [i18n.ts.poll] : [],
	] as string[][]).join(' / ');
});

function toggle() {
	emit('update:modelValue', !props.modelValue);
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 6px;
	box-sizing: border-box;
	min-width: 0;
	margin: 4px 0;
	padding: 10px 12px;
	border: 1px solid color-mix(in srgb, var(--MI_THEME-warn) 22%, transparent);
	border-radius: var(--MI-radius);
	background: color-mix(in srgb, var(--MI_THEME-warn) 6%, var(--MI_THEME-panel));
	cursor: default;

	&.expanded {
		margin-bottom: 10px;
	}
}

.summary {
	display: flex;
	align-items: baseline;
	gap: 8px;
	min-width: 0;
	line-height: 1.5;
}

.icon {
	flex-shrink: 0;
	color: var(--MI_THEME-warn);
}

.summaryText {
	min-width: 0;
	overflow-wrap: anywhere;
}

.footer {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	flex-wrap: wrap;
	gap: 4px 12px;
}

.label {
	flex: 1 1 8em;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 0.8em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.toggle {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-height: 30px;
	padding: 4px 9px;
	border-radius: calc(var(--MI-radius) * 0.65);
	font-size: 0.85em;
	font-weight: 600;
	line-height: 1.4;
	color: var(--MI_THEME-fg);
	background: color-mix(in srgb, var(--MI_THEME-warn) 12%, var(--MI_THEME-panel));

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-warn) 20%, var(--MI_THEME-panel));
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

@media (prefers-reduced-motion: no-preference) {
	.animated {
		transition: background-color 140ms ease;
	}
}
</style>
