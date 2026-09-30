<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	ref="rootEl"
	:class="$style.root"
	:style="{ zIndex }"
	role="dialog"
	:aria-label="i18n.ts._boost.title"
	@pointerenter="cancelClose"
	@pointerleave="scheduleClose"
	@keydown.esc.stop.prevent="close"
>
	<form class="_shadow" :class="$style.form" @submit.prevent="submit">
		<MkAvatar v-if="$i" :user="$i" :class="$style.avatar" :link="false"/>
		<div :class="$style.editor">
			<input
				ref="inputEl"
				:value="composing ? compositionText : formattedDraft.text"
				class="_mfm"
				:class="$style.input"
				:placeholder="i18n.tsx._boost.placeholder({ name: note.user.name ?? note.user.username })"
				:aria-label="i18n.ts._boost.title"
				:aria-invalid="invalid"
				:disabled="sending"
				:readonly="note.reactionAcceptance === 'likeOnly'"
				:maxlength="MAX_CHARS + MAX_GRAPHEMES - 1"
				@input="onInput"
				@compositionstart="startComposition"
				@compositionend="endComposition"
				@copy="onClipboard"
				@cut="onClipboard"
				@keydown.enter="onEnter"
				@focus="pinned = true"
			/>
			<MkEmojiInputOverlay :inputElement="inputEl" :text="composing ? compositionText : formattedDraft.text"/>
		</div>
		<button ref="emojiButton" type="button" class="_button" :class="$style.button" :aria-label="i18n.ts.emoji" :disabled="sending || note.reactionAcceptance === 'likeOnly'" @click="pickEmoji">
			<i class="ti ti-mood-smile" aria-hidden="true"></i>
		</button>
		<button type="submit" class="_button" :class="[$style.button, $style.submit]" :aria-label="i18n.ts._boost.title" :disabled="sending || !reaction || invalid">
			<i :class="sending ? 'ti ti-loader ti-spin' : 'ti ti-check'" aria-hidden="true"></i>
		</button>
		<button type="button" class="_button" :class="[$style.button, $style.remove]" :aria-label="i18n.ts.close" :disabled="sending" @click="close">
			<i class="ti ti-x" aria-hidden="true"></i>
		</button>
	</form>
	<p v-if="error" :class="$style.error" role="alert">{{ error }}</p>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import { getUnicodeEmojiOrNull } from '@@/js/emojilist.js';
import MkEmojiPickerDialog from '@/components/MkEmojiPickerDialog.vue';
import MkEmojiInputOverlay from '@/components/MkEmojiInputOverlay.vue';
import { calcPopupPosition } from '@/utility/popup-position.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { noteEvents } from '@/composables/use-note-capture.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { boostDisplayOffset, boostRawOffset, formatBoostText, readBoostInput } from '@/utility/boost-text-spacing.js';
import * as os from '@/os.js';

const props = defineProps<{
	note: Misskey.entities.Note;
	anchorElement?: HTMLElement | null;
	boundaryElement?: HTMLElement | null;
	focusRequested?: boolean;
	mock?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
	(ev: 'changed', reaction: string | null): void;
}>();

const rootEl = useTemplateRef('rootEl');
const inputEl = useTemplateRef('inputEl');
const emojiButton = useTemplateRef('emojiButton');
const draft = ref(props.note.reactionAcceptance === 'likeOnly' ? String.fromCodePoint(0x2764) : '');
const composing = ref(false);
const compositionText = ref('');
const formattedDraft = computed(() => formatBoostText(draft.value));
const pinned = ref(props.focusRequested ?? false);
const sending = ref(false);
const error = ref('');
const zIndex = os.claimZIndex('low');
const MAX_GRAPHEMES = 16;
const MAX_CHARS = 240;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const normalized = computed(() => draft.value.normalize('NFC').trim());
const customEmoji = computed(() => /^:[\w+-]+(?:@[\w.-]+)?:$/.test(normalized.value));
const length = computed(() => [...segmenter.segment(normalized.value)].length);
const invalid = computed(() => normalized.value.length > MAX_CHARS || (!customEmoji.value && length.value > MAX_GRAPHEMES) || /[\p{Cc}\u2028\u2029]/u.test(normalized.value));
const reaction = computed(() => {
	const text = normalized.value;
	if (!text) return '';
	if (customEmoji.value) return text.replace('@.', '');
	if (getUnicodeEmojiOrNull(text)) return text.includes('\u200d') ? text : text.replace(/\ufe0f/g, '');
	return `text:${text}`;
});

