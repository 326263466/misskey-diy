<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component :is="embedded ? 'div' : 'PageWithHeader'">
	<div :class="{ _pageBody: !embedded }">
		<div class="_gaps_m">
			<div :class="$style.dashboard">
				<section class="_panel _gaps" :class="$style.section" :aria-label="i18n.ts._checkin.grantCards">
					<h2>{{ i18n.ts._checkin.grantCards }}</h2>
					<p :class="$style.description">{{ i18n.ts._checkin.grantDescription }}</p>
					<div :class="$style.controls">
						<MkButton :disabled="selecting || loading || granting || revokingBatchId != null" @click="selectUser"><i class="ti ti-user-search" aria-hidden="true"></i> {{ i18n.ts.selectUser }}</MkButton>
						<MkButton v-if="user" :disabled="selecting || loading || granting || revokingBatchId != null" @click="clearUser">{{ i18n.ts.clear }}</MkButton>
					</div>
					<template v-if="user">
						<MkUserCardMini :user="user" :withChart="false"/>
						<MkLoading v-if="loading"/>
						<div v-else-if="error" class="_gaps_s" role="alert">
							<MkInfo warn>{{ error }}</MkInfo>
							<MkButton @click="loadUser(user)">{{ i18n.ts.retry }}</MkButton>
						</div>
						<MkCheckinCardGrant v-else-if="info" :key="user.id" v-model:makeupCards="info.checkinMakeupCards" v-model:busy="granting" :userId="user.id" :points="info.checkinPoints" :disabled="revokingBatchId != null" @granted="refreshDashboard"/>
					</template>
				</section>
				<section class="_panel _gaps" :class="$style.section" :aria-label="i18n.ts._checkin.grantOverview">
					<div :class="$style.heading">
						<h2>{{ i18n.ts._checkin.grantOverview }}</h2>
						<MkButton small :disabled="statsLoading || recordsLoading" @click="refreshDashboard">{{ i18n.ts.reload }}</MkButton>
					</div>
					<div :class="$style.controls" role="group" :aria-label="i18n.ts.filter">
						<MkButton small :active="!selectedOnly" :aria-pressed="!selectedOnly" @click="selectedOnly = false">{{ i18n.ts._checkin.grantScopeAll }}</MkButton>
						<MkButton small :active="selectedOnly" :aria-pressed="selectedOnly" :disabled="!user" @click="selectedOnly = true">{{ i18n.ts._checkin.grantScopeSelected }}</MkButton>
					</div>
					<p v-if="selectedOnly && user" :class="$style.scope">@{{ user.username }}</p>
					<MkLoading v-if="statsLoading"/>
					<div v-else-if="statsError" class="_gaps_s" role="alert">
						<MkInfo warn>{{ i18n.ts._checkin.grantDashboardLoadFailed }}</MkInfo>
						<MkButton @click="loadStats">{{ i18n.ts.retry }}</MkButton>
					</div>
					<template v-else-if="stats">
						<dl :class="$style.metrics" data-testid="checkin-admin-stats">
							<div v-for="metric in metrics" :key="metric.key"><dt>{{ metric.label }}</dt><dd :data-testid="`checkin-admin-${metric.key}`">{{ stats[metric.key].toLocaleString() }}</dd></div>
						</dl>
						<dl :class="$style.substats">
							<div><dt>{{ i18n.ts._checkin.grantCount }}</dt><dd>{{ stats.grantCount.toLocaleString() }}</dd></div>
							<div><dt>{{ i18n.ts._checkin.cardsUsedUsers }}</dt><dd>{{ stats.usedUsers.toLocaleString() }}</dd></div>
						</dl>
					</template>
					<p :class="$style.description">{{ i18n.ts._checkin.cardsUsageDescription }}</p>
				</section>
			</div>
			<section class="_panel _gaps" :class="$style.section" :aria-label="i18n.ts._checkin.grantHistory">
				<div :class="$style.heading"><h2>{{ i18n.ts._checkin.grantHistory }}</h2><span :class="$style.scope">{{ selectedOnly && user ? `@${user.username}` : i18n.ts._checkin.grantScopeAll }}</span></div>
				<MkLoading v-if="recordsLoading"/>
				<div v-else-if="recordsError" class="_gaps_s" role="alert">
					<MkInfo warn>{{ i18n.ts._checkin.grantHistoryLoadFailed }}</MkInfo>
					<MkButton @click="loadRecords">{{ i18n.ts.retry }}</MkButton>
				</div>
				<p v-else-if="total === 0" :class="$style.description">{{ i18n.ts._checkin.grantRecordsEmpty }}</p>
				<div v-else :class="$style.tableScroll" tabindex="0" :aria-label="i18n.ts._checkin.grantHistory">
					<table :class="$style.table" data-testid="checkin-admin-records">
						<thead><tr><th scope="col">{{ i18n.ts._checkin.grantRecipient }}</th><th scope="col">{{ i18n.ts._checkin.grantOperator }}</th><th scope="col">{{ i18n.ts._checkin.cardsAmount }}</th><th scope="col">{{ i18n.ts._checkin.grantUsageStatus }}</th><th scope="col">{{ i18n.ts._checkin.grantUsedAmount }}</th><th scope="col">{{ i18n.ts._checkin.grantRemaining }}</th><th scope="col">{{ i18n.ts._checkin.grantRevokedAmount }}</th><th scope="col">{{ i18n.ts._checkin.grantTime }}</th><th scope="col">{{ i18n.ts.operations }}</th></tr></thead>
						<tbody>
							<tr v-for="entry in history" :key="entry.id" :data-testid="`checkin-admin-grant-${entry.id}`">
								<td><MkA v-if="entry.user" :to="`/admin/user/${entry.user.id}`" class="_link">@{{ entry.user.username }}</MkA><span v-else :title="entry.userId">{{ entry.recipientUsername ? `@${entry.recipientUsername}` : i18n.ts.unknown }}</span></td>
								<td><MkA v-if="entry.operator" :to="`/admin/user/${entry.operator.id}`" class="_link">@{{ entry.operator.username }}</MkA><span v-else>{{ i18n.ts.unknown }}</span></td>
								<td>{{ entry.amount.toLocaleString() }}</td>
								<td><span :class="[$style.status, { [$style.available]: canRevoke(entry) }]">{{ usageLabels[entry.usageStatus] }}</span></td>
								<td>{{ entry.used?.toLocaleString() ?? i18n.ts.unknown }}</td>
								<td>{{ entry.remaining?.toLocaleString() ?? i18n.ts.unknown }}</td>
								<td>{{ entry.revoked?.toLocaleString() ?? i18n.ts.unknown }}</td>
								<td><MkTime :time="entry.createdAt" mode="detail"/></td>
								<td>
									<MkButton v-if="canRevoke(entry)" small danger :wait="revokingBatchId === entry.batchId" :disabled="granting || loading || revokingBatchId != null" @click="revokeCards(entry)">{{ i18n.ts._checkin.revokeCards }}</MkButton>
									<p v-if="revokeErrors[entry.id]" role="alert" :class="$style.rowError">{{ revokeErrors[entry.id] }}</p>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
				<p v-if="history.some(entry => entry.usageStatus === 'legacy')" :class="$style.description">{{ i18n.ts._checkin.grantLegacyDescription }}</p>
				<div :class="$style.pagination">
					<MkButton small :disabled="recordsLoading || page === 0" @click="changePage(-1)">{{ i18n.ts._checkin.grantPreviousPage }}</MkButton>
					<span aria-live="polite">{{ i18n.tsx._checkin.grantPage({ current: page + 1, total: Math.max(1, Math.ceil(total / pageSize)) }) }}</span>
					<MkButton small :disabled="recordsLoading || recordsError || !hasNextPage" @click="changePage(1)">{{ i18n.ts._checkin.grantNextPage }}</MkButton>
				</div>
			</section>
		</div>
	</div>
