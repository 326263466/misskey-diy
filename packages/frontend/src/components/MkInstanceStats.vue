<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkFoldableSection class="item">
		<template #header>{{ i18n.ts.charts }}</template>
		<div :class="$style.chart">
			<div class="selects">
				<MkSelect v-model="chartSrc" :items="chartSrcDef" style="margin: 0; flex: 1;"></MkSelect>
				<MkSelect v-model="chartSpan" :items="chartSpanDef" style="margin: 0 0 0 10px;"></MkSelect>
			</div>
			<div class="chart _panel">
				<MkChart :src="chartSrc" :span="chartSpan" :limit="chartLimit" :detailed="true"></MkChart>
			</div>
		</div>
	</MkFoldableSection>

	<MkFoldableSection class="item">
		<template #header>{{ i18n.ts._dashboard.activeUsersHeatmap }}</template>
		<MkSelect v-model="heatmapSrc" :items="heatmapSrcDef" style="margin: 0 0 12px 0;"></MkSelect>
		<div class="_panel" :class="$style.heatmap">
			<MkHeatmap :src="heatmapSrc"/>
		</div>
	</MkFoldableSection>

	<MkFoldableSection class="item">
		<template #header>{{ i18n.ts._dashboard.retentionRate }}</template>
		<div class="_panel" :class="$style.retentionHeatmap">
			<MkRetentionHeatmap/>
		</div>
		<div class="_panel" :class="$style.retentionLine">
			<MkRetentionLineChart/>
		</div>
	</MkFoldableSection>

	<MkFoldableSection v-if="shouldShowFederation" class="item">
		<template #header>{{ i18n.ts.federation }}</template>
		<div :class="$style.federation">
			<MkLoading v-if="fedStats == null"/>
			<div v-else class="pies">
				<div class="sub">
					<div class="title">{{ i18n.ts.subscribing }}</div>
					<MkInstanceRanking :items="fedStats.topSubInstances.map(x => ({ host: x.host, value: x.followersCount }))" :other="fedStats.otherFollowersCount" :label="i18n.ts.subscribing"/>
				</div>
				<div class="pub">
					<div class="title">{{ i18n.ts.publishing }}</div>
					<MkInstanceRanking :items="fedStats.topPubInstances.map(x => ({ host: x.host, value: x.followingCount }))" :other="fedStats.otherFollowingCount" :label="i18n.ts.publishing"/>
				</div>
			</div>
		</div>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, computed, shallowRef } from 'vue';
import type * as Misskey from 'misskey-js';
import type { MkSelectItem, ItemOption } from '@/components/MkSelect.vue';
import type { ChartSrc } from '@/components/MkChart.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkChart from '@/components/MkChart.vue';
import { $i } from '@/i.js';
import { misskeyApiGet } from '@/utility/misskey-api.js';
import { instance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import MkHeatmap from '@/components/MkHeatmap.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkRetentionHeatmap from '@/components/MkRetentionHeatmap.vue';
import MkRetentionLineChart from '@/components/MkRetentionLineChart.vue';
import MkInstanceRanking from '@/components/MkInstanceRanking.vue';
import { useMkSelect } from '@/composables/use-mkselect.js';

const shouldShowFederation = computed(() => instance.federation !== 'none' || $i?.isModerator);

const chartLimit = 500;
const {
	model: chartSpan,
	def: chartSpanDef,
} = useMkSelect({
	items: [
		{ value: 'hour', label: i18n.ts.perHour },
		{ value: 'day', label: i18n.ts.perDay },
	],
	initialValue: 'hour',
});
const {
	model: chartSrc,
	def: chartSrcDef,
} = useMkSelect({
	items: computed<MkSelectItem<ChartSrc>[]>(() => {
		const items: MkSelectItem<ChartSrc>[] = [];

		if (shouldShowFederation.value) {
			items.push({
				type: 'group',
				label: i18n.ts.federation,
				items: [
					{ value: 'federation', label: i18n.ts._charts.federation },
					{ value: 'ap-request', label: i18n.ts._charts.apRequest },
				],
			});
		}

		items.push({
			type: 'group',
			label: i18n.ts.users,
			items: [
				{ value: 'users', label: i18n.ts._charts.usersIncDec },
				{ value: 'users-total', label: i18n.ts._charts.usersTotal },
				{ value: 'active-users', label: i18n.ts._charts.activeUsers },
			],
		});

		const notesItems: ItemOption<ChartSrc>[] = [
			{ value: 'notes', label: i18n.ts._charts.notesIncDec },
			{ value: 'local-notes', label: i18n.ts._charts.localNotesIncDec },
		];

		if (shouldShowFederation.value) notesItems.push({ value: 'remote-notes', label: i18n.ts._charts.remoteNotesIncDec });

		notesItems.push(
			{ value: 'notes-total', label: i18n.ts._charts.notesTotal },
		);

		items.push({
			type: 'group',
			label: i18n.ts.notes,
			items: notesItems,
		});

		items.push({
			type: 'group',
			label: i18n.ts.drive,
			items: [
				{ value: 'drive-files', label: i18n.ts._charts.filesIncDec },
				{ value: 'drive', label: i18n.ts._charts.storageUsageIncDec },
			],
		});

		return items;
	}),
	initialValue: 'active-users',
});
const {
	model: heatmapSrc,
	def: heatmapSrcDef,
} = useMkSelect({
	items: computed(() => [
		{ value: 'active-users' as const, label: i18n.ts._charts.activeUsers },
		{ value: 'notes' as const, label: i18n.ts.notes },
		...(shouldShowFederation.value ? [
			{ value: 'ap-requests-inbox-received' as const, label: i18n.ts._dashboard.apRequestsInboxReceived },
			{ value: 'ap-requests-deliver-succeeded' as const, label: i18n.ts._dashboard.apRequestsDeliverSucceeded },
			{ value: 'ap-requests-deliver-failed' as const, label: i18n.ts._dashboard.apRequestsDeliverFailed },
		] : []),
	]),
	initialValue: 'active-users',
});

const fedStats = shallowRef<Misskey.entities.FederationStatsResponse | null>(null);
let disposed = false;

onMounted(async () => {
	if (!shouldShowFederation.value) return;
	const res = await misskeyApiGet('federation/stats', { limit: 30 });
	if (!disposed) fedStats.value = res;
});

onUnmounted(() => {
	disposed = true;
}); </script>

<style lang="scss" module>
.root {
	&:global {
		> .item {
			margin-bottom: 16px;
		}
	}
}

.chart {
	&:global {
		> .selects {
			display: flex;
			margin-bottom: 12px;
		}

	}
}

.heatmap {
	margin-bottom: 16px;
}

.retentionHeatmap {
	margin-bottom: 16px;
}

.retentionLine {
	margin-bottom: 16px;
}

.federation {
	&:global {
		> .pies {
			display: flex;
			gap: 16px;

			> .sub, > .pub {
				flex: 1;
				min-width: 0;
				position: relative;
				background: var(--MI_THEME-panel);
				border-radius: var(--MI-radius);
				padding: var(--MI-cardPadding);

				> .title {
					margin-bottom: 8px;
				}
			}

			@media (max-width: 600px) {
				flex-direction: column;
			}
		}
	}
}
</style>
