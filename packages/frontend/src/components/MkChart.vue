<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<!-- 高度按比例预留，加载前后不改变布局。 -->
	<div :class="$style.chart" :style="{ aspectRatio: String(aspectRatio ?? 2.5) }">
		<MkEChart :option="option" :ariaLabel="ariaLabel"/>
	</div>
	<div v-if="fetching" :class="$style.fetching">
		<MkLoading/>
	</div>
</div>
</template>

<script lang="ts">
export type ChartSrc =
	| 'federation'
	| 'ap-request'
	| 'users'
	| 'users-total'
	| 'active-users'
	| 'notes'
	| 'local-notes'
	| 'remote-notes'
	| 'notes-total'
	| 'drive'
	| 'drive-files'
	| 'instance-requests'
	| 'instance-users'
	| 'instance-users-total'
	| 'instance-notes'
	| 'instance-notes-total'
	| 'instance-ff'
	| 'instance-ff-total'
	| 'instance-drive-usage'
	| 'instance-drive-usage-total'
	| 'instance-drive-files'
	| 'instance-drive-files-total'
	| 'per-user-notes'
	| 'per-user-pv'
	| 'per-user-following'
	| 'per-user-followers'
	| 'per-user-drive';
</script>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkEChart from '@/components/MkEChart.vue';
import { misskeyApiGet } from '@/utility/misskey-api.js';
import { areaGradient, chartColors, chartGrid } from '@/utility/echarts.js';
import date, { dateOnly } from '@/filters/date.js';
import bytes from '@/filters/bytes.js';
import number from '@/filters/number.js';
import { formatChartDate } from '@/utility/chart-date.js';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	src: ChartSrc;
	args?: {
		host?: string;
		user?: Misskey.entities.UserLite;
		withoutAll?: boolean;
	};
	limit?: number;
	span: 'hour' | 'day';
	detailed?: boolean;
	stacked?: boolean;
	bar?: boolean;
	aspectRatio?: number | null;
	nowForChromatic?: number;
}>(), {
	args: undefined,
	limit: 90,
	detailed: false,
	stacked: false,
	bar: false,
	aspectRatio: null,

	/**
	 * @desc Overwrites current date to fix background lines of chart.
	 * @ignore Only used for Chromatic. Don't use this for production.
	 * @see https://github.com/misskey-dev/misskey/pull/13830#issuecomment-2155886151
	 */
	nowForChromatic: undefined,
});

/** 颜色用主题语义：数字是分类配色序号（0 为主题色），其余对应成功、警告、错误等状态色。 */
type SeriesColor = number | 'warn' | 'error' | 'muted';

type ChartData = {
	series: {
		name: string;
		/** line 只画线，用于合计、净值等参考线；area 带填充，用于构成部分。 */
		type: 'line' | 'area';
		color?: SeriesColor;
		dashed?: boolean;
		hidden?: boolean;
		/** 接口返回的原始顺序：最新的在前。 */
		data: number[];
	}[];
	bytes?: boolean;
};

const sum = (...arr: number[][]) => arr.reduce((r, a) => r.map((b, i) => a[i] + b));
const negate = (arr: number[]) => arr.map((x) => -x);
// 各数据源直接沿用接口数组，渲染时再统一配上日期。
const values = (arr: number[]) => arr;

// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const now = props.nowForChromatic != null ? new Date(props.nowForChromatic) : new Date();
const chartData = shallowRef<ChartData | null>(null);
const fetching = ref(true);
let request = 0;
let disposed = false;

const getDate = (ago: number) => {
	const y = now.getFullYear();
	const m = now.getMonth();
	const d = now.getDate();
	const h = now.getHours();

	return props.span === 'day' ? new Date(y, m, d - ago) : new Date(y, m, d, h - ago);
};

const ariaLabel = computed(() => chartData.value?.series.map(x => x.name).join('，') ?? '');

const formatValue = (value: number) => chartData.value?.bytes ? bytes(value * 1000, 1) : number(value);

// 按天看时横轴标日期；按小时看时零点标日期，其余标整点。
function axisLabel(value: number) {
	const time = new Date(value);
	if (props.span === 'day' || (time.getHours() === 0 && time.getMinutes() === 0)) return formatChartDate(value);
	return `${time.getHours()}:00`;
}

