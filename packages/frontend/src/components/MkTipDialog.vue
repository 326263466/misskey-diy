<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="360" :height="440" autoHeight :closeOnBackdrop="false" :closeButtonRight="true" headerIcon="ti ti-heart-handshake" @close="dismiss" @closed="onClosed">
	<template #header>{{ i18n.ts._tip.title }}</template>
	<form class="_gaps_s" :class="$style.body" novalidate @submit.prevent="send">
		<div :class="$style.presets" role="group" :aria-label="i18n.ts._tip.quickAmounts">
			<MkButton v-for="preset in presetAmounts" :key="preset" type="button" :class="[$style.presetButton, { [$style.selected]: amount === preset }]" :aria-label="i18n.tsx._tip.presetAmount({ coins: preset })" :aria-pressed="amount === preset" :disabled="presetDisabled(preset)" @click="selectAmount(preset)">{{ preset }}</MkButton>
		</div>
		<div :class="$style.fields">
			<label :class="$style.field"><span>{{ i18n.ts._tip.amount }}</span><input v-model.number="amount" type="number" inputmode="decimal" min="1" max="1000" step="0.01" :title="i18n.ts._tip.amountRule" :disabled="closing || pending != null" required></label>
			<div :class="[$style.field, $style.messageField]">
				<label :for="messageInputId">{{ i18n.ts._tip.message }}</label>
				<input :id="messageInputId" v-model="message" type="text" :placeholder="i18n.ts._tip.messageHint" :disabled="closing || pending != null" :aria-describedby="messageHintId" :aria-invalid="messageLength > TIP_MESSAGE_LIMIT">
				<!-- 按字符计数，不用原生 maxlength（表情会按两个单位计）；只在超出时提示。 -->
				<span v-if="messageLength > TIP_MESSAGE_LIMIT" class="_inputCounter _inputCounterOver">{{ messageLength }}/{{ TIP_MESSAGE_LIMIT }}</span>
			</div>
			<span :id="messageHintId" hidden>{{ i18n.ts._tip.messageHint }}</span>
		</div>
		<p v-if="pending" :id="pendingHintId" :class="$style.srOnly">{{ i18n.ts._tip.pending }}</p>
		<MkButton type="submit" primary full :class="$style.submit" :disabled="closing" :aria-describedby="pending ? pendingHintId : undefined" :title="pending ? i18n.ts._tip.pending : undefined">{{ pending ? i18n.ts.retry : i18n.ts._tip.send }}</MkButton>
	</form>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, useId, useTemplateRef } from 'vue';
import type { entities } from 'misskey-js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import * as os from '@/os.js';
import { isCoinAmount } from '@/utility/coins.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { createPendingRequestChannel, walletRequestRejected } from '@/utility/wallet.js';
import { globalEvents } from '@/events.js';

const props = defineProps<{ recipient: entities.UserLite; target?: { type: 'note' | 'page'; id: string } }>();
const emit = defineEmits<{ (event: 'closed'): void }>();
const dialogEl = useTemplateRef('dialogEl');
const messageHintId = useId();
const messageInputId = useId();
const pendingHintId = useId();
const account = ensureSignin();
const storageKey = `wallet-tip:${account.id}:${props.recipient.id}${props.target ? `:${props.target.type}:${props.target.id}` : ''}` as const;
const presetAmounts = [5, 10, 20, 50, 100] as const;
const defaultAmount = 10;
const TIP_MESSAGE_LIMIT = 18;
const amount = ref(defaultAmount);
const message = ref('');
const messageLength = computed(() => Array.from(message.value).length);
const balance = ref<number | null>(null);
const pending = ref<entities.IWalletTipRequest | null>(null);
const closing = ref(false);
let active = true;
const validAmount = (value: number) => isCoinAmount(value) && value >= 1 && value <= 1000;
const validationError = computed(() => {
	if (pending.value) return null;
	if (props.recipient.id === account.id || props.recipient.host != null) return i18n.ts._tip.notAllowed;
	if (!validAmount(amount.value)) return i18n.ts._tip.invalidAmount;
	if (balance.value != null && amount.value > balance.value) return i18n.ts._wallet.insufficientBalance;
	if (messageLength.value > TIP_MESSAGE_LIMIT) return i18n.tsx._dialog.charactersExceeded({ current: messageLength.value, max: TIP_MESSAGE_LIMIT });
	return null;
});

