<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" contentCard :actions="headerActions" :tabs="headerTabs">
	<div class="_pageBody" :class="$style.content">
		<div v-if="tab === '-'" class="_gaps">
			<MkLoading v-if="queuesFetching"/>
			<MkError v-else-if="queuesError" @retry="fetchQueues"/>
			<div v-else class="_adminTableContainer">
				<table class="_adminTable">
					<thead>
						<tr>
							<th scope="col">{{ i18n.ts.jobQueue }}</th>
							<th scope="col" class="_adminTableNumber">{{ i18n.ts._queue.active }}</th>
							<th scope="col" class="_adminTableNumber">{{ i18n.ts._queue.waiting }}</th>
							<th scope="col" class="_adminTableNumber">{{ i18n.ts._queue.delayed }}</th>
							<th scope="col" class="_adminTableNumber">{{ i18n.ts._queue.failed }}</th>
							<th scope="col">{{ i18n.ts.state }}</th>
							<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="q in queueInfos" :key="q.name">
							<td class="_adminTableMain"><button type="button" class="_button _textButton" :title="q.name" @click="tab = q.name">{{ i18n.ts._queue._types[q.name] }}</button></td>
							<td class="_adminTableNumber">{{ number(q.counts.active) }}</td>
							<td class="_adminTableNumber">{{ number(q.counts.waiting) }}</td>
							<td class="_adminTableNumber">{{ number(q.counts.delayed) }}</td>
							<td class="_adminTableNumber" :class="{ [$style.error]: q.counts.failed > 0 }">{{ number(q.counts.failed) }}</td>
							<td><span class="_adminTableStatus" :style="{ '--admin-statusColor': q.isPaused ? 'var(--MI_THEME-warn)' : 'var(--MI_THEME-success)' }">{{ q.isPaused ? i18n.ts._dashboard.paused : i18n.ts.enabled }}</span></td>
							<td class="_adminTableActions"><button type="button" class="_button _textButton" @click="tab = q.name">{{ i18n.ts.details }}</button></td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
		<div v-else class="_gaps">
			<MkError v-if="queueStatsError && !queueInfo" @retry="fetchCurrentQueue"/>
			<MkLoading v-else-if="!queueInfo"/>
			<template v-else>
				<p v-if="queueStatsError" role="alert" :class="$style.error">{{ i18n.ts._queue.queueRefreshFailed }}</p>
				<MkFolder :defaultOpen="true">
					<template #label>{{ i18n.tsx._queue.overviewOf({ name: i18n.ts._queue._types[tab] }) }}</template>
					<template #icon><i class="ti ti-http-que"></i></template>
					<template #suffix><span :class="$style.queueConnection" :title="`#${queueInfo.db.processId}:${queueInfo.db.port} / ${queueInfo.db.runId}`">#{{ queueInfo.db.processId }}:{{ queueInfo.db.port }} / {{ queueInfo.db.runId }}</span></template>
					<template #caption>{{ queueInfo.qualifiedName }}</template>
					<template #footer>
						<div class="_buttons">
							<MkButton rounded :disabled="!canOperateQueue" :wait="queueAction === 'promote'" @click="promoteAllJobs"><i class="ti ti-player-track-next"></i> {{ i18n.ts._queue.promoteAllJobs }}</MkButton>
							<MkButton v-if="queueInfo.isPaused" rounded :disabled="!canOperateQueue" :wait="queueAction === 'resume'" @click="resumeQueue"><i class="ti ti-player-play"></i> {{ i18n.ts._queue.resumeQueue }}</MkButton>
							<MkButton v-else rounded danger :disabled="!canOperateQueue" :wait="queueAction === 'pause'" @click="pauseQueue"><i class="ti ti-player-pause"></i> {{ i18n.ts._queue.pauseQueue }}</MkButton>
							<MkButton rounded danger :disabled="!canOperateQueue || searchQuery.trim() !== ''" :wait="queueAction === 'clear'" @click="clearQueue"><i class="ti ti-trash"></i> {{ i18n.ts._queue.emptyQueue }}</MkButton>
						</div>
					</template>

					<div class="_gaps">
						<XChart :dataSet="{ completed: queueInfo.metrics.completed.data, failed: queueInfo.metrics.failed.data }" :aspectRatio="5"/>
						<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr)); gap: 12px;">
							<MkKeyValue>
								<template #key>{{ i18n.ts._queue.active }}</template>
								<template #value>{{ kmg(queueInfo.counts.active, 2) }}</template>
							</MkKeyValue>
							<MkKeyValue>
								<template #key>{{ i18n.ts._queue.delayed }}</template>
								<template #value>{{ kmg(queueInfo.counts.delayed, 2) }}</template>
							</MkKeyValue>
							<MkKeyValue>
								<template #key>{{ i18n.ts._queue.waiting }}</template>
								<template #value>{{ kmg(queueInfo.counts.waiting, 2) }}</template>
							</MkKeyValue>
						</div>
						<hr>
						<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr)); gap: 12px;">
							<MkKeyValue>
								<template #key>{{ i18n.ts._queue.clientsConnected }}</template>
								<template #value>{{ queueInfo.db.clients.connected }}</template>
							</MkKeyValue>
							<MkKeyValue>
								<template #key>{{ i18n.ts._queue.clientsBlocked }}</template>
								<template #value>{{ queueInfo.db.clients.blocked }}</template>
							</MkKeyValue>
							<MkKeyValue>
								<template #key>{{ i18n.ts._queue.memoryPeak }}</template>
								<template #value>{{ bytes(queueInfo.db.memory.peak, 1) }}</template>
							</MkKeyValue>
							<MkKeyValue>
								<template #key>{{ i18n.ts._queue.memoryTotal }}</template>
								<template #value>{{ bytes(queueInfo.db.memory.total, 1) }}</template>
							</MkKeyValue>
							<MkKeyValue>
								<template #key>{{ i18n.ts._queue.memoryUsed }}</template>
								<template #value>{{ bytes(queueInfo.db.memory.used, 1) }}</template>
							</MkKeyValue>
							<MkKeyValue>
								<template #key>{{ i18n.ts._queue.uptime }}</template>
								<template #value>{{ queueInfo.db.uptime }}</template>
							</MkKeyValue>
						</div>
					</div>
				</MkFolder>

				<MkFolder :defaultOpen="true" :withSpacer="false" @opened="jobsOpened = true" @closed="jobsOpened = false">
					<template #label>{{ i18n.tsx._queue.jobsOf({ name: i18n.ts._queue._types[tab] }) }}</template>
					<template #icon><i class="ti ti-list-check"></i></template>
					<template #suffix>{{ i18n.tsx._queue.counts({ active: kmg(queueInfo.counts.active, 2), delayed: kmg(queueInfo.counts.delayed, 2), waiting: kmg(queueInfo.counts.waiting, 2) }) }}</template>
					<template #header>
						<MkTabs
							v-model:tab="jobState"
							:tabs="[{
								key: 'all',
								title: i18n.ts._queue.all,
								icon: 'ti ti-code-asterisk',
							}, {
								key: 'latest',
								title: i18n.ts._queue.latest,
								icon: 'ti ti-logs',
							}, {
								key: 'completed',
								title: i18n.ts._queue.completed,
								icon: 'ti ti-check',
							}, {
								key: 'failed',
								title: i18n.ts._queue.failed,
								icon: 'ti ti-circle-x',
							}, {
								key: 'active',
								title: i18n.ts._queue.active,
								icon: 'ti ti-player-play',
							}, {
								key: 'delayed',
								title: i18n.ts._queue.delayed,
								icon: 'ti ti-clock',
							}, {
								key: 'wait',
								title: i18n.ts._queue.waiting,
								icon: 'ti ti-hourglass-high',
							}]"
						/>
					</template>
					<template #footer>
						<div class="_buttons">
							<MkButton rounded :disabled="!canOperateQueue" @click="refreshJobs"><i class="ti ti-reload"></i> {{ i18n.ts._queue.refreshView }}</MkButton>
							<MkButton rounded danger :disabled="!canDeleteJobs" :wait="queueAction === 'clear'" style="margin-left: auto;" @click="removeJobs"><i class="ti ti-trash"></i> {{ i18n.ts._queue.removeJobs }}</MkButton>
						</div>
					</template>

					<div class="_spacer _spacerCard">
						<MkInput
							v-model="searchQuery"
							:placeholder="i18n.ts.search"
							:aria-label="i18n.ts.search"
							type="search"
							style="margin-bottom: 16px;"
						>
							<template #prefix><i class="ti ti-search"></i></template>
						</MkInput>

						<p v-if="searchQuery.trim() !== ''" role="status">{{ i18n.ts._queue.clearSearchToDelete }}</p>
						<p v-if="jobsError && jobs.length > 0" role="alert">{{ i18n.ts._queue.jobsRefreshFailed }}</p>
						<MkLoading v-if="jobsFetching && jobs.length === 0"/>
						<MkError v-else-if="jobsError && jobs.length === 0" @retry="refreshJobs"/>
						<MkResult v-else-if="jobs.length === 0" type="empty" :text="i18n.ts.noJobs"/>
						<MkTl
							v-else
							:key="tab"
							:events="jobs.map((job) => ({
								id: job.id,
								timestamp: job.finishedOn ?? job.processedOn ?? job.timestamp,
								data: job,
							}))"
							groupBy="h"
							class="_monospace"
						>
							<template #right="{ event: job }">
								<XJob
									:job="job"
									:queueType="tab"
									:visible="jobsOpened"
									:disabled="queueAction != null || jobsFetching || (busyJobs.size > 0 && !busyJobs.has(`${tab}:${job.id}`))"
									style="margin: 4px 0;"
									@updated="updateJob"
									@removed="removeJobFromList"
									@busyChanged="setJobBusy"
								/>
							</template>
						</MkTl>
					</div>
				</MkFolder>
			</template>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, watch, inject, onActivated, onDeactivated, onBeforeUnmount } from 'vue';
