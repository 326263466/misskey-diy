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
	<div v-if="silenced || editingMessage || reply || redPacket || file" :class="$style.previews">
		<div v-if="!isEditing && (redPacket || file)" :class="$style.attachments">
			<section v-if="redPacket" :class="$style.redPacket" :aria-label="i18n.ts._redPacket.created">
				<i class="mi-red-packet" :class="$style.redPacketIcon" aria-hidden="true"></i>
				<div :class="$style.redPacketText"><strong>{{ redPacket.message || i18n.ts._redPacket.defaultMessage }}</strong><span>{{ pending ? i18n.ts._redPacket.pendingLocked : i18n.ts._redPacket.created }}</span></div>
				<button type="button" class="_button" :class="$style.removePacket" :disabled="sending || pending != null" :aria-label="i18n.ts.remove" @click="removeRedPacket"><i class="ti ti-x" aria-hidden="true"></i></button>
			</section>
			<div v-if="file" :class="$style.file">
				<i class="ti ti-paperclip" aria-hidden="true"></i><span :class="$style.fileName" :title="file.name">{{ file.name }}</span>
				<button type="button" class="_button _iconButton" :class="$style.removeFile" :disabled="editLocked" :aria-label="i18n.ts.remove" @click="file = null"><i class="ti ti-x" aria-hidden="true"></i></button>
			</div>
		</div>
		<div v-if="silenced" role="status" :class="$style.silenceNotice"><i class="ti ti-lock" aria-hidden="true"></i> {{ room?.myIsSilenced ? i18n.ts._chat.youAreSilenced : i18n.ts._chat.roomSilenced }}</div>
		<div v-if="editingMessage" :class="[$style.editingBar, $style.accentBar]">
			<i class="ti ti-pencil" :class="$style.editingIcon" aria-hidden="true"></i>
			<div :class="$style.editingTexts">
				<span :class="$style.editingTitle">{{ i18n.ts._chat.editMessage }}</span>
				<span v-if="editingMessage.text" :class="$style.editingPreview"><Mfm :text="toSingleLine(editingMessage.text)" :plain="true" :nowrap="true" :author="editingMessage.fromUser" :nyaize="'respect'"/></span>
			</div>
			<button type="button" class="_button _iconButton" :class="$style.editingCancel" :aria-label="i18n.ts.cancel" @click="emit('cancelEdit')"><i class="ti ti-x" aria-hidden="true"></i></button>
		</div>
		<div v-if="reply && !isEditing" :class="[$style.editingBar, $style.accentBar]">
			<i :class="[reply.type === 'quote' ? 'ti ti-quote' : 'ti ti-arrow-back-up', $style.editingIcon]" aria-hidden="true"></i>
			<div :class="$style.editingTexts">
				<span :class="$style.editingTitle">{{ reply.type === 'quote' ? i18n.ts.quote : i18n.ts.reply }} · <MkUserName v-if="reply.user" :user="reply.user"/><span v-else>{{ reply.name || reply.acct }}</span></span>
				<span :class="$style.editingPreview"><Mfm :text="toSingleLine(reply.text)" :plain="true" :nowrap="true" :author="reply.user"/></span>
			</div>
			<button type="button" class="_button _iconButton" :class="$style.editingCancel" :disabled="editLocked" :aria-label="i18n.ts._chat.cancelReply" @click="reply = null"><i class="ti ti-x" aria-hidden="true"></i></button>
		</div>
	</div>
	<footer :class="$style.footer">
		<div :class="$style.inputBar">
			<button v-tooltip.icon="i18n.ts.attachFile" type="button" class="_button _iconButton" :class="$style.button" :disabled="editLocked || isEditing" :aria-label="i18n.ts.attachFile" @click="chooseFile"><i class="ti ti-paperclip"></i></button>
			<button v-tooltip.icon="i18n.ts._redPacket.create" class="_button _iconButton" :class="$style.button" :disabled="!canCreatePacket" :aria-label="i18n.ts._redPacket.create" @click="createRedPacket"><i class="mi-red-packet" aria-hidden="true"></i></button>
			<XEditor ref="editorEl" v-model="text" :class="$style.editor" :readonly="textareaReadOnly" :disabled="editLocked" @submit="send" @paste="onPaste"/>
			<button v-tooltip.icon="i18n.ts.emoji" class="_button _iconButton" :class="$style.button" :disabled="editLocked" :aria-label="i18n.ts.emoji" @click="insertEmoji"><i class="ti ti-mood-happy"></i></button>
			<button v-tooltip.icon="isEditing ? i18n.ts.save : i18n.ts.send" class="_button _iconButton" :class="[$style.button, { [$style.send]: canSend && !sending }]" :disabled="!canSend || sending" :aria-label="isEditing ? i18n.ts.save : i18n.ts.send" @click="send">
				<i :class="isEditing ? 'ti ti-check' : 'ti ti-send'"></i>
			</button>
		</div>
	</footer>
	<p v-if="fileProtection.status.value !== 'saved'" class="_caption" role="status">{{ fileProtection.status.value === 'failed' ? i18n.ts._attachmentLifecycle.draftFailed : i18n.ts._attachmentLifecycle.draftPending }}</p>
	<input ref="fileEl" style="display: none;" type="file" @change="onChangeFile"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, watch, ref, shallowRef, computed, nextTick, onBeforeUnmount, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import XEditor from './XEditor.vue';
