<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="440" :height="560" autoHeight :closeOnBackdrop="false" :closeButtonRight="true" headerIcon="ti ti-arrows-exchange" @close="dismiss" @closed="emit('closed')">
	<template #header>{{ i18n.ts._transfer.title }}</template>
	<form class="_gaps" :class="$style.body" @submit.prevent="send">
		<p :class="$style.caption">{{ i18n.ts._transfer.description }}</p>
		<MkButton :disabled="busy || closing || storageError || pending != null" @click="selectRecipient">{{ recipient ? `@${recipient.username}` : i18n.ts._transfer.selectRecipient }}</MkButton>
		<label :class="$style.field">{{ i18n.ts._transfer.amount }} ({{ i18n.ts._transfer.coinUnit }})<input v-model.number="amount" type="number" min="0.01" max="2000000000" step="0.01" inputmode="decimal" :disabled="busy || closing || storageError || pending != null" required></label>
		<label :class="[$style.field, $style.message]">{{ i18n.ts._transfer.message }}<input v-model="message" type="text" :aria-invalid="messageLength > CONTENT_LIMITS.transferMemo" :disabled="busy || closing || storageError || pending != null"><span v-if="messageLength > CONTENT_LIMITS.transferMemo" class="_inputCounter _inputCounterOver">{{ messageLength }}/{{ CONTENT_LIMITS.transferMemo }}</span></label>
		<p v-if="pending" role="status" :class="$style.caption">{{ i18n.ts._transfer.pendingRequest }}</p>
		<div v-if="storageError" role="alert" class="_gaps_s"><p>{{ i18n.ts._wallet.loadFailed }}</p><MkButton :disabled="busy || closing" @click="restorePending">{{ i18n.ts.retry }}</MkButton></div>
		<MkButton type="submit" primary full :disabled="busy || closing || storageError || (!pending && !canSend)" :wait="busy || closing">{{ pending ? i18n.ts.retry : i18n.ts._transfer.send }}</MkButton>
	</form>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, useTemplateRef } from 'vue';
