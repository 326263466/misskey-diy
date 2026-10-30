<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader hideHeader :class="$style.page">
	<div :class="$style.root">
		<p v-if="hasError" role="alert" :class="$style.error">{{ i18n.ts._dashboard.refreshFailed }} <button type="button" class="_button _link" :disabled="refreshing" @click="refresh">{{ i18n.ts.retry }}</button></p>
		<XStats :stats="summary" :failed="failed.summary"/>

		<div :class="$style.columns">
			<section :class="$style.panel" :aria-labelledby="`${id}-activity`">
				<header :class="$style.panelHeader"><h2 :id="`${id}-activity`">{{ i18n.ts._dashboard.activityTrend }}</h2><span :title="i18n.ts._dashboard.onlineUsersHint">{{ i18n.ts._dashboard.onlineUsers }} <strong>{{ online == null ? '—' : number(online) }}</strong></span></header>
				<div :class="[$style.panelBody, $style.trend]"><XActiveUsers :refreshKey="refreshKey"/></div>
			</section>

			<section :class="$style.panel" :aria-labelledby="`${id}-pending`">
				<header :class="$style.panelHeader"><h2 :id="`${id}-pending`">{{ i18n.ts._dashboard.pendingWork }}</h2></header>
				<div :class="$style.pending">
					<MkA to="/admin/abuses" :class="$style.pendingItem">
						<i class="ti ti-flag" aria-hidden="true"></i><span>{{ i18n.ts._dashboard.pendingReports }}</span><strong :class="{ [$style.attention]: (summary?.pendingReportsCount ?? 0) > 0 }">{{ summary ? number(summary.pendingReportsCount) : '—' }}</strong><i class="ti ti-chevron-right" aria-hidden="true"></i>
					</MkA>
					<MkA to="/feedback" :class="$style.pendingItem">
						<i class="ti ti-message-report" aria-hidden="true"></i><span>{{ i18n.ts._dashboard.pendingFeedback }}<small>{{ i18n.ts._dashboard.pendingFeedbackHint }}</small></span><strong :class="{ [$style.attention]: (summary?.pendingFeedbackCount ?? 0) > 0 }">{{ summary ? number(summary.pendingFeedbackCount) : '—' }}</strong><i class="ti ti-chevron-right" aria-hidden="true"></i>
					</MkA>
				</div>
				<div :class="$style.configuration">
					<h3>{{ i18n.ts._dashboard.siteConfiguration }}</h3>
					<dl v-if="summary" :class="$style.settings">
						<div><dt>{{ i18n.ts.registration }}</dt><dd>{{ summary.settings.registrationOpen ? i18n.ts._dashboard.openRegistration : i18n.ts._dashboard.invitationOnly }}</dd></div>
						<div><dt>{{ i18n.ts._dashboard.captcha }}</dt><dd>{{ summary.settings.captchaEnabled ? i18n.ts.enabled : i18n.ts.disabled }}</dd></div>
						<div><dt>{{ i18n.ts.emailServer }}</dt><dd>{{ summary.settings.emailEnabled ? i18n.ts.enabled : i18n.ts.disabled }}</dd></div>
						<div><dt>{{ i18n.ts.disk }}</dt><dd>{{ summary.settings.objectStorageEnabled ? i18n.ts.objectStorage : i18n.ts._dashboard.localStorage }}</dd></div>
						<div><dt>{{ i18n.ts.federation }}</dt><dd>{{ federationLabel }}</dd></div>
					</dl>
					<p v-else :class="$style.muted">{{ failed.summary ? i18n.ts.unavailable : i18n.ts.loading }}</p>
				</div>
			</section>
		</div>

		<section :class="$style.panel" :aria-labelledby="`${id}-calendar`">
			<header :class="$style.panelHeader"><h2 :id="`${id}-calendar`">{{ i18n.ts._dashboard.publishingCalendar }}</h2><span>{{ i18n.ts._dashboard.dailyNotes }}</span></header>
			<div :class="$style.panelBody"><MkHeatmap src="notes" :refreshKey="refreshKey"/></div>
		</section>

		<div :class="$style.columns">
			<section :class="$style.panel" :aria-labelledby="`${id}-queues`">
				<header :class="$style.panelHeader"><h2 :id="`${id}-queues`">{{ i18n.ts._dashboard.backgroundJobs }}</h2><MkA to="/admin/job-queue" class="_link">{{ i18n.ts.details }} <i class="ti ti-chevron-right" aria-hidden="true"></i></MkA></header>
				<div v-if="queues == null" :class="$style.loading"><span v-if="failed.queues">{{ i18n.ts.unavailable }}</span><MkLoading v-else/></div>
				<div v-else :class="$style.tableContainer">
					<table :class="$style.table">
						<thead><tr><th scope="col">{{ i18n.ts.jobQueue }}</th><th scope="col">{{ i18n.ts._queue.active }}</th><th scope="col">{{ i18n.ts._queue.waiting }}</th><th scope="col">{{ i18n.ts._queue.delayed }}</th><th scope="col">{{ i18n.ts._queue.failed }}</th><th scope="col">{{ i18n.ts.state }}</th></tr></thead>
						<tbody>
							<tr v-for="queue in visibleQueues" :key="queue.name">
								<th scope="row">{{ i18n.ts._queue._types[queue.name] }}</th>
								<td>{{ number(queue.counts.active) }}</td><td>{{ number(queue.counts.waiting) }}</td><td>{{ number(queue.counts.delayed) }}</td><td :class="{ [$style.attention]: queue.counts.failed > 0 }">{{ number(queue.counts.failed) }}</td>
								<td><span :class="[$style.badge, { [$style.paused]: queue.isPaused }]">{{ queue.isPaused ? i18n.ts._dashboard.paused : i18n.ts.enabled }}</span></td>
							</tr>
						</tbody>
					</table>
				</div>
				<p :class="$style.footnote">{{ i18n.ts._dashboard.queueHint }}</p>
			</section>

			<section :class="$style.panel" :aria-labelledby="`${id}-runtime`">
				<header :class="$style.panelHeader"><h2 :id="`${id}-runtime`">{{ i18n.ts._dashboard.runtime }}</h2><i class="ti ti-server" aria-hidden="true"></i></header>
				<div :class="$style.panelBody">
					<dl v-if="server" :class="$style.runtime">
						<div><dt>{{ i18n.ts.version }}</dt><dd>{{ server.version }}</dd></div>
						<div><dt>{{ i18n.ts._dashboard.operatingSystem }}</dt><dd>{{ server.os }}</dd></div>
						<div><dt>Node.js</dt><dd>{{ server.node }}</dd></div>
						<div><dt>PostgreSQL</dt><dd>{{ server.psql }}</dd></div>
						<div><dt>Redis</dt><dd>{{ server.redis ?? i18n.ts.unavailable }}</dd></div>
						<div><dt>{{ i18n.ts._dashboard.processor }}</dt><dd>{{ i18n.tsx._dashboard.cpuCores({ n: server.cpu.cores }) }}<small v-if="server.cpu.model">{{ server.cpu.model }}</small><small>{{ i18n.tsx._dashboard.cpuAvailable({ n: server.cpu.available }) }}</small></dd></div>
						<div><dt>{{ i18n.ts._dashboard.memoryTotal }}</dt><dd>{{ bytes(server.mem.total, 1) }}<small v-if="server.mem.limit != null">{{ i18n.tsx._dashboard.memoryLimit({ n: bytes(server.mem.limit, 1) }) }}</small></dd></div>
						<div><dt>{{ i18n.ts._dashboard.workerMemory }}</dt><dd>{{ bytes(server.mem.rss, 1) }}</dd></div>
					</dl>
					<div v-if="server && server.fs && server.fs.total > 0" :class="$style.storage">
						<div><span>{{ i18n.ts._dashboard.storageFilesystem }}</span><span>{{ i18n.tsx._dashboard.storageUsed({ used: bytes(server.fs.used, 1), total: bytes(server.fs.total, 1) }) }}</span></div>
						<progress :value="server.fs.used" :max="server.fs.total" :aria-label="i18n.ts._dashboard.storageFilesystem"></progress>
						<p>{{ i18n.ts._dashboard.storageFilesystemHint }}</p>
					</div>
					<p v-if="server == null" :class="$style.muted">{{ failed.server ? i18n.ts.unavailable : i18n.ts.loading }}</p>
				</div>
			</section>
		</div>

		<section v-if="federationEnabled" :class="$style.panel" :aria-labelledby="`${id}-federation`">
			<header :class="$style.panelHeader"><h2 :id="`${id}-federation`">{{ i18n.ts._dashboard.remoteInstances }}</h2><MkA to="/admin/federation" class="_link">{{ i18n.ts.details }} <i class="ti ti-chevron-right" aria-hidden="true"></i></MkA></header>
			<div :class="$style.panelBody"><XInstances :refreshKey="refreshKey"/></div>
		</section>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, shallowRef, useId } from 'vue';