import { chatTextForSend, toSingleLine } from './composer.js';
import type { ChatReply, ChatComposeAction } from './composer.js';
import { formatTimeString } from '@/utility/format-time-string.js';
import { selectFile } from '@/utility/drive.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { emojiPicker } from '@/utility/emoji-picker.js';
import { checkDragDataType, getDragData } from '@/drag-and-drop.js';
import MkRedPacketDialog from '@/components/MkRedPacketDialog.vue';
import { ensureSignin } from '@/i.js';
import { redPacketError, redPacketRequestRejected } from '@/utility/red-packet.js';
import { globalEvents } from '@/events.js';
import { createDraftFileProtection } from '@/utility/draft-file-protection.js';

const $i = ensureSignin();
const fileProtection = createDraftFileProtection($i);
let draftReady = false;
let protectionTimer: number | undefined;
let draftStorageFailed = false;
let storedProtectionId: string | null = null;

const props = defineProps<{
	user?: Misskey.entities.UserDetailed | null;
	room?: Misskey.entities.ChatRoom | null;
	editing?: Misskey.entities.ChatMessageLite | null;
	initializing?: boolean;
	conversationId?: string;
	silenced?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'sent', message: Misskey.entities.ChatMessageLite): void;
	(ev: 'edited', message: Misskey.entities.ChatMessageLite): void;
	(ev: 'cancelEdit'): void;
}>();

const editorEl = useTemplateRef('editorEl');
const fileEl = shallowRef<HTMLInputElement>();

const text = ref<string>('');
const reply = ref<ChatReply | null>(null);
const file = ref<Misskey.entities.DriveFile | null>(null);
const sending = ref(false);
const creating = ref(false);
const redPacket = ref<Misskey.entities.RedPacketsCreateResponse | null>(null);
const pending = ref<{ text?: string; fileId?: string; redPacketId?: string; replyId?: string; replyType?: 'reply' | 'quote' } | null>(null);

function showError(text: string) {
	if (active) os.toast(text, 'error');
}

const textareaReadOnly = ref(false);
let active = true;

const sendText = computed(() => chatTextForSend(text.value));
// 编辑时允许清空文字：编辑后仍有任何内容（文字、文件、红包等，纯空白不算）即可保存
const canSend = computed(() => !props.silenced && !props.initializing && $i.policies.chatAvailability === 'available' && !creating.value && Array.from(sendText.value).length <= Misskey.CONTENT_LIMITS.chatMessage && (sendText.value.trim() !== '' || (isEditing.value && (editingMessage.value?.file != null || editingMessage.value?.redPacket != null)) || (!isEditing.value && (file.value != null || redPacket.value != null || pending.value != null))));
const editLocked = computed(() => props.silenced || props.initializing || sending.value || pending.value != null);
const canCreatePacket = computed(() => !editLocked.value && !creating.value && !redPacket.value && !isEditing.value && $i.policies.chatAvailability === 'available' && (!props.user || props.user.host === null));