const option = computed(() => {
	const c = chartColors.value;
	const data = chartData.value;
	const colorOf = (color: SeriesColor | undefined, index: number) => {
		if (color === 'warn' || color === 'error') return c[color];
		if (color === 'muted') return c.weak;
		const n = color ?? index;
		return n === 0 ? c.accent : c.series(n);
	};
	const series = (data?.series ?? []).map((x, index) => {
		const color = colorOf(x.color, index);
		// 接口数据从新到旧，画图时从旧到新。
		const points = x.data.slice(0, props.limit).map((value, ago) => [getDate(ago).getTime(), value]).reverse();
		if (props.bar) {
			return {
				type: 'bar', name: x.name, data: points, stack: props.stacked ? 'total' : undefined,
				barMaxWidth: 12, itemStyle: { color, borderRadius: props.stacked ? 0 : [2, 2, 0, 0] },
				emphasis: { focus: 'series' },
			};
		}
		return {
			type: 'line', name: x.name, data: points, stack: props.stacked ? 'total' : undefined,
			smooth: 0.3, smoothMonotone: 'x', showSymbol: false, symbolSize: 6,
			lineStyle: { width: 2, color, type: x.dashed ? 'dashed' : 'solid' }, itemStyle: { color },
			// 多条面积叠在一起时降低填充，避免互相遮住。
			areaStyle: x.type === 'area' ? { color: areaGradient(color, (data?.series.length ?? 0) > 3 ? 0.15 : 0.25) } : undefined,
		};
	});
	return {
		// 详细模式底部留出图例位置。
		grid: { ...chartGrid, left: props.detailed ? 4 : 0, right: props.detailed ? 12 : 0, top: 8, bottom: props.detailed ? 32 : 0 },
		legend: props.detailed ? {
			type: 'scroll', bottom: 0,
			selected: Object.fromEntries((data?.series ?? []).map(x => [x.name, !x.hidden])),
		} : { show: false },
		tooltip: {
			trigger: 'axis',
			axisPointer: { type: props.bar ? 'shadow' : 'line' },
			formatter: (params: { axisValue: number; marker: string; seriesName: string; value: [number, number] }[]) => {
				const time = params[0]?.axisValue;
				const title = time == null ? '' : props.span === 'day' ? dateOnly(time) : date(time);
				const rows = params.map(item => `<div style="display:flex;gap:16px;justify-content:space-between"><span>${item.marker}${item.seriesName}</span><b>${formatValue(item.value[1])}</b></div>`);
				return `<div style="margin-bottom:4px;opacity:.7">${title}</div>${rows.join('')}`;
			},
		},
		// 详细模式支持滚轮缩放、拖动平移，替代原来的缩放插件。
		dataZoom: props.detailed ? [{ type: 'inside', filterMode: 'none' }] : [],
		xAxis: {
			type: 'time',
			axisLabel: { show: props.detailed, hideOverlap: true, formatter: axisLabel },
			axisLine: { show: props.detailed },
			splitLine: { show: false },
		},
		yAxis: {
			type: 'value',
			axisLabel: { show: props.detailed, formatter: formatValue },
			splitLine: { show: props.detailed },
		},
		series,
	};
});
const fetchFederationChart = async (): Promise<ChartData | null> => {
	const raw = await misskeyApiGet('charts/federation', { limit: props.limit, span: props.span });
	return {
		series: [{
			name: i18n.ts._chartSeries.federationReceived,
			type: 'area',
			data: values(raw.inboxInstances),
			color: 0,
		}, {
			name: i18n.ts._chartSeries.federationDelivered,
			type: 'area',
			data: values(raw.deliveredInstances),
			color: 1,
		}, {
			name: i18n.ts._chartSeries.federationStalled,
			type: 'area',
			data: values(raw.stalled),
			color: 'error',
		}, {
			name: i18n.ts._chartSeries.federationPubActive,
			type: 'line',
			data: values(raw.pubActive),
			color: 2,
		}, {
			name: i18n.ts._chartSeries.federationSubActive,
			type: 'line',
			data: values(raw.subActive),
			color: 3,
		}, {
			name: i18n.ts._chartSeries.federationPubSub,
			type: 'line',
			data: values(raw.pubsub),
			dashed: true,
			color: 5,
		}, {
			name: i18n.ts._chartSeries.federationPub,
			type: 'line',
			data: values(raw.pub),
			dashed: true,
			color: 2,
		}, {
			name: i18n.ts._chartSeries.federationSub,
			type: 'line',
			data: values(raw.sub),
			dashed: true,
			color: 3,
		}],
	};
};