function readPending(): entities.IWalletTipRequest | null {
	try {
		const saved = JSON.parse(miLocalStorage.getItem(storageKey) ?? 'null');
		if (saved?.userId !== props.recipient.id || saved.targetType !== props.target?.type || saved.targetId !== props.target?.id || !validAmount(saved.amount) || typeof saved.message !== 'string' || Array.from(saved.message).length > TIP_MESSAGE_LIMIT || typeof saved.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.requestId)) return null;
		return { userId: saved.userId, amount: saved.amount, message: saved.message, requestId: saved.requestId, ...(props.target ? { targetType: props.target.type, targetId: props.target.id } : {}) };
	} catch {
		// 损坏的本地记录不影响填写打赏。
		return null;
	}
}

function restorePending() {
	const saved = readPending();
	// 其他标签页已确认的请求不能留在表单中变成一次新打赏。
	if (!saved && pending.value) {
		amount.value = defaultAmount;
		message.value = '';
	}
	pending.value = saved;
	if (saved) {
		amount.value = saved.amount;
		message.value = saved.message ?? '';
	}
}

const pendingChannel = createPendingRequestChannel(storageKey, () => {
	if (active && !closing.value) restorePending();
});
let deferredRequest: { request: entities.IWalletTipRequest; retrying: boolean } | null = null;

function clearStoredPending(requestId: string) {
	if (readPending()?.requestId !== requestId) return;
	miLocalStorage.removeItem(storageKey);
}

restorePending();

function presetDisabled(preset: number): boolean {
	return closing.value || pending.value != null || (balance.value != null && preset > balance.value);
}

function selectAmount(preset: typeof presetAmounts[number]) {
	if (!active || presetDisabled(preset)) return;
	amount.value = preset;
}

async function send() {
	if (closing.value || !active) return;
	if (validationError.value) {
		os.toast(validationError.value, 'error');
		return;
	}
	const retrying = pending.value != null;
	const request = pending.value ?? {
		userId: props.recipient.id,
		amount: amount.value,
		message: message.value.trim(),
		requestId: crypto.randomUUID(),
		...(props.target ? { targetType: props.target.type, targetId: props.target.id } : {}),
	};
	// 先关掉窗口；写入待处理请求和网络请求都在 closed 事件后执行。
	deferredRequest = { request, retrying };
	closing.value = true;
	dialogEl.value?.close();
}

function onClosed() {
	const job = deferredRequest;
	deferredRequest = null;
	emit('closed');
	if (job != null) queueMicrotask(() => { void processTipAfterClose(job.request, job.retrying); });
}

async function processTipAfterClose(request: entities.IWalletTipRequest, retrying: boolean): Promise<void> {
	const process = async () => {
		const existing = readPending();
		if ((!retrying && existing != null) || (retrying && existing?.requestId != null && existing.requestId !== request.requestId)) return;
		try {
			miLocalStorage.setItem(storageKey, JSON.stringify(request));
		} catch {
			os.toast(i18n.ts._tip.saveFailed, 'error');
			return;
		}
		try {
			await misskeyApi('i/wallet/tip', { ...request });
		} catch (cause) {
			// 重试被拒绝不能证明先前的未知请求未扣款，必须保留同一请求。
			const code = (cause as { code?: string } | null)?.code;
			if (!retrying && (walletRequestRejected(cause) || ['NO_SUCH_TIP_TARGET', 'RATE_LIMIT_EXCEEDED', 'CREDENTIAL_REQUIRED', 'AUTHENTICATION_FAILED', 'YOUR_ACCOUNT_SUSPENDED', 'USER_IS_DELETED', 'YOUR_ACCOUNT_MOVED', 'ACCESS_DENIED', 'PERMISSION_DENIED', 'ROLE_PERMISSION_DENIED'].includes(code ?? ''))) {
				clearStoredPending(request.requestId);
			}
			os.toast(tipError(cause), 'error');
			return;
		}
		// 清理失败不改报打赏失败，保留记录供幂等确认。
		try { clearStoredPending(request.requestId); } catch { /* 下次打开仍可按原 requestId 确认。 */ }
		if (request.targetType && request.targetId) {
			globalEvents.emit('contentTipSent', { targetType: request.targetType, targetId: request.targetId });
		}
	};

	try {
		await navigator.locks.request(storageKey, process);
	} catch (cause) {
		os.toast(tipError(cause), 'error');
	}
}

