<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard>
	<div class="_pageBody _gaps_m">
		<div v-if="createdCode" ref="createdResult" class="_gaps_s" :class="$style.created" role="status" tabindex="-1">
			<strong><i class="ti ti-circle-check" aria-hidden="true"></i> {{ i18n.ts._benefits.codeCreated }}</strong>
			<span><Mfm :text="createdCode.name" :plain="true"/> · {{ benefitRewardLabel(createdCode.rewardType, createdCode.amount) }}</span>
			<div :class="$style.toolbar"><code class="_selectable" :class="$style.code">{{ createdCode.code }}</code><MkButton small @click="copyCode(createdCode)">{{ i18n.ts.copy }}</MkButton></div>
			<p :class="$style.description">{{ i18n.ts._benefits.redemptionDescription }}</p>
		</div>
		<section class="_adminPanel" :class="$style.listSection" :aria-label="i18n.ts._benefits.codeList">
			<div class="_adminPanelHeader" :class="$style.heading"><h2 ref="listHeading" tabindex="-1">{{ i18n.ts._benefits.codeList }}</h2><div :class="$style.toolbar"><MkButton v-if="!editorOpen" primary :disabled="saving || deletingId != null" @click="openCreate"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts._benefits.createCode }}</MkButton><MkButton small :disabled="loading" @click="loadCodes">{{ i18n.ts.reload }}</MkButton></div></div>
			<MkLoading v-if="loading && !codes.length"/>
			<div v-if="loadError" class="_gaps_s _adminPanelInset" role="alert"><MkInfo warn>{{ i18n.ts._benefits.codeLoadFailed }}</MkInfo><MkButton @click="codesList.retry">{{ i18n.ts.retry }}</MkButton></div>
			<MkResult v-if="!loading && !loadError && codes.length === 0" type="empty" :text="i18n.ts._benefits.codeListEmpty"/>
			<MkPaginationBar v-if="codes.length" v-slot="{ items }" v-model:pageSize="codesPageSize" :items="codes" :hasMore="codesList.hasMore.value" :loadMore="loadMoreCodes" :disabled="!codesList.canLoad.value || loading || loadError || saving || deletingId != null">
				<div class="_adminTableContainer" tabindex="0" :aria-label="i18n.ts._benefits.codeList">
					<table class="_adminTable" :class="$style.table">
						<thead><tr><th scope="col">{{ i18n.ts._benefits.codeName }}</th><th scope="col">{{ i18n.ts._benefits.code }}</th><th scope="col">{{ i18n.ts._benefits.rewardContent }}</th><th scope="col">{{ i18n.ts._benefits.codeClaims }}</th><th scope="col">{{ i18n.ts.state }}</th><th scope="col">{{ i18n.ts.expirationDate }}</th><th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th></tr></thead>
						<tbody>
							<tr v-for="entry in items" :key="entry.id" :data-testid="`benefit-code-${entry.id}`">
								<td :class="$style.name"><Mfm :text="entry.name" :plain="true"/></td>
								<td><div :class="$style.toolbar"><code class="_selectable" :class="$style.code">{{ entry.code }}</code><MkButton small @click="copyCode(entry)">{{ i18n.ts.copy }}</MkButton></div></td>
								<td>{{ benefitRewardLabel(entry.rewardType, entry.amount) }}</td>
								<td><div class="_gaps_s"><button type="button" class="_textButton" :aria-label="i18n.tsx._benefits.claimsTitle({ name: entry.name })" :aria-expanded="selectedCode?.id === entry.id" aria-haspopup="dialog" @click="selectClaims(entry, $event)">{{ entry.redemptions.toLocaleString() }} / {{ entry.maxRedemptions.toLocaleString() }}</button><progress :class="$style.progress" :value="entry.redemptions" :max="entry.maxRedemptions" :aria-label="i18n.ts._benefits.codeClaims"></progress><span :class="$style.description">{{ i18n.tsx._benefits.claimsRemaining({ count: Math.max(0, entry.maxRedemptions - entry.redemptions).toLocaleString() }) }}</span></div></td>
								<td><span class="_adminTableStatus" :class="[$style.status, { [$style.available]: isAvailable(entry) }]">{{ statusLabel(entry) }}</span></td>
								<td><MkTime v-if="entry.expiresAt" :time="entry.expiresAt" mode="detail"/><span v-else>{{ i18n.ts.noExpirationDate }}</span></td>
								<td class="_adminTableActions"><div :class="$style.actions"><MkButton small :disabled="saving || deletingId != null || loading || !!loadError" @click="openEdit(entry, $event)"><i class="ti ti-pencil" aria-hidden="true"></i> {{ i18n.ts.edit }}</MkButton><MkButton small danger :wait="deletingId === entry.id" :disabled="saving || deletingId != null || loading || !!loadError" @click="deleteCode(entry)"><i class="ti ti-trash" aria-hidden="true"></i> {{ i18n.ts.delete }}</MkButton></div><p v-if="deleteErrors[entry.id]" :class="$style.rowError" role="alert">{{ deleteErrors[entry.id] }}</p></td>
							</tr>
						</tbody>
					</table>
				</div>
				<MkLoading v-if="loading"/>
			</MkPaginationBar>
		</section>
		<Teleport to="#misskey-popups" defer>
			<MkModalWindow
				v-if="editorOpen"
				:width="640"
				:height="600"
				autoHeight
				:closeOnBackdrop="false"
				:withCloseButton="!saving"
				headerIcon="ti ti-qrcode"
				role="dialog"
				tabindex="-1"
				aria-modal="true"
				:aria-label="editingCode ? i18n.ts._benefits.editCode : i18n.ts._benefits.createCode"
				@close="closeEditor"
				@esc="closeEditor"
			>
				<template #header>{{ editingCode ? i18n.ts._benefits.editCode : i18n.ts._benefits.createCode }}</template>
				<form ref="editorForm" class="_gaps" :class="$style.section" :aria-busy="saving" @submit.prevent="saveCode">
					<div :class="$style.formFields">
						<MkInput v-model="name" required :maxLength="CONTENT_LIMITS.collectionName" :disabled="saving"><template #label>{{ i18n.ts._benefits.codeName }}</template><template #caption>{{ i18n.ts._benefits.nameDescription }}</template></MkInput>
						<MkSelect v-model="rewardType" :items="rewardTypes" :disabled="saving || (editingCode != null && editingCode.redemptions > 0)"><template #label>{{ i18n.ts._benefits.rewardContent }}</template></MkSelect>
						<MkInput v-model="amount" type="number" required :min="1" :max="amountLimit" :step="1" :disabled="saving || (editingCode != null && editingCode.redemptions > 0)"><template #label>{{ i18n.ts._benefits.rewardAmount }}</template><template #caption>{{ i18n.tsx._benefits.rewardAmountDescription({ max: amountLimit.toLocaleString() }) }}</template></MkInput>
						<MkInput v-model="maxRedemptions" type="number" required :min="1" :max="1000000" :step="1" :disabled="saving"><template #label>{{ i18n.ts._benefits.claimLimit }}</template></MkInput>
					</div>
					<div :class="$style.expiration"><input v-model="noExpiration" type="checkbox" :class="$style.checkbox" :disabled="saving" :aria-label="i18n.ts.noExpirationDate"><span>{{ i18n.ts.noExpirationDate }}</span></div>
					<MkInput v-if="!noExpiration" v-model="expiresAt" type="datetime-local" required :min="editingCode ? undefined : minimumExpiry" :disabled="saving"><template #label>{{ i18n.ts.expirationDate }}</template><template #caption>{{ i18n.ts._benefits.invalidExpiry }}</template></MkInput>
					<div v-if="editingCode" :class="$style.expiration"><input v-model="enabled" type="checkbox" :class="$style.checkbox" :disabled="saving" :aria-label="i18n.ts.state"><span>{{ i18n.ts.state }}: {{ enabled ? i18n.ts.enabled : i18n.ts.disabled }}</span></div>
					<div :class="$style.toolbar">
						<MkButton primary type="submit" :wait="saving" :disabled="!validConfiguration || saving"><i class="ti" :class="editingCode ? 'ti-device-floppy' : 'ti-plus'" aria-hidden="true"></i> {{ editingCode ? i18n.ts.save : i18n.ts._benefits.createCode }}</MkButton>
						<MkButton :disabled="saving" @click="closeEditor">{{ i18n.ts.cancel }}</MkButton>
						<span v-if="validAmounts" :class="$style.description">{{ i18n.tsx._benefits.codeCapacity({ reward: benefitRewardLabel(rewardType, amount * maxRedemptions) }) }}</span>
					</div>
					<MkInfo v-if="editorError" warn role="alert">{{ editorError }}</MkInfo>
				</form>
			</MkModalWindow>
			<MkModalWindow
				v-if="selectedCode"
				:width="640"
				:height="600"
				autoHeight
				headerIcon="ti ti-users"
				role="dialog"
				tabindex="-1"
				aria-modal="true"
				:aria-label="i18n.tsx._benefits.claimsTitle({ name: selectedCode.name })"
				@close="closeClaims"
				@esc="closeClaims"
			>
				<template #header><I18n :src="i18n.ts._benefits.claimsTitle" tag="span"><template #name><Mfm :text="selectedCode.name" :plain="true"/></template></I18n></template>
				<div class="_gaps" :class="$style.section">
					<div ref="claimsHeading" class="_adminToolbar" tabindex="-1">
						<div class="_adminToolbarActions"><MkButton small :disabled="claimsLoading" @click="loadClaims">{{ i18n.ts.reload }}</MkButton></div>
					</div>
					<MkLoading v-if="claimsLoading && !claims.length"/>
					<div v-if="claimsError" class="_gaps_s" role="alert"><MkInfo warn>{{ i18n.ts._benefits.claimsLoadFailed }}</MkInfo><MkButton @click="claimsList.retry">{{ i18n.ts.retry }}</MkButton></div>
					<MkResult v-if="!claimsLoading && !claimsError && claims.length === 0" type="empty" :text="i18n.ts._benefits.claimsEmpty"/>
					<MkPaginationBar v-if="claims.length" v-slot="{ items }" v-model:pageSize="claimsPageSize" :items="claims" :hasMore="claimsList.hasMore.value" :loadMore="loadMoreClaims" :disabled="!claimsList.canLoad.value || claimsLoading || claimsError || saving || deletingId != null">
						<div class="_adminTableContainer" tabindex="0" :aria-label="i18n.tsx._benefits.claimsTitle({ name: selectedCode.name })">
							<table class="_adminTable">
								<thead><tr><th scope="col">{{ i18n.ts.user }}</th><th scope="col" class="_adminTableNumber">{{ i18n.ts._benefits.rewardContent }}</th><th scope="col">{{ i18n.ts.dateAndTime }}</th></tr></thead>
								<tbody><tr v-for="claim in items" :key="claim.id"><td><MkA v-if="claim.user" :to="`/admin/user/${claim.user.id}`" class="_link" behavior="window">@{{ claim.user.username }}</MkA><span v-else>{{ i18n.ts.unknown }}</span></td><td class="_adminTableNumber">{{ benefitRewardLabel(claim.rewardType, claim.amount) }}</td><td><MkTime :time="claim.createdAt" mode="detail"/></td></tr></tbody>
							</table>
						</div>
						<MkLoading v-if="claimsLoading"/>
					</MkPaginationBar>
				</div>
			</MkModalWindow>
		</Teleport>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, inject, nextTick, onDeactivated, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import { CONTENT_LIMITS } from 'misskey-js';