import * as Misskey from 'misskey-js';
import { debounce } from 'throttle-debounce';
import { useInterval } from '@@/js/use-interval.js';
import XChart from './job-queue.chart.vue';
import XJob from './job-queue.job.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/MkButton.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkTabs from '@/components/MkTabs.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import MkTl from '@/components/MkTl.vue';
import kmg from '@/filters/kmg.js';
import number from '@/filters/number.js';
import MkInput from '@/components/MkInput.vue';
import bytes from '@/filters/bytes.js';
import { DI } from '@/di.js';

const tab = ref<typeof Misskey.queueTypes[number] | '-'>('-');
const jobState = ref<Misskey.entities.AdminQueueJobsRequest['state'][number] | 'all' | 'latest'>('all');
const jobs = ref<Misskey.entities.QueueJob[]>([]);
const jobsFetching = ref(true);
const jobsError = ref(false);
const jobsOpened = ref(true);
const queueInfos = ref<Misskey.entities.AdminQueueQueuesResponse>([]);
const queuesFetching = ref(true);
const queuesError = ref(false);
const queueInfo = ref<Misskey.entities.AdminQueueQueueStatsResponse | null>(null);
const queueStatsError = ref(false);
const searchQuery = ref('');
const pageActive = inject(DI.pageActive, ref(true));
const componentActive = ref(true);
type QueueType = typeof Misskey.queueTypes[number];
type QueueAction = 'clear' | 'promote' | 'pause' | 'resume';
const queueAction = ref<QueueAction | null>(null);
const busyJobs = ref(new Set<string>());
const canOperateQueue = computed(() => tab.value !== '-' && pageActive.value && componentActive.value && queueAction.value == null && busyJobs.value.size === 0 && !jobsFetching.value);
const canDeleteJobs = computed(() => canOperateQueue.value && jobState.value !== 'latest' && searchQuery.value.trim() === '');
let viewRevision = 0;
let queuesRequest = 0;
let queueStatsRequest = 0;
let jobsRequest = 0;

