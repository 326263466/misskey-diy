<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_pageBody">
	<div class="_adminPanel">
		<Teleport defer :to="toolbarTarget">
			<MkInput v-model="queryName" type="search" autocapitalize="off" class="_adminToolbarField" @enter="onSearchRequest">
				<template #label>{{ i18n.ts.name }}</template>
			</MkInput>
			<MkInput v-model="queryHost" type="search" autocapitalize="off" class="_adminToolbarField" @enter="onSearchRequest">
				<template #label>{{ i18n.ts.host }}</template>
			</MkInput>
			<MkInput v-model="queryLicense" type="search" autocapitalize="off" class="_adminToolbarField" @enter="onSearchRequest">
				<template #label>{{ i18n.ts.license }}</template>
			</MkInput>
			<div class="_adminToolbarActions" :class="$style.actions">
				<MkButton small primary :disabled="loading || importing" @click="onSearchRequest"><i class="ti ti-search" aria-hidden="true"></i> {{ i18n.ts.search }}</MkButton>
				<MkButton small :disabled="importing" @click="openFilters"><i class="ti ti-filter" aria-hidden="true"></i> {{ i18n.ts.filter }}</MkButton>
				<MkButton small :disabled="loading || importing" @click="resetQuery">{{ i18n.ts.reset }}</MkButton>
				<MkButton small :disabled="customEmojis.length === 0 || loading || importing" @click="openSelectionWindow"><i class="ti ti-table" aria-hidden="true"></i> {{ i18n.ts._customEmojisManager.selectMode }}</MkButton>
				<MkButton small primary :disabled="selectedEmojis.size === 0 || loading" :wait="importing" @click="importEmojis(Array.from(selectedEmojis.values()))"><i class="ti ti-download" aria-hidden="true"></i> {{ i18n.ts._customEmojisManager._remote.importEmojisButton }} ({{ selectedEmojis.size }})</MkButton>
				<MkButton small :disabled="requestLogs.length === 0" @click="logsOpen = true"><i class="ti ti-notes" aria-hidden="true"></i> {{ i18n.ts._customEmojisManager._gridCommon.registrationLogs }}</MkButton>
			</div>
		</Teleport>
		<div class="_adminPanelInset _gaps">
			<MkLoading v-if="!initialized && loading"/>
			<MkError v-else-if="loadError" @retry="loadPage"/>
			<MkResult v-else-if="customEmojis.length === 0" type="empty" :text="i18n.ts._customEmojisManager._local._list.emojisNothing"/>
			<template v-else>
				<label :class="$style.selectAll"><input type="checkbox" :checked="allSelected" :indeterminate="someSelected && !allSelected" :disabled="loading || importing" @change="togglePageSelection">{{ i18n.ts._customEmojisManager.selectAll }}</label>
				<div :class="$style.emojis" role="list" :aria-label="i18n.ts.remote" :aria-busy="loading">
					<article v-for="emoji in customEmojis" :key="emoji.id" :class="[$style.emoji, { [$style.selected]: selectedEmojis.has(emoji.id) }]" class="_panel" role="listitem">
						<input type="checkbox" :class="$style.checkbox" :checked="selectedEmojis.has(emoji.id)" :disabled="loading || importing" :aria-label="emoji.name" @change="toggleSelection(emoji)">
						<button type="button" class="_button" :class="$style.preview" :disabled="loading || importing" :aria-label="`${i18n.ts.details}: ${emoji.name}`" @click="showDetails(emoji)"><img :src="emoji.publicUrl" :alt="emoji.name" :title="emoji.publicUrl"/></button>
						<div :class="$style.body">
							<button type="button" class="_button _monospace" :class="$style.name" :title="[emoji.name, emoji.uri].filter(Boolean).join('\n')" :disabled="loading || importing" @click="showDetails(emoji)">{{ emoji.name }}</button>
							<div :class="$style.source" :title="emoji.host ?? i18n.ts.unknown">{{ emoji.host ?? i18n.ts.unknown }}</div>
							<div :class="$style.meta">
								<span :class="$style.ellipsis" :title="emoji.license ?? ''">{{ emoji.license || i18n.ts.notSet }}</span>
								<span v-if="emoji.isSensitive" class="_adminTableStatus" style="--admin-statusColor: var(--MI_THEME-warn)">{{ i18n.ts.sensitive }}</span>
								<span v-if="emoji.localOnly" class="_adminTableStatus">{{ i18n.ts.localOnly }}</span>
							</div>
						</div>
						<div :class="$style.itemActions"><button type="button" class="_button _textButton" :disabled="loading || importing" @click="showDetails(emoji)">{{ i18n.ts.details }}</button><button type="button" class="_button _textButton" :disabled="loading || importing" @click="importEmojis([emoji])">{{ i18n.ts.import }}</button></div>
					</article>
				</div>
			</template>
		</div>
		<div v-if="initialized" :class="$style.footer">
			<button v-if="selectedEmojis.size > 0" type="button" class="_button _textButton" :disabled="importing" @click="selectedEmojis.clear()">{{ i18n.ts.clear }} ({{ selectedEmojis.size }})</button>
			<MkLoading v-if="loading" :class="$style.loading"/>
			<MkPaginationBar v-model:page="page" v-model:pageSize="pageSize" :class="$style.pagination" :items="customEmojis" :total="totalCount" :disabled="loading || importing || !canLoad"/>
		</div>
	</div>
	<Teleport to="#misskey-popups" defer>
		<MkModalWindow v-if="selectionOpen" ref="selectionWindow" :width="860" :height="560" autoHeight :closeOnBackdrop="false" @close="requestSelectionClose" @esc="requestSelectionClose" @closed="closeSelectionWindow">
			<template #header>{{ i18n.ts._customEmojisManager.selectMode }}</template>
			<div class="_spacer _spacerCard" :inert="selectionClosing || loading || importing || !canLoad"><MkGrid :data="selectionItems" :settings="selectionGridSettings" @event="onSelectionGridEvent"/></div>
			<template #footer><div class="_buttons"><MkButton small primary :disabled="selectionClosing || loading || importing" @click="applySelection">{{ i18n.ts.apply }}</MkButton><MkButton small @click="requestSelectionClose">{{ i18n.ts.cancel }}</MkButton></div></template>
		</MkModalWindow>
		<MkModalWindow v-if="filtersOpen" :width="520" :height="600" autoHeight :withOkButton="true" @ok="applyFilters" @closed="filtersOpen = false">
			<template #header>{{ i18n.ts._customEmojisManager._gridCommon.searchSettings }}</template>
			<div class="_spacer _spacerCard _gaps">
				<MkInput v-model="queryUri" type="search" autocapitalize="off" @enter="applyFilters"><template #label>URI</template></MkInput>
				<MkInput v-model="queryPublicUrl" type="search" autocapitalize="off" @enter="applyFilters"><template #label>publicUrl</template></MkInput>
				<div class="_gaps_s">
					<span>{{ i18n.ts._customEmojisManager._gridCommon.sortOrder }}</span>
					<MkSortOrderEditor :baseOrderKeyNames="gridSortOrderKeys" :currentOrders="sortOrders" @update="orders => sortOrders = orders"/>
				</div>
			</div>
		</MkModalWindow>
		<MkModalWindow v-if="logsOpen" :width="720" :height="560" autoHeight @closed="logsOpen = false">
			<template #header>{{ i18n.ts._customEmojisManager._gridCommon.registrationLogs }}</template>
			<div class="_spacer _spacerCard"><XRegisterLogs :logs="requestLogs"/></div>
		</MkModalWindow>
	</Teleport>
