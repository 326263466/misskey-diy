<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :class="$style.adminScope" contentCard :actions="headerActions" :tabs="headerTabs" :swipable="true">
	<div v-if="instance" class="_pageBody">
		<div v-if="tab === 'overview'" class="_gaps_m">
			<div :class="$style.faviconAndName">
				<img v-if="faviconUrl" :src="faviconUrl" alt="" :class="$style.icon"/>
				<span :class="$style.name">{{ instance.name || `(${i18n.ts.unknown})` }}</span>
			</div>
			<div style="display: flex; flex-direction: column; gap: 1em;">
				<MkKeyValue :copy="host" oneline>
					<template #key>{{ i18n.ts.host }}</template>
					<template #value><span class="_monospace"><MkLink :url="`https://${host}`">{{ host }}</MkLink></span></template>
				</MkKeyValue>
				<MkKeyValue oneline>
					<template #key>{{ i18n.ts.software }}</template>
					<template #value><span class="_monospace">{{ instance.softwareName || `(${i18n.ts.unknown})` }} / {{ instance.softwareVersion || `(${i18n.ts.unknown})` }}</span></template>
				</MkKeyValue>
				<MkKeyValue oneline>
					<template #key>{{ i18n.ts.administrator }}</template>
					<template #value>{{ instance.maintainerName || `(${i18n.ts.unknown})` }} ({{ instance.maintainerEmail || `(${i18n.ts.unknown})` }})</template>
				</MkKeyValue>
			</div>
			<MkKeyValue>
				<template #key>{{ i18n.ts.description }}</template>
				<template #value>{{ instance.description }}</template>
			</MkKeyValue>

			<FormSection v-if="iAmModerator">
				<template #label>{{ i18n.ts.moderation }}</template>
				<div class="_gaps_s">
					<MkKeyValue>
						<template #key>
							{{ i18n.ts._delivery.status }}
						</template>
						<template #value>
							{{ i18n.ts._delivery._type[suspensionState] }}
						</template>
					</MkKeyValue>
					<MkButton v-if="suspensionState === 'none'" :disabled="!instance" danger @click="stopDelivery">{{ i18n.ts._delivery.stop }}</MkButton>
					<MkButton v-if="suspensionState !== 'none'" :disabled="!instance || suspensionState == 'softwareSuspended'" @click="resumeDelivery">{{ i18n.ts._delivery.resume }}</MkButton>
					<MkSwitch v-model="isBlocked" :disabled="!meta || !instance" @update:modelValue="toggleBlock">{{ i18n.ts.blockThisInstance }}</MkSwitch>
					<MkSwitch v-model="isSilenced" :disabled="!meta || !instance" @update:modelValue="toggleSilenced">{{ i18n.ts.silenceThisInstance }}</MkSwitch>
					<MkSwitch v-model="isMediaSilenced" :disabled="!meta || !instance" @update:modelValue="toggleMediaSilenced">{{ i18n.ts.mediaSilenceThisInstance }}</MkSwitch>
					<MkButton @click="refreshMetadata"><i class="ti ti-refresh"></i> {{ i18n.ts._instanceInfo.refreshMetadata }}</MkButton>
					<MkModerationNote v-model="moderationNote" :save="saveModerationNote"/>
				</div>
			</FormSection>

			<FormSection>
				<MkKeyValue oneline style="margin: 1em 0;">
					<template #key>{{ i18n.ts.registeredAt }}</template>
					<template #value><MkTime mode="detail" :time="instance.firstRetrievedAt"/></template>
				</MkKeyValue>
				<MkKeyValue oneline style="margin: 1em 0;">
					<template #key>{{ i18n.ts.updatedAt }}</template>
					<template #value><MkTime mode="detail" :time="instance.infoUpdatedAt"/></template>
				</MkKeyValue>
				<MkKeyValue oneline style="margin: 1em 0;">
					<template #key>{{ i18n.ts.latestRequestReceivedAt }}</template>
					<template #value><MkTime v-if="instance.latestRequestReceivedAt" :time="instance.latestRequestReceivedAt"/><span v-else>N/A</span></template>
				</MkKeyValue>
			</FormSection>

			<FormSection>
				<MkKeyValue oneline style="margin: 1em 0;">
					<template #key>{{ i18n.ts.following }} (Pub)</template>
					<template #value>{{ number(instance.followingCount) }}</template>
				</MkKeyValue>
				<MkKeyValue oneline style="margin: 1em 0;">
					<template #key>{{ i18n.ts.followers }} (Sub)</template>
					<template #value>{{ number(instance.followersCount) }}</template>
				</MkKeyValue>
			</FormSection>

			<FormSection>
				<template #label>Well-known resources</template>
				<FormLink :to="`https://${host}/.well-known/host-meta`" external style="margin-bottom: 8px;">host-meta</FormLink>
				<FormLink :to="`https://${host}/.well-known/host-meta.json`" external style="margin-bottom: 8px;">host-meta.json</FormLink>
				<FormLink :to="`https://${host}/.well-known/nodeinfo`" external style="margin-bottom: 8px;">nodeinfo</FormLink>
				<FormLink :to="`https://${host}/robots.txt`" external style="margin-bottom: 8px;">robots.txt</FormLink>
				<FormLink :to="`https://${host}/manifest.json`" external style="margin-bottom: 8px;">manifest.json</FormLink>
			</FormSection>
		</div>
		<div v-else-if="tab === 'chart'" class="_gaps_m">
			<div>
				<div :class="$style.selects">
					<MkSelect v-model="chartSrc" :items="chartSrcDef" style="margin: 0 10px 0 0; flex: 1;">
					</MkSelect>
				</div>
				<div>
					<div :class="$style.label">{{ i18n.tsx.recentNHours({ n: 90 }) }}</div>
					<MkChart :src="chartSrc" span="hour" :limit="90" :args="{ host: host }" :detailed="true"></MkChart>
					<div :class="$style.label">{{ i18n.tsx.recentNDays({ n: 90 }) }}</div>
					<MkChart :src="chartSrc" span="day" :limit="90" :args="{ host: host }" :detailed="true"></MkChart>
				</div>
			</div>
		</div>
		<div v-else-if="tab === 'users'" class="_gaps_m">
			<MkPagination v-slot="{ items }" :paginator="usersPaginator" paged>
				<div class="_adminTableContainer" tabindex="0" :aria-label="i18n.ts.users">
					<table class="_adminTable" :class="$style.usersTable">
						<colgroup>
							<col :class="$style.userColumn"/>
							<col :class="$style.descriptionColumn"/>
							<col :class="$style.statisticsColumn"/>
							<col :class="$style.dateColumn"/>
							<col :class="$style.dateColumn"/>
							<col :class="$style.stateColumn"/>
							<col :class="$style.actionsColumn"/>
						</colgroup>
						<thead>
							<tr>
								<th scope="col">{{ i18n.ts.user }}</th>
								<th scope="col">{{ i18n.ts.description }}</th>
								<th scope="col">{{ i18n.ts._adminUser.statistics }}</th>
								<th scope="col">{{ i18n.ts.registeredDate }}</th>
								<th scope="col" :title="i18n.ts._adminUser.lastPostedAtDescription">{{ i18n.ts.lastPostedAt }}</th>
								<th scope="col">{{ i18n.ts.state }}</th>
								<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="user in items" :key="user.id">
								<td>
									<MkA :to="`/admin/user/${user.id}`" behavior="window" class="_adminTableIdentity" :class="$style.userIdentity">
										<MkAvatar :user="user" class="_adminTableAvatar" :class="$style.userAvatar" indicator/>
										<div>
											<div :class="$style.ellipsis"><MkUserName :user="user" :nowrap="true"/></div>
											<div class="_adminTableSecondary _monospace" :class="$style.ellipsis" :title="`@${acct(user)}`">@{{ acct(user) }}</div>
										</div>
									</MkA>
									<div class="_adminTableSecondary _monospace _selectable" :class="$style.ellipsis" :title="`${i18n.ts.userId}: ${user.id}`">{{ user.id }}</div>
								</td>
								<td>
									<div v-if="user.description" :class="$style.description" :title="user.description"><Mfm :text="user.description" :author="user" :plain="true"/></div>
									<span v-else class="_adminTableSecondary">{{ i18n.ts.noAccountDescription }}</span>
								</td>
								<td>
									<div :class="$style.statistics">
										<div><span>{{ i18n.ts.notes }}</span><b>{{ number(user.notesCount) }}</b></div>
										<div><span>{{ i18n.ts.following }}</span><b>{{ number(user.followingCount) }}</b></div>
										<div><span>{{ i18n.ts.followers }}</span><b>{{ number(user.followersCount) }}</b></div>
									</div>
								</td>
								<td><MkTime :time="user.createdAt" mode="date"/><div class="_adminTableSecondary"><MkTime :time="user.createdAt"/></div></td>
								<td>
									<template v-if="user.updatedAt"><MkTime :key="user.updatedAt" :time="user.updatedAt" mode="date"/><div class="_adminTableSecondary"><MkTime :key="user.updatedAt" :time="user.updatedAt"/></div></template>
									<span v-else class="_adminTableSecondary">{{ i18n.ts.unknown }}</span>
								</td>
								<td>
									<span v-if="user.isSuspended" class="_adminTableStatus" style="--admin-statusColor: var(--MI_THEME-error)">{{ i18n.ts._userStatus.suspended }}</span>
									<span v-else-if="user.isSilenced" class="_adminTableStatus" style="--admin-statusColor: var(--MI_THEME-warn)">{{ i18n.ts._userStatus.silenced }}</span>
									<span v-else class="_adminTableStatus" style="--admin-statusColor: var(--MI_THEME-success)">{{ i18n.ts.normal }}</span>
									<div v-if="user.isBot || user.isLocked" :class="$style.accountFlags"><i v-if="user.isBot" class="ti ti-robot" role="img" :aria-label="i18n.ts._role._condition.isBot" :title="i18n.ts._role._condition.isBot"></i><i v-if="user.isLocked" class="ti ti-lock" role="img" :aria-label="i18n.ts._role._condition.isLocked" :title="i18n.ts._role._condition.isLocked"></i></div>
								</td>
								<td class="_adminTableActions"><MkA :to="`/admin/user/${user.id}`" behavior="window" class="_textButton">{{ i18n.ts.details }}</MkA></td>
							</tr>
						</tbody>
					</table>
				</div>
			</MkPagination>
		</div>
		<div v-else-if="tab === 'raw'" class="_gaps_m">
			<MkObjectView tall :value="instance">
			</MkObjectView>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import { acct } from '@@/js/user.js';
