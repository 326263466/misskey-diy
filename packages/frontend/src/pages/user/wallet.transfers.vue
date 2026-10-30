<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard>
	<template #header-actions><MkButton small primary :disabled="transferDialogOpen" aria-haspopup="dialog" @click="createTransfer">{{ i18n.ts._transfer.title }}</MkButton></template>
	<section class="_gaps" :class="$style.root" :aria-busy="loading || undefined">
		<div :class="$style.headerActions"><MkSelect v-model="direction" small :class="$style.filter" :items="directions" :disabled="loading || busy" @update:modelValue="reset"><template #label>{{ i18n.ts._transfer.history }}</template></MkSelect><MkButton small :disabled="loading || busy" :wait="loading" @click="load()">{{ i18n.ts.reload }}</MkButton></div>
		<p v-if="notice" role="status">{{ notice }}</p>
		<div v-if="transfers.length === 0" :class="$style.emptyState">
			<MkLoading v-if="loading"/>
			<MkButton v-else-if="loadError" small :disabled="busy" @click="load(appendFailed)">{{ i18n.ts.retry }}</MkButton>
			<p v-else>{{ i18n.ts._transfer.empty }}</p>
		</div>
		<MkButton v-if="loadError && transfers.length > 0" small :disabled="loading || busy" @click="load(appendFailed)">{{ i18n.ts.retry }}</MkButton>
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
		<MkLoading v-if="loading && transfers.length > 0"/>
		<div v-else-if="!loading && !busy && more && !loadError && pageActive" :key="nextId" v-appear="() => load(true)" :class="$style.sentinel" aria-hidden="true"></div>
	</section>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { inject, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import type { entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { transferError } from '@/utility/transfer.js';
import * as os from '@/os.js';
import { DI } from '@/di.js';
import { appearDirective as vAppear } from '@/directives/appear.js';
import { usePageHistoryRestore } from '@/composables/use-page-history-restore.js';

const account = ensureSignin();
const busy = ref(false);
const loading = ref(false);
const loadError = ref(false);
const notice = ref('');
const transferDialogOpen = ref(false);
let disposeTransferDialog: (() => void) | undefined;
let transferDialogController: AbortController | undefined;
let transferDialogGeneration = 0;
const transfers = ref<entities.TransfersListResponse>([]);
const names = ref<Record<string, string>>({});
const direction = ref<'sent' | 'received'>('received');
const directions = [{ value: 'received', label: i18n.ts._transfer.received }, { value: 'sent', label: i18n.ts._transfer.sent }];
const more = ref(false);
const nextId = ref<string>();
const pageActive = inject(DI.pageActive, ref(true));
const historyRestoring = usePageHistoryRestore();
let active = true;
let generation = 0;
let appendFailed = false;
let interrupted = false;

async function settle(transfer: entities.TransfersShowResponse, action: 'accept' | 'refund') {
	if (!active || !pageActive.value || busy.value || transfer.recipientId !== account.id || transfer.status !== 'pending') return;
	busy.value = true;
	try {
		if (action === 'refund') {
			const { canceled } = await os.confirm({ type: 'question', text: i18n.ts._transfer.refundConfirm });
			if (canceled || !active || !pageActive.value) return;
		}
		const result = await misskeyApi(action === 'accept' ? 'transfers/accept' : 'transfers/refund', { transferId: transfer.id });
		if (active && pageActive.value) notice.value = i18n.ts._transfer._status[result.status];
	} catch (cause) { if (active && pageActive.value) os.toast(transferError(cause), 'error'); } finally { busy.value = false; await load(); }
}

async function load(append = false) {
	if (!active || !pageActive.value || (append && (loading.value || busy.value || !more.value))) return;
	const request = ++generation;
	interrupted = false;
	const untilId = append ? nextId.value : undefined;
	const requestDirection = direction.value;
	appendFailed = append;
	loading.value = true;
	loadError.value = false;
	try {
		const rows = await misskeyApi('transfers/list', { direction: requestDirection, limit: 20, untilId });
		if (!active || !pageActive.value || request !== generation) return;
		transfers.value = append ? [...new Map([...transfers.value, ...rows].map(row => [row.id, row])).values()] : rows;
		nextId.value = rows.at(-1)?.id;
		more.value = rows.length === 20 && nextId.value !== untilId;
		const userIds = [...new Set(rows.flatMap(row => [row.senderId, row.recipientId]))].filter(id => !names.value[id]);
		if (userIds.length) {
			try {
				const users = await misskeyApi('users/show', { userIds });
				if (active && pageActive.value && request === generation) for (const user of users) names.value[user.id] = `@${user.username}`;
			} catch { /* 已删除用户保留账号 ID。 */ }
		}
	} catch {
		if (active && pageActive.value && request === generation) {
			loadError.value = true;
			os.toast(i18n.ts._wallet.loadFailed, 'error');
		}
	} finally {
		if (request === generation) loading.value = false;
	}
}

function reset() {
	transfers.value = [];
	nextId.value = undefined;
	more.value = false;
	void load();
}

function invalidateTransferDialog() {
	transferDialogGeneration++;
	transferDialogController?.abort();
	transferDialogController = undefined;
	disposeTransferDialog?.();
	disposeTransferDialog = undefined;
	transferDialogOpen.value = false;
}

function invalidate() { interrupted ||= loading.value; generation++; loading.value = false; invalidateTransferDialog(); }

function deactivate() { active = false; invalidate(); }

async function createTransfer() {
	if (!active || !pageActive.value || transferDialogOpen.value) return;
	const request = ++transferDialogGeneration;
	const controller = new AbortController();
	transferDialogController = controller;
	transferDialogOpen.value = true;
	try {
		const { default: TransferDialog } = await import('./wallet.transfer-dialog.vue');
		if (!active || !pageActive.value || controller.signal.aborted || request !== transferDialogGeneration) return;
		const { dispose } = os.popup(TransferDialog, { signal: controller.signal }, {
			sent: () => {
				if (!active || !pageActive.value || request !== transferDialogGeneration) return;
				direction.value = 'sent';
				reset();
			},
			closed: () => {
				if (request === transferDialogGeneration) {
					transferDialogGeneration++;
					controller.abort();
					transferDialogController = undefined;
					disposeTransferDialog = undefined;
					transferDialogOpen.value = false;
				}
				dispose();
			},
		});
		disposeTransferDialog = dispose;
	} catch {
		if (request === transferDialogGeneration) {
			invalidateTransferDialog();
			if (active && pageActive.value) os.toast(i18n.ts.somethingHappened, 'error');
		}
	}
}

function refreshOnActivation() {
	if (loading.value) return;
	if (historyRestoring.value && transfers.value.length > 0) {
		if (loadError.value || interrupted) void load(appendFailed);
		return;
	}
	void load();
}

void load();
watch(pageActive, value => { if (value) refreshOnActivation(); else invalidate(); }, { flush: 'sync' });
onActivated(() => { const wasInactive = !active; active = true; if (wasInactive) refreshOnActivation(); });
onDeactivated(deactivate);
onBeforeUnmount(deactivate);
definePage(() => ({ title: i18n.ts._transfer.history, icon: 'ti ti-arrows-exchange' }));
</script>

<style lang="scss" module>
.root { min-width: 0; }
.emptyState { display: grid; min-height: 160px; place-items: center; color: var(--MI_THEME-fgTransparentWeak); }
.root p { margin: 0; }
.heading, .actions, .dates { display: flex; flex-wrap: wrap; gap: var(--MI-marginHalf); align-items: center; justify-content: space-between; }
.headerActions { display: flex; flex-wrap: wrap; gap: var(--MI-marginHalf); align-items: center; }
.filter { min-width: 120px; max-width: 100%; font-size: .85em; }
.filter :global([id$="-label"]) { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.dates { font-size: .85em; color: var(--MI_THEME-fgTransparentWeak); }
.list { list-style: none; padding: 0; margin: 0; }
.entry { padding: var(--MI-margin) 0; border-top: var(--MI-divider); overflow-wrap: anywhere; }
.message { white-space: pre-wrap; }
.sentinel { height: 1px; }
</style>