</component>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkCheckinCardGrant from '@/components/MkCheckinCardGrant.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{ embedded?: boolean }>();
const emit = defineEmits<{ (ev: 'busy', value: boolean): void }>();
const user = ref<entities.UserDetailed | null>(null);
const info = ref<entities.AdminShowUserResponse | null>(null);
const selecting = ref(false);
const loading = ref(false);
const granting = ref(false);
const error = ref('');
const selectedOnly = ref(false);
const filterUserId = computed(() => selectedOnly.value ? user.value?.id : undefined);
const stats = ref<entities.AdminCheckinStatsResponse | null>(null);
const statsLoading = ref(false);
const statsError = ref(false);
const metrics = computed(() => [
	{ key: 'grantedCards', label: i18n.ts._checkin.grantTotal },
	{ key: 'grantedUsers', label: i18n.ts._checkin.grantRecipients },
	{ key: 'usedCards', label: i18n.ts._checkin.cardsUsed },
	{ key: 'availableCards', label: i18n.ts._checkin.cardsHeld },
	{ key: 'exchangedCards', label: i18n.ts._checkin.cardsExchanged },
] as const);
const usageLabels = computed(() => ({
	legacy: i18n.ts._checkin.grantLegacy,
	unused: i18n.ts._checkin.grantUnused,
	partial: i18n.ts._checkin.grantPartiallyUsed,
	used: i18n.ts._checkin.grantUsed,
	revoked: i18n.ts._checkin.grantRevoked,
}));
const history = ref<entities.AdminCheckinHistoryResponse['items']>([]);
const revokingBatchId = ref<string | null>(null);
const revokeErrors = ref<Record<string, string>>({});
const recordsLoading = ref(false);
const recordsError = ref(false);
const total = ref(0);
const page = ref(0);
const pageSize = 20;
const hasNextPage = computed(() => (page.value + 1) * pageSize < total.value && (page.value + 1) * pageSize <= 100000);
let statsRequest = 0;
let recordsRequest = 0;
let active = true;
let closeSelector: (() => void) | undefined;