async function fetchQueues() {
	if (tab.value !== '-' || !pageActive.value || !componentActive.value) return;
	const request = ++queuesRequest;
	queuesError.value = false;
	queuesFetching.value = queueInfos.value.length === 0;
	try {
		const result = await misskeyApi('admin/queue/queues');
		if (request === queuesRequest) queueInfos.value = result;
	} catch {
		if (request === queuesRequest) queuesError.value = true;
	} finally {
		if (request === queuesRequest) queuesFetching.value = false;
	}
}

async function fetchCurrentQueue() {
	const queue = tab.value;
	if (queue === '-' || !pageActive.value || !componentActive.value) return false;
	const request = ++queueStatsRequest;
	queueStatsError.value = false;
	try {
		const result = await misskeyApi('admin/queue/queue-stats', { queue });
		if (request !== queueStatsRequest || tab.value !== queue) return false;
		queueInfo.value = result;
		return true;
	} catch {
		if (request === queueStatsRequest && tab.value === queue) queueStatsError.value = true;
		return false;
	}
}

async function fetchJobs() {
	const queue = tab.value;
	if (queue === '-' || !pageActive.value || !componentActive.value) return false;
	const request = ++jobsRequest;
	jobsFetching.value = true;
	jobsError.value = false;
	const state = jobState.value;
	try {
		const result = await misskeyApi('admin/queue/jobs', {
			queue,
			state: state === 'all' ? ['completed', 'failed', 'active', 'delayed', 'wait'] : state === 'latest' ? ['completed', 'failed'] : [state],
			search: searchQuery.value.trim() === '' ? undefined : searchQuery.value,
		}).then((res: Misskey.entities.AdminQueueJobsResponse) => {
			if (state === 'all') {
				res.sort((a, b) => (a.processedOn ?? a.timestamp) > (b.processedOn ?? b.timestamp) ? -1 : 1);
			} else if (state === 'latest') {
				res.sort((a, b) => a.processedOn! > b.processedOn! ? -1 : 1);
			} else if (state === 'delayed') {
				res.sort((a, b) => (a.processedOn ?? a.timestamp) > (b.processedOn ?? b.timestamp) ? -1 : 1);
			}
			return res;
		});
		if (request !== jobsRequest || tab.value !== queue) return false;
		jobs.value = result;
		return true;
	} catch {
		if (request === jobsRequest && tab.value === queue) jobsError.value = true;
		return false;
	} finally {
		if (request === jobsRequest && tab.value === queue) jobsFetching.value = false;
	}
}

