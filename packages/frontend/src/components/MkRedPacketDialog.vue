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
			<MkRedPacketEditor ref="editorEl" v-model="draft" simple :allowPassword="chat" :allowExclusive="chat && roomId != null" :roomId="roomId" :memberCount="memberCount" :removable="false" :disabled="creating || pending || closing || selectingRecipient" :balance="balance" :fixedAudience="(props.recipientIds != null || props.roomId != null)" :recipientUsers="recipientUsers" @uploading="uploading = $event" @selectRecipient="selectRecipient"/>
			<div v-if="pending && !creating" :class="$style.notice"><MkInfo>{{ i18n.ts._redPacket.pendingLocked }}</MkInfo></div>
		</div>
	</div>
	<template #footer>
		<div :class="$style.actions">
			<MkButton primary rounded large :aria-label="pending && !creating ? i18n.ts.retry : i18n.ts._redPacket.create" :disabled="creating || closing || uploading || selectingRecipient || (!pending && invalid != null)" :wait="creating || closing || uploading || selectingRecipient" @click="create">{{ pending && !creating ? i18n.ts.retry : i18n.ts._redPacket.placeCoins }}</MkButton>
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
import { createPendingRequestChannel } from '@/utility/wallet.js';
import * as os from '@/os.js';

const props = withDefaults(defineProps<{ kind?: 'direct' | 'group'; recipientIds?: string[]; roomId?: string; chat?: boolean; memberCount?: number; isOwnerActive?: () => boolean }>(), { kind: 'group' });
const ownerActive = computed(() => props.isOwnerActive?.() ?? true);
const emit = defineEmits<{ (event: 'created', packet: entities.RedPacketsCreateResponse): void; (event: 'closed'): void }>();
const dialogEl = useTemplateRef('dialogEl');
const editorEl = useTemplateRef('editorEl');
const account = ensureSignin();
const storageKey = `red-packet-create:${account.id}:${props.kind}:${props.roomId ? `room:${props.roomId}` : props.recipientIds == null ? 'public' : 'recipients'}:${[...(props.recipientIds ?? [])].sort().join(',')}` as const;
const draft = ref(createRedPacketDraft(props.kind, props.recipientIds, props.roomId));
const pending = ref(false);
const createdPacketId = ref<string | null>(null);
const balance = ref<number | null>(null);
const creating = ref(false);
const uploading = ref(false);
const closing = ref(false);
const selectingRecipient = ref(false);
let disposed = false;
let lockAcquired = false;
const lifecycleController = new AbortController();
const recipientUsers = ref<Record<string, entities.UserLite>>({});
type SavedRedPacket = { draft: ReturnType<typeof createRedPacketDraft>; pending: boolean; createdPacketId: string | null };

function freshDraft() {
	return createRedPacketDraft(props.kind, props.recipientIds, props.roomId);
}

function readSaved(): SavedRedPacket | null {
	try {
		const saved = JSON.parse(miLocalStorage.getItem(storageKey) ?? 'null');
		const recovering = saved?.pending === true || typeof saved?.createdPacketId === 'string';
		if (!saved?.draft || redPacketValidation(saved.draft, null, { recovering }) != null || saved.draft.roomId !== props.roomId) return null;
		return { draft: saved.draft, pending: saved.pending === true, createdPacketId: typeof saved.createdPacketId === 'string' ? saved.createdPacketId : null };
	} catch {
		// Damaged drafts do not prevent creating a new packet.
		return null;
	}
}

function lockedRecord(saved: SavedRedPacket | null): boolean {
	return saved?.pending === true || saved?.createdPacketId != null;
}

function restoreSaved(includeDraft = false) {
	const saved = readSaved();
	const wasLocked = pending.value || createdPacketId.value != null;
	if (!saved) {
		// 其他标签页确认后不能保留旧请求，避免误发起新的红包。
		if (wasLocked) {
			draft.value = freshDraft();
			pending.value = false;
			createdPacketId.value = null;
		}
		return;
	}
	// 广播只同步待确认请求，普通草稿只在打开时恢复，避免多个标签页互相回写。
	if (!includeDraft && !wasLocked && !lockedRecord(saved)) return;
	draft.value = saved.draft;
	pending.value = saved.pending;
	createdPacketId.value = saved.createdPacketId;
	if (!pending.value && !createdPacketId.value) {
		delete draft.value.startsAt;
		draft.value.expiresInHours = 24;
	}
}

const pendingChannel = createPendingRequestChannel(storageKey, () => {
	if (!disposed && !lockAcquired && !closing.value) restoreSaved();
});
restoreSaved(true);
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

