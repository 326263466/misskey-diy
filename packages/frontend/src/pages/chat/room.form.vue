<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:class="$style.root"
	@dragover.stop="onDragover"
	@drop.stop="onDrop"
>
	<textarea
		ref="textareaEl"
		v-model="text"
		:class="$style.textarea"
		class="_acrylic _mfm"
		rows="2"
		:placeholder="i18n.ts.inputMessageHere"
		:aria-label="i18n.ts.inputMessageHere"
		:readonly="textareaReadOnly"
		:disabled="editLocked"
		@keydown="onKeydown"
		@paste="onPaste"
	></textarea>
	<MkEmojiInputOverlay :inputElement="textareaEl" :text="text"/>
	<section v-if="redPacket" :class="$style.redPacket" class="_gaps_s">
		<div :class="$style.redPacketHeading"><strong>{{ i18n.ts._redPacket.created }}</strong><button type="button" class="_textButton" :disabled="sending || pending != null" @click="removeRedPacket">{{ i18n.ts.remove }}</button></div>
		<MkRedPacket :redPacketId="redPacket.id" :authorId="$i.id" :redPacket="redPacket"/>
		<p>{{ pending ? i18n.ts._redPacket.pendingLocked : i18n.ts._redPacket.createdDescription }}</p>
	</section>
	<footer :class="$style.footer">
		<button v-if="file" type="button" class="_button" :class="$style.file" :disabled="editLocked" @click="file = null">{{ file.name }} <i class="ti ti-x" aria-hidden="true"></i></button>
		<div :class="$style.buttons">
			<button v-tooltip="i18n.ts.attachFile" class="_button" :class="$style.button" :disabled="editLocked" :aria-label="i18n.ts.attachFile" @click="chooseFile"><i class="ti ti-photo-plus"></i></button>
			<button v-tooltip="i18n.ts._redPacket.create" class="_button" :class="$style.button" :disabled="!canCreatePacket" :aria-label="i18n.ts._redPacket.create" @click="createRedPacket"><i class="ti ti-gift" aria-hidden="true"></i></button>
			<button v-tooltip="i18n.ts.emoji" class="_button" :class="$style.button" :disabled="editLocked" :aria-label="i18n.ts.emoji" @click="insertEmoji"><i class="ti ti-mood-happy"></i></button>
			<button v-tooltip="i18n.ts.send" class="_button" :class="[$style.button, $style.send]" :disabled="!canSend || sending" :aria-label="i18n.ts.send" @click="send">
				<template v-if="!sending"><i class="ti ti-send"></i></template><template v-if="sending"><MkLoading :em="true"/></template>
			</button>
		</div>
	</footer>
	<input ref="fileEl" style="display: none;" type="file" @change="onChangeFile"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, watch, ref, shallowRef, computed, nextTick, readonly, onBeforeUnmount } from 'vue';
import * as Misskey from 'misskey-js';
//import insertTextAtCursor from 'insert-text-at-cursor';
import { formatTimeString } from '@/utility/format-time-string.js';
import { selectFile } from '@/utility/drive.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { prefer } from '@/preferences.js';
import { Autocomplete } from '@/utility/autocomplete.js';
import { emojiPicker } from '@/utility/emoji-picker.js';
import { checkDragDataType, getDragData } from '@/drag-and-drop.js';
import MkEmojiInputOverlay from '@/components/MkEmojiInputOverlay.vue';
import MkRedPacket from '@/components/MkRedPacket.vue';
import MkRedPacketDialog from '@/components/MkRedPacketDialog.vue';
import { ensureSignin } from '@/i.js';
import { redPacketError, redPacketRequestRejected } from '@/utility/red-packet.js';

const $i = ensureSignin();

const props = defineProps<{
	user?: Misskey.entities.UserDetailed | null;
	room?: Misskey.entities.ChatRoom | null;
}>();

const textareaEl = shallowRef<HTMLTextAreaElement | null>(null);
const fileEl = shallowRef<HTMLInputElement>();

const text = ref<string>('');
const file = ref<Misskey.entities.DriveFile | null>(null);
const sending = ref(false);
const creating = ref(false);
const redPacket = ref<Misskey.entities.RedPacketsCreateResponse | null>(null);
const pending = ref<{ text?: string; fileId?: string; redPacketId?: string } | null>(null);

function showError(text: string) {
	if (active) void os.alert({ type: 'error', text });
}

const textareaReadOnly = ref(false);
let autocompleteInstance: Autocomplete | null = null;
let active = true;

const canSend = computed(() => $i.policies.chatAvailability === 'available' && !creating.value && ((text.value != null && text.value !== '') || file.value != null || redPacket.value != null));
const editLocked = computed(() => sending.value || pending.value != null);
const canCreatePacket = computed(() => !editLocked.value && !creating.value && !redPacket.value && $i.policies.chatAvailability === 'available' && (!props.user || props.user.host === null));

function getDraftKey() {
	return `${$i.id}:${props.user ? 'user:' + props.user.id : 'room:' + props.room?.id}`;
}

