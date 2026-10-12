<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.compact]: toolbar }]" @dragover="onDragover" @drop="onDrop">
	<div :class="$style.field">
		<textarea ref="inputEl" v-model="text" class="_mfm" :class="[$style.input, inputClass]" :rows="rows ?? (toolbar ? 3 : undefined)" :disabled="disabled" :readonly="readonly || choosingEmoji" :placeholder="placeholder" :aria-label="label ?? i18n.ts.text" data-testid="post-form-text" @paste="onPaste" @compositionupdate="imeText = $event.data" @compositionend="imeText = ''" @keydown="onKeydown"></textarea>
		<MkEmojiInputOverlay :inputElement="inputEl" :text="text"/>
		<slot name="footer"></slot>
		<span class="_inputCounter" :class="{ _inputCounterOver: length > maxLength }">{{ length }}/{{ maxLength }}</span>
	</div>
	<template v-if="toolbar">
		<MkPostFormAttaches v-model="files" :disabled="disabled || choosingEmoji" @detach="detach" @changeSensitive="(file, value) => file.isSensitive = value"/>
		<MkUploaderItems v-if="uploader && uploader.items.value.length" :items="uploader.items.value" @showMenu="showUploadMenu" @showMenuViaContextmenu="showUploadMenu"/>
		<MkInfo v-if="protection && protection.status.value !== 'saved'" :warn="protection.status.value === 'failed'">{{ protection.status.value === 'failed' ? i18n.ts._attachmentLifecycle.draftFailed : i18n.ts._attachmentLifecycle.draftPending }}</MkInfo>
		<div :class="$style.toolbar">
			<div :class="$style.tools">
				<button v-if="emoji" v-tooltip="i18n.ts.emoji" type="button" class="_button" :class="$style.tool" :aria-label="i18n.ts.emoji" :disabled="disabled || readonly || choosingEmoji" @click="insertEmoji"><i class="ti ti-mood-happy" aria-hidden="true"></i></button>
				<button v-if="images" v-tooltip="i18n.ts.attachFile" type="button" class="_button" :class="$style.tool" :aria-label="i18n.ts.attachFile" :disabled="disabled || readonly || choosingEmoji" @click="chooseImages"><i class="ti ti-photo-plus" aria-hidden="true"></i></button>
			</div>
			<slot name="actions" :valid="valid" :busy="busy"></slot>
		</div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import type { entities } from 'misskey-js';
import MkEmojiInputOverlay from '@/components/MkEmojiInputOverlay.vue';
import MkPostFormAttaches from '@/components/MkPostFormAttaches.vue';
import MkUploaderItems from '@/components/MkUploaderItems.vue';
import MkInfo from '@/components/MkInfo.vue';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { Autocomplete } from '@/utility/autocomplete.js';
import { emojiPicker } from '@/utility/emoji-picker.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { useUploader } from '@/composables/use-uploader.js';
import type { UploaderItem } from '@/composables/use-uploader.js';
import { createDraftFileProtection } from '@/utility/draft-file-protection.js';
import * as os from '@/os.js';

const props = withDefaults(defineProps<{
	maxLength: number;
	textLength?: number;
	rows?: number;
	disabled?: boolean;
	readonly?: boolean;
	placeholder?: string;
	label?: string;
	inputClass?: string;
	toolbar?: boolean;
	emoji?: boolean;
	images?: boolean;
	autocomplete?: boolean;
}>(), { toolbar: true, emoji: true, images: true, autocomplete: true });
const text = defineModel<string>({ required: true });
const files = defineModel<entities.DriveFile[]>('files', { default: () => [] });
const emit = defineEmits<{ (event: 'submit'): void }>();
const inputEl = useTemplateRef('inputEl');
const imeText = ref('');
const choosingEmoji = ref(false);
const uploading = ref(false);
const length = computed(() => props.textLength ?? Array.from(text.value + imeText.value).length);
const protection = props.toolbar && $i ? createDraftFileProtection($i, { transient: true }) : null;
const uploader = protection ? useUploader({ multiple: true, isManaged: true, draftId: () => protection.id, features: { imageEditing: false, watermark: false } }) : null;
const busy = computed(() => choosingEmoji.value || uploading.value || imeText.value !== '' || !!uploader?.items.value.length);
const valid = computed(() => !busy.value && length.value <= props.maxLength && files.value.length <= 16 && (text.value.trim().length > 0 || files.value.length > 0));
let autocomplete: Autocomplete | null = null;
let disposed = false;

