<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="360" :height="640" autoHeight :closeOnBackdrop="false" :closeButtonRight="true" headerIcon="mi-red-packet" @close="dismiss" @closed="emit('closed')">
	<template #header>{{ i18n.ts._redPacket.title }}</template>
	<div :class="$style.surface">
		<div :class="$style.coverStage">
			<button type="button" class="_button" :class="$style.previewButton" :disabled="creating || pending || closing || uploading" :aria-label="i18n.ts._redPacket.uploadCover" @click="editorEl?.chooseCover()">
				<MkRedPacketCover :class="$style.preview" :imageUrl="draft.coverUrl" :message="draft.message">
					<span :class="$style.total">{{ Number.isFinite(draft.totalCoins) ? draft.totalCoins.toFixed(2) : '0.00' }} <small>{{ i18n.ts._transfer.coinUnit }}</small></span>
				</MkRedPacketCover>
				<span :class="$style.coverHint"><i class="ti ti-photo-up" aria-hidden="true"></i> {{ i18n.ts._redPacket.uploadCover }}</span>
			</button>
			<button v-if="draft.coverFileId" type="button" class="_button _iconButton" :class="$style.resetCover" :disabled="creating || pending || closing || uploading" :aria-label="i18n.ts._redPacket.resetCover" @click="editorEl?.resetCover()"><i class="ti ti-arrow-back-up" aria-hidden="true"></i></button>
		</div>
		<div :class="$style.body">
			<MkRedPacketEditor ref="editorEl" v-model="draft" simple :allowPassword="chat" :memberCount="memberCount" :removable="false" :disabled="creating || pending || closing" :balance="balance" :fixedAudience="(props.recipientIds != null || props.roomId != null)" :recipientUsers="recipientUsers" @coverUploaded="coverUploaded" @uploading="uploading = $event"/>
			<div v-if="pending && !creating" :class="$style.notice"><MkInfo>{{ i18n.ts._redPacket.pendingLocked }}</MkInfo></div>
		</div>
	</div>
	<template #footer>
		<div :class="$style.actions">
			<MkButton primary rounded large :aria-label="pending && !creating ? i18n.ts.retry : i18n.ts._redPacket.create" :disabled="creating || closing || uploading || (!pending && invalid != null)" :wait="creating || closing || uploading" @click="create">{{ pending && !creating ? i18n.ts.retry : i18n.ts._redPacket.placeCoins }}</MkButton>
		</div>
	</template>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef, watch, onBeforeUnmount } from 'vue';
import type { entities } from 'misskey-js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkRedPacketEditor from '@/components/MkRedPacketEditor.vue';
import MkRedPacketCover from '@/components/MkRedPacketCover.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import { createRedPacketDraft, redPacketValidation, redPacketError, redPacketRequestRejected } from '@/utility/red-packet.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import { cleanupRedPacketCovers } from '@/utility/red-packet-cover-cleanup.js';
import * as os from '@/os.js';

