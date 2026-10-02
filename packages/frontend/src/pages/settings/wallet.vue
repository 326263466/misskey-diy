<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/wallet" :label="i18n.ts._wallet.title" :keywords="['wallet', 'points', 'balance']" icon="ti ti-wallet">
	<div class="_gaps_m">
		<section class="_panel _gaps" :class="$style.section">
			<div :class="$style.heading"><h1><i class="ti ti-wallet" aria-hidden="true"></i> {{ i18n.ts._wallet.title }}</h1><MkButton small :disabled="loading || exchanging" @click="refresh">{{ i18n.ts.reload }}</MkButton></div>
			<p :class="$style.caption">{{ i18n.ts._wallet.description }}</p>
			<MkLoading v-if="loading"/>
			<p v-if="loadError" role="alert" :class="$style.error">{{ i18n.ts._wallet.loadFailed }} <button class="_textButton" :disabled="loading" @click="refresh">{{ i18n.ts.retry }}</button></p>
			<dl v-if="wallet" :class="$style.balances">
				<div><dt>{{ i18n.ts._wallet.balance }}</dt><dd data-testid="wallet-balance">{{ wallet.balance.toLocaleString() }}</dd></div>
				<div><dt>{{ i18n.ts._wallet.reservedBalance }}</dt><dd>{{ wallet.reservedBalance.toLocaleString() }}</dd></div>
				<div><dt>{{ i18n.ts._wallet.points }}</dt><dd>{{ wallet.points.toLocaleString() }}</dd></div>
			</dl>
			<p :class="$style.caption">{{ i18n.ts._wallet.noCashValue }}</p>
		</section>
		<section v-if="wallet" class="_panel _gaps" :class="$style.section">
			<h2>{{ i18n.ts._wallet.exchange }}</h2>
			<p :class="$style.caption">{{ i18n.ts._wallet.exchangeDescription }}</p>
			<p>{{ i18n.tsx._wallet.exchangeRate({ rate: wallet.exchangeRate.toLocaleString() }) }}</p>
			<MkInfo v-if="!wallet.exchangeEnabled" warn>{{ i18n.ts._wallet.exchangeDisabled }}</MkInfo>
			<MkInfo v-if="pending">{{ i18n.ts._wallet.pending }}</MkInfo>
			<form class="_gaps" @submit.prevent="exchange">
				<label :class="$style.field">{{ i18n.ts._wallet.exchangePoints }}<input v-model.number="points" :class="$style.input" type="number" inputmode="numeric" min="1" :max="wallet.points" step="1" :disabled="exchanging || pending != null || !wallet.exchangeEnabled" required></label>
				<p v-if="Number.isFinite(points)" :class="$style.caption">{{ i18n.tsx._wallet.exchangeAmount({ coins: (points * wallet.exchangeRate).toLocaleString() }) }}</p>
				<p v-if="exchangeError" role="alert" :class="$style.error">{{ exchangeError }}</p>
				<MkButton primary :disabled="exchanging || (!pending && (!wallet.exchangeEnabled || !canExchange))" :wait="exchanging" @click="exchange">{{ pending ? i18n.ts.retry : i18n.ts._wallet.exchange }}</MkButton>
			</form>
			<p v-if="notice" role="status" :class="$style.success">{{ notice }}</p>
		</section>
		<section class="_panel _gaps" :class="$style.section">
			<div :class="$style.heading"><h2>{{ i18n.ts._redPacket.history }}</h2><MkButton small primary @click="createPacket">{{ i18n.ts._redPacket.create }}</MkButton></div>
			<p :class="$style.caption">{{ i18n.ts._redPacket.recoverDescription }}</p>
			<MkSelect v-model="packetScope" :items="packetScopeOptions" :disabled="packetsLoading" @update:modelValue="loadPackets()"><template #label>{{ i18n.ts._redPacket.history }}</template></MkSelect>
			<MkLoading v-if="packetsLoading && packets.length === 0"/>
			<p v-if="!packetsLoading && !packetsError && packets.length === 0" :class="$style.caption">{{ i18n.ts._redPacket.empty }}</p>
			<div v-for="packet in packets" :key="packet.id" class="_gaps_s">
				<MkRedPacket :redPacketId="packet.id" :authorId="packet.senderId" :redPacket="packet" @claimed="onPacketClaimed"/>
				<MkButton v-if="packet.senderId === account.id && packet.kind !== 'tip' && packet.status === 'active'" small @click="attachPacket(packet)">{{ i18n.ts._redPacket.attachToNote }}</MkButton>
			</div>
			<p v-if="packetsError" role="alert" :class="$style.error">{{ packetsError }} <button class="_textButton" :disabled="packetsLoading" @click="loadPackets()">{{ i18n.ts.retry }}</button></p>
			<MkButton v-if="morePackets" :disabled="packetsLoading" :wait="packetsLoading" @click="loadPackets(true)">{{ i18n.ts.loadMore }}</MkButton>
		</section>
		<section class="_panel _gaps" :class="$style.section">
			<h2>{{ i18n.ts._wallet.history }}</h2>
			<MkLoading v-if="historyLoading && transactions.length === 0"/>
			<p v-else-if="!historyError && transactions.length === 0" :class="$style.caption">{{ i18n.ts._wallet.empty }}</p>
			<ul :class="$style.transactions">
				<li v-for="entry in transactions" :key="entry.id" :class="$style.transaction">
					<div :class="$style.heading"><strong>{{ i18n.ts._wallet._types[entry.type] }}</strong><strong :class="entry.amount > 0 ? $style.success : ''">{{ entry.amount > 0 ? '+' : '' }}{{ entry.amount.toLocaleString() }}</strong></div>
					<p v-if="entry.description" :class="$style.description">{{ entry.description }}</p>
					<div :class="$style.metadata"><MkTime :time="entry.createdAt" mode="detail"/><span>{{ i18n.tsx._wallet.balanceAfter({ coins: entry.balance.toLocaleString() }) }}</span><span v-if="entry.pointsSpent != null">{{ i18n.tsx._wallet.pointsSpent({ points: entry.pointsSpent }) }}</span></div>
				</li>
			</ul>
			<p v-if="historyError" role="alert" :class="$style.error">{{ i18n.ts._wallet.loadFailed }} <button class="_textButton" :disabled="historyLoading" @click="loadHistory(transactions.length > 0)">{{ i18n.ts.retry }}</button></p>
			<MkButton v-if="hasMore && transactions.length > 0" :disabled="historyLoading" :wait="historyLoading" @click="loadHistory(true)">{{ i18n.ts.loadMore }}</MkButton>
		</section>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, onBeforeUnmount, ref } from 'vue';