import type { entities } from 'misskey-js';
import type { BenefitRewardType } from '@/utility/benefits.js';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import type { MkSelectItem } from '@/components/MkSelect.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkPaginationBar, { DEFAULT_PAGE_SIZE } from '@/components/MkPaginationBar.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useInfiniteList } from '@/composables/use-infinite-list.js';
import * as os from '@/os.js';
import { DI } from '@/di.js';
import { benefitRewardLabel, benefitRewardName } from '@/utility/benefits.js';

type RedemptionCode = entities.AdminBenefitsCodesCreateResponse;
const pageActive = inject(DI.pageActive, ref(true));
const editorOpen = ref(false);
const editorForm = useTemplateRef('editorForm');
const createdResult = useTemplateRef('createdResult');
const listHeading = useTemplateRef('listHeading');
let editorTrigger: HTMLElement | null = null;
let claimsTrigger: HTMLElement | null = null;
const editingCode = ref<RedemptionCode | null>(null);

const rewardType = ref<BenefitRewardType>('points');
const rewardTypes = computed(() => [
	{ value: 'points', label: i18n.ts._checkin.points },
	{ value: 'makeupCards', label: i18n.ts._checkin.makeupCards },
] satisfies MkSelectItem<BenefitRewardType>[]);
const amountLimit = computed(() => rewardType.value === 'points' ? 1_000_000 : 10_000);