import MkChart from '@/components/MkChart.vue';
import MkObjectView from '@/components/MkObjectView.vue';
import FormLink from '@/components/form/link.vue';
import MkLink from '@/components/MkLink.vue';
import MkButton from '@/components/MkButton.vue';
import FormSection from '@/components/form/section.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import number from '@/filters/number.js';
import { iAmModerator, iAmAdmin } from '@/i.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import MkPagination from '@/components/MkPagination.vue';
import { getProxiedImageUrlNullable } from '@/utility/media-proxy.js';
import { useMkSelect } from '@/composables/use-mkselect.js';
import MkModerationNote from '@/components/MkModerationNote.vue';
import { Paginator } from '@/utility/paginator.js';

const props = defineProps<{
	host: string;
}>();

const tab = ref('overview');

const {
	model: chartSrc,
	def: chartSrcDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts._instanceCharts.requests, value: 'instance-requests' },
		{ label: i18n.ts._instanceCharts.users, value: 'instance-users' },
		{ label: i18n.ts._instanceCharts.usersTotal, value: 'instance-users-total' },
		{ label: i18n.ts._instanceCharts.notes, value: 'instance-notes' },
		{ label: i18n.ts._instanceCharts.notesTotal, value: 'instance-notes-total' },
		{ label: i18n.ts._instanceCharts.ff, value: 'instance-ff' },
		{ label: i18n.ts._instanceCharts.ffTotal, value: 'instance-ff-total' },
		{ label: i18n.ts._instanceCharts.cacheSize, value: 'instance-drive-usage' },
		{ label: i18n.ts._instanceCharts.cacheSizeTotal, value: 'instance-drive-usage-total' },
		{ label: i18n.ts._instanceCharts.files, value: 'instance-drive-files' },
		{ label: i18n.ts._instanceCharts.filesTotal, value: 'instance-drive-files-total' },
	],
	initialValue: 'instance-requests',
});
const meta = ref<Misskey.entities.AdminMetaResponse | null>(null);
const instance = ref<Misskey.entities.FederationInstance | null>(null);
const suspensionState = ref<'none' | 'manuallySuspended' | 'goneSuspended' | 'autoSuspendedForNotResponding' | 'softwareSuspended'>('none');
const isBlocked = ref(false);
const isSilenced = ref(false);
const isMediaSilenced = ref(false);
const faviconUrl = ref<string | null>(null);
const moderationNote = ref('');

