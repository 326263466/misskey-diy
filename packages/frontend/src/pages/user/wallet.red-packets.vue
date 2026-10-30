<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard>
	<section class="_gaps" :class="$style.root" :aria-busy="loading">
		<div :class="$style.filters" role="group" :aria-label="i18n.ts.filter">
			<button v-for="option in scopeOptions" :key="option.value" type="button" class="_button _tabUnderline" :class="[$style.filterTab, { [$style.filterTabActive]: scope === option.value }]" :aria-pressed="scope === option.value" @click="selectScope(option.value)">{{ option.label }}</button>
			<button v-tooltip="i18n.ts.reload" type="button" class="_button _iconButton" :class="$style.refresh" :disabled="loading" :aria-label="i18n.ts.reload" @click="loadPackets()"><i class="ti ti-refresh" aria-hidden="true"></i></button>
		</div>
		<div v-if="!packets.length" :class="$style.empty"><MkLoading v-if="loading"/><MkButton v-else-if="loadError" small @click="list.retry()">{{ i18n.ts.retry }}</MkButton><p v-else>{{ i18n.ts._redPacket.empty }}</p></div>
		<div v-else :class="$style.grid">
			<article v-for="packet in packets" :key="packet.id" class="_gaps_s" :class="$style.entry">
				<MkRedPacketCover :imageUrl="packet.coverUrl" :message="packet.password || packet.message">
					<span :class="$style.coverStatus">{{ packet.claimedCoins != null ? i18n.tsx._redPacket.receivedCoins({ coins: formatCoins(packet.claimedCoins) }) : i18n.ts._redPacket[packet.status] }}</span>
				</MkRedPacketCover>
				<div :class="$style.meta"><span>{{ i18n.tsx._redPacket.summaryTotal({ coins: formatCoins(packet.totalCoins) }) }}</span><span>{{ i18n.tsx._redPacket.summaryCount({ claimed: packet.count - packet.remainingCount, count: packet.count }) }}</span></div>
				<span :class="$style.expiry">{{ i18n.ts._redPacket.expiresAt }}: <MkTime :time="packet.expiresAt" mode="detail"/></span>
			</article>
		</div>
		<MkButton v-if="loadError && packets.length" small :disabled="loading" @click="list.retry()">{{ i18n.ts.retry }}</MkButton>
		<MkLoading v-if="loading && packets.length"/>
		<div v-if="canLoad && hasMore && !loading && !loadError" v-appear="list.loadMore" :class="$style.sentinel" aria-hidden="true"></div>
	</section>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import type { entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkRedPacketCover from '@/components/MkRedPacketCover.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useInfiniteList } from '@/composables/use-infinite-list.js';
import { appearDirective as vAppear } from '@/directives/appear.js';

ensureSignin();
const scope = ref<'sent' | 'received'>('sent');
const scopeOptions = [{ value: 'sent' as const, label: i18n.ts._redPacket.sentShort }, { value: 'received' as const, label: i18n.ts._redPacket.receivedShort }];
const pageSize = 6;
const list = useInfiniteList<entities.RedPacketsListResponse[number]>(async (cursor, signal) => {
	const result = await misskeyApi('red-packets/list', { scope: scope.value, limit: pageSize + 1, ...(cursor ? { untilId: cursor } : {}) }, undefined, signal);
	const items = result.slice(0, pageSize);
	return { items, next: result.length > pageSize ? items.at(-1)!.id : null };
});
const { items: packets, loading, error: loadError, hasMore, canLoad } = list;

function loadPackets() { return list.refresh(); }

function reset() { void list.reset(); }

function selectScope(nextScope: 'sent' | 'received') {
	if (scope.value === nextScope) return;
	scope.value = nextScope;
	reset();
}

function formatCoins(coins: number): string {
	return coins.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

void loadPackets();
definePage(() => ({ title: i18n.ts._redPacket.history, icon: 'ti ti-gift' }));
</script>

<style lang="scss" module>
.root { min-width: 0; }
.root p { margin: 0; }
.filters { display: flex; flex-wrap: wrap; gap: var(--MI-margin); border-bottom: var(--MI-divider); }
.filterTab { padding: 0 0 var(--MI-marginHalf); color: var(--MI_THEME-fgTransparentWeak); &:hover { color: var(--MI_THEME-fg); } }
.filterTabActive { --MI-tabUnderlineOpacity: 1; color: var(--MI_THEME-accent); font-weight: bold; }
.refresh { align-self: flex-start; margin-left: auto; color: var(--MI_THEME-fgTransparentWeak); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr)); gap: var(--MI-margin); }
.entry { min-width: 0; }
.coverStatus { display: block; font-size: .85em; }
.meta, .expiry { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--MI-marginHalf); color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; }
.expiry { justify-content: flex-start; }
.empty { display: grid; min-height: 160px; place-items: center; color: var(--MI_THEME-fgTransparentWeak); }
.sentinel { height: 1px; }
</style>