// 正在输入的自定义表情。`:blobcat@example.com:` 这类名字本身就超过 16 字素，所以不按字素截断；
// 只匹配表情名允许的字符，避免把 `:)` 这种颜文字也一起豁免
const PARTIAL_CUSTOM_EMOJI = /^:[\w+-]*(?:@[\w.-]*)?:?$/;

function clampDraft(value: string) {
	const limited = value.length > MAX_CHARS ? value.slice(0, MAX_CHARS) : value;
	if (PARTIAL_CUSTOM_EMOJI.test(limited)) return limited;
	const graphemes = [...segmenter.segment(limited)];
	if (graphemes.length <= MAX_GRAPHEMES) return limited;
	return limited.slice(0, graphemes[MAX_GRAPHEMES].index);
}

// 输入法拼字完成后才更新 draft；表情选择器等程序写入也遵守同一长度限制。
watch(draft, value => {
	const limited = clampDraft(value);
	if (limited !== value) draft.value = limited;
});

function onInput(event: Event) {
	const input = event.target as HTMLInputElement;
	if (composing.value || (event as InputEvent).isComposing) {
		compositionText.value = input.value;
		return;
	}
	const edit = readBoostInput(formattedDraft.value, input.value, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length);
	draft.value = clampDraft(edit.text);
	input.value = formattedDraft.value.text;
	const afterSpace = (event as InputEvent).inputType?.endsWith('Forward') ?? false;
	input.setSelectionRange(
		boostDisplayOffset(formattedDraft.value, Math.min(edit.start, draft.value.length), afterSpace),
		boostDisplayOffset(formattedDraft.value, Math.min(edit.end, draft.value.length), afterSpace),
	);
}

function startComposition(event: CompositionEvent) {
	compositionText.value = (event.target as HTMLInputElement).value;
	composing.value = true;
}

function endComposition(event: CompositionEvent) {
	composing.value = false;
	onInput(event);
}

function onClipboard(event: ClipboardEvent) {
	const input = inputEl.value;
	if (input == null || event.clipboardData == null || composing.value) return;
	const start = boostRawOffset(formattedDraft.value, input.selectionStart ?? 0);
	const end = boostRawOffset(formattedDraft.value, input.selectionEnd ?? 0);
	if (start === end) return;
	event.clipboardData.setData('text/plain', draft.value.slice(start, end));
	event.preventDefault();
	if (event.type === 'cut' && !input.readOnly && !input.disabled) {
		draft.value = draft.value.slice(0, start) + draft.value.slice(end);
		input.value = formattedDraft.value.text;
		const caret = boostDisplayOffset(formattedDraft.value, start);
		input.setSelectionRange(caret, caret);
	}
}

let closeTimer: number | null = null;
let emojiDispose: (() => void) | null = null;
let resizing: ResizeObserver | null = null;
let closed = false;

function cancelClose() {
	if (closeTimer != null) window.clearTimeout(closeTimer);
	closeTimer = null;
}

function scheduleClose() {
	cancelClose();
	if (pinned.value || sending.value || emojiDispose) return;
	closeTimer = window.setTimeout(close, 250);
}

function close() {
	if (sending.value || closed) return;
	closed = true;
	cancelClose();
	if (rootEl.value?.contains(window.document.activeElement)) props.anchorElement?.focus();
	emit('closed');
}

function onOutsidePointer(event: PointerEvent) {
	if (emojiDispose || rootEl.value?.contains(event.target as Node) || props.anchorElement?.contains(event.target as Node)) return;
	close();
}

function setPosition() {
	if (!rootEl.value) return;
	const position = calcPopupPosition(rootEl.value, {
		anchorElement: props.anchorElement,
		boundaryElement: props.boundaryElement,
		x: window.innerWidth / 2 + window.scrollX,
		y: window.innerHeight / 2 + window.scrollY,
		direction: 'bottom', align: 'left', innerMargin: 8,
	});
	rootEl.value.style.left = `${position.left}px`;
	rootEl.value.style.top = `${position.top}px`;
}

function onEnter(event: KeyboardEvent) {
	if (event.isComposing || event.keyCode === 229) event.preventDefault();
}

function pickEmoji() {
	if (!emojiButton.value || sending.value || emojiDispose) return;
	pinned.value = true;
	const start = boostRawOffset(formattedDraft.value, inputEl.value?.selectionStart ?? formattedDraft.value.text.length);
	const end = boostRawOffset(formattedDraft.value, inputEl.value?.selectionEnd ?? formattedDraft.value.text.length);
	let caret: number | null = null;
	const { dispose } = os.popup(MkEmojiPickerDialog, {
		anchorElement: emojiButton.value,
		asReactionPicker: true,
		targetNote: props.note,
	}, {
		done: emoji => {
			const replace = emoji.startsWith(':') || customEmoji.value;
			draft.value = clampDraft(replace ? emoji : draft.value.slice(0, start) + emoji + draft.value.slice(end));
			caret = replace ? draft.value.length : Math.min(start + emoji.length, draft.value.length);
		},
		closed: async () => {
			dispose();
			emojiDispose = null;
			await nextTick();
			inputEl.value?.focus();
			if (caret != null) {
				const offset = boostDisplayOffset(formattedDraft.value, caret);
				inputEl.value?.setSelectionRange(offset, offset);
			}
		},
	});
	emojiDispose = dispose;
}