const editingMessage = computed(() => props.editing ?? null);
const isEditing = computed(() => editingMessage.value != null);

// 进入编辑前的草稿，取消或完成后恢复，避免编辑内容覆盖正在输入的草稿。
let draftBeforeEdit: string | null = null;

watch(editingMessage, (message) => {
	if (message != null) {
		if (draftBeforeEdit == null) draftBeforeEdit = text.value;
		text.value = message.text ?? '';
		nextTick(() => editorEl.value?.focus());
	} else {
		text.value = draftBeforeEdit ?? '';
		draftBeforeEdit = null;
	}
});

function getDraftKey() {
	return `${$i.id}:${props.conversationId ?? (props.user ? 'user:' + props.user.id : 'room:' + props.room?.id)}`;
}

function independentDraftPrefix() {
	return `misskey:chatDraft:${getDraftKey()}:`;
}

watch([text, file, redPacket, pending, reply], () => {
	if (isEditing.value) return;
	try { saveDraft(); } catch {
		showError(i18n.ts._postForm.draftSaveFailed);
	}
});

watch([text, file, editingMessage], () => {
	if (!draftReady || !isEditing.value) return;
	scheduleFileProtection();
});

function protectDraftFiles() {
	if (!draftReady || draftStorageFailed) return;
	void fileProtection.update(
		[file.value?.id, editingMessage.value?.file?.id].filter((id): id is string => id != null),
		[text.value, draftBeforeEdit ?? ''].join('\n').trim(),
	);
}

function scheduleFileProtection() {
	window.clearTimeout(protectionTimer);
	protectionTimer = window.setTimeout(protectDraftFiles, 500);
}

async function createRedPacket() {
	if (!canCreatePacket.value || (!props.user && !props.room)) return;
	creating.value = true;
	const key = getDraftKey();
	try {
		const { dispose } = os.popup(MkRedPacketDialog, props.user ? { kind: 'direct', recipientIds: [props.user.id], chat: true } : { kind: 'group', roomId: props.room!.id, memberCount: props.room!.memberCount, chat: true }, {
			created: packet => {
				if (!active || key !== getDraftKey()) {
					// 弹窗提交时可能已经切换会话，保留原会话的已付款红包供重试。
					const drafts = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}');
					drafts[key] = { updatedAt: new Date(), data: { ...drafts[key]?.data, redPacket: packet } };
					miLocalStorage.setItem('chatMessageDrafts', JSON.stringify(drafts));
					globalEvents.emit('chatDraftUpdated');
					return;
				}
				redPacket.value = packet;
				try { saveDraft(key); } catch { showError(i18n.ts._postForm.draftSaveFailed); }
				creating.value = false;
				void send();
			},
			closed: () => { creating.value = false; dispose(); },
		});
	} catch (error) {
		showError(redPacketError(error));
		creating.value = false;
	}
}

async function removeRedPacket() {
	if (!redPacket.value || editLocked.value) return;
	sending.value = true;
	try {
		const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts._redPacket.cancelCreated });
		if (canceled) return;
		await misskeyApi('red-packets/cancel', { redPacketId: redPacket.value.id });
		redPacket.value = null;
		saveDraft();
	} catch (error) { showError(redPacketError(error)); } finally { sending.value = false; }
}