const props = withDefaults(defineProps<{ kind?: 'direct' | 'group'; recipientIds?: string[]; roomId?: string; chat?: boolean; memberCount?: number }>(), { kind: 'group' });
const emit = defineEmits<{ (event: 'created', packet: entities.RedPacketsCreateResponse): void; (event: 'closed'): void }>();
const dialogEl = useTemplateRef('dialogEl');
const editorEl = useTemplateRef('editorEl');
const account = ensureSignin();
const storageKey = `red-packet-create:${account.id}:${props.kind}:${props.roomId ? `room:${props.roomId}` : props.recipientIds == null ? 'public' : 'recipients'}:${[...(props.recipientIds ?? [])].sort().join(',')}` as const;
const draft = ref(createRedPacketDraft(props.kind, props.recipientIds, props.roomId));
if (props.recipientIds != null || props.roomId != null) draft.value.audience = props.roomId ? 'room' : 'recipients';
const pending = ref(false);
const createdPacketId = ref<string | null>(null);
const balance = ref<number | null>(null);
const creating = ref(false);
const uploading = ref(false);
const closing = ref(false);
let disposed = false;
const uploadedCovers = new Set<string>();
const recipientUsers = ref<Record<string, entities.UserLite>>({});
try {
	const saved = JSON.parse(miLocalStorage.getItem(storageKey) ?? 'null');
	for (const id of saved?.uploadedCovers ?? []) if (typeof id === 'string') uploadedCovers.add(id);
	if (typeof saved?.draft?.coverFileId === 'string') uploadedCovers.add(saved.draft.coverFileId);
	const recovering = saved?.pending === true || typeof saved?.createdPacketId === 'string';
	if (saved?.draft && redPacketValidation(saved.draft, null, { recovering }) == null && saved.draft.roomId === props.roomId) {
		draft.value = saved.draft;
		pending.value = saved.pending === true;
		createdPacketId.value = typeof saved.createdPacketId === 'string' ? saved.createdPacketId : null;
		if (!pending.value && !createdPacketId.value) {
			delete draft.value.startsAt;
			draft.value.expiresInHours = 24;
		}
	}
} catch { /* Damaged drafts do not prevent creating a new packet. */ }
watch(() => draft.value.recipientIds, ids => {
	void loadRecipients([...ids]);
}, { immediate: true });

async function loadRecipients(ids: string[]) {
	const missing = ids.filter(id => !recipientUsers.value[id]);
	for (let offset = 0; offset < missing.length; offset += 100) {
		try {
			const users = await misskeyApi('users/show', { userIds: missing.slice(offset, offset + 100) });
		if (disposed || closing.value) return;
			for (const user of users) recipientUsers.value[user.id] = user;
		} catch { /* Keep the exact recipient ID visible if lookup fails. */ }
	}
}

// 已创建的红包只查询原记录；金额已经扣除，恢复时不能再按当前余额拦截。
const invalid = computed(() => redPacketValidation(draft.value, createdPacketId.value ? null : balance.value, { recovering: pending.value || createdPacketId.value != null }));

function persist() {
	miLocalStorage.setItem(storageKey, JSON.stringify({ draft: draft.value, pending: pending.value, createdPacketId: createdPacketId.value, uploadedCovers: [...uploadedCovers] }));
}

function coverUploaded(fileId: string) {
	uploadedCovers.add(fileId);
	try { persist(); } catch { os.toast(i18n.ts._postForm.draftSaveFailed, 'error'); }
}

watch(draft, () => {
	if (pending.value || closing.value || disposed) return;
	try { persist(); } catch { os.toast(i18n.ts._postForm.draftSaveFailed, 'error'); }
}, { deep: true });

async function loadBalance() {
	try {
		const wallet = await misskeyApi('i/wallet');
		if (!disposed && !closing.value) balance.value = wallet.balance;
	} catch {
		if (!disposed && !closing.value) balance.value = null;
	}
}