async function submit() {
	if (!reaction.value || invalid.value || sending.value || !$i) return;
	const nextReaction = reaction.value;
	sending.value = true;
	error.value = '';
	try {
		if (!props.mock) {
			await misskeyApi('notes/reactions/create', { noteId: props.note.id, reaction: nextReaction });
			noteEvents.emit(`reacted:${props.note.id}`, { userId: $i.id, reaction: nextReaction });
		}
		emit('changed', nextReaction);
		sending.value = false;
		close();
	} catch {
		error.value = i18n.ts.somethingHappened;
	} finally {
		sending.value = false;
	}
}

watch(() => props.focusRequested, async requested => {
	if (!requested) return;
	pinned.value = true;
	await nextTick();
	inputEl.value?.focus();
}, { immediate: true });

onMounted(() => {
	setPosition();
	resizing = new ResizeObserver(setPosition);
	resizing.observe(rootEl.value!);
	if (props.boundaryElement) resizing.observe(props.boundaryElement);
	window.addEventListener('resize', setPosition);
	window.addEventListener('scroll', setPosition, true);
	window.document.addEventListener('pointerdown', onOutsidePointer);
	props.anchorElement?.addEventListener('pointerenter', cancelClose);
	props.anchorElement?.addEventListener('pointerleave', scheduleClose);
});

onUnmounted(() => {
	cancelClose();
	emojiDispose?.();
	resizing?.disconnect();
	window.removeEventListener('resize', setPosition);
	window.removeEventListener('scroll', setPosition, true);
	window.document.removeEventListener('pointerdown', onOutsidePointer);
	props.anchorElement?.removeEventListener('pointerenter', cancelClose);
	props.anchorElement?.removeEventListener('pointerleave', scheduleClose);
});
</script>

<style lang="scss" module>
.root {
	position: absolute;
	box-sizing: border-box;
	// 宽度跟着内容伸缩会导致每输入一个字就重新定位，所以固定
	width: 304px;
	max-width: calc(100dvw - 16px);
	color: var(--MI_THEME-fg);
}

.form {
	display: flex;
	align-items: center;
	gap: 8px;
	box-sizing: border-box;
	padding: 8px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 50px;
	background: var(--MI_THEME-popup);
}

.avatar {
	flex: 0 0 24px;
	width: 24px;
	height: 24px;
}

.editor {
	position: relative;
	flex: 1;
	min-width: 0;
}

.form .input {
	display: block;
	box-sizing: border-box;
	width: 100%;
	min-width: 0;
	height: 28px;
	padding: 0 4px;
	border: 0;
	background: transparent;
	color: inherit;
	font: inherit;
	font-size: 14px;
	line-height: 28px;
	letter-spacing: 0;
	text-autospace: no-autospace;
	text-overflow: ellipsis;

	&::placeholder {
		color: var(--MI_THEME-fgTransparentWeak);
		opacity: 1;
	}

	&:focus-visible {
		outline: none;
	}
}

// 和全局 ._button 一样是单类选择器，谁生效取决于加载顺序；
// 一旦退回 inline-block，align-items 就失效了，所以叠上 .form 保证胜出
.form .button {
	display: inline-flex;
	flex: 0 0 24px;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	width: 24px;
	height: 24px;
	border-radius: 50%;
	font-size: 16px;
	line-height: 1;

	// .ti 的 vertical-align 和 width 是给行内排版做的补正，在 flex 子元素里反而会让图标偏心，
	// 这里抵消掉，只靠 flex 居中
	> :global(.ti) {
		vertical-align: baseline;
		width: auto;
		line-height: 1;
	}

	&:hover:not(:disabled) { background: color-mix(in srgb, var(--MI_THEME-popup), var(--MI_THEME-fg) 10%); }

	&:focus-visible {
		outline: none;
		background: color-mix(in srgb, var(--MI_THEME-popup), var(--MI_THEME-fg) 10%);
	}
}

.form .submit, .form .remove {
	border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
}

.submit { color: var(--MI_THEME-success); }
.remove, .error { color: var(--MI_THEME-error); }
.error { margin: 4px 0 0; padding-left: 12px; font-size: 12px; }
</style>