import type { entities } from 'misskey-js';
import { useInterval } from '@@/js/use-interval.js';
import { timeZone } from '@@/js/intl-const.js';
import XActiveUsers from './overview.active-users.vue';
import XStats from './overview.stats.vue';
import XInstances from './overview.instances.vue';
import MkHeatmap from '@/components/MkHeatmap.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { instance } from '@/instance.js';
import number from '@/filters/number.js';
import bytes from '@/filters/bytes.js';

const id = useId();
const summary = shallowRef<entities.AdminOverviewResponse | null>(null);
const online = ref<number | null>(null);
const server = shallowRef<entities.AdminServerInfoResponse | null>(null);
type Queue = Pick<entities.AdminQueueQueuesResponse[number], 'name' | 'counts' | 'isPaused'>;
const queues = shallowRef<Queue[] | null>(null);
const failed = ref({ summary: false, online: false, queues: false, server: false });
const hasError = computed(() => Object.values(failed.value).some(Boolean));
const refreshing = ref(false);
const refreshKey = ref(0);
let controller: AbortController | null = null;

const federation = computed(() => summary.value?.settings.federation ?? instance.federation);
const federationEnabled = computed(() => federation.value === 'all' || federation.value === 'specified');
const federationLabel = computed(() => federation.value === 'all' ? i18n.ts._dashboard.federationAll : federation.value === 'specified' ? i18n.ts._dashboard.federationSpecified : i18n.ts._dashboard.federationOff);
const visibleQueues = computed(() => (queues.value ?? []).filter(queue => {
	// 已关闭的功能通常不展示；仍有积压或失败任务时保留入口，避免隐藏待处理工作。
	const hasWork = ['active', 'waiting', 'delayed', 'failed', 'paused'].some(key => queue.counts[key] > 0);
	if (hasWork || queue.isPaused) return true;
	if (queue.name === 'deliver' || queue.name === 'inbox') return federationEnabled.value;
	if (queue.name === 'objectStorage') return summary.value?.settings.objectStorageEnabled === true;
	if (queue.name === 'userWebhookDeliver' || queue.name === 'systemWebhookDeliver') return false;
	return true;
}));

