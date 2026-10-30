<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<MkLoading v-if="fetching"/>
	<div v-show="!fetching" :class="$style.root">
		<div v-if="ranking" class="ranking">
			<div class="rankingHeader">
				<MkTab v-model="direction" :tabs="directionTabs" class="switch"/>
				<span class="subTitle">{{ i18n.tsx._dashboard.topN({ n: 10 }) }}</span>
			</div>
			<MkInstanceRanking :items="ranking.items" :other="ranking.other" :label="rankingLabel" plainCanvas/>
		</div>
		<div v-if="!fetching" class="items">
			<div class="item _panel sub">
				<div class="icon"><i class="ti ti-world-download"></i></div>
				<div class="body">
					<div v-if="federationSubActive != null" class="value">
						{{ number(federationSubActive) }}
						<MkNumberDiff v-if="federationSubActiveDiff != null" v-tooltip="i18n.ts.dayOverDayChanges" class="diff" :value="federationSubActiveDiff"></MkNumberDiff>
					</div>
					<div class="label">{{ i18n.ts._chartSeries.federationSubActive }}</div>
				</div>
			</div>
			<div class="item _panel pub">
				<div class="icon"><i class="ti ti-world-upload"></i></div>
				<div class="body">
					<div v-if="federationPubActive != null" class="value">
						{{ number(federationPubActive) }}
						<MkNumberDiff v-if="federationPubActiveDiff != null" v-tooltip="i18n.ts.dayOverDayChanges" class="diff" :value="federationPubActiveDiff"></MkNumberDiff>
					</div>
					<div class="label">{{ i18n.ts._chartSeries.federationPubActive }}</div>
				</div>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, shallowRef } from 'vue';
import type * as Misskey from 'misskey-js';
import { misskeyApiGet } from '@/utility/misskey-api.js';
import number from '@/filters/number.js';
import MkInstanceRanking from '@/components/MkInstanceRanking.vue';
import MkNumberDiff from '@/components/MkNumberDiff.vue';
import MkTab from '@/components/MkTab.vue';
import { i18n } from '@/i18n.js';

type Direction = 'sub' | 'pub';

const direction = ref<Direction>('sub');
const directionTabs = [
	{ key: 'sub' as const, label: i18n.ts._chartSeries.federationSub },
	{ key: 'pub' as const, label: i18n.ts._chartSeries.federationPub },
];
const stats = shallowRef<Misskey.entities.FederationStatsResponse | null>(null);
const federationPubActive = ref<number | null>(null);
const federationPubActiveDiff = ref<number | null>(null);
const federationSubActive = ref<number | null>(null);
const federationSubActiveDiff = ref<number | null>(null);
const fetching = ref(true);

const ranking = computed(() => {
	if (stats.value == null) return null;
	const sub = direction.value === 'sub';
	const instances = sub ? stats.value.topSubInstances : stats.value.topPubInstances;
	return {
		items: instances.map(x => ({ host: x.host, value: sub ? x.followersCount : x.followingCount })),
		other: sub ? stats.value.otherFollowersCount : stats.value.otherFollowingCount,
	};
});

const rankingLabel = computed(() => direction.value === 'sub' ? i18n.ts._chartSeries.federationSub : i18n.ts._chartSeries.federationPub);

onMounted(async () => {
	const chart = await misskeyApiGet('charts/federation', { limit: 2, span: 'day' });
	federationPubActive.value = chart.pubActive[0];
	federationPubActiveDiff.value = chart.pubActive[0] - chart.pubActive[1];
	federationSubActive.value = chart.subActive[0];
	federationSubActiveDiff.value = chart.subActive[0] - chart.subActive[1];

	misskeyApiGet('federation/stats', { limit: 10 }).then(res => {
		stats.value = res;
	});

	fetching.value = false;
});
</script>

<style lang="scss" module>
.root {

	&:global {
		> .ranking {
			display: flex;
			flex-direction: column;
			gap: 8px;
			margin-bottom: 12px;

			> .rankingHeader {
				display: flex;
				align-items: center;
				justify-content: space-between;
				flex-wrap: wrap;
				gap: 8px;

				> .switch {
					--MI-toolbarFontSize: .85em;
				}

				> .subTitle {
					color: var(--MI_THEME-fgTransparentWeak);
					font-size: 0.85em;
				}
			}
		}

		> .items {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(min(190px, 100%), 1fr));
			grid-gap: 12px;

			> .item {
				display: flex;
				box-sizing: border-box;
				padding: var(--MI-cardPadding);

				> .icon {
					display: grid;
					place-items: center;
					height: 100%;
					aspect-ratio: 1;
					margin-right: 12px;
					background: var(--MI_THEME-accentedBg);
					color: var(--MI_THEME-accent);
					border-radius: 10px;
				}

				&.sub {
					> .icon {
						background: #d5ba0026;
						color: #dfc300;
					}
				}

				&.pub {
					> .icon {
						background: #00cf2326;
						color: #00cd5b;
					}
				}

				> .body {
					padding: 2px 0;

					> .value {
						font-size: 1.2em;
						font-weight: bold;

						> .diff {
							font-size: 0.65em;
							font-weight: normal;
						}
					}

					> .label {
						font-size: 0.8em;
						color: var(--MI_THEME-fgTransparentWeak);
					}
				}
			}
		}
	}
}
</style>

