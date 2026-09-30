<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<section v-if="createOpen" class="_panel _gaps" :class="$style.section" :aria-label="i18n.ts._benefits.createCode">
		<div :class="$style.heading"><h2>{{ i18n.ts._benefits.createCode }}</h2><MkButton small :disabled="creating" @click="closeCreate">{{ i18n.ts.cancel }}</MkButton></div>
		<form ref="createForm" class="_gaps" :aria-busy="creating" @submit.prevent="createCode">
			<div :class="$style.formFields">
				<MkInput v-model="name" required :maxLength="100" :disabled="creating"><template #label>{{ i18n.ts._benefits.codeName }}</template><template #caption>{{ i18n.ts._checkin._codes.nameDescription }}</template></MkInput>
				<MkInput v-model="amount" type="number" required :min="1" :max="10000" :step="1" :disabled="creating"><template #label>{{ i18n.ts._benefits.cardsPerClaim }}</template><template #caption>{{ i18n.ts._checkin.grantAmountDescription }}</template></MkInput>
				<MkInput v-model="maxRedemptions" type="number" required :min="1" :max="1000000" :step="1" :disabled="creating"><template #label>{{ i18n.ts._benefits.claimLimit }}</template></MkInput>
			</div>
			<div :class="$style.expiration"><input v-model="noExpiration" type="checkbox" :class="$style.checkbox" :disabled="creating" :aria-label="i18n.ts.noExpirationDate"><span>{{ i18n.ts.noExpirationDate }}</span></div>
			<MkInput v-if="!noExpiration" v-model="expiresAt" type="datetime-local" required :min="minimumExpiry" :disabled="creating"><template #label>{{ i18n.ts.expirationDate }}</template><template #caption>{{ i18n.ts._checkin._codes.invalidExpiry }}</template></MkInput>
			<div :class="$style.toolbar">
				<MkButton primary type="submit" :wait="creating" :disabled="!validConfiguration || creating || updatingId != null"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts._benefits.createCode }}</MkButton>
				<span v-if="validAmounts" :class="$style.description">{{ i18n.tsx._benefits.codeCapacity({ amount: (amount * maxRedemptions).toLocaleString() }) }}</span>
			</div>
			<MkInfo v-if="createError" warn role="alert">{{ createError }}</MkInfo>
		</form>
	</section>
	<div v-if="createdCode" ref="createdResult" class="_gaps_s" :class="$style.created" role="status" tabindex="-1">
		<strong><i class="ti ti-circle-check" aria-hidden="true"></i> {{ i18n.ts._benefits.codeCreated }}</strong>
		<span>{{ createdCode.name }}</span>
		<div :class="$style.toolbar"><code class="_selectable" :class="$style.code">{{ createdCode.code }}</code><MkButton small @click="copyCode(createdCode)">{{ i18n.ts.copy }}</MkButton></div>
		<p :class="$style.description">{{ i18n.ts._benefits.redemptionDescription }}</p>
	</div>
	<section class="_panel _gaps" :class="$style.section" :aria-label="i18n.ts._benefits.codeList">
		<div :class="$style.heading"><h2 ref="listHeading" tabindex="-1">{{ i18n.ts._benefits.codeList }}</h2><div :class="$style.toolbar"><MkButton v-if="!createOpen" primary :disabled="creating || updatingId != null" @click="openCreate"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts._benefits.createCode }}</MkButton><MkButton small :disabled="loading" @click="loadCodes">{{ i18n.ts.reload }}</MkButton></div></div>
		<MkLoading v-if="loading"/>
		<div v-else-if="loadError" class="_gaps_s" role="alert"><MkInfo warn>{{ i18n.ts._benefits.codeLoadFailed }}</MkInfo><MkButton @click="loadCodes">{{ i18n.ts.retry }}</MkButton></div>
		<p v-else-if="codes.length === 0" :class="$style.description">{{ i18n.ts._benefits.codeListEmpty }}</p>
		<div v-else :class="$style.tableScroll" tabindex="0" :aria-label="i18n.ts._benefits.codeList">
			<table :class="$style.table">
				<thead><tr><th scope="col">{{ i18n.ts._benefits.codeName }}</th><th scope="col">{{ i18n.ts._benefits.code }}</th><th scope="col">{{ i18n.ts._benefits.cardsPerClaim }}</th><th scope="col">{{ i18n.ts._benefits.codeClaims }}</th><th scope="col">{{ i18n.ts.status }}</th><th scope="col">{{ i18n.ts.expirationDate }}</th><th scope="col">{{ i18n.ts.operations }}</th></tr></thead>
				<tbody>
					<tr v-for="entry in codes" :key="entry.id" :data-testid="`benefit-code-${entry.id}`">
						<td :class="$style.name">{{ entry.name }}</td>
						<td><div :class="$style.toolbar"><code class="_selectable" :class="$style.code">{{ entry.code }}</code><MkButton small @click="copyCode(entry)">{{ i18n.ts.copy }}</MkButton></div></td>
						<td>{{ entry.amount.toLocaleString() }}</td>
						<td><div class="_gaps_s"><button type="button" class="_textButton" :aria-label="i18n.tsx._benefits.claimsTitle({ name: entry.name })" :aria-expanded="selectedCode?.id === entry.id" @click="selectClaims(entry, $event)">{{ entry.redemptions.toLocaleString() }} / {{ entry.maxRedemptions.toLocaleString() }}</button><progress :class="$style.progress" :value="entry.redemptions" :max="entry.maxRedemptions" :aria-label="i18n.ts._benefits.codeClaims"></progress><span :class="$style.description">{{ i18n.tsx._benefits.claimsRemaining({ count: Math.max(0, entry.maxRedemptions - entry.redemptions).toLocaleString() }) }}</span></div></td>
						<td><span :class="[$style.status, { [$style.available]: isAvailable(entry) }]">{{ statusLabel(entry) }}</span></td>
						<td><MkTime v-if="entry.expiresAt" :time="entry.expiresAt" mode="detail"/><span v-else>{{ i18n.ts.noExpirationDate }}</span></td>
						<td><MkButton small :danger="entry.enabled" :wait="updatingId === entry.id" :disabled="updatingId != null || creating || isExpired(entry) || entry.redemptions >= entry.maxRedemptions" @click="toggleCode(entry)">{{ entry.enabled ? i18n.ts._benefits.disableCode : i18n.ts._benefits.enableCode }}</MkButton><p v-if="updateErrors[entry.id]" :class="$style.rowError" role="alert">{{ updateErrors[entry.id] }}</p></td>
					</tr>
				</tbody>
			</table>
		</div>
		<div :class="$style.pagination">
			<MkButton small :disabled="loading || codePage === 0" @click="changeCodePage(-1)">{{ i18n.ts._checkin.grantPreviousPage }}</MkButton>
			<span aria-live="polite">{{ i18n.tsx._checkin.grantPage({ current: codePage + 1, total: Math.max(1, Math.ceil(codeTotal / pageSize)) }) }}</span>
			<MkButton small :disabled="loading || loadError || !hasNextCodePage" @click="changeCodePage(1)">{{ i18n.ts._checkin.grantNextPage }}</MkButton>
		</div>
	</section>
	<section v-if="selectedCode" class="_panel _gaps" :class="$style.section" :aria-label="i18n.tsx._benefits.claimsTitle({ name: selectedCode.name })">
		<div :class="$style.heading"><h2 ref="claimsHeading" tabindex="-1">{{ i18n.tsx._benefits.claimsTitle({ name: selectedCode.name }) }}</h2><div :class="$style.toolbar"><MkButton small :disabled="claimsLoading" @click="loadClaims">{{ i18n.ts.reload }}</MkButton><MkButton small @click="closeClaims">{{ i18n.ts.close }}</MkButton></div></div>
		<MkLoading v-if="claimsLoading"/>
		<div v-else-if="claimsError" class="_gaps_s" role="alert"><MkInfo warn>{{ i18n.ts._benefits.claimsLoadFailed }}</MkInfo><MkButton @click="loadClaims">{{ i18n.ts.retry }}</MkButton></div>
		<p v-else-if="claims.length === 0" :class="$style.description">{{ i18n.ts._benefits.claimsEmpty }}</p>
		<div v-else :class="$style.tableScroll" tabindex="0" :aria-label="i18n.tsx._benefits.claimsTitle({ name: selectedCode.name })">
			<table :class="$style.table">
				<thead><tr><th scope="col">{{ i18n.ts._checkin.grantRecipient }}</th><th scope="col">{{ i18n.ts._checkin.cardsAmount }}</th><th scope="col">{{ i18n.ts._checkin.grantTime }}</th></tr></thead>
				<tbody><tr v-for="claim in claims" :key="claim.id"><td><MkA v-if="claim.user" :to="`/admin/user/${claim.user.id}`" class="_link">@{{ claim.user.username }}</MkA><span v-else>{{ i18n.ts.unknown }}</span></td><td>{{ claim.amount.toLocaleString() }}</td><td><MkTime :time="claim.createdAt" mode="detail"/></td></tr></tbody>
			</table>
		</div>
		<div :class="$style.pagination">
			<MkButton small :disabled="claimsLoading || claimsPage === 0" @click="changeClaimsPage(-1)">{{ i18n.ts._checkin.grantPreviousPage }}</MkButton>
			<span aria-live="polite">{{ i18n.tsx._checkin.grantPage({ current: claimsPage + 1, total: Math.max(1, Math.ceil(claimsTotal / pageSize)) }) }}</span>
			<MkButton small :disabled="claimsLoading || claimsError || !hasNextClaimsPage" @click="changeClaimsPage(1)">{{ i18n.ts._checkin.grantNextPage }}</MkButton>
		</div>
	</section>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import type { entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';

type RedemptionCode = entities.AdminCheckinCodesCreateResponse;
const emit = defineEmits<{ (ev: 'busy', value: boolean): void }>();
const createOpen = ref(false);
const createForm = useTemplateRef('createForm');
const createdResult = useTemplateRef('createdResult');
const listHeading = useTemplateRef('listHeading');
let createTrigger: HTMLElement | null = null;
let claimsTrigger: HTMLElement | null = null;

// 管理名称是必填项，预填一个带当天日期的默认值 (可直接创建，也可自由覆盖)
function makeDefaultName() {
	const d = new Date();
	const date = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
	return `${i18n.ts._benefits.checkinCard} ${date}`;
}

let lastDefaultName = makeDefaultName();
const name = ref(lastDefaultName);
const amount = ref(1);
const maxRedemptions = ref(1);
const noExpiration = ref(true);
const expiresAt = ref('');
const creating = ref(false);
const createError = ref('');
const createdCode = ref<RedemptionCode | null>(null);
const now = ref(Date.now());
const minimumExpiry = computed(() => new Date(now.value - new Date(now.value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
const validAmounts = computed(() => Number.isInteger(amount.value) && amount.value >= 1 && amount.value <= 10000 && Number.isInteger(maxRedemptions.value) && maxRedemptions.value >= 1 && maxRedemptions.value <= 1000000);
const validConfiguration = computed(() => name.value.trim().length > 0 && name.value.trim().length <= 100 && validAmounts.value && (noExpiration.value || Date.parse(expiresAt.value) > now.value));
const codes = ref<RedemptionCode[]>([]);
const codePage = ref(0);
const codeTotal = ref(0);
const loading = ref(false);
const loadError = ref(false);
const updatingId = ref<string | null>(null);
const updateErrors = ref<Record<string, string>>({});
const selectedCode = ref<RedemptionCode | null>(null);
const claims = ref<entities.AdminCheckinCodesClaimsResponse['items']>([]);
const claimsPage = ref(0);
const claimsTotal = ref(0);
const claimsLoading = ref(false);
const claimsError = ref(false);
const claimsHeading = useTemplateRef('claimsHeading');
const pageSize = 20;
const hasNextCodePage = computed(() => (codePage.value + 1) * pageSize < codeTotal.value && (codePage.value + 1) * pageSize <= 100000);
const hasNextClaimsPage = computed(() => (claimsPage.value + 1) * pageSize < claimsTotal.value && (claimsPage.value + 1) * pageSize <= 100000);
let active = true;
let codesRequest = 0;
let claimsRequest = 0;
let clockTimer: number | undefined;

function isExpired(entry: RedemptionCode) { return entry.expiresAt != null && Date.parse(entry.expiresAt) <= now.value; }

function isAvailable(entry: RedemptionCode) { return entry.enabled && !isExpired(entry) && entry.redemptions < entry.maxRedemptions; }

function statusLabel(entry: RedemptionCode) {
	if (isExpired(entry)) return i18n.ts._benefits.codeExpired;
	if (entry.redemptions >= entry.maxRedemptions) return i18n.ts._benefits.codeExhausted;
	return entry.enabled ? i18n.ts.enabled : i18n.ts.disabled;
}

async function openCreate(ev: PointerEvent) {
	if (creating.value || updatingId.value != null) return;
	createTrigger = ev.currentTarget as HTMLElement;
	// 未编辑过 (为空或仍是默认值) 时，每次打开都刷新为当天日期
	if (name.value.trim() === '' || name.value === lastDefaultName) {
		lastDefaultName = makeDefaultName();
		name.value = lastDefaultName;
	}
	createOpen.value = true;
	await nextTick();
	createForm.value?.querySelector('input')?.focus();
}

async function closeCreate() {
	if (creating.value) return;
	createOpen.value = false;
	await nextTick();
	if (createTrigger?.isConnected) createTrigger.focus();
	else listHeading.value?.parentElement?.querySelector('button')?.focus();
}

async function createCode() {
	if (!active || creating.value || updatingId.value != null) return;
	createError.value = '';
	if (!validConfiguration.value || (!noExpiration.value && Date.parse(expiresAt.value) <= Date.now())) {
		createError.value = i18n.ts._benefits.invalidCodeConfiguration;
		return;
	}
	creating.value = true;
	try {
		const result = await misskeyApi('admin/checkin/codes/create', { name: name.value.trim(), amount: amount.value, maxRedemptions: maxRedemptions.value, expiresAt: noExpiration.value ? null : new Date(expiresAt.value).toISOString() });
		if (!active) return;
		createdCode.value = result;
		lastDefaultName = makeDefaultName();
		name.value = lastDefaultName;
		createOpen.value = false;
		codePage.value = 0;
		void loadCodes();
		await nextTick();
		createdResult.value?.focus();
	} catch (error) {
		if (active) createError.value = (error as { code?: string })?.code === 'INVALID_REDEMPTION_CONFIGURATION' ? i18n.ts._benefits.invalidCodeConfiguration : i18n.ts._benefits.codeCreateFailed;
	} finally {
		creating.value = false;
	}
}

async function copyCode(entry: RedemptionCode) {
	try {
		await navigator.clipboard.writeText(entry.code);
		if (active) os.toast(i18n.ts.copiedToClipboard);
	} catch {
		if (active) void os.alert({ type: 'error', text: i18n.ts._benefits.copyFailed });
	}
}

async function loadCodes() {
	const request = ++codesRequest;
	loading.value = true;
	loadError.value = false;
	try {
		const result = await misskeyApi('admin/checkin/codes/list', { limit: pageSize, offset: codePage.value * pageSize });
		if (!active || request !== codesRequest) return;
		codes.value = result.items;
		codeTotal.value = result.total;
		if (result.total === 0) codePage.value = 0;
		else if (codePage.value * pageSize >= result.total) {
			codePage.value = Math.floor((result.total - 1) / pageSize);
			void loadCodes();
		}
	} catch {
		if (active && request === codesRequest) loadError.value = true;
	} finally {
		if (active && request === codesRequest) loading.value = false;
	}
}

async function toggleCode(entry: RedemptionCode) {
	if (!active || updatingId.value != null || creating.value || isExpired(entry) || entry.redemptions >= entry.maxRedemptions) return;
	updatingId.value = entry.id;
	delete updateErrors.value[entry.id];
	try {
		const enabled = !entry.enabled;
		if (!enabled) {
			const { canceled } = await os.confirm({ type: 'warning', title: i18n.ts._benefits.disableCode, text: i18n.tsx._benefits.disableCodeConfirm({ name: entry.name }) });
			if (canceled || !active) return;
		}
		const result = await misskeyApi('admin/checkin/codes/update', { id: entry.id, enabled });
		if (!active) return;
		codes.value = codes.value.map(code => code.id === result.id ? result : code);
		if (createdCode.value?.id === result.id) createdCode.value = result;
		if (selectedCode.value?.id === result.id) selectedCode.value = result;
		os.toast(result.enabled ? i18n.ts._benefits.codeEnabled : i18n.ts._benefits.codeDisabled);
		void loadCodes();
	} catch {
		if (active) updateErrors.value[entry.id] = i18n.ts._benefits.codeUpdateFailed;
	} finally {
		updatingId.value = null;
	}
}

function changeCodePage(direction: number) {
	if (loading.value || (direction > 0 && !hasNextCodePage.value) || codePage.value + direction < 0) return;
	codePage.value += direction;
	void loadCodes();
}

async function selectClaims(entry: RedemptionCode, ev: MouseEvent) {
	claimsTrigger = ev.currentTarget as HTMLElement;
	selectedCode.value = entry;
	claimsPage.value = 0;
	claims.value = [];
	claimsTotal.value = 0;
	void loadClaims();
	await nextTick();
	claimsHeading.value?.focus();
}

async function closeClaims() {
	claimsRequest++;
	selectedCode.value = null;
	claimsLoading.value = false;
	await nextTick();
	if (claimsTrigger?.isConnected) claimsTrigger.focus();
	else listHeading.value?.focus();
}

async function loadClaims() {
	if (!selectedCode.value) return;
	const request = ++claimsRequest;
	claimsLoading.value = true;
	claimsError.value = false;
	try {
		const result = await misskeyApi('admin/checkin/codes/claims', { codeId: selectedCode.value.id, limit: pageSize, offset: claimsPage.value * pageSize });
		if (!active || request !== claimsRequest) return;
		claims.value = result.items;
		claimsTotal.value = result.total;
		if (result.total === 0) claimsPage.value = 0;
		else if (claimsPage.value * pageSize >= result.total) {
			claimsPage.value = Math.floor((result.total - 1) / pageSize);
			void loadClaims();
		}
	} catch {
		if (active && request === claimsRequest) claimsError.value = true;
	} finally {
		if (active && request === claimsRequest) claimsLoading.value = false;
	}
}

function changeClaimsPage(direction: number) {
	if (claimsLoading.value || (direction > 0 && !hasNextClaimsPage.value) || claimsPage.value + direction < 0) return;
	claimsPage.value += direction;
	void loadClaims();
}

watch(() => creating.value || updatingId.value != null, value => emit('busy', value));
onMounted(() => {
	void loadCodes();
	clockTimer = window.setInterval(() => { now.value = Date.now(); }, 1000);
});
onUnmounted(() => { active = false; codesRequest++; claimsRequest++; window.clearInterval(clockTimer); });
</script>

<style lang="scss" module>
.section { min-width: 0; padding: calc(var(--MI-margin) * 1.5); }
.section h2 { margin: 0; font-size: 1.05em; overflow-wrap: anywhere; }
.heading, .toolbar, .pagination { display: flex; align-items: center; flex-wrap: wrap; gap: var(--MI-marginHalf); }
.heading { justify-content: space-between; }
.formFields { display: grid; grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr)); gap: var(--MI-margin); }
.formFields > * { min-width: 0; }
.description { font-size: .85em; line-height: 1.7; color: var(--MI_THEME-fgTransparentWeak); margin: 0; }
.expiration { display: flex; align-self: flex-start; align-items: center; gap: 6px; }
// 仅由复选框本体触发切换。标签文字不作为点击对象 (不用 label 包裹)
.checkbox { cursor: pointer; }
.expiration input { accent-color: var(--MI_THEME-accent); }
.created { background: var(--MI_THEME-accentedBg); border-radius: var(--MI-radius); padding: var(--MI-margin); }
.code { overflow-wrap: anywhere; font-size: .95em; letter-spacing: .03em; }
.tableScroll { min-width: 0; max-width: 100%; overflow-x: auto; }
.table {
	width: 100%; min-width: 700px; border-collapse: collapse; font-size: .85em; text-align: left;
	th, td { padding: var(--MI-margin); border-bottom: 1px solid var(--MI_THEME-divider); }
	th { white-space: nowrap; color: var(--MI_THEME-fgTransparentWeak); font-weight: normal; }
	td { font-variant-numeric: tabular-nums; }
}
.name { min-width: 120px; max-width: 220px; overflow-wrap: anywhere; }
.status { display: inline-block; white-space: nowrap; padding: var(--MI-marginHalf); border-radius: var(--MI-radius); background: var(--MI_THEME-buttonBg); }
.available { background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); }
.progress { width: 100%; min-width: 100px; height: 6px; }
.rowError { max-width: 220px; margin: var(--MI-marginHalf) 0 0; color: var(--MI_THEME-error); }
.pagination { justify-content: center; font-size: .85em; }
@media (max-width: 700px) {
	.formFields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.formFields > :first-child { grid-column: 1 / -1; }
}
@media (max-width: 500px) {
	.section { padding: var(--MI-margin); }
}
</style>