watch([text, file, redPacket, pending], () => { try { saveDraft(); } catch { showError(i18n.ts._postForm.draftSaveFailed); } });

async function createRedPacket() {
	if (!canCreatePacket.value || (!props.user && !props.room)) return;
	creating.value = true;
	const key = getDraftKey();
	try {
		const { dispose } = os.popup(MkRedPacketDialog, props.user ? { kind: 'direct', recipientIds: [props.user.id] } : { kind: 'group', roomId: props.room!.id }, {
			created: packet => {
				if (!active || key !== getDraftKey()) return;
				redPacket.value = packet;
				try { saveDraft(key); } catch { showError(i18n.ts._postForm.draftSaveFailed); }
			},
			closed: () => { creating.value = false; dispose(); },
		});
	} catch (error) {
		showError(redPacketError(error));
		creating.value = false;
	}
}

function removeRedPacket() {
	if (!redPacket.value || editLocked.value) return;
	redPacket.value = null;
	try {
		saveDraft();
	} catch { showError(i18n.ts._postForm.draftSaveFailed); }
}

async function onPaste(ev: ClipboardEvent) {
	if (editLocked.value) return;
	if (!ev.clipboardData) return;

	const pastedFileName = 'yyyy-MM-dd HH-mm-ss [{{number}}]';

	const clipboardData = ev.clipboardData;
	const items = clipboardData.items;

	if (items.length === 1) {
		if (items[0].kind === 'file') {
			const pastedFile = items[0].getAsFile();
			if (!pastedFile) return;
			const lio = pastedFile.name.lastIndexOf('.');
			const ext = lio >= 0 ? pastedFile.name.slice(lio) : '';
			const formattedName = formatTimeString(new Date(pastedFile.lastModified), pastedFileName).replace(/{{number}}/g, '1') + ext;
			const renamedFile = new File([pastedFile], formattedName, { type: pastedFile.type });
			os.launchUploader([renamedFile], { multiple: false }).then(driveFiles => {
				if (!editLocked.value) file.value = driveFiles[0];
			});
		}
	} else {
		if (items[0].kind === 'file') {
			os.alert({
				type: 'error',
				text: i18n.ts.onlyOneFileCanBeAttached,
			});
		}
	}
}

function onDragover(ev: DragEvent) {
	if (!ev.dataTransfer) return;

	const isFile = ev.dataTransfer.items[0].kind === 'file';
	if (isFile || checkDragDataType(ev, ['driveFiles'])) {
		ev.preventDefault();
		switch (ev.dataTransfer.effectAllowed) {
			case 'all':
			case 'uninitialized':
			case 'copy':
			case 'copyLink':
			case 'copyMove':
				ev.dataTransfer.dropEffect = 'copy';
				break;
			case 'linkMove':
			case 'move':
				ev.dataTransfer.dropEffect = 'move';
				break;
			default:
				ev.dataTransfer.dropEffect = 'none';
				break;
		}
	}
}

function onDrop(ev: DragEvent): void {
	if (editLocked.value) return;
	if (!ev.dataTransfer) return;

	// ファイルだったら
	if (ev.dataTransfer.files.length === 1) {
		ev.preventDefault();
		os.launchUploader([Array.from(ev.dataTransfer.files)[0]], { multiple: false });
		return;
	} else if (ev.dataTransfer.files.length > 1) {
		ev.preventDefault();
		os.alert({
			type: 'error',
			text: i18n.ts.onlyOneFileCanBeAttached,
		});
		return;
	}

	//#region ドライブのファイル
	{
		const droppedData = getDragData(ev, 'driveFiles');
		if (droppedData != null) {
			file.value = droppedData[0];
			ev.preventDefault();
		}
	}
	//#endregion
}

function onKeydown(ev: KeyboardEvent) {
	if (ev.isComposing || ev.key === 'Process' || ev.keyCode === 229) return;
	if (ev.key === 'Enter') {
		if (prefer.s['chat.sendOnEnter']) {
			if (!(ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
				send();
			}
		} else {
			if ((ev.ctrlKey || ev.metaKey)) {
				send();
			}
		}
	}
}

function chooseFile(ev: PointerEvent) {
	if (editLocked.value) return;
	selectFile({
		anchorElement: ev.currentTarget ?? ev.target,
		multiple: false,
		label: i18n.ts.selectFile,
	}).then(selectedFile => {
		if (!editLocked.value) file.value = selectedFile;
	});
}

function onChangeFile() {
	if (editLocked.value) return;
	if (fileEl.value == null || fileEl.value.files == null) return;

	if (fileEl.value.files[0]) {
		os.launchUploader(Array.from(fileEl.value.files), { multiple: false }).then(driveFiles => {
			if (!editLocked.value) file.value = driveFiles[0];
		});
	}
}

async function send() {
	if (!canSend.value || sending.value || (!props.user && !props.room)) return;
	sending.value = true;
	try {
		const data = pending.value ?? { text: text.value || undefined, fileId: file.value?.id, redPacketId: redPacket.value?.id };
		if (redPacket.value) {
			pending.value = data;
			saveDraft();
		}
		if (props.user) await misskeyApi('chat/messages/create-to-user', { toUserId: props.user.id, ...data });
		else if (props.room) await misskeyApi('chat/messages/create-to-room', { toRoomId: props.room.id, ...data });
		clear();
	} catch (error) {
		showError(redPacketError(error));
		if (redPacketRequestRejected(error) || ['RED_PACKET_ACCESS_DENIED', 'RED_PACKET_EXPIRED', 'RED_PACKET_CANCELLED', 'NO_SUCH_USER', 'NO_SUCH_ROOM', 'ROLE_PERMISSION_DENIED', 'CONTENT_REQUIRED'].includes((error as { code?: string }).code ?? '')) pending.value = null;
		try { saveDraft(); } catch { showError(i18n.ts._postForm.draftSaveFailed); }
	} finally { sending.value = false; }
}

function clear() {
	text.value = '';
	file.value = null;
	redPacket.value = null;
	pending.value = null;
	deleteDraft();
}

function saveDraft(key = getDraftKey()) {
	const drafts = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}');

	drafts[key] = {
		updatedAt: new Date(),
		data: {
			text: text.value,
			file: file.value,
			redPacket: redPacket.value,
			pending: pending.value,
		},
	};

	miLocalStorage.setItem('chatMessageDrafts', JSON.stringify(drafts));
}

