<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<header :class="$style.summary">
		<div :class="$style.heading">
			<strong :class="$style.name">{{ currentJob.name }}</strong>
			<span class="_adminTableStatus" :style="{ '--admin-statusColor': statusColor }">{{ statusLabel }}</span>
		</div>
		<div class="_adminTableSecondary _selectable" :class="$style.identity">
			<span>#{{ currentJob.id }}</span>
			<span>{{ i18n.ts._queue._types[queueType] }}</span>
			<span v-if="currentJob.opts.repeat != null">{{ i18n.ts._queue.repeat }}</span>
		</div>
	</header>
	<MkTabs v-model:tab="tab" :tabs="tabs" :class="$style.tabs"/>
	<div :class="$style.content">
		<div v-if="tab === 'info'" class="_gaps">
			<div :class="$style.infoGrid">
				<MkKeyValue>
					<template #key>ID</template>
					<template #value><span class="_selectable">{{ currentJob.id }}</span></template>
				</MkKeyValue>
				<MkKeyValue>
					<template #key>{{ i18n.ts._queue.createdAt }}</template>
					<template #value><MkTime :time="currentJob.timestamp" mode="detail"/></template>
				</MkKeyValue>
				<MkKeyValue v-if="currentJob.processedOn != null">
					<template #key>{{ i18n.ts._queue.processedAt }}</template>
					<template #value><MkTime :time="currentJob.processedOn" mode="detail"/></template>
				</MkKeyValue>
				<MkKeyValue v-if="currentJob.finishedOn != null">
					<template #key>{{ i18n.ts._queue.finishedAt }}</template>
					<template #value><MkTime :time="currentJob.finishedOn" mode="detail"/></template>
				</MkKeyValue>
				<MkKeyValue v-if="currentJob.processedOn != null && currentJob.finishedOn != null">
					<template #key>{{ i18n.ts._queue.spent }}</template>
					<template #value>{{ currentJob.finishedOn - currentJob.processedOn }}ms</template>
				</MkKeyValue>
				<MkKeyValue v-if="currentJob.failedReason">
					<template #key>{{ i18n.ts._queue.failedReason }}</template>
					<template #value><span :class="$style.errorText"><i class="ti ti-alert-triangle" aria-hidden="true"></i> {{ currentJob.failedReason }}</span></template>
				</MkKeyValue>
				<MkKeyValue v-if="currentJob.opts.attempts != null && currentJob.opts.attempts > 0">
					<template #key>{{ i18n.ts._queue.attempts }}</template>
					<template #value>{{ i18n.tsx._queue.attemptsOf({ current: currentJob.attempts, max: currentJob.opts.attempts }) }}</template>
				</MkKeyValue>
				<MkKeyValue v-if="typeof currentJob.progress === 'number'">
					<template #key>{{ i18n.ts._queue.progress }}</template>
					<template #value>{{ Math.floor(currentJob.progress) }}%</template>
				</MkKeyValue>
			</div>
			<MkFolder :withSpacer="false">
				<template #label>{{ i18n.ts._queue.options }}</template>
				<MkCode :code="JSON5.stringify(currentJob.opts, null, '\t')" lang="js"/>
			</MkFolder>
		</div>
		<div v-else-if="tab === 'timeline'" :class="$style.timeline">
			<MkTl :events="timeline" groupBy="h">
				<template #left="{ event }">
					<div>
						<template v-if="event.type === 'finished'">
							<b>{{ i18n.ts._queue.eventFinished }}</b>
							<i :class="currentJob.isFailed ? 'ti ti-circle-x' : 'ti ti-check'" :style="{ color: currentJob.isFailed ? 'var(--MI_THEME-error)' : 'var(--MI_THEME-success)' }" aria-hidden="true"></i>
						</template>
						<template v-else-if="event.type === 'processed'">
							<b>{{ i18n.ts._queue.eventProcessed }}</b> <i class="ti ti-player-play" aria-hidden="true"></i>
						</template>
						<template v-else-if="event.type === 'attempt'">
							<b>{{ i18n.tsx._queue.eventAttempt({ n: event.attempt }) }}</b> <i class="ti ti-alert-triangle" :class="$style.warningText" aria-hidden="true"></i>
						</template>
						<template v-else>
							<b>{{ i18n.ts._queue.eventCreated }}</b> <i class="ti ti-plus" aria-hidden="true"></i>
						</template>
					</div>
				</template>
				<template #right="{ event, timestamp, delta }">
					<div :class="$style.timelineTime">
						<div v-if="event.type === 'attempt'">{{ i18n.ts._queue.atTime }}: ?</div>
						<template v-else>
							<div>{{ i18n.ts._queue.atTime }}: <MkTime :time="timestamp" mode="detail"/></div>
							<div class="_adminTableSecondary">{{ timestamp }} (+{{ msSMH(delta) }})</div>
						</template>
					</div>
				</template>
			</MkTl>
		</div>
		<MkCode v-else-if="tab === 'data'" :code="JSON5.stringify(currentJob.data, null, '\t')" lang="js"/>
		<MkCode v-else-if="tab === 'result'" :code="JSON5.stringify(currentJob.returnValue, null, '\t')" lang="json5"/>
		<div v-else-if="tab === 'error'" class="_gaps_s">
			<MkCode v-for="(trace, index) in currentJob.stacktrace" :key="index" :code="trace" lang="stacktrace"/>
		</div>
		<div v-else-if="tab === 'logs'" class="_gaps_s" :aria-busy="logsState === 'loading'">
			<div :class="$style.logToolbar">
				<strong>{{ i18n.ts._queue.logs }}</strong>
				<MkButton small :disabled="!interactive || busy != null || logsState === 'loading' || removed" @click="loadLogs"><i class="ti ti-refresh" aria-hidden="true"></i> {{ i18n.ts._queue.loadLogs }}</MkButton>
			</div>
			<div v-if="logsState === 'loading'" role="status" :class="$style.emptyState"><i class="ti ti-loader-2" aria-hidden="true"></i> {{ i18n.ts.loading }}</div>
			<div v-else-if="logsState === 'failed'" role="alert" :class="[$style.message, $style.errorText]">{{ i18n.ts._queue.logsLoadFailed }}</div>
			<div v-else-if="logsState === 'loaded' && logs.length === 0" role="status" :class="$style.emptyState">
				<i class="ti ti-file-text" aria-hidden="true"></i>
				<strong>{{ i18n.ts._queue.noLogs }}</strong>
				<span class="_adminTableSecondary">{{ i18n.ts._queue.noLogsDescription }}</span>
			</div>
			<pre v-for="(log, index) in logs" :key="index" class="_selectable" :class="$style.log">{{ log }}</pre>
		</div>
	</div>
	<footer :class="$style.footer">
		<div v-if="feedback" :role="feedback.error ? 'alert' : 'status'" :class="[$style.message, feedback.error ? $style.errorText : $style.successText]">{{ feedback.text }}</div>
		<div class="_buttons" :class="$style.actions">
			<MkButton small :disabled="!interactive || busy != null || removed" @click="copyRaw"><i class="ti ti-copy" aria-hidden="true"></i> {{ i18n.ts._queue.copyRaw }}</MkButton>
			<MkButton small :disabled="!interactive || busy != null || removed" :wait="busy === 'refresh'" @click="refresh"><i class="ti ti-refresh" aria-hidden="true"></i> {{ i18n.ts._queue.refreshView }}</MkButton>
			<MkButton small :disabled="!interactive || busy != null || !canRetry" :wait="busy === 'retry'" @click="retryJob"><i class="ti ti-player-track-next" aria-hidden="true"></i> {{ retryLabel }}</MkButton>
			<MkButton small danger :disabled="!interactive || busy != null || removed" :wait="busy === 'remove'" :class="$style.removeButton" @click="removeJob"><i class="ti ti-trash" aria-hidden="true"></i> {{ i18n.ts._queue.removeJob }}</MkButton>
		</div>
	</footer>