async function selectRecipient() {
	if (!props.roomId || creating.value || pending.value || closing.value || selectingRecipient.value) return;
	selectingRecipient.value = true;
	const currentDraft = draft.value;
	const roomId = props.roomId;
	try {
		const room = await misskeyApi('chat/rooms/show', { roomId }, undefined, lifecycleController.signal);
		const users = new Map<string, entities.UserLite>([[room.owner.id, room.owner]]);
		let untilId: string | undefined;
		for (;;) {
			const members = await misskeyApi('chat/rooms/members', { roomId, limit: 100, untilId }, undefined, lifecycleController.signal);
			if (disposed || closing.value || draft.value !== currentDraft) return;
			for (const member of members) if (member.user) users.set(member.user.id, member.user);
			if (members.length < 100) break;
			untilId = members.at(-1)!.id;
		}
		const eligible = [...users.values()].filter(user => user.id !== account.id && user.host == null);
		if (eligible.length === 0) {
			os.toast(i18n.ts.noUsers, 'info');
			return;
		}
		for (const user of eligible) recipientUsers.value[user.id] = user;
		const user = await os.selectUser({
			title: i18n.ts._redPacket.selectRecipient,
			candidates: eligible,
			localOnly: true,
			includeSelf: false,
			signal: lifecycleController.signal,
		});
		if (!user || disposed || closing.value || draft.value !== currentDraft || !eligible.some(candidate => candidate.id === user.id)) return;
		recipientUsers.value[user.id] = user;
		currentDraft.recipientIds = [user.id];
	} catch (error) {
		if (!disposed && !closing.value) os.toast(redPacketError(error), 'error');
	} finally {
		selectingRecipient.value = false;
	}
}

// 已创建的红包只查询原记录；金额已经扣除，恢复时不能再按当前余额拦截。
const invalid = computed(() => redPacketValidation(draft.value, createdPacketId.value ? null : balance.value, { recovering: pending.value || createdPacketId.value != null }));

function persist() {
	miLocalStorage.setItem(storageKey, JSON.stringify({ draft: draft.value, pending: pending.value, createdPacketId: createdPacketId.value }));
}

function persistDraft() {
	// 未提交草稿不能覆盖其他标签页的待确认请求或已创建结果。
	if (lockedRecord(readSaved())) {
		restoreSaved();
		return;
	}
	persist();
}

function clearRecord(requestId: string, options: { includeLocked?: boolean; notify?: boolean } = {}) {
	const saved = readSaved();
	if (saved && (saved.draft.requestId !== requestId || (!options.includeLocked && lockedRecord(saved)))) return;
	miLocalStorage.removeItem(storageKey);
	if (options.notify) pendingChannel.notify();
}

function withRecordLock(callback: () => void) {
	if (!navigator.locks) {
		callback();
		return;
	}
	void navigator.locks.request(storageKey, callback).catch(() => {});
}

