<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="460" :height="640" autoHeight @close="dismiss" @esc="dismiss" @closed="emit('closed')">
	<template #header><i class="ti ti-gift" aria-hidden="true"></i> {{ draft.kind === 'tip' ? i18n.ts._redPacket.tip : i18n.ts._redPacket.create }}</template>
	<MkRedPacketEditor v-model="draft" :removable="false" :disabled="creating || pending || closing" :balance="balance" :fixedAudience="(props.recipientIds != null || props.roomId != null)" :recipientNames="recipientNames"/>
	<div v-if="pending || error" class="_gaps" :class="$style.notice">
		<MkInfo v-if="pending">{{ i18n.ts._redPacket.pendingLocked }}</MkInfo>
		<p v-if="error" role="alert" :class="$style.error">{{ error }}</p>
	</div>
	<template #footer><div :class="$style.actions"><MkButton primary full large :disabled="creating || closing || (!pending && invalid != null)" :wait="creating || closing" @click="create">{{ pending ? i18n.ts.retry : i18n.ts._redPacket.create }}</MkButton></div></template>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef, watch, onBeforeUnmount } from 'vue';
import type { entities } from 'misskey-js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkRedPacketEditor from '@/components/MkRedPacketEditor.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import { createRedPacketDraft, redPacketValidation, redPacketError, redPacketRequestRejected } from '@/utility/red-packet.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import { cleanupRedPacketCovers } from '@/utility/red-packet-cover-cleanup.js';
import * as os from '@/os.js';

const props = withDefaults(defineProps<{ kind?: 'direct' | 'group' | 'tip'; recipientIds?: string[]; roomId?: string }>(), { kind: 'group' });
const emit = defineEmits<{ (event: 'created', packet: entities.RedPacketsCreateResponse): void; (event: 'closed'): void }>();
const dialogEl = useTemplateRef('dialogEl');
const account = ensureSignin();
const storageKey = `red-packet-create:${account.id}:${props.kind}:${props.roomId ? `room:${props.roomId}` : props.recipientIds == null ? 'public' : 'recipients'}:${[...(props.recipientIds ?? [])].sort().join(',')}` as const;
const draft = ref(createRedPacketDraft(props.kind, props.recipientIds, props.roomId));
if (props.recipientIds != null || props.roomId != null) draft.value.audience = props.roomId ? 'room' : 'recipients';
const pending = ref(false);
const createdPacketId = ref<string | null>(null);
const balance = ref<number | null>(null);
const creating = ref(false);
const closing = ref(false);
let disposed = false;
const uploadedCovers = new Set<string>();
const error = ref('');
const recipientNames = ref<Record<string, string>>({});
let recipientsLoading: Promise<void> = Promise.resolve();
try {
	const saved = JSON.parse(miLocalStorage.getItem(storageKey) ?? 'null');
	for (const id of saved?.uploadedCovers ?? []) if (typeof id === 'string') uploadedCovers.add(id);
	if (typeof saved?.draft?.coverFileId === 'string') uploadedCovers.add(saved.draft.coverFileId);
	if (saved?.draft && redPacketValidation(saved.draft) == null && saved.draft.roomId === props.roomId) {
		draft.value = saved.draft;
		pending.value = saved.pending === true;
		createdPacketId.value = typeof saved.createdPacketId === 'string' ? saved.createdPacketId : null;
	}
} catch { /* Damaged drafts do not prevent creating a new packet. */ }
watch(() => draft.value.recipientIds, ids => {
	recipientsLoading = loadRecipients([...ids]);
}, { immediate: true });

async function loadRecipients(ids: string[]) {
	const missing = ids.filter(id => !recipientNames.value[id]);
	for (let offset = 0; offset < missing.length; offset += 100) {
		try {
			const users = await misskeyApi('users/show', { userIds: missing.slice(offset, offset + 100) });
			for (const user of users) recipientNames.value[user.id] = `${user.name ? user.name + ' ' : ''}(@${user.username})`;
		} catch { /* Keep the exact recipient ID visible if lookup fails. */ }
	}
}

