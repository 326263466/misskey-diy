<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_pageBody _gaps_m">
		<section class="_panel _gaps" :class="$style.section">
			<h2>{{ i18n.ts._wallet.exchange }}</h2>
			<MkLoading v-if="loading"/>
			<template v-else-if="settings">
				<MkSwitch v-model="settings.exchangeEnabled" :disabled="saving">{{ i18n.ts._wallet.exchangeEnabled }}</MkSwitch>
				<MkInput v-model="settings.exchangeRate" type="number" :min="1" :max="1000000" :step="1" :disabled="saving"><template #label>{{ i18n.ts._wallet.rate }}</template></MkInput>
				<MkButton primary :disabled="saving" :wait="saving" @click="save">{{ i18n.ts.save }}</MkButton>
			</template>
			<p v-if="settingsError" role="alert" :class="$style.error">{{ settingsError }} <button class="_textButton" :disabled="loading || saving" @click="load">{{ i18n.ts.reload }}</button></p>
		</section>
		<section class="_panel _gaps" :class="$style.section">
			<h2>{{ i18n.ts._wallet.adjust }}</h2>
			<p :class="$style.caption">{{ i18n.ts._wallet.adjustDescription }}</p>
			<MkInfo v-if="pending">{{ i18n.ts._wallet.pending }}</MkInfo>
			<MkButton :disabled="adjusting || selecting || pending != null" @click="selectUser"><i class="ti ti-user-search" aria-hidden="true"></i> {{ i18n.ts.selectUser }}</MkButton>
			<MkUserCardMini v-if="user" :user="user" :withChart="false"/>
			<p v-else-if="pending" class="_selectable">{{ pending.username }}</p>
			<MkInput v-model="amount" type="number" :min="-2000000000" :max="2000000000" :step="1" :disabled="adjusting || pending != null"><template #label>{{ i18n.ts._wallet.amount }}</template></MkInput>
			<MkTextarea v-model="reason" :max="500" :disabled="adjusting || pending != null"><template #label>{{ i18n.ts._wallet.reason }}</template></MkTextarea>
			<p v-if="adjustError" role="alert" :class="$style.error">{{ adjustError }}</p>
			<MkButton primary :disabled="adjusting || (!user && !pending)" :wait="adjusting" @click="adjust">{{ pending ? i18n.ts.retry : adjustmentAction }}</MkButton>
			<p v-if="notice" role="status" :class="$style.success">{{ notice }}</p>
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
import MkSwitch from '@/components/MkSwitch.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { miLocalStorage } from '@/local-storage.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { walletError, walletRequestRejected } from '@/utility/wallet.js';
import * as os from '@/os.js';

const account = ensureSignin();
const settings = ref<entities.AdminWalletShowSettingsResponse | null>(null);
const loading = ref(false);
const saving = ref(false);
const settingsError = ref('');
const user = ref<entities.UserDetailed | null>(null);
const selecting = ref(false);
const amount = ref(1);
const adjustmentAction = computed(() => amount.value < 0 ? i18n.ts._wallet.decrease : i18n.ts._wallet.increase);
const reason = ref('');
const adjusting = ref(false);
const adjustError = ref('');
const notice = ref('');
const pending = ref<{ userId: string; username: string; amount: number; reason: string; requestId: string } | null>(null);
const storageKey = `wallet-adjust:${account.id}` as const;
let active = true;
try {
	const saved = JSON.parse(miLocalStorage.getItem(storageKey) ?? 'null');
	if (saved && typeof saved.userId === 'string' && typeof saved.requestId === 'string' && Number.isSafeInteger(saved.amount) && typeof saved.reason === 'string') {
		pending.value = saved;
		amount.value = saved.amount;
		reason.value = saved.reason;
	}
} catch { /* Keep settings accessible when a local pending operation is damaged. */ }

async function load() {
	if (loading.value || saving.value) return;
	loading.value = true;
	settingsError.value = '';
	try { settings.value = await misskeyApi('admin/wallet/show-settings'); } catch { settingsError.value = i18n.ts._wallet.loadFailed; } finally { loading.value = false; }
}

async function save() {
	if (saving.value || !settings.value) return;
	if (!Number.isSafeInteger(settings.value.exchangeRate) || settings.value.exchangeRate < 1 || settings.value.exchangeRate > 1000000) {
		settingsError.value = i18n.ts._wallet.invalidRate;
		return;
	}
	saving.value = true;
	settingsError.value = '';
	try {
		settings.value = await misskeyApi('admin/wallet/update-settings', { ...settings.value });
		os.toast(i18n.ts.saved);
	} catch { settingsError.value = i18n.ts._wallet.operationFailed; } finally { saving.value = false; }
}

async function selectUser() {
	if (selecting.value || adjusting.value || pending.value) return;
	selecting.value = true;
	try {
		const selected = await os.selectUser({ localOnly: true, includeSelf: true });
		if (!active || !selected) return;
		if (selected.host) { adjustError.value = i18n.ts._wallet.localUserRequired; return; }
		user.value = selected;
		adjustError.value = '';
		notice.value = '';
	} finally { selecting.value = false; }
}

async function adjust() {
	if (adjusting.value || (!user.value && !pending.value)) return;
	if (!pending.value && (!Number.isSafeInteger(amount.value) || amount.value === 0 || Math.abs(amount.value) > 2000000000 || Array.from(reason.value.trim()).length > 500)) {
		adjustError.value = i18n.ts._wallet.invalidAdjustment;
		return;
	}
	adjusting.value = true;
	adjustError.value = '';
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
		adjustError.value = walletError(error);
		if (walletRequestRejected(error)) { pending.value = null; miLocalStorage.removeItem(storageKey); }
	} finally { adjusting.value = false; }
}

void load();
onBeforeUnmount(() => { active = false; });
definePage(() => ({ title: i18n.ts._wallet.adminTitle, icon: 'ti ti-wallet' }));
</script>

<style lang="scss" module>
.section { padding: var(--MI-cardPadding); }
.section h2, .section p { margin: 0; }
.section h2 { font-size: 1.1em; }
.caption { font-size: .85em; line-height: 1.7; color: var(--MI_THEME-fgTransparentWeak); }
.error { color: var(--MI_THEME-error); }
.success { color: var(--MI_THEME-success); }
</style>
