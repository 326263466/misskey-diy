<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.scrollArea">
		<div v-for="block in blocks" :key="block.id" :class="[$style.block, { [$style.code]: block.type === 'code' }]" :data-chat-code="block.type === 'code' ? '' : undefined">
			<div v-if="block.type === 'code'" :class="$style.codeHeader">
				<span :class="$style.language">{{ block.language || i18n.ts.code }}</span>
				<button type="button" class="_button _iconButton" :class="$style.action" :disabled="!block.text" :aria-label="i18n.ts.copy" :title="i18n.ts.copy" @click="copyCode(block.text)"><i class="ti ti-copy" aria-hidden="true"></i></button>
				<button type="button" class="_button" :class="$style.action" :disabled="disabled || readonly" @click="exitCode(block)">{{ i18n.ts._chat.continueText }}</button>
			</div>
			<textarea
				:ref="element => setInput(block, element)"
				v-model="block.text"
				:class="[$style.input, { [$style.codeInput]: block.type === 'code' }]"
				class="_mfm"
				:rows="block.type === 'code' ? 2 : 1"
				:placeholder="block.type === 'code' ? i18n.ts._chat.inputCode : i18n.ts.inputMessageHere"
				:aria-label="block.type === 'code' ? i18n.ts._chat.inputCode : i18n.ts.inputMessageHere"
				:readonly="readonly"
				:disabled="disabled"
				:spellcheck="block.type === 'code' ? false : undefined"
				:wrap="block.type === 'code' ? 'off' : 'soft'"
				@focus="activeBlockId = block.id"
				@input="onInput(block, $event)"
				@keydown="onKeydown(block, $event)"
				@paste="emit('paste', $event)"
			></textarea>
			<MkEmojiInputOverlay v-if="block.type === 'text'" :inputElement="inputs.get(block.id) ?? null" :text="block.text"/>
		</div>
	</div>
	<span v-if="textLength > CONTENT_LIMITS.chatMessage" class="_inputCounter" :class="{ _inputCounterOver: true }">{{ textLength }}/{{ CONTENT_LIMITS.chatMessage }}</span>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowReactive, toRef, watch } from 'vue';
import { CONTENT_LIMITS } from 'misskey-js';
import type { ComponentPublicInstance } from 'vue';
import type { ChatDraftBlock } from './composer.js';
import { parseChatDraft, serializeChatDraft } from './composer.js';
import MkEmojiInputOverlay from '@/components/MkEmojiInputOverlay.vue';
import { Autocomplete } from '@/utility/autocomplete.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import * as os from '@/os.js';

type EditorBlock = ChatDraftBlock & { id: number };
type EditorSelection = { blockId: number; start: number; end: number };

const model = defineModel<string>({ required: true });
const textLength = computed(() => Array.from(model.value).length);
const props = defineProps<{
	disabled?: boolean;
	readonly?: boolean;
}>();
const emit = defineEmits<{
	(ev: 'submit'): void;
	(ev: 'paste', event: ClipboardEvent): void;
}>();

let nextId = 0;

function identify(block: ChatDraftBlock): EditorBlock {
	return { ...block, id: nextId++ };
}

const blocks = ref<EditorBlock[]>(parseChatDraft(model.value).map(identify));
const inputs = shallowReactive(new Map<number, HTMLTextAreaElement>());
const autocompletes = new Map<number, Autocomplete>();
let activeBlockId = blocks.value[0].id;
let published = model.value;

watch(blocks, () => {
	published = serializeChatDraft(blocks.value);
	model.value = published;
	void nextTick(adjustHeights);
}, { deep: true });

// 输入框随内容精确增减高度；上限由 CSS max-height 控制后内部滚动，操作按钮行不随内容重排。
function adjustHeights() {
	for (const block of blocks.value) {
		const input = inputs.get(block.id);
		if (input == null || input.offsetHeight === 0) continue;
		input.style.height = 'auto';
		input.style.height = `${input.scrollHeight}px`;
	}
}

onMounted(() => {
	adjustHeights();
});

watch(model, value => {
	if (value === published) return;
	published = value;
	blocks.value = parseChatDraft(value).map(identify);
	activeBlockId = blocks.value.at(-1)!.id;
});