const invalid = computed(() => redPacketValidation(draft.value, balance.value));

function persist() {
	miLocalStorage.setItem(storageKey, JSON.stringify({ draft: draft.value, pending: pending.value, createdPacketId: createdPacketId.value, uploadedCovers: [...uploadedCovers] }));
}

watch(draft, () => {
	if (pending.value || closing.value || disposed) return;
	try { persist(); } catch { error.value = i18n.ts._postForm.draftSaveFailed; }
}, { deep: true });

async function loadBalance() {
	try { balance.value = (await misskeyApi('i/wallet')).balance; } catch { balance.value = null; }
}

async function create() {
	if (creating.value || closing.value || (!pending.value && invalid.value)) return;
	creating.value = true;
	error.value = '';
	try {
		if (!pending.value) {
			await recipientsLoading;
			const target = draft.value.recipientIds.map(id => recipientNames.value[id] || i18n.tsx._redPacket.recipientId({ id })).join(', ');
			const { canceled } = await os.confirm({ type: 'warning', text: draft.value.kind === 'tip' ? i18n.tsx._redPacket.confirmTip({ coins: draft.value.totalCoins, target }) : draft.value.kind === 'direct' ? i18n.tsx._redPacket.confirmDirect({ coins: draft.value.totalCoins, target }) : i18n.tsx._redPacket.confirmSend({ coins: draft.value.totalCoins, count: draft.value.count }) });
			if (canceled) {
				await discardCover();
				return;
			}
			pending.value = true;
			try { persist(); } catch (cause) { pending.value = false; throw cause; }
		}
		const { coverUrl: _previewUrl, ...requestDraft } = draft.value;
		const packet = createdPacketId.value
			? await misskeyApi('red-packets/show', { redPacketId: createdPacketId.value })
			: await misskeyApi('red-packets/create', requestDraft);
		// The server owns this cover now, including packets recovered after a timeout.
		if (draft.value.coverFileId) uploadedCovers.delete(draft.value.coverFileId);
		if (packet.kind !== 'tip' && packet.status !== 'active') {
			pending.value = false;
			createdPacketId.value = null;
			draft.value = createRedPacketDraft(props.kind, props.recipientIds, props.roomId);
			if ((props.recipientIds != null || props.roomId != null)) draft.value.audience = props.roomId ? 'room' : 'recipients';
			miLocalStorage.removeItem(storageKey);
			error.value = i18n.ts._redPacket.alreadySentOrEnded;
			return;
		}
		createdPacketId.value = packet.id;
		persist();
		miLocalStorage.removeItem(storageKey);
		emit('created', packet);
		dialogEl.value?.close();
	} catch (cause) {
		error.value = redPacketError(cause);
		if (redPacketRequestRejected(cause)) {
			pending.value = false;
			draft.value.requestId = crypto.randomUUID();
			persist();
		}
	} finally { creating.value = false; }
}

async function deleteUnusedCovers() {
	const ids = [...uploadedCovers].filter(id => id !== draft.value.coverFileId);
	const success = await cleanupRedPacketCovers(account, ids);
	if (success) for (const id of ids) uploadedCovers.delete(id);
	else error.value = i18n.ts._redPacket.coverCleanupFailed;
	return success;
}

async function discardCover() {
	if (pending.value || createdPacketId.value) return true;
	draft.value.coverFileId = null;
	draft.value.coverUrl = null;
	if (!disposed) {
		try { persist(); } catch { error.value = i18n.ts._postForm.draftSaveFailed; }
	}
	return deleteUnusedCovers();
}

watch(() => draft.value.coverFileId, () => { void deleteUnusedCovers(); });

async function dismiss() {
	if (creating.value || closing.value) return;
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
.notice { padding: 0 var(--MI-margin); }
.actions { display: flex; justify-content: flex-end; gap: var(--MI-margin); padding: 12px var(--MI-margin); }
.error { color: var(--MI_THEME-error); }
</style>