async function onPaste(ev: ClipboardEvent) {
	if (editLocked.value || isEditing.value) return;
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
			os.launchUploader([renamedFile], { multiple: false, isManaged: true, draftId: fileProtection.id }).then(driveFiles => {
				if (active && !editLocked.value) file.value = driveFiles[0];
			});
		}
	} else {
		if (items[0].kind === 'file') {
			os.toast(i18n.ts.onlyOneFileCanBeAttached, 'error');
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
	if (editLocked.value || isEditing.value) return;
	if (!ev.dataTransfer) return;

	// ファイルだったら
	if (ev.dataTransfer.files.length === 1) {
		ev.preventDefault();
		os.launchUploader([Array.from(ev.dataTransfer.files)[0]], { multiple: false, isManaged: true, draftId: fileProtection.id }).then(driveFiles => {
			if (active && !editLocked.value) file.value = driveFiles[0];
		});
		return;
	} else if (ev.dataTransfer.files.length > 1) {
		ev.preventDefault();
		os.toast(i18n.ts.onlyOneFileCanBeAttached, 'error');
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

function chooseFile(ev: PointerEvent) {
	if (editLocked.value || isEditing.value) return;
	selectFile({
		anchorElement: ev.currentTarget ?? ev.target,
		multiple: false,
		label: i18n.ts.selectFile,
		isManaged: true,
		draftId: fileProtection.id,
	}).then(selectedFile => {
		if (active && !editLocked.value) file.value = selectedFile;
	});
}

function onChangeFile() {
	if (editLocked.value || isEditing.value) return;
	if (fileEl.value == null || fileEl.value.files == null) return;

	if (fileEl.value.files[0]) {
		os.launchUploader(Array.from(fileEl.value.files), { multiple: false, isManaged: true, draftId: fileProtection.id }).then(driveFiles => {
			if (active && !editLocked.value) file.value = driveFiles[0];
		});
	}
}

async function send() {
	if (!canSend.value || sending.value || (!props.user && !props.room)) return;
	sending.value = true;
	try {
		if (editingMessage.value) {
			const updated = await misskeyApi('chat/messages/update', {
				messageId: editingMessage.value.id,
				text: sendText.value.trim() !== '' ? sendText.value : null,
			});
			emit('edited', updated);
			return;
		}
		const data = pending.value ?? (redPacket.value
			? { redPacketId: redPacket.value.id }
			: { text: sendText.value || undefined, fileId: file.value?.id, ...(reply.value ? { replyId: reply.value.id, replyType: reply.value.type } : {}) });
		if (redPacket.value) {
			pending.value = data;
			saveDraft();
		}
		const sent = props.user
			? await misskeyApi('chat/messages/create-to-user', { toUserId: props.user.id, ...data })
			: props.room ? await misskeyApi('chat/messages/create-to-room', { toRoomId: props.room.id, ...data }) : null;
		if (sent) emit('sent', sent);
		if (data.redPacketId) {
			// 红包独立发送，不消耗或清除输入框里已有的文字、附件和回复草稿。
			redPacket.value = null;
			pending.value = null;
			saveDraft();
		} else {
			clear();
		}
	} catch (error) {
		const reason = sendRejectedReason((error as { code?: string }).code);
		// 消息发送失败的兜底文案用聊天的，红包随消息发送时仍显示红包错误。
		if (reason) os.toast(reason, 'error');
		else showError(redPacketError(error, i18n.ts._chat.sendFailed));
		if (redPacketRequestRejected(error) || ['NO_SUCH_REPLY', 'RED_PACKET_ACCESS_DENIED', 'RED_PACKET_EXPIRED', 'RED_PACKET_CANCELLED', 'NO_SUCH_USER', 'NO_SUCH_ROOM', 'ROLE_PERMISSION_DENIED', 'CONTENT_REQUIRED', 'RECIPIENT_REJECTS_CHAT', 'RECIPIENT_CHAT_UNAVAILABLE', 'NOT_MEMBER_OF_ROOM'].includes((error as { code?: string }).code ?? '')) pending.value = null;
		try { saveDraft(); } catch { showError(i18n.ts._postForm.draftSaveFailed); }
	} finally { sending.value = false; }
}

// 消息被拒收的原因；返回 null 时按普通发送失败处理。
function sendRejectedReason(code: string | undefined): string | null {
	switch (code) {
		case 'NO_SUCH_REPLY': return i18n.ts._chat.messageUnavailable;
		case 'RECIPIENT_REJECTS_CHAT':
			switch (props.user?.chatScope) {
				case 'followers': return i18n.ts._chat.thisUserAllowsChatOnlyFromFollowers;
				case 'following': return i18n.ts._chat.thisUserAllowsChatOnlyFromFollowing;
				case 'mutual': return i18n.ts._chat.thisUserAllowsChatOnlyFromMutualFollowing;
				case 'none': return i18n.ts._chat.thisUserNotAllowedChatAnyone;
				default: return i18n.ts._chat.cannotChatWithTheUser_description;
			}
		case 'RECIPIENT_CHAT_UNAVAILABLE': return i18n.ts._chat.chatNotAvailableInOtherAccount;
		case 'YOU_HAVE_BEEN_BLOCKED': return i18n.ts._chat.blockedByRecipient;
		case 'NOT_MEMBER_OF_ROOM': return i18n.ts._chat.notMemberOfRoom;
		case 'CHAT_ROOM_SILENCED': return i18n.ts._chat.roomSilenced;
		case 'NO_SUCH_USER': return i18n.ts.noSuchUser;
		case 'ROLE_PERMISSION_DENIED': return $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer;
		case 'RATE_LIMIT_EXCEEDED': return i18n.ts.cannotPerformTemporaryDescription;
		default: return null;
	}
}

function clear() {
	window.clearTimeout(protectionTimer);
	void fileProtection.release();
	text.value = '';
	reply.value = null;
	file.value = null;
	redPacket.value = null;
	pending.value = null;
	deleteDraft();
}

function readDrafts() {
	try {
		const drafts = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') ?? '{}');
		return drafts && typeof drafts === 'object' && !Array.isArray(drafts) ? drafts : {};
	} catch { return {}; }
}

function saveDraft(key = getDraftKey()) {
	if (isEditing.value || !draftReady) return;
	try {
		if (!text.value && !file.value && !redPacket.value && !pending.value && !reply.value) {
			window.clearTimeout(protectionTimer);
			deleteDraft();
			storedProtectionId = null;
			draftStorageFailed = false;
			void fileProtection.release();
			return;
		}
		const drafts = readDrafts();
		const protectionId = fileProtection.id;
		const previous = drafts[key];
		const otherDrafts = { ...previous?.otherDrafts };
		if (previous?.data?.fileProtectionId && previous.data.fileProtectionId !== protectionId) otherDrafts[previous.data.fileProtectionId] = { ...previous, otherDrafts: undefined };
		delete otherDrafts[protectionId];

		drafts[key] = {
			updatedAt: new Date(),
			otherDrafts,
			data: {
				fileProtectionId: protectionId,
				text: text.value,
				reply: reply.value,
				file: file.value,
				redPacket: redPacket.value,
				pending: pending.value,
			},
		};

		localStorage.setItem(`${independentDraftPrefix()}${protectionId}`, JSON.stringify(drafts[key]));
		storedProtectionId = protectionId;
		fileProtection.markPersisted();
		draftStorageFailed = false;
		scheduleFileProtection();
		try { miLocalStorage.setItem('chatMessageDrafts', JSON.stringify(drafts)); } catch { /* 独立快照已保存，兼容缓存失败不影响附件登记。 */ }
	} catch (error) {
		draftStorageFailed = true;
		fileProtection.markStorageFailed();
		throw error;
	}
	globalEvents.emit('chatDraftUpdated');
}

function deleteDraft() {
	const drafts = readDrafts();
	if (storedProtectionId) localStorage.removeItem(`${independentDraftPrefix()}${storedProtectionId}`);
	const draft = drafts[getDraftKey()];
	if (draft) {
		const others = { ...draft.otherDrafts };
		if (storedProtectionId) delete others[storedProtectionId];
		if (!draft.data?.fileProtectionId || draft.data.fileProtectionId === storedProtectionId) {
			const replacement = Object.entries(others).sort((a, b) => String((b[1] as { updatedAt?: string }).updatedAt).localeCompare(String((a[1] as { updatedAt?: string }).updatedAt)))[0];
			if (replacement) {
				const [nextId, next] = replacement;
				delete others[nextId];
				drafts[getDraftKey()] = { ...(next as object), otherDrafts: others };
			} else delete drafts[getDraftKey()];
		} else draft.otherDrafts = others;
	}

	miLocalStorage.setItem('chatMessageDrafts', JSON.stringify(drafts));
	globalEvents.emit('chatDraftUpdated');
}

async function insertEmoji(ev: MouseEvent) {
	if (editLocked.value) return;
	const target = ev.currentTarget ?? ev.target;
	if (target == null) return;
	textareaReadOnly.value = true;

	let selection = editorEl.value?.getSelection();
	emojiPicker.show(
		target as HTMLElement,
		emoji => {
			if (editLocked.value) return;
			selection = editorEl.value?.insertText(emoji, { selection, focus: false });
		},
		() => {
			textareaReadOnly.value = false;
			if (selection) void editorEl.value?.restoreSelection(selection);
		},
	);
}

onMounted(async () => {
	// 書きかけの投稿を復元
	try {
		const savedDraft = readDrafts()[getDraftKey()];
		const independentDrafts = Object.keys(localStorage).filter(key => key.startsWith(independentDraftPrefix())).flatMap(key => {
			try { return [JSON.parse(localStorage.getItem(key) ?? 'null')]; } catch { return []; }
		});
		const draft = [savedDraft, ...Object.values(savedDraft?.otherDrafts ?? {}), ...independentDrafts].filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
		if (draft) {
			await fileProtection.restore(draft.data.fileProtectionId);
			if (!active) return;
			if (draft.data.fileProtectionId === fileProtection.id) {
				storedProtectionId = draft.data.fileProtectionId;
				fileProtection.markPersisted();
			}
			text.value = draft.data.text ?? '';
			file.value = draft.data.file ?? null;
			redPacket.value = draft.data.redPacket ?? null;
			pending.value = draft.data.pending?.redPacketId ? { redPacketId: draft.data.pending.redPacketId } : draft.data.pending ?? null;
			const savedReply = draft.data.reply;
			if (savedReply && typeof savedReply.id === 'string' && typeof savedReply.acct === 'string' && typeof savedReply.text === 'string') {
				const savedUser = typeof savedReply.user?.id === 'string' && typeof savedReply.user.username === 'string' ? savedReply.user : undefined;
				reply.value = { id: savedReply.id, acct: savedReply.acct, text: savedReply.text, name: typeof savedReply.name === 'string' ? savedReply.name : undefined, user: savedUser, type: savedReply.type === 'quote' ? 'quote' : 'reply' };
			}
		}
	} catch { showError(i18n.ts._postForm.draftSaveFailed); }
	if (editingMessage.value) {
		draftBeforeEdit = text.value;
		text.value = editingMessage.value.text ?? '';
	}
	draftReady = true;
	void fileProtection.update([file.value?.id, editingMessage.value?.file?.id].filter((id): id is string => id != null), [text.value, draftBeforeEdit ?? ''].join('\n').trim());
});

onBeforeUnmount(() => {
	window.clearTimeout(protectionTimer);
	protectDraftFiles();
	fileProtection.dispose();
	active = false;
});

async function compose(action: ChatComposeAction, message: Misskey.entities.ChatMessageLite) {
	if (editLocked.value || creating.value || $i.policies.chatAvailability !== 'available') return;
	if (isEditing.value) {
		emit('cancelEdit');
		await nextTick();
	}
	const sender = message.fromUser;
	if (!sender) return;
	const acct = Misskey.acct.toString(sender);
	const content = message.text || message.file?.name || (message.redPacket ? i18n.ts._redPacket.title : '');
	if (action === 'reply' || action === 'quote') {
		reply.value = { id: message.id, acct, name: sender.name ?? sender.username, user: sender, text: content, type: action };
		editorEl.value?.focusText();
	} else {
		editorEl.value?.insertText(`@${acct} `, { plainText: true, mention: true });
	}
}

async function mentionUser(user: Misskey.entities.UserLite) {
	if (editLocked.value || creating.value || $i.policies.chatAvailability !== 'available') return;
	if (isEditing.value) { emit('cancelEdit'); await nextTick(); }
	editorEl.value?.insertText(`@${Misskey.acct.toString(user)} `, { plainText: true, mention: true });
}

defineExpose({ compose, mentionUser, isLocked: () => editLocked.value || creating.value });
</script>

<style lang="scss" module>
.root {
	--MI-chatComposerBg: color-mix(in srgb, var(--MI_THEME-fg) 4%, var(--MI_THEME-panel));
	position: relative;
	display: flow-root;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-cardRadius) var(--MI-cardRadius) 0 0;
	overflow: visible;
}

.silenceNotice {
	flex-shrink: 0;
	box-sizing: border-box;
	width: 100%;
	padding: 8px 12px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.85em;
}

.editingBar {
	flex-shrink: 0;
	box-sizing: border-box;
	width: 100%;
	display: flex;
	align-items: center;
	gap: 10px;
	margin-block: 6px;
	padding: 8px var(--MI-cardPadding);
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
	overflow: hidden;
}

// 与气泡内的回复/引用块同风格：左侧强调线 + 强调色浅底。编辑和回复/引用共用。
.accentBar {
	padding-left: calc(var(--MI-cardPadding) - 3px);
	border-left: 3px solid var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, var(--MI_THEME-panel));
}

.editingIcon {
	flex-shrink: 0;
	color: var(--MI_THEME-accent);
}

.editingTexts {
	display: flex;
	flex-direction: column;
	flex: 1;
	min-width: 0;
	line-height: 1.4;
}

.editingTitle {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--MI_THEME-accent);
	font-weight: 700;
}