import type { entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkRedPacket from '@/components/MkRedPacket.vue';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { miLocalStorage } from '@/local-storage.js';
import { validExchange, walletError, walletRequestRejected } from '@/utility/wallet.js';
import { redPacketError } from '@/utility/red-packet.js';
import { refreshCheckinStatus } from '@/composables/use-checkin-status.js';
import * as os from '@/os.js';

const account = ensureSignin();
const wallet = ref<entities.IWalletResponse | null>(null);
const loading = ref(false);
const loadError = ref(false);
const points = ref(1);
const exchanging = ref(false);
const exchangeError = ref('');
const notice = ref('');
const pending = ref<{ points: number; requestId: string } | null>(null);
const storageKey = `wallet-exchange:${account.id}` as const;
try {
	const saved = JSON.parse(miLocalStorage.getItem(storageKey) ?? 'null');
	if (saved && Number.isSafeInteger(saved.points) && saved.points > 0 && typeof saved.requestId === 'string') {
		pending.value = saved;
		points.value = saved.points;
	}
} catch { /* A damaged local draft must not prevent opening the wallet. */ }
const transactions = ref<entities.IWalletTransactionsResponse>([]);
const historyLoading = ref(false);
const historyError = ref(false);
const hasMore = ref(false);
const packets = ref<entities.RedPacketsListResponse>([]);
const packetsLoading = ref(false);
const packetsError = ref('');
const morePackets = ref(false);
const packetScopeOptions = [{ value: 'sent', label: i18n.ts._redPacket.sent }, { value: 'received', label: i18n.ts._redPacket.received }, { value: 'claimable', label: i18n.ts._redPacket.claimable }];
const packetScope = ref<'sent' | 'received' | 'claimable'>('sent');
let active = true;
let walletReloadRequested = false;
let historyReloadRequested = false;
const canExchange = computed(() => wallet.value != null && validExchange(points.value, wallet.value.points, wallet.value.exchangeRate, wallet.value.balance, wallet.value.reservedBalance));

async function loadWallet() {
	if (loading.value) return;
	loading.value = true;
	loadError.value = false;
	try { wallet.value = await misskeyApi('i/wallet'); } catch { loadError.value = true; } finally {
		loading.value = false;
		if (active && walletReloadRequested) { walletReloadRequested = false; void loadWallet(); }
	}
}

async function loadHistory(append = false) {
	if (historyLoading.value) return;
	historyLoading.value = true;
	historyError.value = false;
	try {
		const result = await misskeyApi('i/wallet/transactions', { limit: 30, untilId: append ? transactions.value.at(-1)?.id : undefined });
		if (!active) return;
		transactions.value = append ? [...new Map([...transactions.value, ...result].map(entry => [entry.id, entry])).values()] : result;
		hasMore.value = result.length === 30;
	} catch { historyError.value = true; } finally {
		historyLoading.value = false;
		if (active && historyReloadRequested) { historyReloadRequested = false; void loadHistory(); }
	}
}

async function refresh() { await Promise.all([loadWallet(), loadHistory(), loadPackets()]); }

function onPacketClaimed() {
	if (loading.value) walletReloadRequested = true;
	else void loadWallet();
	if (historyLoading.value) historyReloadRequested = true;
	else void loadHistory();
}

async function loadPackets(append = false) {
	if (packetsLoading.value) return;
	packetsLoading.value = true;
	packetsError.value = '';
	try {
		const result = await misskeyApi('red-packets/list', { scope: packetScope.value, limit: 30, untilId: append ? packets.value.at(-1)?.id : undefined });
		if (!active) return;
		packets.value = append ? [...new Map([...packets.value, ...result].map(packet => [packet.id, packet])).values()] : result;
		morePackets.value = result.length === 30;
	} catch (cause) { packetsError.value = redPacketError(cause); } finally { packetsLoading.value = false; }
}

function createPacket() {
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkRedPacketDialog.vue')), {}, { created: () => { void refresh(); }, closed: () => dispose() });
}

function attachPacket(packet: entities.RedPacketsCreateResponse) {
	if (packet.senderId !== account.id || packet.kind === 'tip' || packet.status !== 'active') return;
	void os.post({ initialRedPacket: packet });
}

async function exchange() {
	if (!wallet.value || exchanging.value || (!pending.value && (!wallet.value.exchangeEnabled || !canExchange.value))) return;
	exchanging.value = true;
	exchangeError.value = '';
	notice.value = '';
	try {
		if (!pending.value) {
			const { canceled } = await os.confirm({ type: 'warning', text: i18n.tsx._wallet.exchangeConfirm({ points: points.value, coins: points.value * wallet.value.exchangeRate }) });
			if (canceled || !active) return;
			const request = { points: points.value, requestId: crypto.randomUUID() };
			miLocalStorage.setItem(storageKey, JSON.stringify(request));
			pending.value = request;
		}
		const result = await misskeyApi('i/wallet/exchange', pending.value);
		pending.value = null;
		miLocalStorage.removeItem(storageKey);
		wallet.value.balance = result.balance;
		wallet.value.points = result.points;
		notice.value = result.exchanged ? i18n.tsx._wallet.exchangeSuccess({ coins: result.amount.toLocaleString() }) : i18n.ts._wallet.exchangeConfirmed;
		void refreshCheckinStatus().catch(() => {});
		await refresh();
	} catch (error) {
		exchangeError.value = walletError(error);
		if (walletRequestRejected(error)) { pending.value = null; miLocalStorage.removeItem(storageKey); }
	} finally { exchanging.value = false; }
}

void refresh();
onBeforeUnmount(() => { active = false; });
definePage(() => ({ title: i18n.ts._wallet.title, icon: 'ti ti-wallet' }));
</script>

<style lang="scss" module>
.section { min-width: 0; }
.section h1, .section h2, .section p { margin: 0; }
.section h1 { font-size: 1.35em; }
.section h2 { font-size: 1.1em; }
.heading { display: flex; align-items: center; justify-content: space-between; gap: var(--MI-margin); }
.caption, .metadata { color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; line-height: 1.7; }
.balances { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); gap: var(--MI-margin); margin: 0; }
.balances > div { padding: var(--MI-margin); background: var(--MI_THEME-accentedBg); border-radius: var(--MI-radius); }
.balances dt { font-size: .8em; }
.balances dd { margin: var(--MI-marginHalf) 0 0; font-size: 1.8em; font-weight: bold; overflow-wrap: anywhere; }
.field { display: flex; flex-direction: column; gap: var(--MI-marginHalf); }
.input { box-sizing: border-box; max-width: 100%; padding: var(--MI-marginHalf); color: var(--MI_THEME-fg); background: var(--MI_THEME-panel); border: 1px solid var(--MI_THEME-inputBorder); border-radius: var(--MI-radius); font: inherit; }
.input:focus-visible { outline: 2px solid var(--MI_THEME-focus); }
.transactions { list-style: none; padding: 0; margin: 0; }
.transaction { padding: var(--MI-margin) 0; border-top: 1px solid var(--MI_THEME-divider); display: flex; flex-direction: column; gap: var(--MI-marginHalf); }
.description { white-space: pre-wrap; overflow-wrap: anywhere; font-size: .9em; }
.metadata { display: flex; flex-wrap: wrap; gap: var(--MI-marginHalf); }
.packetActions { display: flex; flex-wrap: wrap; gap: var(--MI-marginHalf); }
.error { color: var(--MI_THEME-error); }
.success { color: var(--MI_THEME-success); }
</style>
