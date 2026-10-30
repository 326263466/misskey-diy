<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="silenced || editingMessage || reply || redPacket || file" :class="$style.previews" data-chat-previews @dragover.stop="onDragover" @drop.stop="onDrop">
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
	<div v-if="silenced" role="status" :class="$style.silenceNotice"><i class="ti ti-lock" aria-hidden="true"></i> {{ silencePlaceholder }}</div>
	<div v-if="editingMessage" :class="[$style.editingBar, $style.accentBar]">
		<i class="ti ti-pencil" :class="$style.editingIcon" aria-hidden="true"></i>
		<div :class="$style.editingTexts">
			<span :class="$style.editingTitle">{{ i18n.ts._chat.editMessage }}</span>
			<span v-if="editingMessage.text" :class="$style.editingPreview"><Mfm :text="toSingleLine(editingMessage.text)" :plain="true" :nowrap="true" :author="editingMessage.fromUser" :nyaize="'respect'"/></span>
		</div>
		<button type="button" class="_button _iconButton" :class="$style.editingCancel" :aria-label="i18n.ts.cancel" @click="emit('cancelEdit')"><i class="ti ti-x" aria-hidden="true"></i></button>
	</div>
	<div v-if="reply && !isEditing" :class="[$style.editingBar, $style.accentBar, { [$style.quoteBar]: reply.type === 'quote' }]">
		<i :class="[reply.type === 'quote' ? 'ti ti-quote' : 'ti ti-arrow-back-up', $style.editingIcon]" aria-hidden="true"></i>
		<div :class="$style.editingTexts">
			<span :class="$style.editingTitle">{{ reply.type === 'quote' ? i18n.ts.quote : i18n.ts.reply }} · <MkUserName v-if="reply.user" :user="reply.user"/><span v-else>{{ reply.name || reply.acct }}</span></span>
			<span :class="$style.editingPreview"><Mfm :text="toSingleLine(reply.text)" :plain="true" :nowrap="true" :author="reply.user"/></span>
		</div>
		<button type="button" class="_button _iconButton" :class="$style.editingCancel" :disabled="editLocked" :aria-label="i18n.ts._chat.cancelReply" @click="reply = null"><i class="ti ti-x" aria-hidden="true"></i></button>
	</div>
</div>
<div
	ref="rootEl"
	:class="$style.root"
	data-chat-composer
	data-emoji-picker-boundary
	@dragover.stop="onDragover"
	@drop.stop="onDrop"
>
	<footer :class="$style.footer">
		<div :class="$style.toolbar" role="group" :aria-label="i18n.ts.more">
			<button v-tooltip.icon="i18n.ts.attachFile" type="button" class="_button" :class="$style.button" :disabled="editLocked || isEditing" :aria-label="i18n.ts.attachFile" @click="chooseFile"><i class="ti ti-paperclip" aria-hidden="true"></i></button>
			<button v-tooltip.icon="i18n.ts.emoji" type="button" class="_button" :class="$style.button" :disabled="editLocked" :aria-label="i18n.ts.emoji" @click="insertEmoji"><i class="ti ti-mood-happy" aria-hidden="true"></i></button>
			<button v-tooltip.icon="i18n.ts._redPacket.create" type="button" class="_button" :class="$style.button" :disabled="!canCreatePacket" :aria-label="i18n.ts._redPacket.create" @click="createRedPacket"><i class="mi-red-packet" aria-hidden="true"></i></button>
		</div>
		<XEditor ref="editorEl" v-model="text" :class="$style.editor" :readonly="textareaReadOnly || sending" :disabled="editorDisabled" :placeholder="silencePlaceholder" @submit="send" @paste="onPaste"/>
		<button type="button" class="_button" :class="$style.send" :disabled="!canSend || sending" :aria-busy="sending" @mousedown.prevent @click="send">{{ isEditing ? i18n.ts.save : i18n.ts.send }}</button>
	</footer>
</div>
</template>