async function clearUser(ev: PointerEvent) {
	if (selecting.value || loading.value || granting.value || revokingBatchId.value != null) return;
	const selectButton = (ev.currentTarget as HTMLElement).previousElementSibling;
	selectedOnly.value = false;
	user.value = null;
	info.value = null;
	error.value = '';
	await nextTick();
	if (selectButton instanceof HTMLElement) selectButton.focus();
}

function selectUser() {
	if (selecting.value || loading.value || granting.value || revokingBatchId.value != null) return;
	selecting.value = true;
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkUserSelectDialog.vue')), {
		includeSelf: true,
		localOnly: true,
	}, {
		ok: selected => {
			if (active) void loadUser(selected);
		},
		closed: () => {
			selecting.value = false;
			closeSelector = undefined;
			dispose();
		},
	});
	closeSelector = dispose;
}

async function loadUser(selected: entities.UserDetailed) {
	if (!active || loading.value || granting.value || revokingBatchId.value != null) return;
	if (selected.host != null || selected.username.includes('.') || selected.isSuspended || selected.movedTo) {
		await os.alert({ type: 'warning', text: i18n.ts._checkin.grantNotAllowed });
		return;
	}
	user.value = selected;
	info.value = null;
	error.value = '';
	loading.value = true;
	try {
		const result = await misskeyApi('admin/show-user', { userId: selected.id });
		if (!active) return;
		if (result.isSuspended) {
			selectedOnly.value = false;
			user.value = null;
			await os.alert({ type: 'warning', text: i18n.ts._checkin.grantNotAllowed });
			return;
		}
		info.value = result;
	} catch {
		if (active) error.value = i18n.ts._checkin.grantLoadFailed;
	} finally {
		loading.value = false;
	}
}

async function loadStats() {
	const request = ++statsRequest;
	statsLoading.value = true;
	statsError.value = false;
	try {
		const result = await misskeyApi('admin/checkin/stats', filterUserId.value ? { userId: filterUserId.value } : {});
		if (active && request === statsRequest) stats.value = result;
	} catch {
		if (active && request === statsRequest) statsError.value = true;
	} finally {
		if (active && request === statsRequest) statsLoading.value = false;
	}
}

async function loadRecords() {
	const request = ++recordsRequest;
	recordsLoading.value = true;
	recordsError.value = false;
	const params = { ...(filterUserId.value ? { userId: filterUserId.value } : {}), limit: pageSize, offset: page.value * pageSize };
	try {
		const result = await misskeyApi('admin/checkin/history', { ...params, type: 'grant' });
		if (!active || request !== recordsRequest) return;
		history.value = result.items;
		total.value = result.total;
		if (result.total === 0) page.value = 0;
		else if (page.value * pageSize >= result.total) {
			page.value = Math.floor((result.total - 1) / pageSize);
			void loadRecords();
		}
	} catch {
		if (active && request === recordsRequest) recordsError.value = true;
	} finally {
		if (active && request === recordsRequest) recordsLoading.value = false;
	}
}

function canRevoke(entry: entities.AdminCheckinHistoryResponse['items'][number]): boolean {
	return entry.batchId != null && entry.usageStatus !== 'legacy' && (entry.remaining ?? 0) > 0;
}

