<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard>
	<div class="_pageBody _gaps_m">
		<section class="_gaps" :class="$style.section">
			<p :class="$style.caption">{{ i18n.ts._wallet.adjustDescription }}</p>
			<MkInfo v-if="pending">{{ i18n.ts._wallet.pending }}</MkInfo>
			<div class="_formField">
				<div>{{ i18n.ts.user }}</div>
				<div :class="$style.userSelection">
					<MkUserCardMini v-if="user" :user="user" :withChart="false" :class="$style.selectedUser"/>
					<p v-else-if="pending" class="_selectable">{{ pending.username }}</p>
					<MkButton small :disabled="adjusting || selecting || pending != null" @click="selectUser"><i class="ti ti-user-search" aria-hidden="true"></i> {{ i18n.ts.selectUser }}</MkButton>
				</div>
			</div>
			<MkInput v-model="amount" type="number" :min="-2000000000" :max="2000000000" :step="0.01" :disabled="adjusting || pending != null"><template #label>{{ i18n.ts._wallet.amount }}</template></MkInput>
			<MkTextarea v-model="reason" :counterMaxLength="500" :disabled="adjusting || pending != null"><template #label>{{ i18n.ts._wallet.reason }}</template></MkTextarea>
			<div class="_formActions _gaps_s">
				<div class="_buttons"><MkButton small primary :disabled="adjusting || (!user && !pending)" :wait="adjusting" @click="adjust">{{ pending ? i18n.ts.retry : adjustmentAction }}</MkButton></div>
				<p v-if="notice" role="status" :class="$style.success">{{ notice }}</p>
			</div>
		</section>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import type { entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { miLocalStorage } from '@/local-storage.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { walletError, walletRequestRejected } from '@/utility/wallet.js';
import { isCoinAmount } from '@/utility/coins.js';
import * as os from '@/os.js';

const account = ensureSignin();
const user = ref<entities.UserDetailed | null>(null);
const selecting = ref(false);
const amount = ref(1);
const adjustmentAction = computed(() => amount.value < 0 ? i18n.ts._wallet.decrease : i18n.ts._wallet.increase);
const reason = ref('');
const adjusting = ref(false);
const notice = ref('');
const pending = ref<{ userId: string; username: string; amount: number; reason: string; requestId: string } | null>(null);
const storageKey = `wallet-adjust:${account.id}` as const;
let active = true;
try {
	const saved = JSON.parse(miLocalStorage.getItem(storageKey) ?? 'null');
	if (saved && typeof saved.userId === 'string' && typeof saved.requestId === 'string' && isCoinAmount(saved.amount) && typeof saved.reason === 'string') {
		pending.value = saved;
		amount.value = saved.amount;
		reason.value = saved.reason;
	}
} catch { /* Keep settings accessible when a local pending operation is damaged. */ }

async function selectUser() {
	if (selecting.value || adjusting.value || pending.value) return;
	selecting.value = true;
	try {
		const selected = await os.selectUser({ localOnly: true, includeSelf: true });
		if (!active || !selected) return;
		if (selected.host) { os.toast(i18n.ts._wallet.localUserRequired, 'error'); return; }
		user.value = selected;
		notice.value = '';
	} catch { os.toast(i18n.ts._wallet.operationFailed, 'error'); } finally { selecting.value = false; }
}

async function adjust() {
	if (adjusting.value || (!user.value && !pending.value)) return;
	if (!pending.value && (!isCoinAmount(amount.value) || amount.value === 0 || Math.abs(amount.value) > 2000000000 || Array.from(reason.value.trim()).length > 500)) {
		os.toast(i18n.ts._wallet.invalidAdjustment, 'error');
		return;
	}
	adjusting.value = true;
	notice.value = '';
	try {
		if (!pending.value && user.value) {
			const { canceled } = await os.confirm({
				type: 'warning',
				title: adjustmentAction.value,
				text: amount.value < 0
					? i18n.tsx._wallet.decreaseConfirm({ amount: Math.abs(amount.value).toLocaleString() })
					: i18n.tsx._wallet.increaseConfirm({ amount: amount.value.toLocaleString() }),
				okText: adjustmentAction.value,
			});
			if (canceled || !active) return;
			const request = { userId: user.value.id, username: user.value.username, amount: amount.value, reason: reason.value.trim(), requestId: crypto.randomUUID() };
			miLocalStorage.setItem(storageKey, JSON.stringify(request));
			pending.value = request;
		}
		if (!pending.value) return;
		const { userId, amount: adjustment, reason: adjustmentReason, requestId } = pending.value;
		const result = await misskeyApi('admin/wallet/adjust', { userId, amount: adjustment, reason: adjustmentReason, requestId });
		pending.value = null;
		miLocalStorage.removeItem(storageKey);
		notice.value = i18n.tsx._wallet.adjusted({ balance: result.balance.toLocaleString() });
	} catch (error) {
		os.toast(walletError(error), 'error');
		if (walletRequestRejected(error)) { pending.value = null; miLocalStorage.removeItem(storageKey); }
	} finally { adjusting.value = false; }
}

onBeforeUnmount(() => { active = false; });
definePage(() => ({ title: i18n.ts._wallet.adminTitle, icon: 'ti ti-wallet' }));
</script>

<style lang="scss" module>
.section { min-width: 0; font-size: 1em; }
.section p { margin: 0; }
.caption { font-size: 1em; line-height: 1.7; color: var(--MI_THEME-fgTransparentWeak); }
.userSelection { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.selectedUser { flex: 1 1 220px; min-width: 0; padding: 0; background: transparent; border-radius: 0; }
.success { color: var(--MI_THEME-success); }
</style>