import { BroadcastChannel } from 'broadcast-channel';
import { CONTENT_LIMITS } from 'misskey-js';
import type { entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import { isCoinAmount } from '@/utility/coins.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { transferError } from '@/utility/transfer.js';
import * as os from '@/os.js';

const props = defineProps<{ signal: AbortSignal }>();
const emit = defineEmits<{ (event: 'sent'): void; (event: 'closed'): void }>();
const dialogEl = useTemplateRef('dialogEl');
const account = ensureSignin();
const storageKey = `wallet-transfer:${account.id}` as const;
const recipient = ref<{ id: string; username: string } | null>(null);
const amount = ref(1);
const message = ref('');
const messageLength = computed(() => Array.from(message.value).length);
const pending = ref<entities.TransfersCreateRequest | null>(null);
const busy = ref(false);
const closing = ref(false);
const storageError = ref(false);
const active = ref(!props.signal.aborted);
const lifecycleController = new AbortController();
const pendingChannel = new BroadcastChannel<'changed'>(storageKey);
const canSend = computed(() => recipient.value != null && recipient.value.id !== account.id && isCoinAmount(amount.value) && amount.value > 0 && amount.value <= 2_000_000_000 && messageLength.value <= CONTENT_LIMITS.transferMemo);

function readPending(): entities.TransfersCreateRequest | null {
	const raw = miLocalStorage.getItem(storageKey);
	if (raw == null) return null;
	const saved = JSON.parse(raw) as entities.TransfersCreateRequest | null;
	if (!saved || typeof saved.recipientId !== 'string' || !saved.recipientId || saved.recipientId.length > 32
		|| typeof saved.requestId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(saved.requestId)
		|| typeof saved.amount !== 'number' || !isCoinAmount(saved.amount) || saved.amount <= 0 || saved.amount > 2_000_000_000
		|| (saved.message != null && (typeof saved.message !== 'string' || Array.from(saved.message).length > CONTENT_LIMITS.transferMemo))) throw new Error('Invalid pending transfer');
	return { recipientId: saved.recipientId, amount: saved.amount, message: saved.message ?? '', requestId: saved.requestId };
}

function restorePending(): boolean {
	try {
		const saved = readPending();
		// 其他标签页已确认的请求不能留在表单中变成一次新转账。
		if (!saved && pending.value) { recipient.value = null; amount.value = 1; message.value = ''; }
		pending.value = saved;
		if (saved) {
			recipient.value = { id: saved.recipientId, username: saved.recipientId };
			amount.value = saved.amount;
			message.value = saved.message ?? '';
		}
		storageError.value = false;
		return true;
	} catch {
		// 无法读取的请求可能已扣款，不能覆盖。
		storageError.value = true;
		return false;
	}
}

function notifyPendingChanged() {
	if (!pendingChannel.isClosed) void pendingChannel.postMessage('changed').catch(() => {});
}

function closePendingChannel() {
	if (!pendingChannel.isClosed) void pendingChannel.close().catch(() => {});
}

function clearPending(requestId: string) {
	try {
		if (readPending()?.requestId !== requestId) return;
		miLocalStorage.removeItem(storageKey);
		if (pending.value?.requestId === requestId) pending.value = null;
		notifyPendingChanged();
	} catch { storageError.value = true; }
}

restorePending();
pendingChannel.onmessage = () => { if (active.value && !busy.value && !closing.value) restorePending(); };

async function selectRecipient() {
	if (!active.value || busy.value || closing.value || storageError.value || pending.value) return;
	try {
		const user = await os.selectUser({ includeSelf: false, localOnly: true, signal: lifecycleController.signal });
		if (user && active.value && !busy.value && !closing.value && !storageError.value && !pending.value) recipient.value = user;
	} catch { if (active.value) os.toast(i18n.ts._wallet.operationFailed, 'error'); }
}

async function send() {
	if (!active.value || busy.value || closing.value || storageError.value || (!pending.value && !canSend.value)) return;
	if (!navigator.locks || (!pending.value && !crypto.randomUUID)) { os.toast(i18n.ts._marketplace.securePurchaseUnavailable, 'error'); return; }
	const expectedRequestId = pending.value?.requestId;
	const draft = { recipientId: recipient.value!.id, amount: amount.value, message: message.value };
	busy.value = true;
	try {
		// 锁覆盖落盘、发送和按 ID 清理；广播只通知重读，不传请求或凭据。
		await navigator.locks.request(storageKey, { signal: lifecycleController.signal }, async () => {
			if (!active.value || closing.value || !restorePending()) return;
			if (expectedRequestId != null ? pending.value?.requestId !== expectedRequestId : pending.value != null) return;
			const retrying = pending.value != null;
			const request = pending.value ?? { ...draft, requestId: crypto.randomUUID() };
			if (!retrying) {
				try { miLocalStorage.setItem(storageKey, JSON.stringify(request)); } catch { storageError.value = true; return; }
				pending.value = request;
				notifyPendingChanged();
			}
			let result: entities.TransfersCreateResponse;
			try {
				// 离开页面只取消排队，不中止已发出的转账；结果未知时保留同一请求。
				result = await misskeyApi('transfers/create', { ...request }, account.token);
			} catch (cause) {
				if (!retrying && ['INVALID_PARAM', 'INVALID_TRANSFER', 'TRANSFER_ACCESS_DENIED', 'INSUFFICIENT_WALLET_BALANCE', 'WALLET_BALANCE_LIMIT'].includes((cause as { code?: string } | null)?.code ?? '')) clearPending(request.requestId);
				if (active.value) os.toast(transferError(cause), 'error');
				return;
			}
			// 清理存储失败不改报转账失败，保留记录供幂等确认。
			clearPending(request.requestId);
			if (!active.value) return;
			closing.value = true;
			os.toast(result.status === 'pending' ? i18n.ts._transfer.sentSuccess : i18n.ts._transfer._status[result.status]);
			emit('sent');
			dialogEl.value?.close();
		});
	} catch (cause) {
		if (active.value && !closing.value) os.toast(transferError(cause), 'error');
	} finally {
		busy.value = false;
		if (!active.value) closePendingChannel();
	}
}

function deactivate() {
	active.value = false;
	closing.value = true;
	lifecycleController.abort();
}

function dismiss() {
	if (busy.value || closing.value) return;
	deactivate();
	dialogEl.value?.close();
}

if (props.signal.aborted) deactivate();
else props.signal.addEventListener('abort', deactivate, { once: true });
onBeforeUnmount(() => {
	props.signal.removeEventListener('abort', deactivate);
	deactivate();
	// 已发送请求仍需广播真实结果，等串行任务结束后再释放频道。
	if (!busy.value) closePendingChannel();
});
</script>

<style lang="scss" module>
@use '../../styles/input.scss' as input;

.body { padding: var(--MI-cardPadding); }
.body p { margin: 0; overflow-wrap: anywhere; }
.caption { color: var(--MI_THEME-fgTransparentWeak); font-size: .9em; line-height: 1.5; }
.field { display: flex; flex-direction: column; gap: var(--MI-marginHalf); }
.message { position: relative; }
.field input { @include input.field; box-sizing: border-box; width: 100%; min-width: 0; padding: var(--MI-marginHalf); font: inherit; color: var(--MI_THEME-fg); border-radius: var(--MI-radius); }
</style>
