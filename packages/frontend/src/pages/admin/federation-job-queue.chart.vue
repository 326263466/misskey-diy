<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div :class="$style.status">
		<div :class="$style.statusItem" class="_panel"><div :class="$style.statusLabel">{{ i18n.ts._queue.process }}</div>{{ number(activeSincePrevTick) }}</div>
		<div :class="$style.statusItem" class="_panel"><div :class="$style.statusLabel">{{ i18n.ts._queue.active }}</div>{{ number(active) }}</div>
		<div :class="$style.statusItem" class="_panel"><div :class="$style.statusLabel">{{ i18n.ts._queue.waiting }}</div>{{ number(waiting) }}</div>
		<div :class="$style.statusItem" class="_panel"><div :class="$style.statusLabel">{{ i18n.ts._queue.delayed }}</div>{{ number(delayed) }}</div>
	</div>
	<div :class="$style.charts">
		<div :class="$style.chart">
			<div :class="$style.chartTitle">{{ i18n.ts._queue.process }}</div>
			<XChart ref="chartProcess" type="process"/>
		</div>
		<div :class="$style.chart">
			<div :class="$style.chartTitle">{{ i18n.ts._queue.active }}</div>
			<XChart ref="chartActive" type="active"/>
		</div>
		<div :class="$style.chart">
			<div :class="$style.chartTitle">{{ i18n.ts._queue.delayed }}</div>
			<XChart ref="chartDelayed" type="delayed"/>
		</div>
		<div :class="$style.chart">
			<div :class="$style.chartTitle">{{ i18n.ts._queue.waiting }}</div>
			<XChart ref="chartWaiting" type="waiting"/>
		</div>
	</div>
	<MkFolder :defaultOpen="true" :max-height="250">
		<template #icon><i class="ti ti-alert-triangle"></i></template>
		<template #label>{{ i18n.ts._queue.erroredInstances }}</template>
		<template #suffix>{{ i18n.tsx._queue.nJobs({ n: number(jobs.reduce((a, b) => a + b[1], 0)) }) }}</template>

		<div>
			<div v-if="jobs.length > 0">
				<div v-for="job in jobs" :key="job[0]">
					<MkA :to="`/instance-info/${job[0]}`" behavior="window">{{ job[0] }}</MkA>
					<span style="margin-left: 8px; color: var(--MI_THEME-fgTransparentWeak);">{{ i18n.tsx._queue.nJobs({ n: number(job[1]) }) }}</span>
				</div>
			</div>
			<span v-else style="color: var(--MI_THEME-fgTransparentWeak);">{{ i18n.ts.noJobs }}</span>
		</div>
	</MkFolder>
</div>
</template>

<script lang="ts" setup>
import { markRaw, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import XChart from './federation-job-queue.chart.chart.vue';
import type { ApQueueDomain } from '@/pages/admin/federation-job-queue.vue';
import number from '@/filters/number.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useStream } from '@/stream.js';
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/MkFolder.vue';
import { genId } from '@/utility/id.js';

const connection = markRaw(useStream().useChannel('queueStats'));

const activeSincePrevTick = ref(0);
const active = ref(0);
const delayed = ref(0);
const waiting = ref(0);
const jobs = ref<Misskey.Endpoints[`admin/queue/${ApQueueDomain}-delayed`]['res']>([]);
const chartProcess = useTemplateRef('chartProcess');
const chartActive = useTemplateRef('chartActive');
const chartDelayed = useTemplateRef('chartDelayed');
const chartWaiting = useTemplateRef('chartWaiting');

const props = defineProps<{
	domain: ApQueueDomain;
}>();

function onStats(stats: Misskey.entities.QueueStats) {
	activeSincePrevTick.value = stats[props.domain].activeSincePrevTick;
	active.value = stats[props.domain].active;
	delayed.value = stats[props.domain].delayed;
	waiting.value = stats[props.domain].waiting;

	if (chartProcess.value != null) chartProcess.value.pushData(stats[props.domain].activeSincePrevTick);
	if (chartActive.value != null) chartActive.value.pushData(stats[props.domain].active);
	if (chartDelayed.value != null) chartDelayed.value.pushData(stats[props.domain].delayed);
	if (chartWaiting.value != null) chartWaiting.value.pushData(stats[props.domain].waiting);
}

function onStatsLog(statsLog: Misskey.entities.QueueStatsLog) {
	const dataProcess: Misskey.entities.QueueStats[ApQueueDomain]['activeSincePrevTick'][] = [];
	const dataActive: Misskey.entities.QueueStats[ApQueueDomain]['active'][] = [];
	const dataDelayed: Misskey.entities.QueueStats[ApQueueDomain]['delayed'][] = [];
	const dataWaiting: Misskey.entities.QueueStats[ApQueueDomain]['waiting'][] = [];

	for (const stats of [...statsLog].reverse()) {
		dataProcess.push(stats[props.domain].activeSincePrevTick);
		dataActive.push(stats[props.domain].active);
		dataDelayed.push(stats[props.domain].delayed);
		dataWaiting.push(stats[props.domain].waiting);
	}

	if (chartProcess.value != null) chartProcess.value.setData(dataProcess);
	if (chartActive.value != null) chartActive.value.setData(dataActive);
	if (chartDelayed.value != null) chartDelayed.value.setData(dataDelayed);
	if (chartWaiting.value != null) chartWaiting.value.setData(dataWaiting);
}

onMounted(() => {
	misskeyApi(`admin/queue/${props.domain}-delayed`).then(result => {
		jobs.value = result;
	});

	connection.on('stats', onStats);
	connection.on('statsLog', onStatsLog);
	connection.send('requestLog', {
		id: genId(),
		length: 200,
	});
});

onUnmounted(() => {
	connection.off('stats', onStats);
	connection.off('statsLog', onStatsLog);
	connection.dispose();
});
</script>

<style lang="scss" module>
.charts {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 10px;
}

.chart {
	min-width: 0;
	padding: var(--MI-cardPadding);
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
}

.chartTitle {
	margin-bottom: 8px;
}

.status {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(160px, 100%), 1fr));
	grid-gap: 10px;
}

.statusItem {
	padding: var(--MI-cardPadding);
}

.statusLabel {
	font-size: 80%;
	color: var(--MI_THEME-fgTransparentWeak);
}
</style>