const usersPaginator = iAmModerator ? markRaw(new Paginator('admin/show-users', {
	limit: 10,
	params: {
		sort: '+updatedAt',
		state: 'all',
		hostname: props.host,
	},
	offsetMode: true,
})) : markRaw(new Paginator('users', {
	limit: 10,
	params: {
		sort: '+updatedAt',
		state: 'all',
		hostname: props.host,
	},
	offsetMode: true,
}));

async function saveModerationNote(value: string): Promise<unknown> {
	if (!iAmModerator) throw new Error('Not a moderator');
	const host = instance.value?.host;
	if (!host) throw new Error('No instance host');
	return os.apiWithDialog('admin/federation/update-instance', { host, moderationNote: value });
}

async function _fetch_(): Promise<void> {
	if (iAmAdmin) {
		meta.value = await misskeyApi('admin/meta');
	}
	instance.value = await misskeyApi('federation/show-instance', {
		host: props.host,
	});
	suspensionState.value = instance.value?.suspensionState ?? 'none';
	isBlocked.value = instance.value?.isBlocked ?? false;
	isSilenced.value = instance.value?.isSilenced ?? false;
	isMediaSilenced.value = instance.value?.isMediaSilenced ?? false;
	faviconUrl.value = getProxiedImageUrlNullable(instance.value?.faviconUrl, 'preview') ?? getProxiedImageUrlNullable(instance.value?.iconUrl, 'preview');
	moderationNote.value = instance.value?.moderationNote ?? '';
}