function setInput(block: EditorBlock, element: Element | ComponentPublicInstance | null) {
	if (inputs.get(block.id) === element) return;
	autocompletes.get(block.id)?.detach();
	autocompletes.delete(block.id);
	if (!(element instanceof HTMLTextAreaElement)) {
		inputs.delete(block.id);
		return;
	}
	inputs.set(block.id, element);
	if (block.type === 'text') autocompletes.set(block.id, new Autocomplete(element, toRef(block, 'text')));
}

function getSelection(): EditorSelection {
	const block = blocks.value.find(item => item.id === activeBlockId) ?? blocks.value.at(-1)!;
	const input = inputs.get(block.id);
	return { blockId: block.id, start: input?.selectionStart ?? block.text.length, end: input?.selectionEnd ?? block.text.length };
}

async function restoreSelection(selection: EditorSelection) {
	await nextTick();
	const input = inputs.get(selection.blockId);
	input?.focus({ preventScroll: true });
	input?.setSelectionRange(selection.start, selection.end);
}

function focus() {
	const block = blocks.value.at(-1)!;
	void restoreSelection({ blockId: block.id, start: block.text.length, end: block.text.length });
}

function focusText() {
	const current = blocks.value.find(item => item.id === activeBlockId) ?? blocks.value.at(-1)!;
	if (current.type === 'code') exitCode(current);
	else void restoreSelection(getSelection());
}

function textAfter(block: EditorBlock): EditorBlock {
	const index = blocks.value.indexOf(block);
	if (blocks.value[index + 1]?.type !== 'text') blocks.value.splice(index + 1, 0, identify({ type: 'text', text: '' }));
	return blocks.value[index + 1];
}

function exitCode(block: EditorBlock) {
	if (props.disabled || props.readonly) return;
	const following = textAfter(block);
	void restoreSelection({ blockId: following.id, start: 0, end: 0 });
}

function insertText(value: string, options: { selection?: EditorSelection; plainText?: boolean; mention?: boolean; focus?: boolean } = {}): EditorSelection {
	let selection = options.selection ?? getSelection();
	if (props.disabled) return selection;
	let block = blocks.value.find(item => item.id === selection.blockId) ?? blocks.value.at(-1)!;
	if (options.plainText && block.type === 'code') {
		block = textAfter(block);
		selection = { blockId: block.id, start: 0, end: 0 };
	}
	const before = block.text.slice(0, selection.start);
	const after = block.text.slice(selection.end);
	const insertion = options.mention && before && !/\s$/.test(before) ? ` ${value}` : value;
	block.text = before + insertion + after;
	const position = before.length + insertion.length;
	const result = { blockId: block.id, start: position, end: position };
	if (options.focus !== false) void restoreSelection(result);
	return result;
}

function onInput(block: EditorBlock, event: Event) {
	if ((event as InputEvent).isComposing || block.type !== 'text') return;
	const index = blocks.value.indexOf(block);
	if (index === -1) return;
	const parsed = parseChatDraft(block.text);
	if (!parsed.some(item => item.type === 'code')) return;
	const input = event.currentTarget as HTMLTextAreaElement;
	let offset = input.selectionStart;
	const replacement = parsed.map(identify);
	blocks.value.splice(index, 1, ...replacement);
	for (const item of replacement) {
		const length = serializeChatDraft([item]).length;
		if (offset <= length || item === replacement.at(-1)) {
			const position = Math.max(0, Math.min(item.text.length, offset - (item.type === 'code' ? item.language.length + 4 : 0)));
			void restoreSelection({ blockId: item.id, start: position, end: position });
			break;
		}
		offset -= length + 1;
	}
}