function invalidateRequests() {
	queuesRequest++;
	queueStatsRequest++;
	jobsRequest++;
}

function refreshView() {
	if (tab.value === '-') {
		void fetchQueues();
	} else {
		void fetchCurrentQueue();
		void fetchJobs();
	}
}

watch(tab, () => {
	viewRevision++;
	invalidateRequests();
	queueInfo.value = null;
	jobs.value = [];
	jobsOpened.value = true;
	refreshView();
}, { immediate: true, flush: 'sync' });

watch([pageActive, componentActive], ([isPageActive, isComponentActive]) => {
	viewRevision++;
	invalidateRequests();
	if (isPageActive && isComponentActive) refreshView();
}, { flush: 'sync' });

onActivated(() => { componentActive.value = true; });
onDeactivated(() => { componentActive.value = false; });

watch(jobState, () => {
	viewRevision++;
	void fetchJobs();
}, { flush: 'sync' });

const search = debounce(1000, () => {
	fetchJobs();
});

watch([searchQuery], () => {
	viewRevision++;
	jobsRequest++;
	search();
}, { flush: 'sync' });

useInterval(() => {
	if (tab.value === '-') {
		fetchQueues();
	} else {
		fetchCurrentQueue();
	}
}, 1000 * 10, {
	immediate: false,
	afterMounted: true,
});

onBeforeUnmount(() => {
	viewRevision++;
	invalidateRequests();
	search.cancel();
});

async function runQueueAction(action: QueueAction, queue: QueueType, operation: () => Promise<unknown>, successText: string, confirmation?: { title: string; text: string }) {
	if (!canOperateQueue.value || tab.value !== queue) return;
	const revision = viewRevision;
	const isCurrentQueue = () => tab.value === queue && pageActive.value && componentActive.value;
	queueAction.value = action;
	try {
		if (confirmation) {
			const { canceled } = await os.confirm({ type: 'warning', ...confirmation });
			if (canceled || revision !== viewRevision || !isCurrentQueue()) return;
		}
		await operation();
		if (!isCurrentQueue()) return;
		// 先完成写入，再读取同一队列；旧的读取结果不能覆盖操作后的状态。
		invalidateRequests();
		const refreshRevision = viewRevision;
		const refreshed = await Promise.all([fetchCurrentQueue(), fetchJobs()]);
		if (refreshRevision === viewRevision && isCurrentQueue()) os.toast(refreshed.every(Boolean) ? successText : i18n.ts._queue.operationQueueRefreshFailed, refreshed.every(Boolean) ? 'success' : 'warning');
	} catch {
		// apiWithDialog 已提示失败，不刷新或丢弃原列表。
	} finally {
		queueAction.value = null;
	}
}