// 开关不提示；失败时还原开关
function onToggleError(target: { value: boolean }) {
	return () => {
		target.value = !target.value;
	};
}

async function toggleBlock(): Promise<void> {
	if (!iAmAdmin) return;
	if (!meta.value) throw new Error('No meta?');
	if (!instance.value) throw new Error('No instance?');
	const { host } = instance.value;
	await misskeyApi('admin/update-meta', {
		blockedHosts: isBlocked.value ? meta.value.blockedHosts.concat([host]) : meta.value.blockedHosts.filter(x => x !== host),
	}).catch(onToggleError(isBlocked));
}

async function toggleSilenced(): Promise<void> {
	if (!iAmAdmin) return;
	if (!meta.value) throw new Error('No meta?');
	if (!instance.value) throw new Error('No instance?');
	const { host } = instance.value;
	const silencedHosts = meta.value.silencedHosts ?? [];
	await misskeyApi('admin/update-meta', {
		silencedHosts: isSilenced.value ? silencedHosts.concat([host]) : silencedHosts.filter(x => x !== host),
	}).catch(onToggleError(isSilenced));
}

async function toggleMediaSilenced(): Promise<void> {
	if (!iAmAdmin) return;
	if (!meta.value) throw new Error('No meta?');
	if (!instance.value) throw new Error('No instance?');
	const { host } = instance.value;
	const mediaSilencedHosts = meta.value.mediaSilencedHosts ?? [];
	await misskeyApi('admin/update-meta', {
		mediaSilencedHosts: isMediaSilenced.value ? mediaSilencedHosts.concat([host]) : mediaSilencedHosts.filter(x => x !== host),
	}).catch(onToggleError(isMediaSilenced));
}

