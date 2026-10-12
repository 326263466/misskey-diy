<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard hideHeader>
	<section class="_gaps" :class="$style.root" :aria-busy="loading">
		<div :class="$style.heading">
			<h1>{{ i18n.ts._redPacket.history }}</h1>
			<MkSelect v-model="scope" small :items="scopeOptions" @update:modelValue="reset"><template #label>{{ i18n.ts._redPacket.history }}</template></MkSelect>
		</div>
		<div v-if="!packets.length" :class="$style.empty"><MkLoading v-if="loading"/><MkButton v-else-if="loadError" small @click="loadPackets(requestedPage)">{{ i18n.ts.retry }}</MkButton><p v-else>{{ i18n.ts._redPacket.empty }}</p></div>
		<div v-else :class="$style.grid">
			<article v-for="packet in packets" :key="packet.id" class="_gaps_s" :class="$style.entry">
				<MkRedPacketCover :imageUrl="packet.coverUrl" :message="packet.password || packet.message">
					<span :class="$style.coverStatus">{{ packet.claimedCoins != null ? i18n.tsx._redPacket.receivedCoins({ coins: formatCoins(packet.claimedCoins) }) : i18n.ts._redPacket[packet.status] }}</span>
				</MkRedPacketCover>
				<div :class="$style.meta"><span>{{ i18n.tsx._redPacket.summaryTotal({ coins: formatCoins(packet.totalCoins) }) }}</span><span>{{ i18n.tsx._redPacket.summaryCount({ claimed: packet.count - packet.remainingCount, count: packet.count }) }}</span></div>
				<span :class="$style.expiry">{{ i18n.ts._redPacket.expiresAt }}: <MkTime :time="packet.expiresAt" mode="detail"/></span>
			</article>
		</div>
		<MkButton v-if="loadError && packets.length" small :disabled="loading" @click="loadPackets(requestedPage)">{{ i18n.ts.retry }}</MkButton>
		<nav v-if="hasMore || currentPage > 1" :class="$style.pagination" :aria-label="i18n.ts._redPacket.history">
			<MkButton small :disabled="loading || currentPage === 1" @click="loadPackets(currentPage - 1)">{{ i18n.ts._wallet.previousPage }}</MkButton>
			<span aria-live="polite">{{ i18n.tsx._wallet.historyPage({ page: currentPage }) }}</span>
			<MkButton small :disabled="loading || loadError || !hasMore" @click="loadPackets(currentPage + 1)">{{ i18n.ts._wallet.nextPage }}</MkButton>
		</nav>
	</section>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, ref } from 'vue';
import type { entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkRedPacketCover from '@/components/MkRedPacketCover.vue';
import MkSelect from '@/components/MkSelect.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';

ensureSignin();
const packets = ref<entities.RedPacketsListResponse>([]);
const scope = ref<'sent' | 'received'>('sent');
const scopeOptions = [{ value: 'sent' as const, label: i18n.ts._redPacket.sentShort }, { value: 'received' as const, label: i18n.ts._redPacket.receivedShort }];
const loading = ref(false);
const loadError = ref(false);
const hasMore = ref(false);
const pageSize = 6;
const currentPage = ref(1);
let requestedPage = 1;
let cursors: (string | undefined)[] = [undefined];
let active = true;
let reloadRequested = false;

async function loadPackets(page = 1) {
	if (!active) return;
	if (loading.value) { if (page === 1) reloadRequested = true; return; }
	if (page < 1 || (page > 1 && cursors[page - 1] == null)) return;
	requestedPage = page;
	const requestScope = scope.value;
	loading.value = true;
	loadError.value = false;
	try {
		let result: entities.RedPacketsListResponse;
		do {
			result = await misskeyApi('red-packets/list', { scope: requestScope, limit: pageSize + 1, untilId: cursors[page - 1] });
			if (!active || requestScope !== scope.value || reloadRequested) return;
			if (result.length > 0 || page === 1) break;
			page--;
		} while (page >= 1);
		packets.value = result.slice(0, pageSize);
		hasMore.value = result.length > pageSize;
		currentPage.value = page;
		cursors = cursors.slice(0, page);
		cursors[page] = packets.value.at(-1)?.id;
	} catch {
		if (active && !reloadRequested) loadError.value = true;
	} finally {
		loading.value = false;
		if (active && reloadRequested) { reloadRequested = false; void loadPackets(); }
	}
}

function reset() {
	packets.value = [];
	currentPage.value = 1;
	cursors = [undefined];
	hasMore.value = false;
	void loadPackets();
}

function formatCoins(coins: number): string {
	return coins.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

void loadPackets();
onBeforeUnmount(() => { active = false; });
definePage(() => ({ title: i18n.ts._redPacket.history, icon: 'ti ti-gift' }));
</script>

<style lang="scss" module>
.root { min-width: 0; }
.root h1, .root p { margin: 0; }
.root h1 { font-size: 1.35em; }
.heading { display: flex; align-items: center; justify-content: space-between; gap: var(--MI-margin); flex-wrap: wrap; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr)); gap: var(--MI-margin); }
.entry { min-width: 0; }
.coverStatus { display: block; font-size: .85em; }
.meta, .expiry { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--MI-marginHalf); color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; }
.expiry { justify-content: flex-start; }
.empty { display: grid; min-height: 160px; place-items: center; color: var(--MI_THEME-fgTransparentWeak); }
.pagination { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: var(--MI-marginHalf); font-size: .85em; }
</style>