async function create() {
	if (creating.value || closing.value || uploading.value) return;
	if (!pending.value && invalid.value) {
		os.toast(invalid.value, 'error');
		return;
	}
	creating.value = true;
	try {
		if (!pending.value) {
			pending.value = true;
			try { persist(); } catch (cause) { pending.value = false; throw cause; }
		}
		const { coverUrl: _previewUrl, ...requestDraft } = draft.value;
		const packet = createdPacketId.value
			? await misskeyApi('red-packets/show', { redPacketId: createdPacketId.value })
			: await misskeyApi('red-packets/create', requestDraft);
		// The server owns this cover now, including packets recovered after a timeout.
		if (draft.value.coverFileId) uploadedCovers.delete(draft.value.coverFileId);
		if (!['active', 'scheduled'].includes(packet.status)) {
			pending.value = false;
			createdPacketId.value = null;
			draft.value = createRedPacketDraft(props.kind, props.recipientIds, props.roomId);
			if ((props.recipientIds != null || props.roomId != null)) draft.value.audience = props.roomId ? 'room' : 'recipients';
			miLocalStorage.removeItem(storageKey);
			os.toast(i18n.ts._redPacket.alreadySentOrEnded, 'error');
			return;
		}
		createdPacketId.value = packet.id;
		persist();
		miLocalStorage.removeItem(storageKey);
		// 先锁住内容再开始关闭动画。MkModal 会在 leave 动画期间继续渲染
		// 子组件，finally 中复位 creating 时不能让按钮从等待态闪回可点击状态。
		closing.value = true;
		// 恢复记录已清除，请求已成功；提前复位避免关闭动画期间闪现「重试」状态。
		pending.value = false;
		emit('created', packet);
		dialogEl.value?.close();
	} catch (cause) {
		os.toast(redPacketError(cause), 'error');
		if (redPacketRequestRejected(cause)) {
			pending.value = false;
			// 只有服务端确认旧请求未创建，才可移除预约数据并换用新 requestId。
			delete draft.value.startsAt;
			draft.value.expiresInHours = 24;
			draft.value.requestId = crypto.randomUUID();
			try { persist(); } catch { os.toast(i18n.ts._postForm.draftSaveFailed, 'error'); }
		}
	} finally { creating.value = false; }
}

async function deleteUnusedCovers() {
	const ids = [...uploadedCovers].filter(id => id !== draft.value.coverFileId);
	const success = await cleanupRedPacketCovers(account, ids);
	if (success) for (const id of ids) uploadedCovers.delete(id);
	else os.toast(i18n.ts._redPacket.coverCleanupFailed, 'error');
	return success;
}

async function discardCover() {
	if (pending.value || createdPacketId.value) return true;
	draft.value.coverFileId = null;
	draft.value.coverUrl = null;
	if (!disposed) {
		try { persist(); } catch { os.toast(i18n.ts._postForm.draftSaveFailed, 'error'); }
	}
	return deleteUnusedCovers();
}

watch(() => draft.value.coverFileId, () => { void deleteUnusedCovers(); });

async function dismiss() {
	if (creating.value || closing.value || uploading.value) return;
	closing.value = true;
	if (!await discardCover()) {
		closing.value = false;
		return;
	}
	if (!pending.value) miLocalStorage.removeItem(storageKey);
	dialogEl.value?.close();
}

onBeforeUnmount(() => {
	disposed = true;
	if (!pending.value && !createdPacketId.value) miLocalStorage.removeItem(storageKey);
	void discardCover();
});

void deleteUnusedCovers();

void loadBalance();
</script>

<style lang="scss" module>
.surface { background: var(--MI_THEME-bg); }
// 弹窗整体做紧凑：正文、封面和底部按钮的留白同步收紧。
.body { padding: 14px; }
.coverStage { position: relative; }
.previewButton { position: relative; display: block; width: 100%; }
.preview { min-height: 84px; padding: 14px 24px; border-radius: 0 0 28px 28px; }
.coverHint { position: absolute; right: 18px; bottom: 10px; display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 12px; font-size: 11px; color: var(--MI-redPacketGold); background: color-mix(in srgb, var(--MI-redPacketEnd) 85%, transparent); }
.resetCover { position: absolute; right: 12px; top: 10px; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; color: var(--MI-redPacketGold); background: var(--MI-redPacketEnd); }
.notice { margin-top: 12px; }
.actions { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.actions > button { width: 100%; --MI_THEME-accent: var(--MI-redPacketStart); --MI_THEME-accentDarken: var(--MI-redPacketEnd); --MI_THEME-accentHover: var(--MI-redPacketStart); --MI_THEME-accentActive: var(--MI-redPacketStart); --MI_THEME-fgOnAccent: var(--MI-redPacketGold); }
.actions > button:hover:not(:disabled), .actions > button:active:not(:disabled) { transform: none; background: var(--MI-redPacketStart); }
.total { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
.total > small { font-size: 12px; font-weight: 400; }
@media (max-height: 540px) { .actions { gap: 8px; } .total { font-size: 24px; } }
</style>