<script lang="ts" setup>
import { onMounted, watch, ref, computed, nextTick, onBeforeUnmount, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import XEditor from './XEditor.vue';
import { chatTextForSend, toSingleLine } from './composer.js';
import type { ChatReply, ChatComposeAction } from './composer.js';
import { formatTimeString } from '@/utility/format-time-string.js';
import { selectFile } from '@/utility/drive.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { emojiPicker } from '@/utility/emoji-picker.js';
import { checkDragDataType, getDragData } from '@/drag-and-drop.js';
import MkRedPacketDialog from '@/components/MkRedPacketDialog.vue';
import { ensureSignin } from '@/i.js';
import { redPacketError, redPacketRequestRejected } from '@/utility/red-packet.js';
import { globalEvents } from '@/events.js';
import { createDraftSession } from '@/utility/draft-session.js';

const $i = ensureSignin();
let draftSession = createDraftSession($i.id);
let draftReady = false;
let storedDraft: { key: string; raw: string } | null = null;
let restoredDraftSources: ChatDraftSource[] = [];

const props = defineProps<{
	user?: Misskey.entities.UserDetailed | null;
	room?: Misskey.entities.ChatRoom | null;
	editing?: Misskey.entities.ChatMessageLite | null;
	initializing?: boolean;
	conversationId?: string;
	silenced?: boolean;
	silenceUntil?: string | null;
}>();

const emit = defineEmits<{
	(ev: 'sent', message: Misskey.entities.ChatMessageLite): void;
	(ev: 'edited', message: Misskey.entities.ChatMessageLite): void;
	(ev: 'cancelEdit'): void;
}>();

const editorEl = useTemplateRef('editorEl');

const text = ref<string>('');
const reply = ref<ChatReply | null>(null);
const file = ref<Misskey.entities.DriveFile | null>(null);
const sending = ref(false);
const creating = ref(false);
const redPacket = ref<Misskey.entities.RedPacketsCreateResponse | null>(null);
const pending = ref<{ text?: string; fileId?: string; redPacketId?: string; replyId?: string; replyType?: 'reply' | 'quote' } | null>(null);

type StoredChatDraft = {
	updatedAt?: string;
	sessionId?: string;
	otherDrafts?: Record<string, StoredChatDraft>;
	data?: {
		fileProtectionId?: string;
		text?: string | null;
		reply?: ChatReply | null;
		file?: Misskey.entities.DriveFile | null;
		redPacket?: Misskey.entities.RedPacketsCreateResponse | null;
		pending?: typeof pending.value;
	};
};
type ChatDraftSource = { key: string; entryKey?: string; otherDraftId?: string; sessionId?: string; raw: string };
type ChatDraftCandidate = {
	draft: StoredChatDraft & { data: NonNullable<StoredChatDraft['data']> };
	source: ChatDraftSource;
	storageRaw: string;
};

function showError(text: string) {
	if (active) os.toast(text, 'error');
}

const textareaReadOnly = ref(false);
let active = true;

const sendText = computed(() => chatTextForSend(text.value));
// 编辑时允许清空文字：编辑后仍有任何内容（文字、文件、红包等，纯空白不算）即可保存
const canSend = computed(() => !props.silenced && !props.initializing && $i.policies.chatAvailability === 'available' && !creating.value && Array.from(sendText.value).length <= Misskey.CONTENT_LIMITS.chatMessage && (sendText.value.trim() !== '' || (isEditing.value && (editingMessage.value?.file != null || editingMessage.value?.redPacket != null)) || (!isEditing.value && (file.value != null || redPacket.value != null || pending.value != null))));
const editorDisabled = computed(() => props.silenced || props.initializing || pending.value != null);
const editLocked = computed(() => editorDisabled.value || sending.value);
const canMention = computed(() => !editLocked.value && !creating.value && $i.policies.chatAvailability === 'available');
const rootEl = useTemplateRef('rootEl');
const canCreatePacket = computed(() => !editLocked.value && !creating.value && !redPacket.value && !isEditing.value && $i.policies.chatAvailability === 'available' && (!props.user || props.user.host === null));
const silencePlaceholder = computed(() => !props.silenced ? undefined : props.silenceUntil
	? i18n.tsx._chat.silencedUntil({ time: formatTimeString(new Date(props.silenceUntil), 'yyyy-MM-dd HH:mm:ss') })
	: i18n.ts._chat.silencedIndefinitely);

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

function independentDraftPrefix(key = getDraftKey()) {
	return `misskey:chatDraft:${key}:`;
}

function draftRecordRaw(draft: StoredChatDraft) {
	// 只比较这份正文，其他窗口的草稿仍作为独立记录保留。
	return JSON.stringify({ ...draft, otherDrafts: undefined });
}

function readDraftCandidates() {
	const candidates: ChatDraftCandidate[] = [];

	function collect(record: StoredChatDraft | undefined, key: string, storageRaw: string, entryKey?: string) {
		function add(draft: StoredChatDraft | undefined, otherDraftId?: string) {
			if (!draft?.data || typeof draft.data !== 'object' || Array.isArray(draft.data)) return;
			if (draft.data.text != null && typeof draft.data.text !== 'string') return;
			candidates.push({ draft: { ...draft, data: draft.data }, source: { key, entryKey, otherDraftId, sessionId: draft.sessionId ?? draft.data.fileProtectionId, raw: draftRecordRaw(draft) }, storageRaw });
		}

		add(record);
		for (const [id, other] of Object.entries(record?.otherDrafts ?? {})) add(other, id);
	}

	for (const key of Object.keys(localStorage).filter(key => key.startsWith(independentDraftPrefix()))) {
		try {
			const raw = localStorage.getItem(key);
			if (raw != null) collect(JSON.parse(raw), key, raw);
		} catch { /* 单条损坏不影响其他草稿恢复。 */ }
	}
	try {
		const raw = localStorage.getItem('chatMessageDrafts');
		if (raw != null) {
			const drafts = JSON.parse(raw);
			const entryKey = getDraftKey();
			collect(drafts?.[entryKey], 'chatMessageDrafts', raw, entryKey);
			// 原版共享草稿没有账号前缀，仅在没有当前账号草稿时回退。
			if (candidates.length === 0) {
				const legacyKey = entryKey.slice($i.id.length + 1);
				collect(drafts?.[legacyKey], 'chatMessageDrafts', raw, legacyKey);
			}
		}
	} catch { /* 共享缓存损坏时仍可恢复独立记录。 */ }
	return candidates.sort((a, b) => String(b.draft.updatedAt).localeCompare(String(a.draft.updatedAt)));
}

function consumeDraftSource(source: ChatDraftSource) {
	const raw = localStorage.getItem(source.key);
	if (raw == null) return;
	const parsed = JSON.parse(raw);
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
	const entries: Record<string, StoredChatDraft> = source.entryKey == null ? { draft: parsed } : parsed;
	const entryKey = source.entryKey ?? 'draft';
	const entry = entries[entryKey];
	if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
	const selected = source.otherDraftId == null ? entry : entry?.otherDrafts?.[source.otherDraftId];
	if (!selected || draftRecordRaw(selected) !== source.raw) return;
	const others = { ...entry.otherDrafts };
	if (source.otherDraftId != null) {
		delete others[source.otherDraftId];
		entries[entryKey] = { ...entry, otherDrafts: others };
	} else {
		const replacement = Object.entries(others).sort((a, b) => String(b[1]?.updatedAt).localeCompare(String(a[1]?.updatedAt)))[0];
		if (replacement) {
			delete others[replacement[0]];
			entries[entryKey] = { ...replacement[1], otherDrafts: others };
		} else delete entries[entryKey];
	}
	// 使用刚读到的共享内容，只改选中条目；并发更新过则保守保留。
	if (localStorage.getItem(source.key) !== raw) return;
	if (source.entryKey != null) localStorage.setItem(source.key, JSON.stringify(entries));
	else if (entries.draft) localStorage.setItem(source.key, JSON.stringify(entries.draft));
	else localStorage.removeItem(source.key);
}

function consumeRestoredDrafts(ownerId = draftSession.id) {
	const remaining: ChatDraftSource[] = [];
	// 先移除匹配的子记录，再提升仍需保留的其他草稿。
	for (const source of restoredDraftSources.toSorted((a, b) => Number(a.otherDraftId == null) - Number(b.otherDraftId == null))) {
		if (source.key === storedDraft?.key && source.entryKey == null && source.otherDraftId == null) continue;
		if (source.sessionId != null && source.sessionId !== ownerId) { remaining.push(source); continue; }
		try { consumeDraftSource(source); } catch { remaining.push(source); }
	}
	restoredDraftSources = remaining;
}

watch([text, file, redPacket, pending, reply], () => {
	if (isEditing.value) return;
	try { saveDraft(); } catch {
		showError(i18n.ts._postForm.draftSaveFailed);
	}
});

async function createRedPacket() {
	if (!canCreatePacket.value || (!props.user && !props.room)) return;
	creating.value = true;
	const key = getDraftKey();
	const sessionId = draftSession.id;
	const snapshot = { text: text.value, reply: reply.value, file: file.value, redPacket: redPacket.value, pending: pending.value };
	try {
		const { dispose } = os.popup(MkRedPacketDialog, props.user ? { kind: 'direct', recipientIds: [props.user.id], chat: true } : { kind: 'group', roomId: props.room!.id, memberCount: props.room!.memberCount, chat: true }, {
			created: packet => {
				if (!active || key !== getDraftKey()) {
					// 弹窗提交时可能已经切换会话，保留原会话的已付款红包供重试。
					const storageKey = `${independentDraftPrefix(key)}${sessionId}`;
					let data = snapshot;
					try { data = JSON.parse(localStorage.getItem(storageKey) ?? 'null')?.data ?? snapshot; } catch { /* 损坏的单条记录保留原正文快照。 */ }
					localStorage.setItem(storageKey, JSON.stringify({ updatedAt: new Date().toISOString(), sessionId, data: { ...data, redPacket: packet } }));
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
			os.launchUploader([renamedFile], { multiple: false }).then(driveFiles => {
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
		os.launchUploader([Array.from(ev.dataTransfer.files)[0]], { multiple: false }).then(driveFiles => {
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
	}).then(selectedFile => {
		if (active && !editLocked.value) file.value = selectedFile;
	});
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
			try { saveDraft(); } catch { showError(i18n.ts._postForm.draftSaveFailed); }
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
	} finally {
		sending.value = false;
		await nextTick();
		const focused = window.document.activeElement;
		const editor = editorEl.value;
		if (active && editor && !editLocked.value && (focused === window.document.body || (focused && rootEl.value?.contains(focused)))) void editor.restoreSelection(editor.getSelection());
	}
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
	text.value = '';
	reply.value = null;
	file.value = null;
	redPacket.value = null;
	pending.value = null;
	try { deleteDraft(); } catch { showError(i18n.ts._postForm.draftSaveFailed); }
	draftSession.release();
}

function saveDraft(key = getDraftKey()) {
	if (isEditing.value || !draftReady) return;
	if (!text.value && !file.value && !redPacket.value && !pending.value && !reply.value) {
		deleteDraft();
		draftSession.release();
		return;
	}
	let session = draftSession;
	let storageKey = `${independentDraftPrefix(key)}${session.id}`;
	const previousRaw = storedDraft?.key === storageKey ? storedDraft.raw : null;
	if (localStorage.getItem(storageKey) !== previousRaw) {
		// 已被其他窗口更新的记录不能覆盖，后续内容写入新的独立会话。
		session = createDraftSession($i.id);
		storageKey = `${independentDraftPrefix(key)}${session.id}`;
	}
	const sessionId = session.id;
	const draft = {
		updatedAt: new Date().toISOString(),
		sessionId,
		data: {
			text: text.value,
			reply: reply.value,
			file: file.value,
			redPacket: redPacket.value,
			pending: pending.value,
		},
	};

	const raw = JSON.stringify(draft);
	try { localStorage.setItem(storageKey, raw); } catch (error) {
		if (session !== draftSession) session.dispose();
		throw error;
	}
	const previousSession = draftSession;
	draftSession = session;
	storedDraft = { key: storageKey, raw };
	draftSession.markPersisted();
	consumeRestoredDrafts(previousSession.id);
	if (previousSession !== session) previousSession.dispose();
	globalEvents.emit('chatDraftUpdated');
}

function deleteDraft() {
	if (storedDraft && localStorage.getItem(storedDraft.key) === storedDraft.raw) localStorage.removeItem(storedDraft.key);
	storedDraft = null;
	consumeRestoredDrafts();
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
	let restored = false;
	try {
		const candidates = readDraftCandidates();
		const selected = candidates[0];
		if (selected) {
			const draft = selected.draft;
			const sessionId = draft.sessionId ?? draft.data.fileProtectionId;
			await draftSession.restore(sessionId);
			if (!active) return;
			if (sessionId == null || sessionId === draftSession.id) {
				restoredDraftSources = candidates.filter(candidate => candidate.source.raw === selected.source.raw).map(candidate => candidate.source);
				const owned = candidates.find(candidate => candidate.source.raw === selected.source.raw && candidate.source.key === `${independentDraftPrefix()}${draftSession.id}` && candidate.source.entryKey == null && candidate.source.otherDraftId == null && Object.keys(candidate.draft.otherDrafts ?? {}).length === 0);
				if (owned) storedDraft = { key: owned.source.key, raw: owned.storageRaw };
				draftSession.markPersisted();
			}
			text.value = typeof draft.data.text === 'string' ? draft.data.text : '';
			file.value = draft.data.file ?? null;
			redPacket.value = draft.data.redPacket ?? null;
			pending.value = draft.data.pending?.redPacketId ? { redPacketId: draft.data.pending.redPacketId } : draft.data.pending ?? null;
			const savedReply = draft.data.reply;
			if (savedReply && typeof savedReply.id === 'string' && typeof savedReply.acct === 'string' && typeof savedReply.text === 'string') {
				const savedUser = typeof savedReply.user?.id === 'string' && typeof savedReply.user.username === 'string' ? savedReply.user : undefined;
				reply.value = { id: savedReply.id, acct: savedReply.acct, text: savedReply.text, name: typeof savedReply.name === 'string' ? savedReply.name : undefined, user: savedUser, type: savedReply.type === 'quote' ? 'quote' : 'reply' };
			}
			restored = true;
		}
	} catch { showError(i18n.ts._postForm.draftSaveFailed); }
	if (editingMessage.value) {
		draftBeforeEdit = text.value;
		text.value = editingMessage.value.text ?? '';
	}
	await nextTick();
	if (!active) return;
	draftReady = true;
	if (restored && !isEditing.value) {
		try { saveDraft(); } catch { showError(i18n.ts._postForm.draftSaveFailed); }
	}
});

onBeforeUnmount(() => {
	draftSession.dispose();
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
	if (!canMention.value) return;
	if (isEditing.value) { emit('cancelEdit'); await nextTick(); }
	editorEl.value?.insertText(`@${Misskey.acct.toString(user)} `, { plainText: true, mention: true });
}

defineExpose({ compose, mentionUser, isLocked: () => editLocked.value || creating.value });
</script>

<style lang="scss" module>
.root {
	grid-area: composer;
	position: relative;
	display: flex;
	flex-direction: column;
	min-width: 0;
	padding: 8px max(16px, calc((100% - 920px) / 2));
	box-sizing: border-box;
	border-top: var(--MI-divider);
	background: var(--MI_THEME-panel);
	container-type: inline-size;
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
	padding: 9px 12px;
	border: var(--MI-divider);
	border-radius: 8px;
	background: var(--MI_THEME-panel);
	overflow: hidden;
}

// 与气泡内的回复/引用块同风格：左侧强调线 + 强调色浅底。编辑和回复/引用共用。
.accentBar {
	--chat-reference-color: var(--MI_THEME-accent);
	padding-left: 9px;
	border-left: 3px solid var(--chat-reference-color);
	background: color-mix(in srgb, var(--chat-reference-color) 12%, var(--MI_THEME-panel));
}

.editingIcon {
	flex-shrink: 0;
	color: var(--chat-reference-color);
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
	color: var(--chat-reference-color);
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

.quoteBar {
	--chat-reference-color: var(--MI_THEME-renote);
}

.footer {
	display: flex;
	align-items: center;
	gap: 8px;
	flex: none;
	min-width: 0;
	background: var(--MI_THEME-panel);
	padding-bottom: env(safe-area-inset-bottom, 0px);
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
	grid-area: previews;
	display: flex;
	flex-direction: column;
	min-width: 0;
	gap: 8px;
	padding: 8px max(16px, calc((100% - 920px) / 2));
	box-sizing: border-box;
}
.attachments { display: flex; flex-direction: column; align-items: start; gap: 8px; width: 100%; }

.toolbar {
	display: flex;
	align-items: center;
	gap: 2px;
	flex: none;
}

.editor {
	--chat-editor-scroll-padding: 3px 2px;
	flex: 1;
	min-width: 0;
	height: 32px;
	box-sizing: border-box;
	padding: 0;
	line-height: 22px;
}

.button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: 0 0 28px;
	width: 28px;
	height: 32px;
	font-size: 1em;

	&:hover:not(:disabled) { color: var(--MI_THEME-accent); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}

.send {
	flex: none;
	box-sizing: border-box;
	min-width: 64px;
	height: 30px;
	padding-inline: 14px;
	border-radius: 4px;
	background: var(--MI_THEME-buttonBg);
	color: var(--MI_THEME-accent);
	&:hover:not(:disabled) { background: var(--MI_THEME-buttonHoverBg); }
	&:disabled { color: var(--MI_THEME-fgTransparentWeak); cursor: default; }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}

.redPacket { display: flex; flex-shrink: 0; align-items: center; gap: 10px; width: 250px; max-width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: var(--MI-radius); overflow: hidden; color: var(--MI-redPacketGold); background: linear-gradient(135deg, var(--MI-redPacketStart), var(--MI-redPacketEnd)); }
.redPacketIcon { flex: none; font-size: 26px; }
.redPacketText { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.redPacketText strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.redPacketText span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; opacity: .8; }
.removePacket { display: grid; place-items: center; flex: none; width: 24px; height: 24px; border-radius: 50%; }
.removePacket:hover { background: color-mix(in srgb, var(--MI-redPacketGold) 15%, transparent); }

@container (max-width: 300px) {
	.root { padding-inline: 8px; }
	.footer { gap: 4px; }
	.send { min-width: 48px; padding-inline: 8px; }
}
</style>