function makeDefaultName() {
	const d = new Date();
	const date = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
	return `${benefitRewardName(rewardType.value)} ${date}`;
}

let lastDefaultName = makeDefaultName();
const name = ref(lastDefaultName);
const amount = ref(1);
const maxRedemptions = ref(1);
const noExpiration = ref(true);
const expiresAt = ref('');
const enabled = ref(true);
const creating = ref(false);
const editorError = ref('');
const createdCode = ref<RedemptionCode | null>(null);
const now = ref(Date.now());
const minimumExpiry = computed(() => new Date(now.value - new Date(now.value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
const validAmounts = computed(() => Number.isInteger(amount.value) && amount.value >= 1 && amount.value <= amountLimit.value && Number.isInteger(maxRedemptions.value) && maxRedemptions.value >= 1 && maxRedemptions.value <= 1000000);
const validConfiguration = computed(() => {
	const validExpiry = noExpiration.value || Date.parse(expiresAt.value) > now.value || (
		editingCode.value?.expiresAt != null && toLocalDateTime(editingCode.value.expiresAt) === expiresAt.value
	);
	return name.value.trim().length > 0 && Array.from(name.value.trim()).length <= CONTENT_LIMITS.collectionName && validAmounts.value && validExpiry;
});
const updatingId = ref<string | null>(null);
const deleteErrors = ref<Record<string, string>>({});
const deletingId = ref<string | null>(null);
const saving = computed(() => creating.value || updatingId.value != null);
const selectedCode = ref<RedemptionCode | null>(null);
const claimsHeading = useTemplateRef('claimsHeading');
const codesPageSize = ref(DEFAULT_PAGE_SIZE);
const claimsPageSize = ref(DEFAULT_PAGE_SIZE);
const codesList = useInfiniteList<RedemptionCode, number>(async (cursor, signal) => {
	const offset = cursor ?? 0;
	const result = await misskeyApi('admin/benefits/codes/list', { limit: codesPageSize.value, offset }, undefined, signal);
	const next = offset + result.items.length;
	return { items: result.items, next: result.items.length > 0 && next < result.total && next <= 100000 ? next : null };
});
const claimsList = useInfiniteList<entities.AdminBenefitsCodesClaimsResponse['items'][number], number>(async (cursor, signal) => {
	if (!selectedCode.value) return { items: [], next: null };
	const offset = cursor ?? 0;
	const result = await misskeyApi('admin/benefits/codes/claims', { codeId: selectedCode.value.id, limit: claimsPageSize.value, offset }, undefined, signal);
	const next = offset + result.items.length;
	return { items: result.items, next: result.items.length > 0 && next < result.total && next <= 100000 ? next : null };
});
const { items: codes, loading, error: loadError } = codesList;
const { items: claims, loading: claimsLoading, error: claimsError } = claimsList;

async function loadMoreCodes() {
	await codesList.loadMore();
	return !loadError.value;
}

async function loadMoreClaims() {
	await claimsList.loadMore();
	return !claimsError.value;
}

let active = true;
let clockTimer: number | undefined;

function deactivate() {
	editorOpen.value = false;
	editingCode.value = null;
	selectedCode.value = null;
	claimsList.invalidate();
	editorTrigger = null;
	claimsTrigger = null;
}

watch(pageActive, value => {
	if (!value) deactivate();
}, { flush: 'sync' });
onDeactivated(deactivate);

function isExpired(entry: RedemptionCode) { return entry.expiresAt != null && Date.parse(entry.expiresAt) <= now.value; }

function isAvailable(entry: RedemptionCode) { return entry.enabled && !isExpired(entry) && entry.redemptions < entry.maxRedemptions; }

function statusLabel(entry: RedemptionCode) {
	if (isExpired(entry)) return i18n.ts._benefits.codeExpired;
	if (entry.redemptions >= entry.maxRedemptions) return i18n.ts._benefits.codeExhausted;
	return entry.enabled ? i18n.ts.enabled : i18n.ts.disabled;
}

async function openCreate(ev: PointerEvent) {
	if (saving.value || deletingId.value != null) return;
	editorTrigger = ev.currentTarget as HTMLElement;
	editingCode.value = null;
	rewardType.value = 'points';
	lastDefaultName = makeDefaultName();
	name.value = lastDefaultName;
	amount.value = 1;
	maxRedemptions.value = 1;
	noExpiration.value = true;
	expiresAt.value = '';
	enabled.value = true;
	editorError.value = '';
	createdCode.value = null;
	editorOpen.value = true;
	await nextTick();
	editorForm.value?.querySelector('input')?.focus();
}

function toLocalDateTime(value: string) {
	const date = new Date(value);
	return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

async function openEdit(entry: RedemptionCode, ev: PointerEvent) {
	if (saving.value || deletingId.value != null) return;
	editorTrigger = ev.currentTarget as HTMLElement;
	editingCode.value = entry;
	name.value = entry.name;
	rewardType.value = entry.rewardType;
	amount.value = entry.amount;
	maxRedemptions.value = entry.maxRedemptions;
	noExpiration.value = entry.expiresAt == null;
	expiresAt.value = entry.expiresAt == null ? '' : toLocalDateTime(entry.expiresAt);
	enabled.value = entry.enabled;
	editorError.value = '';
	editorOpen.value = true;
	await nextTick();
	editorForm.value?.querySelector('input')?.focus();
}

async function closeEditor() {
	if (saving.value) return;
	editorOpen.value = false;
	editingCode.value = null;
	await nextTick();
	if (!active || !pageActive.value) return;
	if (editorTrigger?.isConnected) editorTrigger.focus();
	else listHeading.value?.parentElement?.querySelector('button')?.focus();
}

function errorMessage(error: unknown, fallback: string) {
	const code = (error as { code?: string })?.code;
	if (code === 'INVALID_REDEMPTION_CONFIGURATION') return i18n.ts._benefits.invalidCodeConfiguration;
	if (code === 'REDEMPTION_REWARD_LOCKED') return i18n.ts._benefits.rewardLocked;
	if (code === 'REDEMPTION_LIMIT_TOO_LOW') return i18n.ts._benefits.claimLimitTooLow;
	return fallback;
}

async function saveCode() {
	if (!active || saving.value || deletingId.value != null) return;
	editorError.value = '';
	if (!validConfiguration.value) {
		editorError.value = i18n.ts._benefits.invalidCodeConfiguration;
		return;
	}
	const payload = {
		name: name.value.trim(), rewardType: rewardType.value, amount: amount.value, maxRedemptions: maxRedemptions.value,
		expiresAt: noExpiration.value ? null : editingCode.value?.expiresAt != null && toLocalDateTime(editingCode.value.expiresAt) === expiresAt.value ? editingCode.value.expiresAt : new Date(expiresAt.value).toISOString(),
	};
	const editing = editingCode.value;
	if (editing) updatingId.value = editing.id;
	else creating.value = true;
	try {
		const result = editing
			? await misskeyApi('admin/benefits/codes/update', { ...payload, id: editing.id, enabled: enabled.value })
			: await misskeyApi('admin/benefits/codes/create', payload);
		if (!active) return;
		if (editing) {
			codes.value = codes.value.map(code => code.id === result.id ? result : code);
			if (selectedCode.value?.id === result.id) selectedCode.value = result;
			editorOpen.value = false;
			editingCode.value = null;
		} else {
			createdCode.value = result;
			lastDefaultName = makeDefaultName();
			name.value = lastDefaultName;
			editorOpen.value = false;
		}
		void loadCodes();
		await nextTick();
		if (editing) {
			if (editorTrigger?.isConnected) editorTrigger.focus();
		} else {
			createdResult.value?.focus();
		}
	} catch (error) {
		if (active) editorError.value = errorMessage(error, editing ? i18n.ts._benefits.codeUpdateFailed : i18n.ts._benefits.codeCreateFailed);
	} finally {
		creating.value = false;
		updatingId.value = null;
	}
}

async function copyCode(entry: RedemptionCode) {
	try {
		await navigator.clipboard.writeText(entry.code);
		if (active) os.toast(i18n.ts.copiedToClipboard, 'success');
	} catch {
		if (active) os.toast(i18n.ts._benefits.copyFailed, 'error');
	}
}

function loadCodes() { return codesList.refresh(); }

async function deleteCode(entry: RedemptionCode) {
	if (!active || saving.value || deletingId.value != null || loading.value || loadError.value) return;
	deleteErrors.value[entry.id] = '';
	deletingId.value = entry.id;
	try {
		const { canceled } = await os.confirm({ type: 'warning', title: i18n.ts._benefits.deleteCode, text: i18n.tsx._benefits.deleteCodeConfirm({ name: entry.name }) });
		if (canceled || !active) return;
		await misskeyApi('admin/benefits/codes/delete', { id: entry.id });
		if (!active) return;
		if (selectedCode.value?.id === entry.id) await closeClaims();
		await loadCodes();
	} catch (error) {
		if (active) deleteErrors.value[entry.id] = errorMessage(error, i18n.ts._benefits.codeDeleteFailed);
	} finally {
		deletingId.value = null;
	}
}

async function selectClaims(entry: RedemptionCode, ev: MouseEvent) {
	claimsTrigger = ev.currentTarget as HTMLElement;
	selectedCode.value = entry;
	void claimsList.reset();
	await nextTick();
	claimsHeading.value?.focus();
}

async function closeClaims() {
	claimsList.invalidate();
	selectedCode.value = null;
	claimsLoading.value = false;
	await nextTick();
	if (!active || !pageActive.value) return;
	if (claimsTrigger?.isConnected) claimsTrigger.focus();
	else listHeading.value?.focus();
}

function loadClaims() { return claimsList.refresh(); }

watch(rewardType, () => {
	if (!editingCode.value && name.value === lastDefaultName) {
		lastDefaultName = makeDefaultName();
		name.value = lastDefaultName;
	}
	if (amount.value > amountLimit.value) amount.value = 1;
});
onMounted(() => {
	void loadCodes();
	clockTimer = window.setInterval(() => { now.value = Date.now(); }, 1000);
});
onUnmounted(() => { active = false; window.clearInterval(clockTimer); });
definePage(() => ({ title: i18n.ts._benefits.adminTitle, icon: 'ti ti-qrcode' }));
</script>

<style lang="scss" module>
.section { min-width: 0; padding: var(--MI-cardPadding); }
.listSection { min-width: 0; }
.section h2, .listSection h2 { margin: 0; font-size: 1.05em; overflow-wrap: anywhere; }
.heading, .toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--MI-marginHalf); }
.heading { justify-content: space-between; }
.formFields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--MI-margin); }
.formFields > * { min-width: 0; }
.formFields > :first-child { grid-column: 1 / -1; }
.description { font-size: .9em; line-height: 1.7; color: var(--MI_THEME-fgTransparentWeak); margin: 0; }
.expiration { display: flex; align-self: flex-start; align-items: center; gap: 6px; }
.checkbox { cursor: pointer; }
.expiration input { accent-color: var(--MI_THEME-accent); }
.created { background: var(--MI_THEME-accentedBg); border-radius: var(--MI-radius); padding: var(--MI-margin); }
.code { overflow-wrap: anywhere; font-size: 1em; letter-spacing: .03em; }
.table {
	min-width: 700px;
	td { font-variant-numeric: tabular-nums; }
}
.name { min-width: 120px; max-width: 220px; overflow-wrap: anywhere; }
.status { --admin-statusColor: var(--MI_THEME-fgTransparentWeak); }
.available { --admin-statusColor: var(--MI_THEME-accent); }
.progress { min-width: 100px; }
.actions { display: flex; flex-wrap: wrap; gap: var(--MI-marginHalf); }
.rowError { max-width: 220px; margin: var(--MI-marginHalf) 0 0; color: var(--MI_THEME-error); }
@media (max-width: 700px) {
	.formFields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.formFields > :first-child { grid-column: 1 / -1; }
}
</style>