const fetchApRequestChart = async (): Promise<ChartData | null> => {
	const raw = await misskeyApiGet('charts/ap-request', { limit: props.limit, span: props.span });
	return {
		series: [{
			name: i18n.ts._dashboard.apIn,
			type: 'area',
			color: 0,
			data: values(raw.inboxReceived),
		}, {
			name: i18n.ts._dashboard.apOutSucceeded,
			type: 'area',
			color: 1,
			data: values(raw.deliverSucceeded),
		}, {
			name: i18n.ts._dashboard.apOutFailed,
			type: 'area',
			color: 'error',
			data: values(raw.deliverFailed),
		}],
	};
};

const fetchNotesChart = async (type: 'local' | 'remote' | 'combined'): Promise<ChartData | null> => {
	const raw = await misskeyApiGet('charts/notes', { limit: props.limit, span: props.span });
	return {
		series: [{
			name: i18n.ts.all,
			type: 'line',
			data: values(type === 'combined'
				? sum(raw.local.inc, negate(raw.local.dec), raw.remote.inc, negate(raw.remote.dec))
				: sum(raw[type].inc, negate(raw[type].dec)),
			),
			color: 'muted',
		}, {
			name: i18n.ts.renotes,
			type: 'area',
			data: values(type === 'combined'
				? sum(raw.local.diffs.renote, raw.remote.diffs.renote)
				: raw[type].diffs.renote,
			),
			color: 1,
		}, {
			name: i18n.ts.replies,
			type: 'area',
			data: values(type === 'combined'
				? sum(raw.local.diffs.reply, raw.remote.diffs.reply)
				: raw[type].diffs.reply,
			),
			color: 'warn',
		}, {
			name: i18n.ts._chartSeries.notesNormal,
			type: 'area',
			data: values(type === 'combined'
				? sum(raw.local.diffs.normal, raw.remote.diffs.normal)
				: raw[type].diffs.normal,
			),
			color: 0,
		}, {
			name: i18n.ts._chartSeries.notesWithFile,
			type: 'area',
			data: values(type === 'combined'
				? sum(raw.local.diffs.withFile, raw.remote.diffs.withFile)
				: raw[type].diffs.withFile,
			),
			color: 2,
		}],
	};
};

const fetchNotesTotalChart = async (): Promise<ChartData | null> => {
	const raw = await misskeyApiGet('charts/notes', { limit: props.limit, span: props.span });
	return {
		series: [{
			name: i18n.ts._chartSeries.combined,
			type: 'line',
			data: values(sum(raw.local.total, raw.remote.total)),
		}, {
			name: i18n.ts.local,
			type: 'area',
			data: values(raw.local.total),
		}, {
			name: i18n.ts.remote,
			type: 'area',
			data: values(raw.remote.total),
		}],
	};
};

const fetchUsersChart = async (total: boolean): Promise<ChartData | null> => {
	const raw = await misskeyApiGet('charts/users', { limit: props.limit, span: props.span });
	return {
		series: [{
			name: i18n.ts._chartSeries.combined,
			type: 'line',
			data: values(total
				? sum(raw.local.total, raw.remote.total)
				: sum(raw.local.inc, negate(raw.local.dec), raw.remote.inc, negate(raw.remote.dec)),
			),
		}, {
			name: i18n.ts.local,
			type: 'area',
			data: values(total
				? raw.local.total
				: sum(raw.local.inc, negate(raw.local.dec)),
			),
		}, {
			name: i18n.ts.remote,
			type: 'area',
			data: values(total
				? raw.remote.total
				: sum(raw.remote.inc, negate(raw.remote.dec)),
			),
		}],
	};
};

