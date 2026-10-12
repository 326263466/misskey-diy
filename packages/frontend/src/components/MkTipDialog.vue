<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="400" :height="520" autoHeight :closeOnBackdrop="false" :closeButtonRight="true" headerIcon="ti ti-heart-handshake" @close="dismiss" @closed="emit('closed')">
	<template #header>{{ i18n.ts._tip.title }}</template>
	<form class="_gaps_s" :class="$style.body" @submit.prevent="send">
		<div class="_gaps_s">
			<div :class="$style.recipient">
				<MkAvatar :user="recipient" :link="false" :class="$style.avatar"/>
				<div :class="$style.identity">
					<strong :class="$style.recipientName">{{ i18n.ts._tip.recipient }} <MkUserName :user="recipient"/></strong>
					<MkAcct :user="recipient" :class="$style.caption"/>
				</div>
			</div>
			<p v-if="balance != null" :class="$style.caption">{{ i18n.tsx._tip.balance({ coins: balance.toLocaleString() }) }}</p>
			<p v-if="target" :class="$style.caption">{{ i18n.tsx._tip.target({ title: target.title ?? (target.type === 'note' ? i18n.ts.note : i18n.ts._article.article) }) }}</p>
		</div>
		<div :class="$style.presets" role="group" :aria-label="i18n.ts._tip.quickAmounts">
			<MkButton v-for="preset in presetAmounts" :key="preset" type="button" :class="[$style.presetButton, { [$style.selected]: amount === preset }]" :aria-label="i18n.tsx._tip.presetAmount({ coins: preset })" :aria-pressed="amount === preset" :disabled="presetDisabled(preset)" @click="selectAmount(preset)">{{ preset }}</MkButton>
		</div>
		<div :class="$style.fields">
			<label :class="$style.field"><span>{{ i18n.ts._tip.amount }}</span><input v-model.number="amount" type="number" inputmode="decimal" min="1" max="1000" step="0.01" :disabled="busy || pending != null" required></label>
			<div :class="[$style.field, $style.messageField]">
				<label :for="messageInputId">{{ i18n.ts._tip.message }}</label>
				<input :id="messageInputId" v-model="message" type="text" :placeholder="i18n.ts._tip.messageHint" :disabled="busy || pending != null" :aria-describedby="messageHintId" :aria-invalid="messageLength > 100">
				<span class="_inputCounter" :class="{ _inputCounterOver: messageLength > 100 }">{{ messageLength }}/100</span>
			</div>
			<span :id="messageHintId" hidden>{{ i18n.ts._tip.messageHint }}</span>
			<p :class="$style.caption">{{ i18n.ts._tip.invalidAmount }}</p>
		</div>
		<p :class="$style.caption">{{ i18n.ts._tip.description }}</p>
		<p v-if="target" :class="$style.caption">{{ i18n.ts._tip.publicRecord }}</p>
		<p v-if="!closing && (error || validationError)" role="alert" :class="$style.error">{{ error || validationError }}</p>
		<p v-if="pending && !busy && !closing" role="status" :class="$style.caption">{{ i18n.ts._tip.pending }}</p>
		<MkButton type="submit" primary full :class="$style.submit" :disabled="busy || closing || (!pending && !canSend)" :wait="busy || closing">{{ pending && !busy && !closing ? i18n.ts.retry : i18n.ts._tip.send }}</MkButton>
	</form>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue';
import type { entities } from 'misskey-js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import { isCoinAmount } from '@/utility/coins.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { walletRequestRejected } from '@/utility/wallet.js';

const props = defineProps<{ recipient: entities.UserLite; target?: { type: 'note' | 'page'; id: string; title?: string } }>();
const emit = defineEmits<{ (event: 'sent'): void; (event: 'closed'): void }>();
const dialogEl = useTemplateRef('dialogEl');
const messageHintId = useId();
const messageInputId = useId();
const account = ensureSignin();
const storageKey = `wallet-tip:${account.id}:${props.recipient.id}${props.target ? `:${props.target.type}:${props.target.id}` : ''}` as const;
const presetAmounts = [5, 10, 20, 50, 100] as const;
const amount = ref(10);
const message = ref('');
const messageLength = computed(() => Array.from(message.value).length);
const balance = ref<number | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);
const pending = ref<entities.IWalletTipRequest | null>(null);
const closing = ref(false);
let active = true;
const validAmount = (value: number) => isCoinAmount(value) && value >= 1 && value <= 1000;
const validationError = computed(() => {
	if (pending.value) return null;
	if (props.recipient.id === account.id || props.recipient.host != null) return i18n.ts._tip.notAllowed;
	if (!validAmount(amount.value)) return i18n.ts._tip.invalidAmount;
	if (balance.value != null && amount.value > balance.value) return i18n.ts._wallet.insufficientBalance;
	if (messageLength.value > 100) return i18n.ts._tip.messageHint;
	return null;
});
const canSend = computed(() => validationError.value == null);
watch([amount, message], () => { if (!pending.value) error.value = null; });