</div>
</template>

<script setup lang="ts">
import { computed, inject, onActivated, onDeactivated, onMounted, onScopeDispose, ref, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import type { GridSortOrderKey, RequestLogItem } from '@/pages/admin/custom-emojis-manager.impl.js';
import type { SortOrder } from '@/components/MkSortOrderEditor.define.js';
import type { GridEvent } from '@/components/grid/grid-event.js';
import type { GridSetting } from '@/components/grid/grid.js';
import MkRemoteEmojiEditDialog from '@/components/MkRemoteEmojiEditDialog.vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkPaginationBar, { DEFAULT_PAGE_SIZE } from '@/components/MkPaginationBar.vue';
import MkSortOrderEditor from '@/components/MkSortOrderEditor.vue';
import MkGrid from '@/components/grid/MkGrid.vue';
import XRegisterLogs from '@/pages/admin/custom-emojis-manager.logs.vue';
import { DI } from '@/di.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { emptyStrToUndefined, gridSortOrderKeys } from '@/pages/admin/custom-emojis-manager.impl.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { copyGridDataToClipboard } from '@/components/grid/grid-utils.js';

const toolbarTarget = inject('adminEmojisToolbarTarget', '');

type SelectionItem = {
	id: string;
	checked: boolean;
	url: string;
	name: string;
	host: string | null;
	license: string | null;
	uri: string | null;
	publicUrl: string;
};

const initialized = ref(false);
const loading = ref(false);
const loadError = ref(false);
const importing = ref(false);
const page = ref(1);
const totalCount = ref(0);
const customEmojis = ref<Misskey.entities.EmojiDetailedAdmin[]>([]);
const selectedEmojis = ref(new Map<string, Misskey.entities.EmojiDetailedAdmin>());
const selectionOpen = ref(false);
const selectionItems = ref<SelectionItem[]>([]);
const selectionWindow = useTemplateRef('selectionWindow');
const selectionClosing = ref(false);
const allSelected = computed(() => customEmojis.value.length > 0 && customEmojis.value.every(emoji => selectedEmojis.value.has(emoji.id)));
const someSelected = computed(() => customEmojis.value.some(emoji => selectedEmojis.value.has(emoji.id)));
const queryName = ref<string | null>(null);
const queryHost = ref<string | null>(null);
const queryLicense = ref<string | null>(null);
const queryUri = ref<string | null>(null);
const queryPublicUrl = ref<string | null>(null);
const pageSize = ref(DEFAULT_PAGE_SIZE);
const sortOrders = ref<SortOrder<GridSortOrderKey>[]>([]);
const filtersOpen = ref(false);
const logsOpen = ref(false);
const requestLogs = ref<RequestLogItem[]>([]);
const active = ref(true);
const pageActive = inject(DI.pageActive, ref(true));
const canLoad = computed(() => active.value && pageActive.value);
let disposed = false;
let controller: AbortController | null = null;
let requestRevision = 0;
let interrupted = false;
let appliedQuery: Misskey.entities.V2AdminEmojiListRequest['query'] = { hostType: 'remote' };
let appliedSort: Misskey.entities.V2AdminEmojiListRequest['sortKeys'];

const selectionGridSettings: GridSetting = {
	row: {
		showNumber: true,
		minimumDefinitionCount: 1,
		contextMenuFactory: (_, context) => [{
			text: i18n.ts._customEmojisManager._gridCommon.copySelectionRows,
			icon: 'ti ti-copy',
			action: () => copyGridDataToClipboard(selectionItems, context),
		}, {
			text: i18n.ts._customEmojisManager._remote.importSelectionRows,
			icon: 'ti ti-download',
			action: () => importSelectionRows(context.rangedRows.map(row => row.index)),
		}],
	},
	cols: [
		{ bindTo: 'checked', icon: 'ti-download', type: 'boolean', editable: true, width: 34 },
		{ bindTo: 'url', icon: 'ti-icons', type: 'image', editable: false, width: 64 },
		{ bindTo: 'name', title: i18n.ts.name, type: 'text', editable: false, width: 140 },
		{ bindTo: 'host', title: i18n.ts.host, type: 'text', editable: false, width: 160 },
		{ bindTo: 'license', title: i18n.ts.license, type: 'text', editable: false, width: 180 },
		{ bindTo: 'uri', title: 'URI', type: 'text', editable: false, width: 220 },
		{ bindTo: 'publicUrl', title: 'publicUrl', type: 'text', editable: false, width: 220 },
	],
	cells: {
		contextMenuFactory: (_, row, __, context) => [{
			text: i18n.ts._customEmojisManager._gridCommon.copySelectionRanges,
			icon: 'ti ti-copy',
			action: () => copyGridDataToClipboard(selectionItems, context),
		}, {
			text: i18n.ts._customEmojisManager._remote.selectionRowDetail,
			icon: 'ti ti-info-circle',
			action: () => {
				const emoji = customEmojis.value.find(item => item.id === selectionItems.value[row.index]?.id);
				if (emoji) showDetails(emoji);
			},
		}, {
			text: i18n.ts._customEmojisManager._remote.importSelectionRangesRows,
			icon: 'ti ti-download',
			action: () => importSelectionRows(context.rangedCells.map(cell => cell.row.index)),
		}],
	},
};

function openSelectionWindow() {
	if (loading.value || importing.value || !canLoad.value) return;
	selectionItems.value = customEmojis.value.map(emoji => ({
		id: emoji.id,
		checked: selectedEmojis.value.has(emoji.id),
		url: emoji.publicUrl,
		name: emoji.name,
		host: emoji.host,
		license: emoji.license,
		uri: emoji.uri,
		publicUrl: emoji.publicUrl,
	}));
	selectionClosing.value = false;
	selectionOpen.value = true;
}

function onSelectionGridEvent(event: GridEvent) {
	if (selectionClosing.value || loading.value || importing.value || !canLoad.value) return;
	if (event.type !== 'cell-value-change') return;
	const item = selectionItems.value[event.row.index];
	if (item && event.column.setting.bindTo === 'checked') item.checked = event.newValue === true;
}

function applySelection() {
	if (selectionClosing.value || loading.value || importing.value || !canLoad.value) return;
	for (const item of selectionItems.value) {
		const emoji = customEmojis.value.find(emoji => emoji.id === item.id);
		if (emoji && item.checked) selectedEmojis.value.set(item.id, emoji);
		else selectedEmojis.value.delete(item.id);
	}
	requestSelectionClose();
}

function importSelectionRows(indexes: number[]) {
	if (selectionClosing.value || importing.value || !canLoad.value) return;
	const ids = new Set(indexes.flatMap(index => selectionItems.value[index] ? [selectionItems.value[index].id] : []));
	const targets = customEmojis.value.filter(emoji => ids.has(emoji.id));
	void importEmojis(targets);
}

function closeSelectionWindow() {
	selectionOpen.value = false;
	selectionItems.value = [];
	selectionClosing.value = false;
}

function requestSelectionClose() {
	selectionClosing.value = true;
	selectionWindow.value?.close();
}

function toggleSelection(emoji: Misskey.entities.EmojiDetailedAdmin) {
	if (loading.value || importing.value) return;
	if (selectedEmojis.value.has(emoji.id)) selectedEmojis.value.delete(emoji.id);
	else selectedEmojis.value.set(emoji.id, emoji);
}

function togglePageSelection() {
	if (loading.value || importing.value) return;
	const remove = allSelected.value;
	for (const emoji of customEmojis.value) {
		if (remove) selectedEmojis.value.delete(emoji.id);
		else selectedEmojis.value.set(emoji.id, emoji);
	}
}

function openFilters() {
	filtersOpen.value = true;
}

function applyFilters() {
	filtersOpen.value = false;
	void onSearchRequest();
}

function resetQuery() {
	queryName.value = null;
	queryHost.value = null;
	queryLicense.value = null;
	queryUri.value = null;
	queryPublicUrl.value = null;
}

async function onSearchRequest() {
	if (importing.value) return;
	appliedQuery = {
		name: emptyStrToUndefined(queryName.value),
		host: emptyStrToUndefined(queryHost.value),
		license: emptyStrToUndefined(queryLicense.value),
		uri: emptyStrToUndefined(queryUri.value),
		publicUrl: emptyStrToUndefined(queryPublicUrl.value),
		hostType: 'remote',
	};
	appliedSort = sortOrders.value.length > 0
		? sortOrders.value.map(({ key, direction }) => `${direction}${key}`) as NonNullable<Misskey.entities.V2AdminEmojiListRequest['sortKeys']>
		: undefined;
	if (page.value !== 1) page.value = 1;
	else await loadPage();
}

// 加载 page；页码和条数由分页组件双向绑定。
async function loadPage() {
	if (disposed) return;
	const requestedPage = page.value;
	if (!canLoad.value) {
		interrupted = true;
		return;
	}
	controller?.abort();
	controller = new AbortController();
	const signal = controller.signal;
	const revision = ++requestRevision;
	loading.value = true;
	loadError.value = false;
	try {
		const result = await misskeyApi('v2/admin/emoji/list', { query: appliedQuery, limit: pageSize.value, page: requestedPage, sortKeys: appliedSort }, undefined, signal);
		if (signal.aborted || revision !== requestRevision || disposed) return;
		const lastPage = Math.max(1, result.allPages);
		if (requestedPage > lastPage) {
			// 改页码后由 watch 重新加载最后一页。
			page.value = lastPage;
			return;
		}
		customEmojis.value = result.emojis;
		totalCount.value = result.allCount;
		// 切页不丢勾选，重载同一项时同步其最新数据。
		for (const emoji of result.emojis) if (selectedEmojis.value.has(emoji.id)) selectedEmojis.value.set(emoji.id, emoji);
		initialized.value = true;
	} catch {
		if (signal.aborted || revision !== requestRevision || disposed) return;
		initialized.value = true;
		loadError.value = true;
	} finally {
		if (revision === requestRevision) loading.value = false;
	}
}

function showDetails(emoji: Misskey.entities.EmojiDetailedAdmin) {
	if (loading.value || importing.value) return;
	const { dispose } = os.popup(MkRemoteEmojiEditDialog, {
		emoji: { id: emoji.id, name: emoji.name, host: emoji.host!, license: emoji.license, url: emoji.publicUrl },
	}, {
		done: () => {
			selectedEmojis.value.delete(emoji.id);
			const selected = selectionItems.value.find(item => item.id === emoji.id);
			if (selected) selected.checked = false;
			if (!disposed) void loadPage();
		},
		closed: () => dispose(),
	});
}

async function importEmojis(targets: Misskey.entities.EmojiDetailedAdmin[]) {
	if (importing.value || targets.length === 0 || !canLoad.value) return;
	const uniqueTargets = Array.from(new Map(targets.map(emoji => [emoji.id, emoji])).values());
	importing.value = true;
	try {
		const confirm = await os.confirm({
			type: 'info',
			title: i18n.ts._customEmojisManager._remote.confirmImportEmojisTitle,
			text: i18n.tsx._customEmojisManager._remote.confirmImportEmojisDescription({ count: uniqueTargets.length }),
		});
		if (confirm.canceled || disposed || !canLoad.value) return;
		const result = await os.promiseDialog(Promise.all(uniqueTargets.map(item =>
			misskeyApi('admin/emoji/copy', { emojiId: item.id })
				.then(() => ({ item, success: true, err: undefined }))
				.catch(err => ({ item, success: false, err })),
		)));
		requestLogs.value = result.map(({ item, success, err }) => ({
			failed: !success,
			url: item.publicUrl,
			name: item.name,
			error: err ? JSON.stringify(err) : undefined,
		}));
		for (const entry of result) if (entry.success) selectedEmojis.value.delete(entry.item.id);
		if (selectionOpen.value) {
			const importedIds = new Set(result.filter(entry => entry.success).map(entry => entry.item.id));
			for (const item of selectionItems.value) if (importedIds.has(item.id)) item.checked = false;
		}
		if (result.some(entry => !entry.success)) {
			await os.alert({ type: 'error', title: i18n.ts.somethingHappened, text: i18n.ts._customEmojisManager._gridCommon.alertEmojisRegisterFailedDescription });
		} else {
			os.toast(i18n.ts.added, 'success');
		}
		if (!disposed) await loadPage();
	} finally {
		importing.value = false;
	}
}

watch(canLoad, value => {
	if (!value) {
		interrupted = loading.value || interrupted;
		controller?.abort();
		requestRevision++;
		loading.value = false;
		filtersOpen.value = false;
		logsOpen.value = false;
		requestSelectionClose();
	} else if (interrupted) {
		interrupted = false;
		void loadPage();
	}
}, { flush: 'sync' });
onActivated(() => { active.value = true; });
onDeactivated(() => { active.value = false; });
onScopeDispose(() => {
	disposed = true;
	controller?.abort();
	requestRevision++;
});
watch([page, pageSize], () => { void loadPage(); });
onMounted(() => { void onSearchRequest(); });
</script>

<style module lang="scss">
.actions { --MI-toolbarFontSize: 1em; }

.selectAll {
	display: inline-flex;
	align-items: center;
	align-self: flex-start;
	gap: 8px;
	font-size: 1em;
}

.emojis {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr));
	gap: 12px;
	min-width: 0;
	font-size: 1em;
}

