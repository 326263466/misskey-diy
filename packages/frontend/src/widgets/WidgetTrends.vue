<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" data-testid="mkw-trends" class="mkw-trends">
	<template #header>{{ i18n.ts._widgets.trends }}</template>

	<div class="wbrkwala _panelPadding">
		<div v-if="fetching" aria-busy="true">
			<div v-for="index in 5" :key="index" class="placeholderRow" aria-hidden="true"><span></span><span></span></div>
		</div>
		<TransitionGroup v-else tag="div" :name="prefer.s.animation ? 'chart' : ''" class="tags">
			<MkA v-for="(stat, index) in stats" :key="stat.tag" class="row" :class="{ top: index < 3 }" :to="`/tags/${ encodeURIComponent(stat.tag) }`" :title="stat.tag">
				<span class="rank" aria-hidden="true">{{ index + 1 }}</span>
				<div class="tag">
					<span class="tagName">#{{ stat.tag }}</span>
					<p>{{ i18n.tsx.nUsersMentioned({ n: compactFormat.format(stat.totalUsersCount) }) }}</p>
				</div>
				<MkMiniChart class="chart" :src="stat.chart"/>
			</MkA>
		</TransitionGroup>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { computed, ref, shallowRef } from 'vue';
import { useInterval } from '@@/js/use-interval.js';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import MkContainer from '@/components/MkContainer.vue';
import MkMiniChart from '@/components/MkMiniChart.vue';
import { misskeyApiGet } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { getVisibleTrends, mergeTrendsWithCache, readTrendsCache, saveTrendsCache } from '@/utility/trends-cache.js';
import { numberFormat } from '@@/js/intl-const.js';

const name = 'trends';
const compactFormat = new Intl.NumberFormat(numberFormat.resolvedOptions().locale, { notation: 'compact', maximumFractionDigits: 1 });

const widgetPropsDef = {
	showHeader: {
		type: 'boolean',
		label: i18n.ts._widgetOptions.showHeader,
		default: true,
	},
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure } = useWidgetPropsManager(name,
	widgetPropsDef,
	props,
	emit,
);

const snapshot = shallowRef(readTrendsCache());
const stats = computed(() => getVisibleTrends(snapshot.value));
const fetching = ref(snapshot.value == null);

const load = () => {
	misskeyApiGet('hashtags/trend').then(res => {
		snapshot.value = mergeTrendsWithCache(res, snapshot.value);
		saveTrendsCache(snapshot.value);
		fetching.value = false;
	}).catch(() => {
		// 拉取失败时继续显示缓存内容，下一次轮询再试
		fetching.value = false;
	});
};

useInterval(load, 1000 * 60, {
	immediate: true,
	afterMounted: true,
});

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" scoped>
// 固定为 5 行高度，加载和排名变化时卡片不跳动
$rowHeight: 46px;

.wbrkwala {
	height: calc(#{$rowHeight * 5} + var(--MI-cardPadding) * 2);
	overflow: hidden;

	> .tags {
		.chart-move {
			transition: transform 1s ease;
		}

		> .row {
			display: flex;
			align-items: center;
			gap: 10px;
			height: $rowHeight;
			box-sizing: border-box;
			border-radius: var(--MI-cardRadius);
			color: var(--MI_THEME-fg);
			transition: background 0.15s ease;

			&:hover {
				text-decoration: none;
				background: var(--MI_THEME-panelHighlight);
			}

			&:focus-visible {
				outline: 2px solid var(--MI_THEME-focus);
				outline-offset: -2px;
			}

			&.top > .rank {
				color: var(--MI_THEME-accent);
			}

			> .rank {
				flex-shrink: 0;
				width: 16px;
				font-size: 15px;
				font-variant-numeric: tabular-nums;
				text-align: center;
				color: var(--MI_THEME-fgTransparentWeak);
			}

			> .tag {
				flex: 1;
				min-width: 0;

				> .tagName {
					display: block;
					overflow: hidden;
					white-space: nowrap;
					text-overflow: ellipsis;
					font-size: 1em;
					line-height: 1.4;
				}

				> p {
					margin: 0;
					font-size: 12px;
					line-height: 16px;
					color: var(--MI_THEME-fgTransparentWeak);
				}
			}

			> .chart {
				flex-shrink: 0;
				height: 28px;
			}
		}
	}
}

.placeholderRow {
	height: $rowHeight;
	box-sizing: border-box;
	display: grid;
	grid-template-columns: 16px minmax(0, 1fr);
	align-content: center;
	gap: 6px 10px;

	> span { grid-column: 2; width: 55%; height: 10px; border-radius: 5px; background: var(--MI_THEME-panelHighlight); }
	> span + span { width: 35%; height: 8px; }
}
</style>
