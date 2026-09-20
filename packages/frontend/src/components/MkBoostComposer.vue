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
	<form :class="$style.form" @submit.prevent="submit">
		<MkAvatar v-if="$i" :user="$i" :class="$style.avatar" :link="false"/>
		<input
			ref="inputEl"
			v-model="draft"
			class="_mfm"
			:class="$style.input"
			:placeholder="i18n.tsx._boost.placeholder({ name: note.user.name ?? note.user.username })"
			:aria-label="i18n.ts._boost.title"
			:aria-invalid="invalid"
			:disabled="sending"
			:readonly="note.reactionAcceptance === 'likeOnly'"
			maxlength="240"
			@keydown.enter="onEnter"
			@focus="pinned = true"
		/>
		<button ref="emojiButton" type="button" class="_button" :class="$style.button" :aria-label="i18n.ts.emoji" :disabled="sending || note.reactionAcceptance === 'likeOnly'" @click="pickEmoji">
			<i class="ti ti-mood-smile" aria-hidden="true"></i>
		</button>
		<button type="submit" class="_button" :class="[$style.button, $style.submit]" :aria-label="i18n.ts._boost.title" :disabled="sending || !reaction || invalid">
			<i :class="sending ? 'ti ti-loader ti-spin' : 'ti ti-circle-check'" aria-hidden="true"></i>
		</button>
		<button type="button" class="_button" :class="[$style.button, $style.remove]" :aria-label="i18n.ts.close" :disabled="sending" @click="close">
			<i class="ti ti-circle-x" aria-hidden="true"></i>
		</button>
	</form>
	<div v-if="draft && !customEmoji" :class="[$style.counter, { [$style.invalid]: tooLong }]" aria-live="polite">
		<span v-if="tooLong">{{ i18n.ts.tooLong }}&ensp;</span>{{ length }}/16
	</div>
	<p v-if="error" :class="$style.error" role="alert">{{ error }}</p>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import { getUnicodeEmojiOrNull } from '@@/js/emojilist.js';
import MkEmojiPickerDialog from '@/components/MkEmojiPickerDialog.vue';
import { calcPopupPosition } from '@/utility/popup-position.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { noteEvents } from '@/composables/use-note-capture.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import * as os from '@/os.js';

const props = defineProps<{
	note: Misskey.entities.Note;
	anchorElement?: HTMLElement | null;
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
// Boostは投稿のたびに書き下ろすものなので、既存のBoostを下書きへ引き継がない
const draft = ref(props.note.reactionAcceptance === 'likeOnly' ? String.fromCodePoint(0x2764) : '');
const pinned = ref(props.focusRequested ?? false);
const sending = ref(false);
const error = ref('');
const zIndex = os.claimZIndex('low');
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const normalized = computed(() => draft.value.normalize('NFC').trim());
const customEmoji = computed(() => /^:[\w+-]+(?:@[\w.-]+)?:$/.test(normalized.value));
const length = computed(() => [...segmenter.segment(normalized.value)].length);
const tooLong = computed(() => normalized.value.length > 240 || (!customEmoji.value && length.value > 16));
const invalid = computed(() => tooLong.value || /[\p{Cc}\u2028\u2029]/u.test(normalized.value));
const reaction = computed(() => {
	const text = normalized.value;
	if (!text) return '';
	if (customEmoji.value) return text.replace('@.', '');
	if (getUnicodeEmojiOrNull(text)) return text.includes('\u200d') ? text : text.replace(/\ufe0f/g, '');
	return `text:${text}`;
});

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
		x: window.innerWidth / 2 + window.scrollX,
		y: window.innerHeight / 2 + window.scrollY,
		direction: 'top', align: 'center', innerMargin: 6,
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
	const start = inputEl.value?.selectionStart ?? draft.value.length;
	const end = inputEl.value?.selectionEnd ?? start;
	const { dispose } = os.popup(MkEmojiPickerDialog, {
		anchorElement: emojiButton.value,
		asReactionPicker: true,
		targetNote: props.note,
	}, {
		done: emoji => {
			draft.value = emoji.startsWith(':') || customEmoji.value ? emoji : draft.value.slice(0, start) + emoji + draft.value.slice(end);
		},
		closed: () => {
			dispose();
			emojiDispose = null;
			inputEl.value?.focus();
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
	width: 390px;
	max-width: calc(100dvw - 16px);
	color: var(--MI_THEME-fg);
}

// リアクションのバブルと同じピル型。左端はアバターが縁に接するので詰める
.form {
	display: flex;
	align-items: center;
	gap: 4px;
	box-sizing: border-box;
	padding: 6px 8px 6px 6px;
	border-radius: 50px;
	background: var(--MI_THEME-popup);
	// テーマのshadowは薄いので、2枚重ねてピルの縁が背景から浮くようにする
	box-shadow: 0 1px 4px var(--MI_THEME-shadow), 0 4px 16px var(--MI_THEME-shadow);
}

.avatar {
	flex: 0 0 28px;
	width: 28px;
	height: 28px;
}

// アバターとアイコンと同じ28pxに揃えて、ピルの中で縦位置が揺れないようにする。
// ピルの縁に沿う枠は描けないので、フォーカスリングは出さない
.input {
	flex: 1;
	width: 0;
	min-width: 0;
	height: 28px;
	padding: 0 4px;
	border: 0;
	background: transparent;
	color: inherit;
	font: inherit;
	font-size: 13px;
	line-height: 28px;
	letter-spacing: 0;

	&:focus-visible {
		outline: none;
	}
}

.button {
	display: inline-flex;
	flex: 0 0 28px;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 50%;
	font-size: 16px;
	line-height: 1;

	// buttonHoverBgはpanel由来なのでpopupの上では色が合わない。地色を選ばない薄い重ねにする
	&:hover:not(:disabled) { background: color-mix(in srgb, var(--MI_THEME-popup), var(--MI_THEME-fg) 10%); }

	&:focus-visible {
		outline: none;
		background: color-mix(in srgb, var(--MI_THEME-popup), var(--MI_THEME-fg) 10%);
	}
}

.submit { color: var(--MI_THEME-success); }
.remove, .invalid, .error { color: var(--MI_THEME-error); }
.counter { margin-top: 4px; padding-right: 12px; font-size: 11px; text-align: right; }
.error { margin: 4px 0 0; padding-left: 12px; font-size: 12px; }
</style>