</div>
</template>

<script lang="ts" setup>
import { computed, inject, onActivated, onBeforeUnmount, onDeactivated, ref, shallowRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import JSON5 from 'json5';
import type { TlEvent } from '@/components/MkTl.vue';
import MkTl from '@/components/MkTl.vue';
import MkButton from '@/components/MkButton.vue';
import MkTabs from '@/components/MkTabs.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkCode from '@/components/MkCode.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { DI } from '@/di.js';

const props = withDefaults(defineProps<{
	job: Misskey.entities.QueueJob;
	queueType: typeof Misskey.queueTypes[number];
	visible?: boolean;
	disabled?: boolean;
}>(), { visible: true, disabled: false });

const emit = defineEmits<{
	(ev: 'updated', job: Misskey.entities.QueueJob): void;
	(ev: 'removed', jobId: string): void;
	(ev: 'busyChanged', value: boolean): void;
}>();

const currentJob = shallowRef(props.job);
const tab = ref('info');
const logs = ref<string[]>([]);
const logsState = ref<'idle' | 'loading' | 'loaded' | 'failed'>('idle');
const busy = ref<'refresh' | 'retry' | 'remove' | 'copy' | null>(null);
const feedback = ref<{ text: string; error: boolean } | null>(null);
const removed = ref(false);
const needsRefresh = ref(false);
const pageActive = inject(DI.pageActive, ref(true));
const componentActive = ref(true);
const detailsVisible = computed(() => props.visible && pageActive.value && componentActive.value);
const interactive = computed(() => detailsVisible.value && !props.disabled);
let version = 0;
let logsRequest = 0;
let interactionRevision = 0;
let visibilityRevision = 0;
let logsController: AbortController | null = null;

function cancelLogs() {
	logsRequest++;
	logsController?.abort();
	logsController = null;
	if (logsState.value === 'loading') logsState.value = logs.value.length > 0 ? 'loaded' : 'idle';
}

watch(busy, value => { emit('busyChanged', value != null); }, { immediate: true, flush: 'sync' });
watch(() => props.job, job => { currentJob.value = job; }, { flush: 'sync' });
watch(() => `${props.queueType}:${props.job.id}`, () => {
	version++;
	cancelLogs();
	currentJob.value = props.job;
	tab.value = 'info';
	logs.value = [];
	logsState.value = 'idle';
	busy.value = null;
	feedback.value = null;
	removed.value = false;
	needsRefresh.value = false;
}, { flush: 'sync' });
watch(interactive, () => { interactionRevision++; }, { flush: 'sync' });
watch(detailsVisible, () => { visibilityRevision++; }, { flush: 'sync' });
onActivated(() => { componentActive.value = true; });
onDeactivated(() => { componentActive.value = false; });
onBeforeUnmount(() => { version++; cancelLogs(); emit('busyChanged', false); });

const statusLabel = computed(() => {
	if (currentJob.value.finishedOn != null) return currentJob.value.isFailed ? i18n.ts._queue.failed : i18n.ts._queue.completed;
	if (currentJob.value.delay != null && currentJob.value.delay !== 0) return i18n.ts._queue.delayed;
	if (currentJob.value.processedOn != null) return i18n.ts._queue.active;
	return i18n.ts._queue.waiting;
});
const statusColor = computed(() => {
	if (currentJob.value.isFailed && currentJob.value.finishedOn != null) return 'var(--MI_THEME-error)';
	if (currentJob.value.finishedOn != null || currentJob.value.processedOn != null) return 'var(--MI_THEME-success)';
	return 'var(--MI_THEME-fgTransparentWeak)';
});
const canRetry = computed(() => !removed.value && !needsRefresh.value && (currentJob.value.finishedOn != null || currentJob.value.delay > 0));
const retryLabel = computed(() => currentJob.value.finishedOn != null ? i18n.ts.retry : i18n.ts._queue.promoteJob);
const tabs = computed(() => [
	{ key: 'info', title: i18n.ts._queue.info, icon: 'ti ti-info-circle' },
	{ key: 'timeline', title: i18n.ts._queue.timeline, icon: 'ti ti-timeline-event' },
	{ key: 'data', title: i18n.ts._queue.data, icon: 'ti ti-package' },
	...(currentJob.value.returnValue != null ? [{ key: 'result', title: i18n.ts._queue.result, icon: 'ti ti-check' }] : []),
	...(currentJob.value.stacktrace.length > 0 ? [{ key: 'error', title: i18n.ts._queue.error, icon: 'ti ti-alert-triangle' }] : []),
	{ key: 'logs', title: i18n.ts._queue.logs, icon: 'ti ti-logs' },
]);
watch(tabs, value => {
	if (!value.some(item => item.key === tab.value)) tab.value = 'info';
});
const logsVisible = computed(() => tab.value === 'logs' && detailsVisible.value && !removed.value);
watch(logsVisible, visible => {
	if (!visible) cancelLogs();
	else if (logsState.value === 'idle') void loadLogs();
}, { flush: 'sync' });

type TimelineEvent = TlEvent<{ type: 'created' | 'processed' | 'finished' } | { type: 'attempt'; attempt: number }>;
const timeline = computed<TimelineEvent[]>(() => {
	const job = currentJob.value;
	const events: TimelineEvent[] = [{ id: 'created', timestamp: job.timestamp, data: { type: 'created' } }];
	for (let attempt = 1; attempt < job.attempts; attempt++) {
		events.push({ id: `attempt-${attempt}`, timestamp: job.timestamp + attempt, data: { type: 'attempt', attempt } });
	}
	if (job.processedOn != null) events.push({ id: 'processed', timestamp: job.processedOn, data: { type: 'processed' } });
	if (job.finishedOn != null) events.push({ id: 'finished', timestamp: job.finishedOn, data: { type: 'finished' } });
	return events;
});

function msSMH(value: number | null) {
	if (value == null) return 'N/A';
	if (value === 0) return '0';
	const units = [{ size: 3600000, suffix: 'h' }, { size: 60000, suffix: 'm' }, { size: 1000, suffix: 's' }, { size: 1, suffix: 'ms' }];
	const unit = units.find(item => Math.abs(value) >= item.size) ?? units[units.length - 1];
	return `${(value / unit.size).toFixed(1)}${unit.suffix}`;
}

async function loadLogs() {
	if (!logsVisible.value || logsState.value === 'loading') return;
	const request = ++logsRequest;
	const activeVersion = version;
	const controller = new AbortController();
	logsController = controller;
	logsState.value = 'loading';
	try {
		const result = await misskeyApi('admin/queue/show-job-logs', { queue: props.queueType, jobId: currentJob.value.id }, undefined, controller.signal);
		if (activeVersion !== version || request !== logsRequest) return;
		logs.value = result;
		logsState.value = 'loaded';
	} catch {
		if (activeVersion === version && request === logsRequest) logsState.value = 'failed';
	} finally {
		if (request === logsRequest) logsController = null;
	}
}

async function fetchJob(activeVersion: number) {
	const revision = visibilityRevision;
	const result = await misskeyApi('admin/queue/show-job', { queue: props.queueType, jobId: currentJob.value.id });
	if (activeVersion !== version || revision !== visibilityRevision) return false;
	currentJob.value = result;
	needsRefresh.value = false;
	emit('updated', result);
	if (logsVisible.value) {
		cancelLogs();
		await loadLogs();
	}
	return activeVersion === version && revision === visibilityRevision;
}

async function refresh() {
	if (!interactive.value || busy.value != null || removed.value) return;
	const activeVersion = version;
	busy.value = 'refresh';
	feedback.value = null;
	try {
		if (await fetchJob(activeVersion)) feedback.value = { text: i18n.ts._queue.refreshed, error: false };
	} catch {
		if (activeVersion === version) feedback.value = { text: i18n.ts._queue.refreshFailed, error: true };
	} finally {
		if (activeVersion === version) busy.value = null;
	}
}

async function retryJob() {
	if (!interactive.value || busy.value != null || !canRetry.value) return;
	const activeVersion = version;
	const revision = interactionRevision;
	const queue = props.queueType;
	const jobId = currentJob.value.id;
	busy.value = 'retry';
	feedback.value = null;
	try {
		const { canceled } = await os.confirm({ type: 'warning', title: retryLabel.value, text: i18n.ts.areYouSure });
		if (canceled || activeVersion !== version || revision !== interactionRevision || !interactive.value || !canRetry.value) return;
		await misskeyApi('admin/queue/retry-job', { queue, jobId });
		if (activeVersion !== version) return;
		needsRefresh.value = true;
		try {
			if (await fetchJob(activeVersion)) feedback.value = { text: i18n.ts._queue.jobsPromoted, error: false };
		} catch {
			if (activeVersion === version) feedback.value = { text: i18n.ts._queue.operationRefreshFailed, error: true };
		}
	} catch {
		if (activeVersion === version) feedback.value = { text: i18n.ts._queue.operationFailed, error: true };
	} finally {
		if (activeVersion === version) busy.value = null;
	}
}

async function removeJob() {
	if (!interactive.value || busy.value != null || removed.value) return;
	const activeVersion = version;
	const revision = interactionRevision;
	const queue = props.queueType;
	const jobId = currentJob.value.id;
	busy.value = 'remove';
	feedback.value = null;
	try {
		const { canceled } = await os.confirm({ type: 'warning', title: i18n.ts._queue.removeJob, text: i18n.ts.areYouSure });
		if (canceled || activeVersion !== version || revision !== interactionRevision || !interactive.value) return;
		await misskeyApi('admin/queue/remove-job', { queue, jobId });
		if (activeVersion !== version) return;
		removed.value = true;
		feedback.value = { text: i18n.ts.deleteSucceeded, error: false };
		emit('removed', jobId);
	} catch {
		if (activeVersion === version) feedback.value = { text: i18n.ts._queue.operationFailed, error: true };
	} finally {
		if (activeVersion === version) busy.value = null;
	}
}

async function copyRaw() {
	if (!interactive.value || busy.value != null || removed.value) return;
	const activeVersion = version;
	busy.value = 'copy';
	feedback.value = null;
	try {
		await navigator.clipboard.writeText(JSON.stringify(currentJob.value, null, '\t'));
		if (activeVersion === version) feedback.value = { text: i18n.ts.copiedToClipboard, error: false };
	} catch {
		if (activeVersion === version) feedback.value = { text: i18n.ts._queue.copyFailed, error: true };
	} finally {
		if (activeVersion === version) busy.value = null;
	}
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	min-width: 0;
	min-height: 420px;
}

.summary {
	padding: 20px 20px 12px;
}

.heading {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 12px;
}

.name {
	min-width: 0;
	font-size: 1.1em;
	overflow-wrap: anywhere;
}

.identity {
	display: flex;
	flex-wrap: wrap;
	gap: 4px 16px;
	margin-top: 8px;
	overflow-wrap: anywhere;
}

.tabs {
	flex-shrink: 0;
	margin: 0 10px;
	border-bottom: var(--MI-divider);
}

.content {
	flex: 1;
	min-width: 0;
	min-height: 220px;
	padding: 16px 20px 20px;
	overflow-wrap: anywhere;
}

.infoGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
	gap: 16px 20px;
}

