<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section class="_gaps" :class="$style.root" :aria-busy="loading || undefined">
	<div :class="$style.heading"><h1>{{ i18n.ts._transfer.history }}</h1><div :class="$style.headerActions"><MkSelect v-model="direction" small :class="$style.filter" :items="directions" :disabled="loading || busy" @update:modelValue="load()"><template #label>{{ i18n.ts._transfer.history }}</template></MkSelect><MkButton small primary :disabled="transferDialogOpen" aria-haspopup="dialog" @click="createTransfer">{{ i18n.ts._transfer.title }}</MkButton><MkButton small :disabled="loading || busy" :wait="loading" @click="load()">{{ i18n.ts.reload }}</MkButton></div></div>
	<p v-if="notice" role="status">{{ notice }}</p>
	<div v-if="transfers.length === 0" :class="$style.emptyState">
		<MkLoading v-if="loading"/>
		<MkButton v-else-if="loadError" small :disabled="busy" @click="load()">{{ i18n.ts.retry }}</MkButton>
		<p v-else>{{ i18n.ts._transfer.empty }}</p>
	</div>
	<MkButton v-if="loadError && transfers.length > 0" small :disabled="loading || busy" @click="load()">{{ i18n.ts.retry }}</MkButton>
	<ul v-if="transfers.length > 0" :class="$style.list">
		<li v-for="transfer in transfers" :key="transfer.id" class="_gaps_s" :class="$style.entry">
			<div :class="$style.heading"><strong>{{ transfer.amount.toLocaleString() }} {{ i18n.ts._transfer.coinUnit }}</strong><span>{{ i18n.ts._transfer._status[transfer.status] }}</span></div>
			<MkA :to="`/users/${transfer.senderId === account.id ? transfer.recipientId : transfer.senderId}`">{{ transfer.senderId === account.id ? i18n.ts._transfer.recipient : i18n.ts._transfer.sender }}: {{ names[transfer.senderId === account.id ? transfer.recipientId : transfer.senderId] ?? (transfer.senderId === account.id ? transfer.recipientId : transfer.senderId) }}</MkA>
			<p v-if="transfer.message" :class="$style.message">{{ transfer.message }}</p>
			<div :class="$style.dates"><span>{{ i18n.ts._transfer.createdAt }}: <MkTime :time="transfer.createdAt" mode="detail"/></span><span>{{ i18n.ts._transfer.expiresAt }}: <MkTime :time="transfer.expiresAt" mode="detail"/></span></div>
			<div v-if="transfer.recipientId === account.id && transfer.status === 'pending'" :class="$style.actions">
				<MkButton small primary :disabled="busy" @click="settle(transfer, 'accept')">{{ i18n.ts._transfer.accept }}</MkButton>
				<MkButton small :disabled="busy" @click="settle(transfer, 'refund')">{{ i18n.ts._transfer.refund }}</MkButton>
			</div>
		</li>
	</ul>
	<MkButton v-if="more" :disabled="loading || busy" @click="load(true)">{{ i18n.ts.loadMore }}</MkButton>
</section>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, ref } from 'vue';
import type { entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { transferError } from '@/utility/transfer.js';
import * as os from '@/os.js';

const emit = defineEmits<{ (event: 'changed'): void }>();
const account = ensureSignin();
const busy = ref(false);
const loading = ref(false);
const loadError = ref(false);
const notice = ref('');
const transferDialogOpen = ref(false);
let disposeTransferDialog: (() => void) | undefined;
const transfers = ref<entities.TransfersListResponse>([]);
const names = ref<Record<string, string>>({});
const direction = ref<'sent' | 'received'>('received');
const directions = [{ value: 'received', label: i18n.ts._transfer.received }, { value: 'sent', label: i18n.ts._transfer.sent }];
const more = ref(false);
let active = true;
let reloadRequested = false;

async function settle(transfer: entities.TransfersShowResponse, action: 'accept' | 'refund') {
	if (busy.value) return;
	busy.value = true;
	try {
		if (action === 'refund') {
			const { canceled } = await os.confirm({ type: 'question', text: i18n.ts._transfer.refundConfirm });
			if (canceled || !active) return;
		}
		const result = await misskeyApi(action === 'accept' ? 'transfers/accept' : 'transfers/refund', { transferId: transfer.id });
		notice.value = i18n.ts._transfer._status[result.status];
		emit('changed');
	} catch (cause) { os.toast(transferError(cause), 'error'); } finally { busy.value = false; await load(); }
}

async function load(append = false) {
	if (!active) return;
	if (loading.value) { if (!append) reloadRequested = true; return; }
	loading.value = true;
	loadError.value = false;
	try {
		const rows = await misskeyApi('transfers/list', { direction: direction.value, limit: 20, untilId: append ? transfers.value.at(-1)?.id : undefined });
		if (!active) return;
		transfers.value = append ? [...new Map([...transfers.value, ...rows].map(row => [row.id, row])).values()] : rows;
		more.value = rows.length === 20;
		const userIds = [...new Set(rows.flatMap(row => [row.senderId, row.recipientId]))].filter(id => !names.value[id]);
		if (userIds.length) {
			try {
				const users = await misskeyApi('users/show', { userIds });
				if (active) for (const user of users) names.value[user.id] = `@${user.username}`;
			} catch { /* 已删除用户保留账号 ID。 */ }
		}
	} catch { loadError.value = true; os.toast(i18n.ts._wallet.loadFailed, 'error'); } finally {
		loading.value = false;
		if (reloadRequested) { reloadRequested = false; void load(); }
	}
}

async function createTransfer() {
	if (!active || transferDialogOpen.value) return;
	transferDialogOpen.value = true;
	try {
		const { dispose } = await os.popupAsyncWithDialog(import('@/pages/user/wallet.transfer-dialog.vue').then(module => module.default), {}, {
			sent: () => {
				if (!active) return;
				direction.value = 'sent';
				void load();
			},
			closed: () => { transferDialogOpen.value = false; disposeTransferDialog = undefined; dispose(); },
		});
		if (!active) dispose();
		else disposeTransferDialog = dispose;
	} catch {
		transferDialogOpen.value = false;
	}
}

void load();
onBeforeUnmount(() => { active = false; disposeTransferDialog?.(); });
definePage(() => ({ title: i18n.ts._transfer.history, icon: 'ti ti-arrows-exchange' }));
</script>

<style lang="scss" module>
.root { min-width: 0; }
.emptyState { display: grid; min-height: 160px; place-items: center; color: var(--MI_THEME-fgTransparentWeak); }
.root h1, .root p { margin: 0; }
.root h1 { font-size: 1.35em; }
.heading, .actions, .dates { display: flex; flex-wrap: wrap; gap: var(--MI-marginHalf); align-items: center; justify-content: space-between; }
.headerActions { display: flex; flex-wrap: wrap; gap: var(--MI-marginHalf); align-items: center; }
.filter { min-width: 120px; max-width: 100%; font-size: .85em; }
.filter :global([id$="-label"]) { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.dates { font-size: .85em; color: var(--MI_THEME-fgTransparentWeak); }
.list { list-style: none; padding: 0; margin: 0; }
.entry { padding: var(--MI-margin) 0; border-top: var(--MI-divider); overflow-wrap: anywhere; }
.message { white-space: pre-wrap; }
</style>