const fetchActiveUsersChart = async (): Promise<ChartData | null> => {
	const raw = await misskeyApiGet('charts/active-users', { limit: props.limit, span: props.span });
	return {
		series: [{
			name: i18n.ts._chartSeries.activeReadWrite,
			type: 'area',
			data: values(raw.readWrite),
		}, {
			name: i18n.ts._dashboard.write,
			type: 'area',
			data: values(raw.write),
		}, {
			name: i18n.ts._dashboard.read,
			type: 'area',
			data: values(raw.read),
		}, {
			name: i18n.ts._chartSeries.activeRegisteredWithinWeek,
			type: 'area',
			data: values(raw.registeredWithinWeek),
		}, {
			name: i18n.ts._chartSeries.activeRegisteredWithinMonth,
			type: 'area',
			data: values(raw.registeredWithinMonth),
		}, {
			name: i18n.ts._chartSeries.activeRegisteredWithinYear,
			type: 'area',
			data: values(raw.registeredWithinYear),
		}, {
			name: i18n.ts._chartSeries.activeRegisteredOutsideWeek,
			type: 'area',
			data: values(raw.registeredOutsideWeek),
		}, {
			name: i18n.ts._chartSeries.activeRegisteredOutsideMonth,
			type: 'area',
			data: values(raw.registeredOutsideMonth),
		}, {
			name: i18n.ts._chartSeries.activeRegisteredOutsideYear,
			type: 'area',
			data: values(raw.registeredOutsideYear),
		}],
	};
};

const fetchDriveChart = async (): Promise<ChartData | null> => {
	const raw = await misskeyApiGet('charts/drive', { limit: props.limit, span: props.span });
	return {
		bytes: true,
		series: [{
			name: i18n.ts.all,
			type: 'line',
			dashed: true,
			data: values(
				sum(
					raw.local.incSize,
					negate(raw.local.decSize),
					raw.remote.incSize,
					negate(raw.remote.decSize),
				),
			),
		}, {
			name: i18n.ts._chartSeries.localInc,
			type: 'area',
			data: values(raw.local.incSize),
		}, {
			name: i18n.ts._chartSeries.localDec,
			type: 'area',
			data: values(negate(raw.local.decSize)),
		}, {
			name: i18n.ts._chartSeries.remoteInc,
			type: 'area',
			data: values(raw.remote.incSize),
		}, {
			name: i18n.ts._chartSeries.remoteDec,
			type: 'area',
			data: values(negate(raw.remote.decSize)),
		}],
	};
};

const fetchDriveFilesChart = async (): Promise<ChartData | null> => {
	const raw = await misskeyApiGet('charts/drive', { limit: props.limit, span: props.span });
	return {
		series: [{
			name: i18n.ts.all,
			type: 'line',
			dashed: true,
			data: values(
				sum(
					raw.local.incCount,
					negate(raw.local.decCount),
					raw.remote.incCount,
					negate(raw.remote.decCount),
				),
			),
		}, {
			name: i18n.ts._chartSeries.localInc,
			type: 'area',
			data: values(raw.local.incCount),
		}, {
			name: i18n.ts._chartSeries.localDec,
			type: 'area',
			data: values(negate(raw.local.decCount)),
		}, {
			name: i18n.ts._chartSeries.remoteInc,
			type: 'area',
			data: values(raw.remote.incCount),
		}, {
			name: i18n.ts._chartSeries.remoteDec,
			type: 'area',
			data: values(negate(raw.remote.decCount)),
		}],
	};
};

const fetchInstanceRequestsChart = async (): Promise<ChartData | null> => {
	const host = props.args?.host;
	if (host == null) return { series: [] };

	const raw = await misskeyApiGet('charts/instance', { host: host, limit: props.limit, span: props.span });
	return {
		series: [{
			name: i18n.ts._dashboard.apIn,
			type: 'area',
			color: 0,
			data: values(raw.requests.received),
		}, {
			name: i18n.ts._dashboard.apOutSucceeded,
			type: 'area',
			color: 1,
			data: values(raw.requests.succeeded),
		}, {
			name: i18n.ts._dashboard.apOutFailed,
			type: 'area',
			color: 'error',
			data: values(raw.requests.failed),
		}],
	};
};

const fetchInstanceUsersChart = async (total: boolean): Promise<ChartData | null> => {
	const host = props.args?.host;
	if (host == null) return { series: [] };

	const raw = await misskeyApiGet('charts/instance', { host: host, limit: props.limit, span: props.span });
	return {
		series: [{
			name: i18n.ts.users,
			type: 'area',
			color: 0,
			data: values(total
				? raw.users.total
				: sum(raw.users.inc, negate(raw.users.dec)),
			),
		}],
	};
};

