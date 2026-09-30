<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" data-testid="mkw-trends" class="mkw-trends">
	<template #icon><i class="ti ti-hash"></i></template>
	<template #header>{{ i18n.ts._widgets.trends }}</template>

	<div class="wbrkwala">
		<MkLoading v-if="fetching"/>
		<TransitionGroup v-else tag="div" :name="prefer.s.animation ? 'chart' : ''" class="tags">
			<div v-for="stat in stats" :key="stat.tag">
				<div class="tag">
					<MkA class="a" :to="`/tags/${ encodeURIComponent(stat.tag) }`" :title="stat.tag">#{{ stat.tag }}</MkA>
					<p>{{ i18n.tsx.nUsersMentioned({ n: stat.usersCount }) }}</p>
				</div>
				<MkMiniChart class="chart" :src="stat.chart"/>
			</div>
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
import { useLowresTime } from '@/composables/use-lowres-time.js';
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
const now = useLowresTime();
// 后端只返回当前排行窗口内的话题，窗口一过就是空数组。
// 没有新趋势补入时保留旧话题，避免刷新后面板变空。
const stats = computed(() => getVisibleTrends(snapshot.value, now.value));
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
.wbrkwala {
	height: (62px + 1px) + (62px + 1px) + (62px + 1px) + (62px + 1px) + 62px;
	overflow: hidden;

	> .tags {
		.chart-move {
			transition: transform 1s ease;
		}

		> div {
			display: flex;
			align-items: center;
			padding: 14px var(--MI-cardPadding, 20px);
			border-bottom: solid 0.5px var(--MI_THEME-divider);

			> .tag {
				flex: 1;
				overflow: hidden;
				font-size: 0.9em;
				color: var(--MI_THEME-fg);

				> .a {
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
					opacity: 0.7;
					line-height: 16px;
				}
			}

			> .chart {
				height: 30px;
			}
		}
	}
}
</style>