uploader?.events.on('itemUploaded', ({ item }) => {
	if (disposed) return;
	files.value = [...files.value, item.uploaded!];
	uploader.removeItem(item);
});
watch(() => !uploading.value && uploader?.readyForUpload.value && uploader.items.value.every(item => !item.uploadFailed && !item.aborted), async ready => {
	if (!ready || !uploader || disposed) return;
	uploading.value = true;
	try {
		await uploader.upload();
	} catch {
		if (!disposed) os.toast(i18n.ts.somethingHappened, 'error');
	} finally {
		uploading.value = false;
	}
});
watch([files, text], () => {
	if (protection) void protection.update(files.value.map(file => file.id), text.value);
}, { deep: true });

function focus() {
	inputEl.value?.focus({ preventScroll: true });
}

function insertEmoji(event: MouseEvent) {
	const input = inputEl.value;
	if (!input || props.disabled || props.readonly || choosingEmoji.value) return;
	let start = input.selectionStart;
	let end = input.selectionEnd;
	choosingEmoji.value = true;
	emojiPicker.show(event.currentTarget as HTMLElement, chosen => {
		if (disposed || props.disabled) return;
		text.value = text.value.slice(0, start) + chosen + text.value.slice(end);
		start += chosen.length;
		end = start;
	}, () => {
		if (disposed) return;
		choosingEmoji.value = false;
		void nextTick(() => {
			if (disposed) return;
			focus();
			input.setSelectionRange(start, end);
		});
	});
}

async function addImages(selected: File[]) {
	if (props.disabled || props.readonly || !props.images || !props.toolbar || disposed) return;
	if (!$i) { await pleaseLogin(); return; }
	const available = 16 - files.value.length - (uploader?.items.value.length ?? 0);
	uploader?.addFiles(selected.filter(file => file.type.startsWith('image/')).slice(0, Math.max(0, available)));
}

async function chooseImages() {
	if (props.disabled || props.readonly || choosingEmoji.value) return;
	if (!$i) { await pleaseLogin(); return; }
	await addImages(await os.chooseFileFromPc({ multiple: true, accept: 'image/*' }));
}

function onPaste(event: ClipboardEvent) {
	if (!props.toolbar || !props.images) return;
	const selected = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith('image/'));
	if (selected.length) { event.preventDefault(); void addImages(selected); }
}

function onDragover(event: DragEvent) {
	if (props.toolbar && props.images && event.dataTransfer?.types.includes('Files')) event.preventDefault();
}

function onDrop(event: DragEvent) {
	if (!props.toolbar || !props.images || !event.dataTransfer?.files.length) return;
	event.preventDefault();
	void addImages(Array.from(event.dataTransfer.files));
}

function onKeydown(event: KeyboardEvent) {
	if (props.toolbar && !props.disabled && !event.isComposing && (event.ctrlKey || event.metaKey) && event.key === 'Enter' && valid.value) emit('submit');
}

function detach(id: string) {
	if (!props.disabled) files.value = files.value.filter(file => file.id !== id);
}

function showUploadMenu(item: UploaderItem, event: PointerEvent) {
	if (uploader && !props.disabled) os.popupMenu(uploader.getMenu(item), event.currentTarget as HTMLElement);
}

function submitted() {
	const hadAttachments = files.value.length > 0;
	text.value = '';
	files.value = [];
	uploader?.reset();
	if (protection && hadAttachments) void protection.release();
}

onMounted(() => {
	if (props.autocomplete && inputEl.value) autocomplete = new Autocomplete(inputEl.value, text);
});
onBeforeUnmount(() => {
	disposed = true;
	autocomplete?.detach();
	if (protection && (files.value.length > 0 || uploader?.items.value.length)) void protection.release();
	protection?.dispose();
});
defineExpose({ inputElement: inputEl, focus, submitted, busy, valid });
</script>

<style lang="scss" module>
.root { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.field { position: relative; display: flex; flex: 1; flex-direction: column; min-height: 0; }
.input { flex: 1; box-sizing: border-box; width: 100%; margin: 0; padding: 6px 12px; border: none; border-radius: inherit; background: transparent; color: var(--MI_THEME-fg); font: inherit; }
.input::placeholder { color: var(--MI_THEME-fgTransparentWeak); opacity: 1; }
.input:focus { outline: none; }
.compact .field { border-radius: 8px; background: color-mix(in srgb, var(--MI_THEME-fg) 7%, transparent); }
.compact .field::before { content: ''; position: absolute; inset: 0; border: 1px solid transparent; border-radius: inherit; pointer-events: none; } // divider-exempt: input focus outline
.compact .field:focus-within::before { border-color: var(--MI_THEME-accent); }
.compact .input { min-height: 88px; max-height: 240px; resize: none; }
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding-top: 8px; }
.tools { display: flex; gap: 4px; }
.tool { width: 30px; height: 30px; padding: 0; border-radius: 6px; color: var(--MI_THEME-fgTransparentWeak); }
.tool:hover:not(:disabled) { background: var(--MI_THEME-buttonHoverBg); color: var(--MI_THEME-accent); }
.tool:focus-visible { outline: 2px solid var(--MI_THEME-focus); }
</style>