const fetchInstanceNotesChart = async (total: boolean): Promise<ChartData | null> => {
	const host = props.args?.host;
	if (host == null) return { series: [] };

	const raw = await misskeyApiGet('charts/instance', { host: host, limit: props.limit, span: props.span });
	return {
		series: [{
			name: i18n.ts.notes,
			type: 'area',
			color: 0,
			data: values(total
				? raw.notes.total
				: sum(raw.notes.inc, negate(raw.notes.dec)),
			),
		}],
	};
};

const fetchInstanceFfChart = async (total: boolean): Promise<ChartData | null> => {
	const host = props.args?.host;
	if (host == null) return { series: [] };

	const raw = await misskeyApiGet('charts/instance', { host: host, limit: props.limit, span: props.span });
	return {
		series: [{
			name: i18n.ts.following,
			type: 'area',
			color: 0,
			data: values(total
				? raw.following.total
				: sum(raw.following.inc, negate(raw.following.dec)),
			),
		}, {
			name: i18n.ts.followers,
			type: 'area',
			color: 1,
			data: values(total
				? raw.followers.total
				: sum(raw.followers.inc, negate(raw.followers.dec)),
			),
		}],
	};
};

const fetchInstanceDriveUsageChart = async (total: boolean): Promise<ChartData | null> => {
	const host = props.args?.host;
	if (host == null) return { series: [] };

	const raw = await misskeyApiGet('charts/instance', { host: host, limit: props.limit, span: props.span });
	return {
		bytes: true,
		series: [{
			name: i18n.ts.driveUsage,
			type: 'area',
			color: 0,
			data: values(total
				? sum(raw.drive.incUsage)
				: sum(raw.drive.incUsage, negate(raw.drive.decUsage)),
			),
		}],
	};
};

const fetchInstanceDriveFilesChart = async (total: boolean): Promise<ChartData | null> => {
	const host = props.args?.host;
	if (host == null) return { series: [] };

	const raw = await misskeyApiGet('charts/instance', { host: host, limit: props.limit, span: props.span });
	return {
		series: [{
			name: i18n.ts._chartSeries.driveFiles,
			type: 'area',
			color: 0,
			data: values(total
				? raw.drive.totalFiles
				: sum(raw.drive.incFiles, negate(raw.drive.decFiles)),
			),
		}],
	};
};

const fetchPerUserNotesChart = async (): Promise<ChartData | null> => {
	const userId = props.args?.user?.id;
	if (userId == null) return { series: [] };

	const raw = await misskeyApiGet('charts/user/notes', { userId: userId, limit: props.limit, span: props.span });
	const all: ChartData['series'] = props.args?.withoutAll ? [] : [{
		name: i18n.ts.all,
		type: 'line',
		data: values(sum(raw.inc, negate(raw.dec))),
		color: 'muted',
	}];
	return {
		series: [...all, {
			name: i18n.ts._chartSeries.notesWithFile,
			type: 'area',
			data: values(raw.diffs.withFile),
			color: 2,
		}, {
			name: i18n.ts.renotes,
			type: 'area',
			data: values(raw.diffs.renote),
			color: 1,
		}, {
			name: i18n.ts.replies,
			type: 'area',
			data: values(raw.diffs.reply),
			color: 'warn',
		}, {
			name: i18n.ts._chartSeries.notesNormal,
			type: 'area',
			data: values(raw.diffs.normal),
			color: 0,
		}],
	};
};

const fetchPerUserPvChart = async (): Promise<ChartData | null> => {
	const userId = props.args?.user?.id;
	if (userId == null) return { series: [] };

	const raw = await misskeyApiGet('charts/user/pv', { userId: userId, limit: props.limit, span: props.span });
	return {
		series: [{
			name: i18n.ts._chartSeries.uniquePvUser,
			type: 'area',
			data: values(raw.upv.user),
			color: 2,
		}, {
			name: i18n.ts._chartSeries.pvUser,
			type: 'area',
			data: values(raw.pv.user),
			color: 1,
		}, {
			name: i18n.ts._chartSeries.uniquePvVisitor,
			type: 'area',
			data: values(raw.upv.visitor),
			color: 'warn',
		}, {
			name: i18n.ts._chartSeries.pvVisitor,
			type: 'area',
			data: values(raw.pv.visitor),
			color: 0,
		}],
	};
};