async function revokeCards(entry: entities.AdminCheckinHistoryResponse['items'][number]) {
	if (!active || !canRevoke(entry) || !entry.batchId || revokingBatchId.value != null || granting.value || loading.value) return;
	revokingBatchId.value = entry.batchId;
	delete revokeErrors.value[entry.id];
	try {
		const { canceled } = await os.confirm({
			type: 'warning',
			title: i18n.ts._checkin.revokeCards,
			text: i18n.tsx._checkin.revokeCardsConfirm({ username: entry.user?.username ?? entry.recipientUsername ?? entry.userId, amount: entry.remaining!.toLocaleString() }),
		});
		if (canceled || !active) return;
		const result = await misskeyApi('admin/checkin/revoke-cards', { batchId: entry.batchId });
		if (!active) return;
		if (user.value?.id === entry.userId && info.value) info.value.checkinMakeupCards = result.makeupCards;
		if (result.revokedCards > 0) os.toast(i18n.tsx._checkin.revokeCardsSucceeded({ amount: result.revokedCards.toLocaleString() }));
		else revokeErrors.value[entry.id] = i18n.ts._checkin.revokeCardsUnavailable;
		void loadStats();
		void loadRecords();
	} catch (cause) {
		if (!active) return;
		const code = (cause as { code?: string } | null)?.code;
		revokeErrors.value[entry.id] = code === 'NO_SUCH_CARD_BATCH' || code === 'CARD_BATCH_NOT_REVOKABLE' ? i18n.ts._checkin.revokeCardsUnavailable : i18n.ts._checkin.revokeCardsFailed;
	} finally {
		revokingBatchId.value = null;
	}
}

function refreshDashboard() {
	if (!active) return;
	page.value = 0;
	void loadStats();
	void loadRecords();
}

function changePage(direction: number) {
	if (recordsLoading.value || (direction > 0 && !hasNextPage.value)) return;
	const nextPage = page.value + direction;
	if (nextPage < 0 || nextPage * pageSize >= total.value) return;
	page.value = nextPage;
	void loadRecords();
}

watch(filterUserId, refreshDashboard);
watch(() => selecting.value || loading.value || granting.value || revokingBatchId.value != null, value => emit('busy', value));
onMounted(refreshDashboard);
onUnmounted(() => {
	active = false;
	statsRequest++;
	recordsRequest++;
	closeSelector?.();
});

if (!props.embedded) definePage(() => ({ title: i18n.ts._checkin.grantCards, icon: 'ti ti-ticket' }));
</script>

<style lang="scss" module>
.dashboard {
	display: grid;
	grid-template-columns: minmax(280px, 1fr) minmax(0, 1.8fr);
	gap: var(--MI-margin);
}
.section {
	min-width: 0;
	padding: var(--MI-cardPadding);
	h2 { margin: 0; font-size: 1.05em; }
}
.heading, .controls, .pagination {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: var(--MI-marginHalf);
}
.heading { justify-content: space-between; }
.description, .scope { margin: 0; font-size: .85em; line-height: 1.7; color: var(--MI_THEME-fgTransparentWeak); }
.metrics {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(130px, 100%), 1fr));
	gap: var(--MI-marginHalf);
	margin: 0;
	> div { min-width: 0; padding: var(--MI-cardPadding); background: var(--MI_THEME-panel); border: 1px solid var(--MI_THEME-divider); border-radius: var(--MI-radius); }
	dt { font-size: .8em; color: var(--MI_THEME-fgTransparentWeak); }
	dd { margin: var(--MI-marginHalf) 0 0; font-size: 1.7em; font-weight: bold; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
}
.substats {
	display: flex;
	flex-wrap: wrap;
	gap: var(--MI-margin);
	margin: 0;
	> div { display: flex; gap: var(--MI-marginHalf); font-size: .85em; }
	dd { margin: 0; font-weight: bold; }
}
.tableScroll { min-width: 0; max-width: 100%; overflow-x: auto; }
.rowError { max-width: 220px; margin: var(--MI-marginHalf) 0 0; white-space: normal; color: var(--MI_THEME-error); }
.status { display: inline-block; padding: var(--MI-marginHalf); border-radius: var(--MI-radius); background: var(--MI_THEME-buttonBg); }
.available { background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); }
.table {
	width: 100%;
	min-width: 680px;
	border-collapse: collapse;
	font-size: .85em;
	text-align: left;
	th, td { padding: var(--MI-margin); border-bottom: 1px solid var(--MI_THEME-divider); white-space: nowrap; }
	th { color: var(--MI_THEME-fgTransparentWeak); font-weight: normal; }
	td { font-variant-numeric: tabular-nums; }
}
.pagination { justify-content: center; font-size: .85em; }
@media (max-width: 850px) {
	.dashboard { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 500px) {
	.metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>