async function refresh() {
	if (refreshing.value) return;
	refreshing.value = true;
	if (controller != null) refreshKey.value++;
	const current = new AbortController();
	controller = current;
	const signal = AbortSignal.any([current.signal, AbortSignal.timeout(20_000)]);
	const load = async <T,>(key: keyof typeof failed.value, request: Promise<T>, apply: (result: T) => void) => {
		try {
			const result = await request;
			if (current.signal.aborted) return;
			apply(result);
			failed.value[key] = false;
		} catch {
			if (!current.signal.aborted) failed.value[key] = true;
		}
	};
	// 各块独立显示，服务器信息较慢时不阻塞顶部统计、在线人数或队列。
	await Promise.all([
		load('summary', misskeyApi('admin/overview', { timeZone }, undefined, signal), result => { summary.value = result; }),
		load('online', misskeyApi('get-online-users-count', {}, undefined, signal), result => { online.value = result.count; }),
		load('queues', misskeyApi('admin/queue/queues', {}, undefined, signal), result => { queues.value = result.map(({ name, counts, isPaused }) => ({ name, counts, isPaused })); }),
		load('server', misskeyApi('admin/server-info', {}, undefined, signal), result => { server.value = result; }),
	]);
	if (current.signal.aborted) return;
	refreshing.value = false;
}

useInterval(() => { void refresh(); }, 60_000, { immediate: true, afterMounted: true });
onBeforeUnmount(() => controller?.abort());

definePage(() => ({ title: i18n.ts.dashboard, icon: 'ti ti-dashboard' }));
</script>

<style lang="scss" module>
.page {
	--MI-pageCardBg: var(--MI_THEME-bg);
	--MI-pageContentPadding: 0px;
	--MI-pageHeaderRadius: 0px;
}

