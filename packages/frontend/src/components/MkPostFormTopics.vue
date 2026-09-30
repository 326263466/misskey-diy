<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="enabled && draftTokens.length" ref="root" :class="$style.root" :aria-label="i18n.ts._topics.title" role="group">
	<span :class="$style.label"><i class="ti ti-hash" aria-hidden="true"></i>{{ i18n.ts._topics.title }}</span>
	<span v-if="tags.length > MAX_TOPICS" role="alert" :class="$style.limit">{{ i18n.ts._topics.singleLimit }}</span>
	<span v-for="token in draftTokens" :key="token.key" :class="[$style.chip, { [$style.invalidChip]: !token.valid }]">
		<i v-if="!token.valid" class="ti ti-alert-triangle" :title="i18n.ts._topics.invalid" aria-hidden="true"></i>
		<span :class="$style.name" :title="token.valid ? `#${token.label}` : `${token.label}\n${i18n.ts._topics.invalid}`">{{ token.label }}</span>
		<button type="button" class="_button" :class="$style.remove" :disabled="disabled" :aria-label="i18n.tsx._topics.remove({ tag: token.label })" data-topic-remove @click="remove(token.key)"><i class="ti ti-x" aria-hidden="true"></i></button>
	</span>
	<button type="button" class="_button" :class="$style.add" :disabled="disabled || tags.length >= MAX_TOPICS" :aria-label="i18n.ts._topics.add" aria-haspopup="dialog" :aria-expanded="isOpen" @click="open($event.currentTarget as HTMLElement)"><i class="ti ti-plus" aria-hidden="true"></i></button>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, toRef, useTemplateRef, watch } from 'vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { MAX_TOPICS, parseTopic, parseTopics, topicKey } from '@/utility/topic-picker.js';

const model = defineModel<string>({ required: true });
const enabled = defineModel<boolean>('enabled', { required: true });
const props = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ (ev: 'openChange', value: boolean): void; (ev: 'empty'): void }>();
const root = useTemplateRef('root');
const tags = computed(() => parseTopics(model.value));
const selected = computed(() => enabled.value ? tags.value : []);
const draftTokens = computed(() => {
	const seen = new Set<string>();
	return model.value.split(/\s+/u).filter(Boolean).flatMap(raw => {
		const tag = parseTopic(raw);
		const key = topicKey(tag ?? raw);
		if (seen.has(key)) return [];
		seen.add(key);
		return [{ key, label: tag ?? raw, valid: tag != null }];
	});
});
const isOpen = ref(false);
let disposePicker: (() => void) | undefined;

function close(): void {
	disposePicker?.();
	disposePicker = undefined;
	isOpen.value = false;
	emit('openChange', false);
}

function open(target: HTMLElement): void {
	if (props.disabled || isOpen.value) return;
	isOpen.value = true;
	emit('openChange', true);
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkTopicPicker.vue')), {
		anchorElement: target,
		selected,
		disabled: toRef(props, 'disabled'),
	}, {
		choose: add,
		closed: close,
	});
	disposePicker = dispose;
}

function add(value: string): void {
	if (props.disabled || !isOpen.value || selected.value.length >= MAX_TOPICS) return;
	const tag = parseTopic(value);
	if (tag == null || selected.value.some(existing => topicKey(existing) === topicKey(tag))) return;
	model.value = [enabled.value ? model.value.trim() : '', `#${tag}`].filter(Boolean).join(' ');
	enabled.value = true;
}

function remove(key: string): void {
	if (props.disabled) return;
	const index = draftTokens.value.findIndex(token => token.key === key);
	// Keep untouched draft tokens verbatim instead of rewriting the entire draft.
	const remaining = model.value.split(/\s+/u).filter(value => topicKey(parseTopic(value) ?? value) !== key).join(' ').trim();
	model.value = remaining;
	if (remaining === '') enabled.value = false;
	void nextTick(() => {
		if (remaining === '') { emit('empty'); return; }
		const buttons = root.value?.querySelectorAll<HTMLButtonElement>('[data-topic-remove]');
		buttons?.[Math.min(index, buttons.length - 1)]?.focus();
	});
}

watch(() => props.disabled, disabled => { if (disabled) close(); });
onBeforeUnmount(close);
defineExpose({ open });
</script>

<style lang="scss" module>
.root {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
	min-width: 0;
	max-height: 130px;
	margin-top: 6px;
	padding: 10px 12px;
	overflow-y: auto;
	border: 1px solid color-mix(in srgb, var(--MI_THEME-hashtag) 16%, transparent);
	border-radius: var(--MI-radius);
	background: color-mix(in srgb, var(--MI_THEME-hashtag) 5%, var(--MI_THEME-panel));
	font-size: .85em;
}

.label {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	margin-inline-end: 3px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-weight: 600;
}

.limit { width: 100%; color: var(--MI_THEME-error); }

.chip {
	display: inline-flex;
	align-items: center;
	max-width: min(100%, 220px);
	min-width: 0;
	border-radius: 7px;
	padding-inline-start: 8px;
	color: var(--MI_THEME-hashtag);
	background: color-mix(in srgb, var(--MI_THEME-hashtag) 10%, var(--MI_THEME-panel));
}

.name {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.invalidChip {
	gap: 4px;
	color: var(--MI_THEME-warn);
	background: color-mix(in srgb, var(--MI_THEME-warn) 12%, var(--MI_THEME-panel));
	.remove { color: inherit; }
}

.remove, .add {
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: 30px;
	height: 30px;
	border-radius: 7px;
	color: var(--MI_THEME-hashtag);

	&:enabled:hover { background: color-mix(in srgb, var(--MI_THEME-hashtag) 14%, transparent); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
	&:disabled { opacity: .4; }
}

.add { border: 1px dashed color-mix(in srgb, var(--MI_THEME-hashtag) 35%, transparent); }
</style>