.editingPreview {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--MI_THEME-fgTransparentWeak);
}

.editingCancel {
	flex-shrink: 0;
	padding: 4px 8px;
}

.footer {
	background: var(--MI_THEME-panel);
	padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
	border-radius: inherit;
}

.file {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 8px;
	max-width: 100%;
	box-sizing: border-box;
	padding: 8px 10px;
	border: var(--MI-divider);
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
	font-size: 13px;
	overflow: hidden;
}
.file > i { flex-shrink: 0; }
.fileName { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.removeFile { display: grid; place-items: center; flex: none; width: 24px; height: 24px; color: var(--MI_THEME-fgTransparentWeak); }
.previews {
	position: absolute;
	z-index: 3;
	inset-inline: 0;
	bottom: 100%;
	display: flex;
	flex-direction: column;
	gap: 2px;
	box-sizing: border-box;
	padding: 0 12px 2px;
	max-height: min(40vh, 240px);
	overflow: hidden;
}
.attachments { display: flex; flex-direction: column; align-items: start; gap: 2px; width: min(320px, 100%); min-height: 0; overflow-y: auto; }

.inputBar {
	display: flex;
	align-items: flex-end;
	min-width: 0;
	padding: 3px;
	border-radius: 8px;
	background: var(--MI-chatComposerBg);

	// 去掉全局 _iconButton 的悬停圆底，只保留图标变色。
	.button > :is(i, .mi-red-packet)::after {
		content: none;
	}
}

.editor { flex: 1; min-width: 0; }

.button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: none;
	width: 24px;
	// 与一行输入区等高（行高 1.5em + 编辑区上下内边距 12px），底部对齐时图标始终与最后一行文字垂直居中。
	height: calc(1.5em + 12px);
	font-size: 1em;
	color: var(--MI_THEME-fgTransparentWeak);

	&:hover {
		color: var(--MI_THEME-accent);
	}
}
.send {
	color: var(--MI_THEME-accent);
}

.redPacket { display: flex; flex-shrink: 0; align-items: center; gap: 10px; width: 250px; max-width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: var(--MI-radius); overflow: hidden; color: var(--MI-redPacketGold); background: linear-gradient(135deg, var(--MI-redPacketStart), var(--MI-redPacketEnd)); }
.redPacketIcon { flex: none; font-size: 26px; }
.redPacketText { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.redPacketText strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.redPacketText span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; opacity: .8; }
.removePacket { display: grid; place-items: center; flex: none; width: 24px; height: 24px; border-radius: 50%; }
.removePacket:hover { background: color-mix(in srgb, var(--MI-redPacketGold) 15%, transparent); }
</style>