.root { display: flex; flex-direction: column; gap: 20px; min-width: 0; container-type: inline-size; }
.columns { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); align-items: stretch; gap: 20px; }
.panel { min-width: 0; overflow: clip; background: var(--MI_THEME-panel); border-radius: var(--MI-cardRadius); }
.panelHeader { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; min-height: 52px; box-sizing: border-box; padding: 14px 20px; border-bottom: var(--MI-divider); }
.panelHeader h2 { margin: 0; color: var(--MI_THEME-fgHighlighted); font-size: .95em; font-weight: 600; }
.panelHeader > :not(h2) { color: var(--MI_THEME-fgTransparentWeak); font-size: .8em; }
.panelHeader > a:hover { color: var(--MI_THEME-accent); }
.panelBody { min-width: 0; padding: 20px; }
.trend { height: 330px; box-sizing: border-box; display: flex; }
.pending { padding: 4px 20px; }
.pendingItem { display: flex; align-items: center; gap: 12px; min-height: 62px; color: var(--MI_THEME-fg); }
.pendingItem + .pendingItem { border-top: var(--MI-divider); }
.pendingItem > i { color: var(--MI_THEME-fgTransparentWeak); }
.pendingItem > span { flex: 1; }
.pendingItem small { display: block; margin-top: 4px; color: var(--MI_THEME-fgTransparentWeak); font-size: .75em; }
.pendingItem strong { font-size: 1.4em; font-weight: 600; font-variant-numeric: tabular-nums; }
.pendingItem:hover { color: var(--MI_THEME-accent); text-decoration: none; }
.pendingItem:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
.configuration { padding: 16px 20px 20px; border-top: var(--MI-divider); }
.configuration h3 { margin: 0 0 14px; font-size: .85em; font-weight: 600; }
.settings, .runtime { display: flex; flex-direction: column; gap: 12px; margin: 0; font-size: .85em; }
.settings > div, .runtime > div { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
.settings dt, .runtime dt { flex-shrink: 0; color: var(--MI_THEME-fgTransparentWeak); }
.settings dd, .runtime dd { margin: 0; min-width: 0; text-align: end; overflow-wrap: anywhere; }
.runtime small { display: block; margin-top: 4px; color: var(--MI_THEME-fgTransparentWeak); font-size: .9em; line-height: 1.5; }
.runtime > div + div { padding-top: 10px; border-top: var(--MI-divider); }
.storage { margin-top: 20px; font-size: .8em; }
.storage > div { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; color: var(--MI_THEME-fgTransparentWeak); }
.storage > p { margin: 8px 0 0; color: var(--MI_THEME-fgTransparentWeak); line-height: 1.6; }
.storage progress { margin-top: 10px; }
.tableContainer { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; font-size: .8em; font-variant-numeric: tabular-nums; }
.table th, .table td { padding: 12px 14px; text-align: end; white-space: nowrap; border-bottom: var(--MI-divider); }
.table thead { background: var(--MI_THEME-panelHighlight); color: var(--MI_THEME-fgTransparentWeak); }
.table th { font-weight: 500; }
.table th:first-child { text-align: start; padding-inline-start: 20px; }
.table tbody tr:hover { background: var(--MI_THEME-panelHighlight); }
.table tbody tr:last-child > * { border-bottom: none; }
.badge { padding: 3px 6px; border-radius: 3px; color: var(--MI_THEME-success); background: color-mix(in srgb, var(--MI_THEME-success) 8%, transparent); font-size: .9em; }
.paused { color: var(--MI_THEME-warn); background: color-mix(in srgb, var(--MI_THEME-warn) 8%, transparent); }
.attention, .error { color: var(--MI_THEME-error); }
.error { margin: 0; font-size: .85em; }
.footnote { margin: 0; padding: 14px 20px; border-top: var(--MI-divider); color: var(--MI_THEME-fgTransparentWeak); font-size: .75em; line-height: 1.6; }
.muted { color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; }
.loading { display: grid; place-items: center; min-height: 210px; color: var(--MI_THEME-fgTransparentWeak); }

@container (max-width: 760px) {
	.columns { grid-template-columns: minmax(0, 1fr); gap: 16px; }
	.trend { height: 280px; }
	.panelHeader { padding-inline: 16px; }
	.panelBody { padding: 16px; }
}

</style>