function deleteDraft() {
	const drafts = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}');

	delete drafts[getDraftKey()];

	miLocalStorage.setItem('chatMessageDrafts', JSON.stringify(drafts));
}

async function insertEmoji(ev: MouseEvent) {
	if (editLocked.value) return;
	const target = ev.currentTarget ?? ev.target;
	if (target == null) return;
	textareaReadOnly.value = true;

	// emojiPickerはダイアログが閉じずにtextareaとやりとりするので、
	// focustrapをかけているとinsertTextAtCursorが効かない
	// そのため、投稿フォームのテキストに直接注入する
	// See: https://github.com/misskey-dev/misskey/pull/14282
	//      https://github.com/misskey-dev/misskey/issues/14274

	let pos = textareaEl.value?.selectionStart ?? 0;
	let posEnd = textareaEl.value?.selectionEnd ?? text.value.length;
	emojiPicker.show(
		target as HTMLElement,
		emoji => {
			if (editLocked.value) return;
			const textBefore = text.value.substring(0, pos);
			const textAfter = text.value.substring(posEnd);
			text.value = textBefore + emoji + textAfter;
			pos += emoji.length;
			posEnd = pos;
		},
		() => {
			textareaReadOnly.value = false;
			nextTick(() => {
				textareaEl.value?.focus();
				textareaEl.value?.setSelectionRange(pos, pos);
			});
		},
	);
}

onMounted(() => {
	if (textareaEl.value != null) {
		autocompleteInstance = new Autocomplete(textareaEl.value, text);
	}

	// 書きかけの投稿を復元
	try {
		const draft = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}')[getDraftKey()];
		if (draft) {
			text.value = draft.data.text;
			file.value = draft.data.file;
			redPacket.value = draft.data.redPacket ?? null;
			pending.value = draft.data.pending ?? null;
		}
	} catch { showError(i18n.ts._postForm.draftSaveFailed); }
});

onBeforeUnmount(() => {
	active = false;
	if (autocompleteInstance) {
		autocompleteInstance.detach();
		autocompleteInstance = null;
	}
});
</script>

<style lang="scss" module>
.root {
	position: relative;
	border-radius: var(--MI-cardRadius) var(--MI-cardRadius) 0 0;
	overflow: clip;
}

.textarea {
	cursor: auto;
	display: block;
	width: 100%;
	min-width: 100%;
	max-width: 100%;
	min-height: calc(1.5em + var(--MI-marginHalf) * 2);
	margin: 0;
	padding: var(--MI-marginHalf) var(--MI-cardPadding);
	resize: none;
	font-size: 1em;
	line-height: 1.5;
	font-family: inherit;
	outline: none;
	border: none;
	// 毛玻璃会建立独立合成层，输入框自身也需要圆角，避免滚动时露出直角。
	border-radius: var(--MI-cardRadius) var(--MI-cardRadius) 0 0;
	box-shadow: none;
	box-sizing: border-box;
	color: var(--MI_THEME-fg);
	field-sizing: content;
}

.footer {
	position: sticky;
	bottom: 0;
	background: var(--MI_THEME-panel);
}

.file {
	padding: 8px;
	cursor: pointer;
}

.buttons {
	display: flex;
}

.button {
	height: 50px;
	aspect-ratio: 1;

	&:hover {
		color: var(--MI_THEME-accent);
	}
}
.send {
	margin-left: auto;
	color: var(--MI_THEME-accent);
}

.redPacket { padding: var(--MI-margin); background: var(--MI_THEME-panel); }
.redPacket p { margin: 0; font-size: .85em; color: var(--MI_THEME-fgTransparentWeak); }
.redPacketHeading { display: flex; align-items: center; justify-content: space-between; gap: var(--MI-margin); }
</style>