function tipError(cause: unknown): string {
	const code = (cause as { code?: string } | null)?.code;
	switch (code) {
		case 'INVALID_AMOUNT':
		case 'INVALID_PARAM': return i18n.ts._tip.invalidInput;
		case 'NO_SUCH_USER': return i18n.ts._tip.userUnavailable;
		case 'REMOTE_USER':
		case 'WALLET_NOT_ALLOWED': return i18n.ts._tip.notAllowed;
		case 'NO_SUCH_TIP_TARGET': return i18n.ts._tip.targetUnavailable;
		case 'INSUFFICIENT_BALANCE': return i18n.ts._wallet.insufficientBalance;
		case 'BALANCE_LIMIT_EXCEEDED': return i18n.ts._tip.recipientBalanceLimit;
		case 'REQUEST_CONFLICT':
		case 'REQUEST_ID_CONFLICT': return i18n.ts._wallet.requestConflict;
		case 'RATE_LIMIT_EXCEEDED': return i18n.ts._tip.tooFrequent;
		case 'CREDENTIAL_REQUIRED':
		case 'AUTHENTICATION_FAILED': return i18n.ts._tip.signinRequired;
		case 'YOUR_ACCOUNT_SUSPENDED':
		case 'USER_IS_DELETED':
		case 'YOUR_ACCOUNT_MOVED':
		case 'ACCESS_DENIED':
		case 'PERMISSION_DENIED':
		case 'ROLE_PERMISSION_DENIED': return i18n.ts._tip.accountRestricted;
		case 'INTERNAL_ERROR': return i18n.ts._tip.serverError;
		default:
			if (code) return i18n.tsx._tip.unknownError({ code });
			if (cause instanceof TypeError) return i18n.ts._tip.networkError;
			return i18n.ts._tip.responseUnavailable;
	}
}

function dismiss() {
	if (closing.value) return;
	dialogEl.value?.close();
}

void misskeyApi('i/wallet').then(wallet => { if (active && !closing.value) balance.value = wallet.balance; }).catch(() => { /* 余额由服务端在打赏时再次验证。 */ });
onBeforeUnmount(() => {
	active = false;
	pendingChannel.close();
});
</script>

<style lang="scss" module>
@use '../styles/input.scss' as input;

.body { padding: var(--MI-marginHalf) var(--MI-cardPadding) var(--MI-cardPadding); }
.srOnly { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.presets { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.presets > .presetButton { width: 100%; min-width: 0; min-height: 36px; padding: 4px; font-size: .95em; font-weight: 400; color: var(--MI_THEME-fg); background: var(--MI_THEME-panel); border: var(--MI-divider); border-radius: var(--MI-radius); }
.presets > .presetButton:hover:not(:disabled) { background: var(--MI_THEME-buttonHoverBg); border-color: var(--MI_THEME-accent); }
.presets > .selected { color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); border-color: var(--MI_THEME-accent); }
.fields { display: flex; flex-direction: column; gap: 8px; }
.field { display: grid; grid-template-columns: 5em minmax(0, 1fr); align-items: center; gap: var(--MI-marginHalf); }
.field > span, .field > label { color: var(--MI_THEME-fgTransparentWeak); font-size: .9em; white-space: nowrap; }
.field input { @include input.field; box-sizing: border-box; width: 100%; min-width: 0; min-height: 36px; padding: 6px 10px; font: inherit; color: var(--MI_THEME-fg); border-radius: var(--MI-radius); }
.messageField { align-items: center; }
.messageField input { font-size: .9em; }
.messageField { position: relative; }
.field input:disabled { opacity: .7; }
.body > .submit { min-height: 38px; border-radius: var(--MI-radius); font-weight: 700; }
</style>
