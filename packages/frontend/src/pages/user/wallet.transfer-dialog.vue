<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="440" :height="560" autoHeight :closeOnBackdrop="false" :closeButtonRight="true" headerIcon="ti ti-arrows-exchange" @close="dismiss" @closed="emit('closed')">
	<template #header>{{ i18n.ts._transfer.title }}</template>
	<form class="_gaps" :class="$style.body" @submit.prevent="send">
		<p :class="$style.caption">{{ i18n.ts._transfer.description }}</p>
		<MkButton :disabled="busy || closing || pending != null" @click="selectRecipient">{{ recipient ? `@${recipient.username}` : i18n.ts._transfer.selectRecipient }}</MkButton>
		<label :class="$style.field">{{ i18n.ts._transfer.amount }} ({{ i18n.ts._transfer.coinUnit }})<input v-model.number="amount" type="number" min="0.01" max="2000000000" step="0.01" inputmode="decimal" :disabled="busy || closing || pending != null" required></label>
		<label :class="[$style.field, $style.message]">{{ i18n.ts._transfer.message }}<input v-model="message" type="text" :aria-invalid="messageLength > CONTENT_LIMITS.transferMemo" :disabled="busy || closing || pending != null"><span class="_inputCounter" :class="{ _inputCounterOver: messageLength > CONTENT_LIMITS.transferMemo }">{{ messageLength }}/{{ CONTENT_LIMITS.transferMemo }}</span></label>
		<p v-if="pending" role="status" :class="$style.caption">{{ i18n.ts._transfer.pendingRequest }}</p>
		<MkButton type="submit" primary full :disabled="busy || closing || (!pending && !canSend)" :wait="busy || closing">{{ pending ? i18n.ts.retry : i18n.ts._transfer.send }}</MkButton>
	</form>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, useTemplateRef } from 'vue';
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
let active = true;
const canSend = computed(() => recipient.value != null && recipient.value.id !== account.id && isCoinAmount(amount.value) && amount.value > 0 && amount.value <= 2_000_000_000 && messageLength.value <= CONTENT_LIMITS.transferMemo);

try {
	const saved = JSON.parse(miLocalStorage.getItem(storageKey) ?? 'null');
	if (saved && typeof saved.recipientId === 'string' && typeof saved.requestId === 'string' && isCoinAmount(saved.amount) && saved.amount > 0 && (saved.message == null || typeof saved.message === 'string')) {
		pending.value = saved;
		recipient.value = { id: saved.recipientId, username: saved.recipientId };
		amount.value = saved.amount;
		message.value = saved.message ?? '';
	}
} catch { /* 损坏的本地草稿不影响填写转账。 */ }

async function selectRecipient() {
	if (busy.value || closing.value || pending.value) return;
	try {
		const user = await os.selectUser({ includeSelf: false, localOnly: true });
		if (active && !busy.value && !closing.value && !pending.value) recipient.value = user;
	} catch { if (active) os.toast(i18n.ts._wallet.operationFailed, 'error'); }
}

async function send() {
	if (!active || busy.value || closing.value || (!pending.value && !canSend.value)) return;
	const retrying = pending.value != null;
	busy.value = true;
	try {
		if (!pending.value) {
			const draft = { recipientId: recipient.value!.id, amount: amount.value, message: message.value, requestId: crypto.randomUUID() };
			miLocalStorage.setItem(storageKey, JSON.stringify(draft));
			pending.value = draft;
		}
		const result = await misskeyApi('transfers/create', pending.value);
		miLocalStorage.removeItem(storageKey);
		pending.value = null;
		closing.value = true;
		if (!active) return;
		os.toast(result.status === 'pending' ? i18n.ts._transfer.sentSuccess : i18n.ts._transfer._status[result.status]);
		emit('sent');
		dialogEl.value?.close();
	} catch (cause) {
		if (active) os.toast(transferError(cause), 'error');
		// 重试被拒绝不能证明上次未扣款，保留原请求供再次确认。
		if (!retrying && ['INVALID_PARAM', 'INVALID_TRANSFER', 'TRANSFER_ACCESS_DENIED', 'INSUFFICIENT_WALLET_BALANCE', 'WALLET_BALANCE_LIMIT'].includes((cause as { code?: string })?.code ?? '')) {
			miLocalStorage.removeItem(storageKey);
			pending.value = null;
		}
	} finally { busy.value = false; }
}

function dismiss() {
	if (busy.value || closing.value) return;
	closing.value = true;
	dialogEl.value?.close();
}

onBeforeUnmount(() => { active = false; });
</script>

<style lang="scss" module>
.body { padding: var(--MI-cardPadding); }
.body p { margin: 0; overflow-wrap: anywhere; }
.caption { color: var(--MI_THEME-fgTransparentWeak); font-size: .9em; line-height: 1.5; }
.field { display: flex; flex-direction: column; gap: var(--MI-marginHalf); }
.message { position: relative; }
.field input { box-sizing: border-box; width: 100%; min-width: 0; padding: var(--MI-marginHalf); font: inherit; color: var(--MI_THEME-fg); background: var(--MI_THEME-panel); border: 1px solid var(--MI_THEME-inputBorder); border-radius: var(--MI-radius); }
.field input:focus-visible { outline: 2px solid var(--MI_THEME-focus); }
</style>