.timeline {
	overflow-x: auto;
}

.timelineTime {
	margin: 8px 0;
}

.logToolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.emptyState {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 10px;
	min-height: 180px;
	text-align: center;
	line-height: 1.5;

	> i {
		font-size: 1.8em;
		color: var(--MI_THEME-fgTransparentWeak);
	}
}

.log {
	margin: 0;
	padding: 10px 12px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panelHighlight);
	font-size: 85%;
	line-height: 1.6;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.footer {
	position: sticky;
	bottom: 0;
	z-index: 1;
	padding: 12px 20px 16px;
	border-top: var(--MI-divider);
	background: var(--MI_THEME-panel);
}

.actions {
	gap: 8px;
}

.removeButton {
	margin-inline-start: auto;
}

.message {
	margin-bottom: 10px;
	font-size: 90%;
	line-height: 1.5;
	overflow-wrap: anywhere;
}

.errorText {
	color: var(--MI_THEME-error);
}

.warningText {
	color: var(--MI_THEME-warn);
}

.successText {
	color: var(--MI_THEME-success);
}

@container (max-width: 450px) {
	.summary {
		padding: 16px 16px 12px;
	}

	.content {
		padding: 16px;
	}

	.footer {
		padding: 12px 16px max(16px, env(safe-area-inset-bottom, 0px));
	}

	.removeButton {
		margin-inline-start: 0;
	}
}
</style>