async function stopDelivery(): Promise<void> {
	if (!iAmModerator) return;
	if (!instance.value) throw new Error('No instance?');
	const previous = suspensionState.value;
	suspensionState.value = 'manuallySuspended';
	await misskeyApi('admin/federation/update-instance', {
		host: instance.value.host,
		isSuspended: true,
	}).catch(error => {
		// 按钮状态即为成功反馈；失败时还原并提示
		suspensionState.value = previous;
		if (!isAccountSessionErrorHandled(error)) os.toast(i18n.ts.somethingHappened, 'error');
	});
}

async function resumeDelivery(): Promise<void> {
	if (!iAmModerator) return;
	if (!instance.value) throw new Error('No instance?');
	const previous = suspensionState.value;
	suspensionState.value = 'none';
	await misskeyApi('admin/federation/update-instance', {
		host: instance.value.host,
		isSuspended: false,
	}).catch(error => {
		// 按钮状态即为成功反馈；失败时还原并提示
		suspensionState.value = previous;
		if (!isAccountSessionErrorHandled(error)) os.toast(i18n.ts.somethingHappened, 'error');
	});
}

function refreshMetadata(): void {
	if (!iAmModerator) return;
	if (!instance.value) throw new Error('No instance?');
	// 失败提示由 apiWithDialog 处理
	os.apiWithDialog('admin/federation/refresh-remote-instance-metadata', {
		host: instance.value.host,
	}).then(() => {
		os.toast(i18n.ts._instanceInfo.refreshRequested, 'success');
	}, () => {});
}

_fetch_();

const headerActions = computed(() => [{
	text: `https://${props.host}`,
	icon: 'ti ti-external-link',
	handler: () => {
		window.open(`https://${props.host}`, '_blank', 'noopener');
	},
}]);

const headerTabs = computed(() => [{
	key: 'overview',
	title: i18n.ts.overview,
	icon: 'ti ti-info-circle',
}, ...(iAmModerator ? [{
	key: 'chart',
	title: i18n.ts.charts,
	icon: 'ti ti-chart-line',
}, {
	key: 'users',
	title: i18n.ts.users,
	icon: 'ti ti-users',
}] : []), {
	key: 'raw',
	title: i18n.ts.rawData,
	icon: 'ti ti-code',
}]);

definePage(() => ({
	title: props.host,
	icon: 'ti ti-server',
}));
</script>

<style lang="scss" module>
@use './admin/table.scss' as admin-table;

@include admin-table.styles;

.faviconAndName {
	display: flex;
	align-items: center;
}
.icon {
	display: block;
	margin: 0 16px 0 0;
	height: 64px;
	border-radius: 8px;
}
.name {
	word-break: break-all;
}
.selects {
	display: flex;
	margin: 0 0 16px 0;
}
.label {
	margin-bottom: 12px;
	font-weight: bold;
}
.usersTable {
	table-layout: fixed;
	min-width: 1120px;
}
.userColumn { width: 220px; }
.descriptionColumn { width: 220px; }
.statisticsColumn { width: 160px; }
.dateColumn { width: 150px; }
.stateColumn { width: 120px; }
.actionsColumn { width: 100px; }
.userIdentity { min-width: 0; }
.userAvatar { width: 32px; height: 32px; }
.ellipsis {
	display: block;
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.description {
	display: -webkit-box;
	-webkit-line-clamp: 3;
	-webkit-box-orient: vertical;
	overflow: hidden;
	word-break: break-word;
}
.statistics {
	display: grid;
	gap: 3px;

	> div { display: flex; justify-content: space-between; gap: 8px; }
	span { color: var(--MI_THEME-fgTransparentWeak); }
	b { font-weight: 500; font-variant-numeric: tabular-nums; }
}
.accountFlags {
	display: flex;
	gap: 8px;
	margin-top: 6px;
	color: var(--MI_THEME-fgTransparentWeak);
}
</style>