.emoji {
	position: relative;
	display: flex;
	flex-direction: column;
	min-width: 0;
	border: var(--MI-divider);
	border-radius: calc(var(--MI-radius) / 2);

	&:hover {
		border-color: var(--MI_THEME-inputBorderHover);
	}

	&.selected {
		border-color: var(--MI_THEME-accent);
		background: var(--MI_THEME-accentedBg);
	}
}

.checkbox {
	position: absolute;
	inset-block-start: 10px;
	inset-inline-start: 10px;
	z-index: 1;
	margin: 0;
	accent-color: var(--MI_THEME-accent);
}

.preview {
	display: grid;
	place-items: center;
	width: 100%;
	height: 112px;
	padding: 20px 16px 12px;
	box-sizing: border-box;

	> img {
		max-width: 100%;
		width: 80px;
		height: 80px;
		object-fit: contain;
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -2px;
	}
}

.body {
	flex: 1;
	min-width: 0;
	padding: 0 12px 10px;
}

.ellipsis,
.name,
.source {
	display: block;
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.name {
	width: 100%;
	font-size: 1em;
	font-weight: 600;
	text-align: start;
}

.source {
	margin-top: 4px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.meta {
	display: flex;
	align-items: center;
	gap: 4px;
	margin-top: 8px;
	color: var(--MI_THEME-fgTransparentWeak);

	> :first-child {
		flex: 1;
		min-width: 0;
	}
}

.itemActions {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 12px;
	padding: 8px 12px;
	border-top: var(--MI-divider);
}

.footer {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 12px;
	padding-inline: 16px;
	border-top: var(--MI-divider);
	font-size: 1em;

	:global(._pagination) {
		padding-inline: 0;
		border-top: none;
	}
}

.pagination {
	flex: 1 1 auto;
	min-width: 0;
}

.loading { padding: 0; }
</style>