function clearQueue() {
	const queue = tab.value;
	if (queue === '-' || searchQuery.value.trim() !== '') return;
	return runQueueAction('clear', queue, () => os.apiWithDialog('admin/queue/clear', { queue, state: '*' }), i18n.ts.cleared, {
		title: i18n.ts._queue.emptyQueue,
		text: i18n.tsx._queue.clearQueueConfirm({ name: i18n.ts._queue._types[queue] }),
	});
}

function promoteAllJobs() {
	const queue = tab.value;
	if (queue === '-') return;
	return runQueueAction('promote', queue, () => os.apiWithDialog('admin/queue/promote-jobs', { queue }), i18n.ts._queue.jobsPromoted, {
		title: i18n.ts._queue.promoteAllJobs,
		text: i18n.ts.retryAllQueuesConfirmText,
	});
}

function pauseQueue() {
	const queue = tab.value;
	if (queue === '-') return;
	return runQueueAction('pause', queue, () => os.apiWithDialog('admin/queue/pause', { queue }), i18n.ts._queue.queuePaused, {
		title: i18n.ts._queue.pauseQueue,
		text: i18n.ts.areYouSure,
	});
}

function resumeQueue() {
	const queue = tab.value;
	if (queue === '-') return;
	return runQueueAction('resume', queue, () => os.apiWithDialog('admin/queue/resume', { queue }), i18n.ts._queue.queueResumed);
}

function removeJobs() {
	const queue = tab.value;
	const state = jobState.value;
	if (queue === '-' || !canDeleteJobs.value || state === 'latest') return;
	return runQueueAction('clear', queue, () => os.apiWithDialog('admin/queue/clear', { queue, state: state === 'all' ? '*' : state }), i18n.ts.cleared, {
		title: i18n.ts._queue.removeJobs,
		text: state === 'all'
			? i18n.tsx._queue.clearQueueConfirm({ name: i18n.ts._queue._types[queue] })
			: i18n.tsx._queue.removeJobsConfirm({ name: i18n.ts._queue._types[queue], state: state === 'wait' ? i18n.ts._queue.waiting : i18n.ts._queue[state] }),
	});
}

function refreshJobs() {
	if (canOperateQueue.value) void fetchJobs();
}

function setJobBusy(queue: QueueType, jobId: string, busy: boolean) {
	const key = `${queue}:${jobId}`;
	if (busy) busyJobs.value.add(key);
	else busyJobs.value.delete(key);
}

function updateJob(queue: QueueType, job: Misskey.entities.QueueJob) {
	if (tab.value !== queue) return;
	const index = jobs.value.findIndex(item => item.id === job.id);
	if (index !== -1) jobs.value[index] = job;
	void fetchCurrentQueue();
	// 重试可能改变任务所属状态，重新按当前筛选读取列表。
	void fetchJobs();
}

function removeJobFromList(queue: QueueType, jobId: string) {
	if (tab.value !== queue) return;
	jobsRequest++;
	jobsFetching.value = false;
	jobs.value = jobs.value.filter(job => job.id !== jobId);
	void fetchCurrentQueue();
}

const headerActions = computed(() => []);

const headerTabs = computed<{
	key: string;
	title: string;
	icon?: string;
}[]>(() => [{
	key: '-',
	title: i18n.ts.jobQueue,
	icon: 'ti ti-list-check',
}, ...Misskey.queueTypes.map((q) => ({
	key: q,
	title: i18n.ts._queue._types[q],
}))]);

definePage(() => ({
	title: i18n.ts.jobQueue,
	icon: 'ti ti-clock-play',
	needWideArea: true,
}));
</script>

<style lang="scss" module>
.content {
	// Let the tab strip scroll instead of widening the folder's grid track.
	:global([role="group"] [aria-hidden] > div > div) {
		min-width: 0;
	}
}

.queueConnection {
	display: block;
	max-width: min(35vw, 30em);
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.error {
	color: var(--MI_THEME-error);
}
</style>
