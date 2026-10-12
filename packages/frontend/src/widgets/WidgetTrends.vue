<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" data-testid="mkw-trends" class="mkw-trends">
	<template #icon><i class="ti ti-hash"></i></template>
	<template #header>{{ i18n.ts._widgets.trends }}</template>

	<div class="wbrkwala">
		<div v-if="fetching" class="placeholder" aria-busy="true">
			<div v-for="index in 5" :key="index" class="placeholderRow" aria-hidden="true"><span></span><span></span></div>
		</div>
		<TransitionGroup v-else tag="div" :name="prefer.s.animation ? 'chart' : ''" class="tags">
			<MkA v-for="stat in stats" :key="stat.tag" class="row" :to="`/tags/${ encodeURIComponent(stat.tag) }`" :title="stat.tag">
				<div class="tag">
					<span class="tagName">#{{ stat.tag }}</span>
					<p>{{ i18n.tsx.nUsersMentioned({ n: stat.usersCount }) }}</p>
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

const name = 'trends';

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
// 标题栏与卡片主体同为 panel 白，保持视觉一致
.mkw-trends {
	--MI-containerHeaderBg: var(--MI_THEME-panel);
}

.wbrkwala {
	height: (54px + 1px) + (54px + 1px) + (54px + 1px) + (54px + 1px) + 54px;
	overflow: hidden;

	> .tags {
		.chart-move {
			transition: transform 1s ease;
		}

		> .row {
			display: flex;
			align-items: center;
			padding: 10px var(--MI-cardPadding, 18px);
			border-bottom: var(--MI-divider);

			&:hover {
				text-decoration: none;
				background: var(--MI_THEME-panelHighlight);
			}

			&:focus-visible {
				outline: 2px solid var(--MI_THEME-focus);
				outline-offset: -2px;
			}

			> .tag {
				flex: 1;
				overflow: hidden;
				font-size: 0.9em;
				color: var(--MI_THEME-fg);

				> .tagName {
					display: block;
					width: 100%;
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
					line-height: 18px;
				}

				> p {
					margin: 0;
					font-size: 75%;
					color: var(--MI_THEME-fgTransparentWeak);
					line-height: 16px;
				}
			}

			> .chart {
				height: 30px;
			}
		}
	}
}

.placeholderRow {
	height: 55px;
	box-sizing: border-box;
	padding: 12px var(--MI-cardPadding, 18px);
	display: flex;
	flex-direction: column;
	gap: 6px;

	> span { width: 55%; height: 10px; border-radius: var(--MI-cardRadius); background: var(--MI_THEME-panelHighlight); }
	> span + span { width: 35%; height: 8px; }
}
</style>