watch(draft, () => {
	if (pending.value || closing.value || disposed) return;
	withRecordLock(() => {
		if (pending.value || closing.value || disposed) return;
		try { persistDraft(); } catch { os.toast(i18n.ts._postForm.draftSaveFailed, 'error'); }
	});
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
	if (!ownerActive.value || creating.value || closing.value || uploading.value || selectingRecipient.value) return;
	if (!navigator.locks) {
		os.toast(i18n.ts._marketplace.securePurchaseUnavailable, 'error');
		return;
	}
	if (!pending.value && invalid.value) {
		os.toast(invalid.value, 'error');
		return;
	}
	const expectedRequestId = draft.value.requestId;
	const expectedLocked = pending.value || createdPacketId.value != null;
	creating.value = true;
	try {
		// 锁覆盖本地记录、创建和按 requestId 清理，避免多个标签页换用或删除同一请求。
		await navigator.locks.request(storageKey, { signal: lifecycleController.signal }, async () => {
			lockAcquired = true;
			if (disposed || closing.value || !ownerActive.value) return;
			const saved = readSaved();
			const changed = expectedLocked
				? !lockedRecord(saved) || saved?.draft.requestId !== expectedRequestId
				: draft.value.requestId !== expectedRequestId || pending.value || createdPacketId.value != null || lockedRecord(saved);
			if (changed) {
				restoreSaved();
				return;
			}
			if (expectedLocked) restoreSaved();
			const retrying = pending.value || createdPacketId.value != null;
			if (!retrying) {
				pending.value = true;
				try { persist(); } catch (cause) { pending.value = false; throw cause; }
				pendingChannel.notify();
			}
			const requestId = draft.value.requestId;
			const { coverUrl: _previewUrl, ...requestDraft } = draft.value;
			let packet: entities.RedPacketsCreateResponse;
			try {
				packet = createdPacketId.value
					? await misskeyApi('red-packets/show', { redPacketId: createdPacketId.value })
					: await misskeyApi('red-packets/create', requestDraft);
			} catch (cause) {
				if (!disposed) os.toast(redPacketError(cause), 'error');
				// 未知结果重试时，限流等前置错误不能证明旧请求未扣款。
				if (!retrying && redPacketRequestRejected(cause)) {
					pending.value = false;
					// 只有服务端确认旧请求未创建，才可移除预约数据并换用新 requestId。
					delete draft.value.startsAt;
					draft.value.expiresInHours = 24;
					draft.value.requestId = crypto.randomUUID();
					try { persist(); pendingChannel.notify(); } catch { if (!disposed) os.toast(i18n.ts._postForm.draftSaveFailed, 'error'); }
				}
				return;
			}
			if (!['active', 'scheduled'].includes(packet.status)) {
				clearRecord(requestId, { includeLocked: true, notify: true });
				if (disposed) return;
				pending.value = false;
				createdPacketId.value = null;
				draft.value = freshDraft();
				os.toast(i18n.ts._redPacket.alreadySentOrEnded, 'error');
				return;
			}
			createdPacketId.value = packet.id;
			try { persist(); } catch { /* 待确认记录仍可按 requestId 恢复。 */ }
			// 离开的编辑器不接收扣款结果，保留原请求供下次打开时恢复。
			if (disposed || !ownerActive.value) return;
			// 先锁住内容再开始关闭动画。MkModal 会在 leave 动画期间继续渲染
			// 子组件，finally 中复位 creating 时不能让按钮从等待态闪回可点击状态。
			closing.value = true;
			// 请求已成功，提前复位避免关闭动画期间闪现「重试」状态。
			pending.value = false;
			emit('created', packet);
			try { clearRecord(requestId, { includeLocked: true, notify: true }); } catch { /* 下次打开仍可按 createdPacketId 确认。 */ }
			dialogEl.value?.close();
		});
	} catch (cause) {
		if (!disposed && !closing.value && (cause as DOMException | null)?.name !== 'AbortError') os.toast(redPacketError(cause), 'error');
	} finally {
		lockAcquired = false;
		creating.value = false;
		if (disposed || closing.value) pendingChannel.close();
	}
}

function dismiss() {
	if (creating.value || closing.value || uploading.value) return;
	closing.value = true;
	lifecycleController.abort();
	const requestId = draft.value.requestId;
	if (!pending.value && !createdPacketId.value) withRecordLock(() => clearRecord(requestId));
	dialogEl.value?.close();
}

watch([ownerActive, creating, uploading], ([active]) => {
	if (!active) dismiss();
}, { immediate: true, flush: 'sync' });

onBeforeUnmount(() => {
	disposed = true;
	lifecycleController.abort();
	const requestId = draft.value.requestId;
	if (!pending.value && !createdPacketId.value) withRecordLock(() => clearRecord(requestId));
	if (!creating.value) pendingChannel.close();
});

void loadBalance();
</script>

<style lang="scss" module>
.surface { background: var(--MI_THEME-bg); }
// 弹窗整体做紧凑：正文、封面和底部按钮的留白同步收紧。
.body { padding: 14px; }
.coverStage { position: relative; }
.previewButton { position: relative; display: block; width: 100%; }
.preview { min-height: 84px; padding: 14px 24px; border-radius: 0 0 28px 28px; }
.coverHint { position: absolute; right: 18px; bottom: 10px; display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 12px; font-size: 12px; color: var(--MI-redPacketGold); background: color-mix(in srgb, var(--MI-redPacketEnd) 85%, transparent); }
.resetCover { position: absolute; right: 12px; top: 10px; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; color: var(--MI-redPacketGold); background: var(--MI-redPacketEnd); }
.notice { margin-top: 12px; }
.actions { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.actions > button { width: 100%; --MI_THEME-accent: var(--MI-redPacketStart); --MI_THEME-accentDarken: var(--MI-redPacketEnd); --MI_THEME-accentHover: var(--MI-redPacketStart); --MI_THEME-accentActive: var(--MI-redPacketStart); --MI_THEME-fgOnAccent: var(--MI-redPacketGold); }
.actions > button:hover:not(:disabled), .actions > button:active:not(:disabled) { transform: none; background: var(--MI-redPacketStart); }
.total { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
.total > small { font-size: 12px; font-weight: 400; }
@media (max-height: 540px) { .actions { gap: 8px; } .total { font-size: 24px; } }
</style>