function onKeydown(block: EditorBlock, event: KeyboardEvent) {
	if (event.isComposing || event.key === 'Process' || event.keyCode === 229 || event.defaultPrevented || props.disabled || props.readonly) return;
	const input = inputs.get(block.id)!;
	const start = input.selectionStart;
	const end = input.selectionEnd;
	if (event.key === 'Enter' && block.type === 'text' && start === end && !event.ctrlKey && !event.metaKey && !event.altKey) {
		const lineStart = block.text.lastIndexOf('\n', start - 1) + 1;
		const fence = /^```([^`]*)$/.exec(block.text.slice(lineStart, start));
		if (fence) {
			event.preventDefault();
			const replacement: EditorBlock[] = [];
			if (lineStart > 0) replacement.push(identify({ type: 'text', text: block.text.slice(0, lineStart - 1) }));
			const code = identify({ type: 'code', text: '', language: fence[1].trim() });
			replacement.push(code);
			const after = block.text.slice(end).replace(/^\n/, '');
			if (after) replacement.push(identify({ type: 'text', text: after }));
			blocks.value.splice(blocks.value.indexOf(block), 1, ...replacement);
			void restoreSelection({ blockId: code.id, start: 0, end: 0 });
			return;
		}
	}
	if (block.type === 'code') {
		if (event.key === 'Escape' || (event.key === 'ArrowDown' && start === end && end === block.text.length)) {
			event.preventDefault();
			exitCode(block);
			return;
		}
		if (event.key === 'Backspace' && start === 0 && end === 0 && block.text === '') {
			event.preventDefault();
			const index = blocks.value.indexOf(block);
			const previous = blocks.value[index - 1];
			if (previous?.type === 'text') {
				blocks.value.splice(index, 1);
				void restoreSelection({ blockId: previous.id, start: previous.text.length, end: previous.text.length });
			} else {
				const plain = identify({ type: 'text', text: '' });
				blocks.value.splice(index, 1, plain);
				void restoreSelection({ blockId: plain.id, start: 0, end: 0 });
			}
			return;
		}
	}
	if (event.key !== 'Enter' || event.altKey) return;
	const submit = block.type === 'code' || !prefer.s['chat.sendOnEnter'] ? event.ctrlKey || event.metaKey : !(event.ctrlKey || event.metaKey || event.shiftKey);
	if (submit) {
		event.preventDefault();
		// 先同步本次输入，避免同一轮按键中的发送读取到上一份草稿。
		published = serializeChatDraft(blocks.value);
		model.value = published;
		emit('submit');
	}
}

async function copyCode(code: string) {
	try {
		await navigator.clipboard.writeText(code);
	} catch {
		os.toast(i18n.ts.somethingHappened, 'error');
	}
}

onBeforeUnmount(() => {
	for (const autocomplete of autocompletes.values()) autocomplete.detach();
	autocompletes.clear();
});

defineExpose({ focus, focusText, getSelection, restoreSelection, insertText });
</script>

<style lang="scss" module>
.root {
	position: relative;
	margin: 0;
	border-radius: 0;
	background: transparent;
}

.scrollArea {
	max-height: min(40vh, 320px);
	overflow-y: auto;
	padding: 4px 2px;
}

.block {
	position: relative;
	min-width: 0;
}

.input {
	display: block;
	box-sizing: border-box;
	width: 100%;
	min-width: 0;
	margin: 0;
	padding: 2px 0;
	border: none;
	border-radius: 0;
	outline: none;
	box-shadow: none;
	resize: none;
	// 增高由脚本按内容精确计算，不依赖 field-sizing：保证增减都可预期，超限后内部滚动。
	max-height: min(40vh, 200px);
	overflow-y: auto;
	font: inherit;
	line-height: 1.5;
	color: var(--MI_THEME-fg);
	background: transparent;
	&:focus-visible {
		box-shadow: inset 0 -2px var(--MI_THEME-focus);
	}
}

.code {
	margin-block: 4px;
	border-left: 4px solid var(--MI_THEME-accent);
	border-radius: var(--MI-radius);
	overflow: hidden;
	background: color-mix(in srgb, var(--MI_THEME-fg) 6%, var(--MI_THEME-panel));
}

.codeHeader {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 2px 8px;
	font-size: 0.85em;
	background: color-mix(in srgb, var(--MI_THEME-fg) 12%, var(--MI_THEME-panel));
}

.language {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.action {
	flex-shrink: 0;
	padding: 4px;
	&:hover {
		color: var(--MI_THEME-accent);
	}
}

.codeInput {
	padding: 8px;
	font-family: Consolas, Monaco, monospace;
	tab-size: 4;
	white-space: pre;
}
</style>