const fetchPerUserFollowingChart = async (): Promise<ChartData | null> => {
	const userId = props.args?.user?.id;
	if (userId == null) return { series: [] };

	const raw = await misskeyApiGet('charts/user/following', { userId: userId, limit: props.limit, span: props.span });
	return {
		series: [{
			name: i18n.ts.local,
			type: 'area',
			data: values(raw.local.followings.total),
		}, {
			name: i18n.ts.remote,
			type: 'area',
			data: values(raw.remote.followings.total),
		}],
	};
};

const fetchPerUserFollowersChart = async (): Promise<ChartData | null> => {
	const userId = props.args?.user?.id;
	if (userId == null) return { series: [] };

	const raw = await misskeyApiGet('charts/user/following', { userId: userId, limit: props.limit, span: props.span });
	return {
		series: [{
			name: i18n.ts.local,
			type: 'area',
			data: values(raw.local.followers.total),
		}, {
			name: i18n.ts.remote,
			type: 'area',
			data: values(raw.remote.followers.total),
		}],
	};
};

const fetchPerUserDriveChart = async (): Promise<ChartData | null> => {
	const userId = props.args?.user?.id;
	if (userId == null) return { series: [] };

	const raw = await misskeyApiGet('charts/user/drive', { userId: userId, limit: props.limit, span: props.span });
	return {
		bytes: true,
		series: [{
			name: i18n.ts._chartSeries.inc,
			type: 'area',
			data: values(raw.incSize),
		}, {
			name: i18n.ts._chartSeries.dec,
			type: 'area',
			data: values(raw.decSize),
		}],
	};
};

async function fetchData(): Promise<ChartData | null> {
	switch (props.src) {
		case 'federation': return fetchFederationChart();
		case 'ap-request': return fetchApRequestChart();
		case 'users': return fetchUsersChart(false);
		case 'users-total': return fetchUsersChart(true);
		case 'active-users': return fetchActiveUsersChart();
		case 'notes': return fetchNotesChart('combined');
		case 'local-notes': return fetchNotesChart('local');
		case 'remote-notes': return fetchNotesChart('remote');
		case 'notes-total': return fetchNotesTotalChart();
		case 'drive': return fetchDriveChart();
		case 'drive-files': return fetchDriveFilesChart();
		case 'instance-requests': return fetchInstanceRequestsChart();
		case 'instance-users': return fetchInstanceUsersChart(false);
		case 'instance-users-total': return fetchInstanceUsersChart(true);
		case 'instance-notes': return fetchInstanceNotesChart(false);
		case 'instance-notes-total': return fetchInstanceNotesChart(true);
		case 'instance-ff': return fetchInstanceFfChart(false);
		case 'instance-ff-total': return fetchInstanceFfChart(true);
		case 'instance-drive-usage': return fetchInstanceDriveUsageChart(false);
		case 'instance-drive-usage-total': return fetchInstanceDriveUsageChart(true);
		case 'instance-drive-files': return fetchInstanceDriveFilesChart(false);
		case 'instance-drive-files-total': return fetchInstanceDriveFilesChart(true);

		case 'per-user-notes': return fetchPerUserNotesChart();
		case 'per-user-pv': return fetchPerUserPvChart();
		case 'per-user-following': return fetchPerUserFollowingChart();
		case 'per-user-followers': return fetchPerUserFollowersChart();
		case 'per-user-drive': return fetchPerUserDriveChart();

		default: return null;
	}
}

async function fetchAndRender() {
	const current = ++request;
	fetching.value = true;
	const result = await fetchData();
	// 切换数据源时只采用最后一次请求的结果。
	if (disposed || current !== request) return;
	chartData.value = result;
	fetching.value = false;
}

watch(() => [props.src, props.span], fetchAndRender);

onMounted(() => {
	fetchAndRender();
});

onUnmounted(() => {
	disposed = true;
});
</script>

<style lang="scss" module>
.root {
	position: relative;
}

.chart {
	width: 100%;
	min-height: 0;
}

.fetching {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	-webkit-backdrop-filter: var(--MI-blur, blur(12px));
	backdrop-filter: var(--MI-blur, blur(12px));
	display: flex;
	justify-content: center;
	align-items: center;
	cursor: wait;
}
</style>