try {
	const saved = JSON.parse(miLocalStorage.getItem(storageKey) ?? 'null');
	if (saved?.userId === props.recipient.id && saved.targetType === props.target?.type && saved.targetId === props.target?.id && validAmount(saved.amount) && typeof saved.message === 'string' && Array.from(saved.message).length <= 100 && typeof saved.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.requestId)) {
		pending.value = { userId: saved.userId, amount: saved.amount, message: saved.message, requestId: saved.requestId, ...(props.target ? { targetType: props.target.type, targetId: props.target.id } : {}) };
		amount.value = saved.amount;
		message.value = saved.message;
	}
} catch { /* 损坏的本地记录不影响填写打赏。 */ }

function presetDisabled(preset: number): boolean {
	return busy.value || pending.value != null || (balance.value != null && preset > balance.value);
}

function selectAmount(preset: typeof presetAmounts[number]) {
	if (!active || presetDisabled(preset)) return;
	amount.value = preset;
}

async function send() {
	if (busy.value || !active || (!pending.value && !canSend.value)) return;
	const retrying = pending.value != null;
	busy.value = true;
	error.value = null;
	try {
		if (!pending.value) {
			const request = { userId: props.recipient.id, amount: amount.value, message: message.value.trim(), requestId: crypto.randomUUID(), ...(props.target ? { targetType: props.target.type, targetId: props.target.id } : {}) };
			try { miLocalStorage.setItem(storageKey, JSON.stringify(request)); } catch {
				error.value = i18n.ts._tip.saveFailed;
				return;
			}
			pending.value = request;
		}
		await misskeyApi('i/wallet/tip', pending.value);
		miLocalStorage.removeItem(storageKey);
		closing.value = true;
		pending.value = null;
		if (!active) return;
		emit('sent');
		dialogEl.value?.close();
	} catch (cause) {
		// 重试被拒绝不能证明先前的未知请求未扣款，必须保留同一请求。
		const code = (cause as { code?: string } | null)?.code;
		if (!retrying && (walletRequestRejected(cause) || ['NO_SUCH_TIP_TARGET', 'RATE_LIMIT_EXCEEDED', 'CREDENTIAL_REQUIRED', 'AUTHENTICATION_FAILED', 'YOUR_ACCOUNT_SUSPENDED', 'USER_IS_DELETED', 'YOUR_ACCOUNT_MOVED', 'ACCESS_DENIED', 'PERMISSION_DENIED', 'ROLE_PERMISSION_DENIED'].includes(code ?? ''))) {
			miLocalStorage.removeItem(storageKey);
			pending.value = null;
		}
		if (active) error.value = tipError(cause);
	} finally {
		if (!closing.value) busy.value = false;
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
	if (busy.value || closing.value) return;
	dialogEl.value?.close();
}

void misskeyApi('i/wallet').then(wallet => { if (active && !closing.value) balance.value = wallet.balance; }).catch(() => { /* 余额由服务端在打赏时再次验证。 */ });
onBeforeUnmount(() => { active = false; });
</script>

<style lang="scss" module>
.body { padding: var(--MI-cardPadding); }
.body p { margin: 0; overflow-wrap: anywhere; }
.recipient { display: flex; align-items: center; gap: var(--MI-margin); }
.avatar { width: 40px; height: 40px; flex-shrink: 0; }
.identity { display: flex; flex-direction: column; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
.recipientName { font-size: 1em; }
.caption { color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; }
.error { color: var(--MI_THEME-error); font-size: .9em; line-height: 1.5; }
.presets { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--MI-marginHalf); }
.presets > .presetButton { width: 100%; min-width: 0; min-height: 40px; padding: var(--MI-marginHalf); font-size: 1em; font-weight: 700; color: var(--MI_THEME-fg); background: var(--MI_THEME-panel); border: var(--MI-divider); border-radius: var(--MI-radius); }
.presets > .presetButton:hover:not(:disabled) { background: var(--MI_THEME-buttonHoverBg); border-color: var(--MI_THEME-accent); }
.presets > .selected { color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); border-color: var(--MI_THEME-accent); }
.fields { display: flex; flex-direction: column; gap: var(--MI-marginHalf); }
.field { display: grid; grid-template-columns: 5em minmax(0, 1fr); align-items: center; gap: var(--MI-marginHalf); }
.field > span, .field > label { color: var(--MI_THEME-fgTransparentWeak); font-size: .9em; white-space: nowrap; }
.field input { box-sizing: border-box; width: 100%; min-width: 0; min-height: 38px; padding: var(--MI-marginHalf) var(--MI-margin); font: inherit; color: var(--MI_THEME-fg); background: var(--MI_THEME-panelHighlight); border: 1px solid transparent; border-radius: var(--MI-radius); }
.messageField input { min-height: 38px; font-size: .9em; }
.messageField { position: relative; }
.field input:focus-visible { outline: 2px solid var(--MI_THEME-focus); }
.field input:disabled { opacity: .7; }
.body > .submit { min-height: 40px; border-radius: var(--MI-radius); font-weight: 700; }
</style>
