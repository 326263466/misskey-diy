<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="root" class="_adminPanel" :class="$style.root" :aria-busy="loading">
	<Teleport defer :to="toolbarTarget">
		<MkInput v-model="searchQuery.name" class="_adminToolbarField" type="search" :placeholder="i18n.ts.name" @enter="onSearchRequest"><template #label>{{ i18n.ts.name }}</template></MkInput>
		<MkButton small :disabled="operationBusy || !canInteract" @click="onSearchRequest"><i class="ti ti-search" aria-hidden="true"></i> {{ i18n.ts.search }}</MkButton>
		<MkButton small :disabled="operationBusy || !canInteract" aria-haspopup="dialog" :aria-expanded="searchWindowOpening" @click="openSearchWindow"><i class="ti ti-adjustments" aria-hidden="true"></i> {{ i18n.ts.filter }}</MkButton>
		<label :class="$style.selectAll"><input type="checkbox" :class="$style.checkbox" :checked="allVisibleSelected" :indeterminate="someVisibleSelected && !allVisibleSelected" :disabled="operationBusy || loading || !canInteract || visibleItems.length === 0" @change="toggleVisibleSelection"/>{{ i18n.ts._customEmojisManager.selectAll }}</label>
		<div class="_adminToolbarActions">
			<MkButton small :disabled="operationBusy || loading || !canInteract || visibleItems.length === 0" aria-haspopup="dialog" :aria-expanded="bulkEditorOpening" @click="openBulkEditor"><i class="ti ti-table" aria-hidden="true"></i> {{ i18n.ts.edit }} ({{ visibleItems.length }})</MkButton>
			<MkButton small primary :disabled="operationBusy || loading || !canInteract || editingItem != null || updatedItems.length === 0 || updateInvalid" @click="onUpdateButtonClicked">{{ i18n.ts.update }} ({{ updatedItems.length }})</MkButton>
			<MkButton small danger :disabled="operationBusy || loading || !canInteract || editingItem != null || selectedIds.size === 0" @click="onDeleteButtonClicked">{{ i18n.ts.delete }} ({{ selectedIds.size }})</MkButton>
			<MkButton small :disabled="operationBusy || !canInteract || editingItem != null || (drafts.size === 0 && selectedIds.size === 0)" @click="onResetButtonClicked">{{ i18n.ts.reset }}</MkButton>
			<MkButton v-tooltip.noDelay="i18n.ts._customEmojisManager._gridCommon.copySelectionRows" small iconOnly :disabled="selectedIds.size === 0 || !canInteract" :aria-label="i18n.ts._customEmojisManager._gridCommon.copySelectionRows" @click="copySelectedRows"><i class="ti ti-copy" aria-hidden="true"></i></MkButton>
			<MkButton v-tooltip.noDelay="i18n.ts.reload" small iconOnly :wait="loading" :disabled="operationBusy || !canInteract" :aria-label="i18n.ts.reload" @click="refreshCustomEmojis"><i class="ti ti-refresh" aria-hidden="true"></i></MkButton>
			<MkButton v-tooltip.noDelay="i18n.ts._customEmojisManager._gridCommon.registrationLogs" small iconOnly :disabled="!canInteract" :aria-label="i18n.ts._customEmojisManager._gridCommon.registrationLogs" @click="logsOpening = true"><i class="ti ti-notes" aria-hidden="true"></i></MkButton>
		</div>
	</Teleport>
	<div class="_adminPanelInset">
		<MkLoading v-if="!initialized && loading"/>
		<MkError v-else-if="loadError" @retry="loadPage"/>
		<MkResult v-else-if="visibleItems.length === 0" type="empty" :text="i18n.ts._customEmojisManager._local._list.emojisNothing"/>
		<ul v-else :class="$style.gallery" :aria-label="i18n.ts._customEmojisManager._local.tabTitleList">
			<li v-for="item in visibleItems" :key="item.id" :class="[$style.emojiItem, { [$style.changedItem]: drafts.has(item.id), [$style.selectedItem]: selectedIds.has(item.id), [$style.invalidItem]: validationErrors.get(item.id) != null }]" @contextmenu="onRowContextMenu(item, $event)">
				<input type="checkbox" :class="[$style.checkbox, $style.itemCheckbox]" :checked="selectedIds.has(item.id)" :disabled="operationBusy || loading || !canInteract" :aria-label="`${i18n.ts.delete}: ${item.name}`" @change="toggleSelection(item.id, $event)"/>
				<button type="button" class="_button" :class="$style.preview" :disabled="operationBusy || loading || !canInteract" :aria-label="`${i18n.ts.details}: ${item.name}`" aria-haspopup="dialog" @click="openEditor(item, $event, true)"><img :src="item.url" :alt="item.name" loading="lazy"/></button>
				<div :class="$style.itemBody">
					<button type="button" class="_button _monospace" :class="$style.itemName" :disabled="operationBusy || loading || !canInteract" :title="item.name" aria-haspopup="dialog" @click="openEditor(item, $event, true)">{{ item.name }}</button>
					<span :class="$style.category" :title="item.category || i18n.ts.uncategorized">{{ item.category || i18n.ts.uncategorized }}</span>
					<div :class="$style.statuses"><span v-if="item.isSensitive" class="_adminTableStatus" style="--admin-statusColor: var(--MI_THEME-warn)">{{ i18n.ts.sensitive }}</span><span v-if="item.localOnly" class="_adminTableStatus">{{ i18n.ts.localOnly }}</span><span v-if="drafts.has(item.id)" class="_adminTableStatus">{{ i18n.ts.draft }}</span></div>
					<div :class="$style.itemActions"><MkButton small :disabled="operationBusy || loading || !canInteract" aria-haspopup="dialog" @click="openEditor(item, $event)">{{ i18n.ts.edit }}</MkButton><button type="button" class="_button _textButton" :disabled="operationBusy || loading || !canInteract" aria-haspopup="dialog" @click="openEditor(item, $event, true)">{{ i18n.ts.details }}</button></div>
					<p v-if="validationErrors.get(item.id)" :class="$style.validationError">{{ validationErrors.get(item.id) }}</p>
				</div>
			</li>
		</ul>
	</div>
	<MkPaginationBar v-if="initialized" v-model:page="currentPage" v-model:pageSize="pageSize" :items="visibleItems" :total="totalCount" :disabled="operationBusy || loading || !canInteract"/>
</div>
<Teleport to="#misskey-popups" defer>
	<XSearch v-if="searchWindowOpening" :query="searchQuery" @queryUpdated="searchQuery = $event" @search="onSearchRequest" @closed="onSearchClosed"/>
	<MkModalWindow v-if="bulkEditorOpening" ref="bulkEditorWindow" :width="820" :height="620" :closeOnBackdrop="false" @close="closeBulkEditor" @esc="closeBulkEditor" @closed="onBulkEditorClosed">
		<template #header>{{ i18n.ts.edit }} ({{ bulkItems.length }})</template>
		<div :class="$style.bulkEditor"><MkGrid :data="bulkItems" :settings="bulkGridSettings" :class="$style.bulkGrid" v-on="bulkGridEvents"/></div>
		<template #footer><div class="_buttons"><MkButton small primary :disabled="bulkEditorClosing || !bulkValid || !canInteract" @click="applyBulkEditor">{{ i18n.ts.apply }}</MkButton><MkButton small @click="closeBulkEditor">{{ i18n.ts.cancel }}</MkButton></div></template>
	</MkModalWindow>
	<MkModalWindow v-if="editingItem" ref="editorWindow" :width="580" :height="660" autoHeight :closeOnBackdrop="false" @close="closeEditor" @esc="closeEditor" @closed="onEditorClosed">
		<template #header>{{ editorReadOnly ? i18n.ts.details : i18n.ts.edit }} - {{ editingItem.name }}</template>
		<div class="_spacer _spacerCard _gaps" :class="$style.editor">
			<div :class="$style.editorPreview"><img :src="editingItem.url" :alt="editingItem.name" loading="lazy"/><MkButton v-if="!editorReadOnly" small @click="selectEditorFile">{{ i18n.ts.selectFile }}</MkButton></div>
			<template v-if="editorReadOnly">
				<dl :class="$style.details">
					<dt>ID</dt><dd class="_monospace">{{ editingItem.id }}</dd>
					<dt>{{ i18n.ts.name }}</dt><dd>{{ editingItem.name }}</dd>
					<dt>{{ i18n.ts.category }}</dt><dd>{{ editingItem.category || '-' }}</dd>
					<dt>{{ i18n.ts._customEmojisManager._gridCommon.aliases }}</dt><dd>{{ editingItem.aliases || '-' }}</dd>
					<dt>{{ i18n.ts.license }}</dt><dd>{{ editingItem.license || '-' }}</dd>
					<dt>{{ i18n.ts.sensitive }}</dt><dd>{{ editingItem.isSensitive ? i18n.ts.yes : i18n.ts.no }}</dd>
					<dt>{{ i18n.ts.localOnly }}</dt><dd>{{ editingItem.localOnly ? i18n.ts.yes : i18n.ts.no }}</dd>
					<dt>{{ i18n.ts.role }}</dt><dd>{{ editingItem.roleIdsThatCanBeUsedThisEmojiAsReaction.map(role => role.name).join(', ') || '-' }}</dd>
					<dt>{{ i18n.ts.type }}</dt><dd>{{ editingItem.type || '-' }}</dd>
					<dt>{{ i18n.ts.updatedAt }}</dt><dd><MkTime v-if="editingItem.updatedAt" :time="editingItem.updatedAt" mode="absolute"/><span v-else>-</span></dd>
					<dt>publicUrl</dt><dd class="_selectable">{{ editingItem.publicUrl || '-' }}</dd>
					<dt>originalUrl</dt><dd class="_selectable">{{ editingItem.originalUrl || '-' }}</dd>
				</dl>
			</template>
			<template v-else>
				<div :class="$style.editorFields">
					<MkInput v-model="editingItem.name" required pattern="^[a-zA-Z0-9_]+$" autocapitalize="off"><template #label>{{ i18n.ts.name }}</template></MkInput>
					<MkInput v-model="editingItem.category"><template #label>{{ i18n.ts.category }}</template></MkInput>
					<MkInput v-model="editingItem.aliases"><template #label>{{ i18n.ts._customEmojisManager._gridCommon.aliases }}</template></MkInput>
					<MkInput v-model="editingItem.license"><template #label>{{ i18n.ts.license }}</template></MkInput>
				</div>
				<div class="_buttons"><MkSwitch v-model="editingItem.isSensitive">{{ i18n.ts.sensitive }}</MkSwitch><MkSwitch v-model="editingItem.localOnly">{{ i18n.ts.localOnly }}</MkSwitch></div>
				<MkInput :modelValue="editingItem.roleIdsThatCanBeUsedThisEmojiAsReaction.map(role => role.name).join(', ')" readonly @click="selectEditorRoles"><template #label>{{ i18n.ts.rolesThatCanBeUsedThisEmojiAsReaction }}</template><template #suffix><button type="button" class="_button _iconButton" :aria-label="i18n.ts.rolesThatCanBeUsedThisEmojiAsReaction" @click.stop="selectEditorRoles"><i class="ti ti-pencil" aria-hidden="true"></i></button></template></MkInput>
				<p v-if="editorValidation" :class="$style.validationError" role="alert">{{ editorValidation }}</p>
			</template>
		</div>
		<template #footer><div class="_buttons"><MkButton v-if="!editorReadOnly" small primary :disabled="editorClosing || editorValidation != null" @click="applyEditor">{{ i18n.ts.apply }}</MkButton><MkButton small @click="closeEditor">{{ editorReadOnly ? i18n.ts.close : i18n.ts.cancel }}</MkButton></div></template>
	</MkModalWindow>
	<MkModalWindow v-if="logsOpening" ref="logsWindow" :width="740" :height="580" autoHeight @close="logsWindow?.close()" @esc="logsWindow?.close()" @closed="logsOpening = false">
		<template #header>{{ i18n.ts._customEmojisManager._gridCommon.registrationLogs }}</template>
		<div class="_spacer _spacerCard"><XRegisterLogs :logs="requestLogs"/></div>
	</MkModalWindow>
</Teleport>
</template>

<script lang="ts">
import type { SortOrder } from '@/components/MkSortOrderEditor.define.js';
import type { GridSortOrderKey } from './custom-emojis-manager.impl.js';

export type EmojiSearchQuery = {
	name: string | null;
	category: string | null;
	aliases: string | null;
	type: string | null;
	license: string | null;
	updatedAtFrom: string | null;
	updatedAtTo: string | null;
	sensitive: 'true' | 'false' | null;
	localOnly: 'true' | 'false' | null;
	roles: { id: string; name: string }[];
	sortOrders: SortOrder<GridSortOrderKey>[];
};
</script>

<script setup lang="ts">
import { computed, defineAsyncComponent, inject, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import type { RequestLogItem } from '@/pages/admin/custom-emojis-manager.impl.js';
import type { CellValue } from '@/components/grid/cell.js';
import type { GridEvent } from '@/components/grid/grid-event.js';
import type { GridSetting } from '@/components/grid/grid.js';
import * as os from '@/os.js';
import { emptyStrToEmptyArray, emptyStrToNull, emptyStrToUndefined, roleIdsParser } from '@/pages/admin/custom-emojis-manager.impl.js';
import { validators } from '@/components/grid/cell-validators.js';
import { copyGridDataToClipboard, removeDataFromGrid } from '@/components/grid/grid-utils.js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkPaginationBar, { DEFAULT_PAGE_SIZE } from '@/components/MkPaginationBar.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { selectFile } from '@/utility/drive.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { DI } from '@/di.js';

const toolbarTarget = inject('adminEmojisToolbarTarget', '');

const XSearch = defineAsyncComponent(() => import('@/pages/admin/custom-emojis-manager.local.list.search.vue'));
const XRegisterLogs = defineAsyncComponent(() => import('@/pages/admin/custom-emojis-manager.logs.vue'));
const MkGrid = defineAsyncComponent(() => import('@/components/grid/MkGrid.vue'));

const optionalUpdateFields = ['category', 'license', 'isSensitive', 'localOnly'] as const;
type OptionalUpdateField = typeof optionalUpdateFields[number];

type EmojiItem = {
	id: string;
	url: string;
	name: string;
	category: string;
	aliases: string;
	license: string;
	isSensitive: boolean;
	localOnly: boolean;
	roleIdsThatCanBeUsedThisEmojiAsReaction: { id: string; name: string }[];
	fileId?: string;
	updatedAt: string | null;
	publicUrl: string;
	originalUrl: string;
	type: string | null;
	omittedUpdateFields?: OptionalUpdateField[];
};

const root = useTemplateRef('root');
const pageActive = inject(DI.pageActive, ref(true));
const componentActive = ref(true);
const canInteract = computed(() => pageActive.value && componentActive.value);
const initialized = ref(false);
const loading = ref(true);
const loadError = ref(false);
const currentPage = ref(1);
const pageSize = ref(DEFAULT_PAGE_SIZE);
const totalCount = ref(0);
const operationBusy = ref(false);

// 草稿和删除选择按 ID 保存；翻页、筛选和重新请求只替换当前可见行。
const originals = ref(new Map<string, EmojiItem>());
const drafts = ref(new Map<string, EmojiItem>());
const selectedIds = ref(new Set<string>());
const visibleIds = ref<string[]>([]);
const visibleItems = computed(() => visibleIds.value.map(id => drafts.value.get(id) ?? originals.value.get(id)).filter((item): item is EmojiItem => item != null));
const allVisibleSelected = computed(() => visibleIds.value.length > 0 && visibleIds.value.every(id => selectedIds.value.has(id)));
const someVisibleSelected = computed(() => visibleIds.value.some(id => selectedIds.value.has(id)));
const updatedItems = computed(() => [...drafts.value.values()].filter(item => !selectedIds.value.has(item.id)));
const knownNames = computed(() => {
	const names = new Map<string, Set<string>>();
	for (const [id, original] of originals.value) {
		const name = (drafts.value.get(id) ?? original).name;
		const ids = names.get(name) ?? new Set<string>();
		ids.add(id);
		names.set(name, ids);
	}
	return names;
});
const validationErrors = computed(() => new Map(visibleItems.value.map(item => [item.id, validateItem(item)])));
const updateInvalid = computed(() => updatedItems.value.some(item => validateItem(item) != null));

const searchQuery = ref<EmojiSearchQuery>({
	name: null, category: null, aliases: null, type: null, license: null,
	updatedAtFrom: null, updatedAtTo: null, sensitive: null, localOnly: null,
	roles: [], sortOrders: [],
});
const searchWindowOpening = ref(false);
let searchFocusTarget: HTMLElement | null = null;
const logsOpening = ref(false);
const logsWindow = useTemplateRef('logsWindow');
const requestLogs = ref<RequestLogItem[]>([]);
let appliedQuery = buildQuery(searchQuery.value);
let appliedSort: Misskey.entities.V2AdminEmojiListRequest['sortKeys'];
let controller: AbortController | null = null;
let requestRevision = 0;
let interrupted = false;

function copyItem(item: EmojiItem): EmojiItem {
	return { ...item, roleIdsThatCanBeUsedThisEmojiAsReaction: item.roleIdsThatCanBeUsedThisEmojiAsReaction.map(role => ({ ...role })), omittedUpdateFields: item.omittedUpdateFields?.slice() };
}

function fromEmoji(emoji: Misskey.entities.EmojiDetailedAdmin): EmojiItem {
	return {
		id: emoji.id, url: emoji.publicUrl, name: emoji.name, category: emoji.category ?? '',
		aliases: emoji.aliases.join(' '), license: emoji.license ?? '', isSensitive: emoji.isSensitive,
		localOnly: emoji.localOnly, roleIdsThatCanBeUsedThisEmojiAsReaction: emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.map(role => ({ ...role })),
		updatedAt: emoji.updatedAt, publicUrl: emoji.publicUrl, originalUrl: emoji.originalUrl, type: emoji.type,
	};
}

function editableValue(item: EmojiItem) {
	return JSON.stringify({
		name: item.name, url: item.url, fileId: item.fileId, category: item.category, aliases: item.aliases,
		license: item.license, isSensitive: item.isSensitive, localOnly: item.localOnly,
		roleIds: item.roleIdsThatCanBeUsedThisEmojiAsReaction.map(role => role.id),
		omittedUpdateFields: item.omittedUpdateFields?.length ? item.omittedUpdateFields : undefined,
	});
}

function validateItem(item: EmojiItem): string | null {
	if (!item.url || !item.name) return i18n.ts._gridComponent._error.requiredValue;
	if (!/^[a-zA-Z0-9_]+$/.test(item.name)) return i18n.ts.usernameInvalidFormat;
	const sameNameIds = knownNames.value.get(item.name);
	if (sameNameIds && (sameNameIds.size > 1 || !sameNameIds.has(item.id))) return i18n.ts._gridComponent._error.notUnique;
	return null;
}

function buildQuery(query: EmojiSearchQuery): Misskey.entities.V2AdminEmojiListRequest['query'] {
	return {
		name: emptyStrToUndefined(query.name), type: emptyStrToUndefined(query.type),
		aliases: emptyStrToUndefined(query.aliases), category: emptyStrToUndefined(query.category), license: emptyStrToUndefined(query.license),
		isSensitive: query.sensitive == null ? undefined : query.sensitive === 'true',
		localOnly: query.localOnly == null ? undefined : query.localOnly === 'true',
		updatedAtFrom: emptyStrToUndefined(query.updatedAtFrom), updatedAtTo: emptyStrToUndefined(query.updatedAtTo),
		roleIds: query.roles.map(role => role.id), hostType: 'local',
	};
}

function cancelLoad() {
	interrupted ||= loading.value;
	requestRevision++;
	controller?.abort();
	controller = null;
	loading.value = false;
}

// 加载 currentPage；页码和条数由分页组件双向绑定。
async function loadPage() {
	if (!canInteract.value) {
		interrupted = true;
		return;
	}
	controller?.abort();
	const currentController = new AbortController();
	controller = currentController;
	const request = ++requestRevision;
	interrupted = false;
	loading.value = true;
	loadError.value = false;
	const target = currentPage.value;
	try {
		const result = await misskeyApi('v2/admin/emoji/list', { query: appliedQuery, sortKeys: appliedSort, limit: pageSize.value, page: target }, undefined, currentController.signal);
		if (request !== requestRevision || !canInteract.value) return;
		const lastPage = Math.max(1, result.allPages);
		if (target > lastPage) {
			// 改页码后由 watch 重新加载最后一页。
			currentPage.value = lastPage;
			return;
		}
		for (const emoji of result.emojis) {
			// 不用最新响应覆盖未提交草稿的基线，避免刷新把失败编辑抹掉。
			if (!drafts.value.has(emoji.id)) originals.value.set(emoji.id, fromEmoji(emoji));
		}
		visibleIds.value = result.emojis.map(emoji => emoji.id);
		const visible = new Set(visibleIds.value);
		for (const id of originals.value.keys()) {
			if (!visible.has(id) && !drafts.value.has(id) && !selectedIds.value.has(id)) originals.value.delete(id);
		}
		totalCount.value = result.allCount;
		initialized.value = true;
	} catch {
		if (request === requestRevision && !currentController.signal.aborted) {
			loadError.value = true;
			initialized.value = true;
		}
	} finally {
		if (request === requestRevision) {
			loading.value = false;
			controller = null;
		}
	}
}

function refreshCustomEmojis() { return loadPage(); }

function onSearchRequest() {
	if (operationBusy.value || !canInteract.value) return;
	appliedQuery = buildQuery(searchQuery.value);
	appliedSort = searchQuery.value.sortOrders.map(({ key, direction }) => `${direction}${key}`) as Misskey.entities.V2AdminEmojiListRequest['sortKeys'];
	if (currentPage.value !== 1) currentPage.value = 1;
	else void loadPage();
}

function openSearchWindow(event: PointerEvent) {
	if (operationBusy.value || !canInteract.value || searchWindowOpening.value) return;
	searchFocusTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
	searchWindowOpening.value = true;
}

function onSearchClosed() {
	searchWindowOpening.value = false;
	const target = searchFocusTarget;
	searchFocusTarget = null;
	nextTick(() => { if (canInteract.value && target?.isConnected) target.focus({ preventScroll: true }); });
}

function toggleSelection(id: string, event: Event) {
	if (operationBusy.value || loading.value || !canInteract.value) return;
	if ((event.target as HTMLInputElement).checked) selectedIds.value.add(id);
	else selectedIds.value.delete(id);
}

function toggleVisibleSelection(event: Event) {
	if (operationBusy.value || loading.value || !canInteract.value) return;
	const checked = (event.target as HTMLInputElement).checked;
	for (const id of visibleIds.value) {
		if (checked) selectedIds.value.add(id);
		else selectedIds.value.delete(id);
	}
}

function copyRows(items: EmojiItem[]) {
	const text = items.map(item => [
		selectedIds.value.has(item.id), item.url, item.name,
		item.omittedUpdateFields?.includes('category') ? undefined : item.category,
		item.aliases, item.omittedUpdateFields?.includes('license') ? undefined : item.license,
		item.omittedUpdateFields?.includes('isSensitive') ? undefined : item.isSensitive,
		item.omittedUpdateFields?.includes('localOnly') ? undefined : item.localOnly,
		item.roleIdsThatCanBeUsedThisEmojiAsReaction,
		item.type, item.updatedAt, item.publicUrl, item.originalUrl,
	].map(value => typeof value === 'object' ? JSON.stringify(value) : value?.toString() ?? '').join('\t')).join('\n');
	void copyToClipboard(text);
}

function copySelectedRows() {
	const items = [...originals.value.keys()].filter(id => selectedIds.value.has(id)).map(id => drafts.value.get(id) ?? originals.value.get(id)).filter((item): item is EmojiItem => item != null);
	copyRows(items);
}

function onRowContextMenu(item: EmojiItem, event: PointerEvent) {
	if (!canInteract.value) return;
	os.contextMenu([{
		text: i18n.ts._customEmojisManager._gridCommon.copySelectionRows,
		icon: 'ti ti-copy',
		action: () => selectedIds.value.has(item.id) ? copySelectedRows() : copyRows([item]),
	}, {
		text: i18n.ts._customEmojisManager._local._list.markAsDeleteTargetRows,
		icon: 'ti ti-trash',
		action: () => {
			if (operationBusy.value || loading.value || !canInteract.value) return;
			selectedIds.value.add(item.id);
		},
	}], event);
}

async function onUpdateButtonClicked() {
	if (operationBusy.value || loading.value || !canInteract.value || editingItem.value || updatedItems.value.length === 0 || updateInvalid.value) return;
	operationBusy.value = true;
	try {
		const items = updatedItems.value.map(copyItem);
		const { canceled } = await os.confirm({ type: 'info', text: i18n.tsx._customEmojisManager._local._list.confirmUpdateEmojisDescription({ count: items.length }) });
		if (canceled || !canInteract.value) return;
		const result = await os.promiseDialog(Promise.all(items.map(async item => {
			try {
				await misskeyApi('admin/emoji/update', {
					id: item.id, name: item.name, category: item.omittedUpdateFields?.includes('category') ? undefined : emptyStrToNull(item.category), aliases: emptyStrToEmptyArray(item.aliases),
					license: item.omittedUpdateFields?.includes('license') ? undefined : emptyStrToNull(item.license),
					isSensitive: item.omittedUpdateFields?.includes('isSensitive') ? undefined : item.isSensitive,
					localOnly: item.omittedUpdateFields?.includes('localOnly') ? undefined : item.localOnly,
					roleIdsThatCanBeUsedThisEmojiAsReaction: item.roleIdsThatCanBeUsedThisEmojiAsReaction.map(role => role.id), fileId: item.fileId,
				});
				return { item, success: true, err: undefined };
			} catch (err) {
				return { item, success: false, err };
			}
		})));
		requestLogs.value = result.map(({ item, success, err }) => ({ failed: !success, url: item.url, name: item.name, error: err ? JSON.stringify(err) : undefined }));
		for (const { item, success } of result) {
			if (!success) continue;
			const saved = copyItem(item);
			delete saved.fileId;
			delete saved.omittedUpdateFields;
			originals.value.set(item.id, saved);
			drafts.value.delete(item.id);
		}
		await refreshCustomEmojis();
		if (!canInteract.value) return;
		if (result.some(entry => !entry.success)) await os.alert({ type: 'error', title: i18n.ts.somethingHappened, text: i18n.ts._customEmojisManager._gridCommon.alertEmojisRegisterFailedDescription });
		else os.toast(i18n.ts.saved, 'success');
	} finally {
		operationBusy.value = false;
	}
}

async function onDeleteButtonClicked() {
	if (operationBusy.value || loading.value || !canInteract.value || editingItem.value || selectedIds.value.size === 0) return;
	operationBusy.value = true;
	try {
		const ids = [...selectedIds.value];
		const { canceled } = await os.confirm({ type: 'info', text: i18n.tsx._customEmojisManager._local._list.confirmDeleteEmojisDescription({ count: ids.length }) });
		if (canceled || !canInteract.value) return;
		const items = ids.map(id => drafts.value.get(id) ?? originals.value.get(id)).filter((item): item is EmojiItem => item != null);
		try {
			await os.promiseDialog(misskeyApi('admin/emoji/delete-bulk', { ids }));
		} catch (err) {
			requestLogs.value = items.map(item => ({ failed: true, url: item.url, name: item.name, error: JSON.stringify(err) }));
			return;
		}
		requestLogs.value = items.map(item => ({ failed: false, url: item.url, name: item.name }));
		for (const id of ids) {
			originals.value.delete(id);
			drafts.value.delete(id);
			selectedIds.value.delete(id);
		}
		visibleIds.value = visibleIds.value.filter(id => !ids.includes(id));
		await refreshCustomEmojis();
		if (canInteract.value) os.toast(i18n.ts.deleteSucceeded, 'success');
	} finally {
		operationBusy.value = false;
	}
}

async function onResetButtonClicked() {
	if (operationBusy.value || !canInteract.value || editingItem.value) return;
	operationBusy.value = true;
	try {
		const { canceled } = await os.confirm({ type: 'warning', title: i18n.ts.resetAreYouSure, text: i18n.ts._customEmojisManager._local._list.confirmResetDescription });
		if (canceled || !canInteract.value) return;
		drafts.value.clear();
		selectedIds.value.clear();
		await refreshCustomEmojis();
	} finally {
		operationBusy.value = false;
	}
}

type BulkItem = Record<string, CellValue> & { id: string; checked: boolean };
type EmojiRole = EmojiItem['roleIdsThatCanBeUsedThisEmojiAsReaction'][number];
const bulkItems = ref<BulkItem[]>([]);
const bulkEditorOpening = ref(false);
const bulkEditorClosing = ref(false);
const bulkEditorWindow = useTemplateRef('bulkEditorWindow');
const bulkGridEvents = ref({ event: (event: GridEvent) => onBulkGridEvent(event, -1) });
const bulkValid = computed(() => bulkItems.value.every(item => item.checked || validateBulkItem(item) == null));
const bulkEditorRevision = ref(0);
let bulkFocusTarget: HTMLElement | null = null;
let bulkEditorBase = new Map<string, EmojiItem>();

function validateBulkItem(item: BulkItem): string | null {
	if (!item.url || !item.name) return i18n.ts._gridComponent._error.requiredValue;
	if (typeof item.name !== 'string' || !/^[a-zA-Z0-9_]+$/.test(item.name)) return i18n.ts.usernameInvalidFormat;
	if (readBulkRoles(item.roleIdsThatCanBeUsedThisEmojiAsReaction) == null) return i18n.ts.invalidParamError;
	if (bulkItems.value.some(other => other.id !== item.id && other.name === item.name)) return i18n.ts._gridComponent._error.notUnique;
	const sameNameIds = knownNames.value.get(item.name);
	if (sameNameIds && [...sameNameIds].some(id => id !== item.id && !bulkEditorBase.has(id))) return i18n.ts._gridComponent._error.notUnique;
	return null;
}

function readBulkRoles(value: CellValue): EmojiRole[] | null {
	if (!Array.isArray(value) || !value.every(role => role != null && typeof role === 'object' && typeof role.id === 'string' && typeof role.name === 'string')) return null;
	return value as EmojiRole[];
}

function isCurrentBulkEditor(items: BulkItem[], revision: number): boolean {
	return bulkEditorOpening.value && !bulkEditorClosing.value && bulkItems.value === items && revision === bulkEditorRevision.value && canInteract.value;
}

// 原网格仅作为弹窗工作副本；复制、清空、粘贴等沿用公共网格逻辑。
const bulkGridSettings: GridSetting = {
	root: { rounded: false, outerBorder: false, noOverflowStyle: true },
	row: {
		showNumber: true,
		selectable: true,
		minimumDefinitionCount: 0,
		contextMenuFactory: (_row, context) => {
			const items = bulkItems.value;
			const revision = bulkEditorRevision.value;
			return [{
				text: i18n.ts._customEmojisManager._gridCommon.copySelectionRows,
				icon: 'ti ti-copy',
				action: () => { if (isCurrentBulkEditor(items, revision)) copyGridDataToClipboard(items, context); },
			}, {
				text: i18n.ts._customEmojisManager._local._list.markAsDeleteTargetRows,
				icon: 'ti ti-trash',
				action: () => {
					if (!isCurrentBulkEditor(items, revision)) return;
					for (const row of context.rangedRows) items[row.index].checked = true;
				},
			}];
		},
		events: {
			delete(rows) {
				for (const row of rows) bulkItems.value[row.index].checked = true;
			},
		},
	},
	cols: [
		{ bindTo: 'checked', icon: 'ti-trash', type: 'boolean', editable: true, width: 34 },
		{
			bindTo: 'url', icon: 'ti-icons', type: 'image', editable: true, width: 72, validators: [validators.required()],
			async customValueEditor(row, _column, _value, cellElement) {
				const item = bulkItems.value[row.index];
				const revision = bulkEditorRevision.value;
				try {
					const file = await selectFile({ anchorElement: cellElement, multiple: false });
					if (!file || revision !== bulkEditorRevision.value || bulkItems.value[row.index] !== item || !canInteract.value) return item.url;
					item.url = file.url;
					item.fileId = file.id;
					item.publicUrl = file.url;
					item.originalUrl = file.url;
					item.type = file.type;
					return file.url;
				} catch {
					return item.url;
				}
			},
		},
		{ bindTo: 'name', title: i18n.ts.name, type: 'text', editable: true, width: 140, validators: [validators.required(), validators.regex(/^[a-zA-Z0-9_]+$/), validators.unique()] },
		{ bindTo: 'category', title: i18n.ts.category, type: 'text', editable: true, width: 140 },
		{ bindTo: 'aliases', title: i18n.ts._customEmojisManager._gridCommon.aliases, type: 'text', editable: true, width: 140 },
		{ bindTo: 'license', title: i18n.ts.license, type: 'text', editable: true, width: 140 },
		{ bindTo: 'isSensitive', title: i18n.ts.sensitive, type: 'boolean', editable: true, width: 110 },
		{ bindTo: 'localOnly', title: i18n.ts.localOnly, type: 'boolean', editable: true, width: 110 },
		{
			bindTo: 'roleIdsThatCanBeUsedThisEmojiAsReaction', title: i18n.ts.role, type: 'text', editable: true, width: 140,
			valueTransformer: row => (readBulkRoles(bulkItems.value[row.index].roleIdsThatCanBeUsedThisEmojiAsReaction) ?? []).map(role => role.name).join(', '),
			async customValueEditor(row) {
				const item = bulkItems.value[row.index];
				const current = readBulkRoles(item.roleIdsThatCanBeUsedThisEmojiAsReaction) ?? [];
				const revision = bulkEditorRevision.value;
				const result = await os.selectRole({
					initialRoleIds: current.map(role => role.id), title: i18n.ts.rolesThatCanBeUsedThisEmojiAsReaction,
					infoMessage: i18n.ts.rolesThatCanBeUsedThisEmojiAsReactionEmptyDescription, publicOnly: true,
				});
				if (result.canceled || revision !== bulkEditorRevision.value || bulkItems.value[row.index] !== item || !canInteract.value) return current;
				const roles = result.result.map(role => ({ id: role.id, name: role.name }));
				item.roleIdsThatCanBeUsedThisEmojiAsReaction = roles;
				return roles;
			},
			events: {
				paste: roleIdsParser,
				delete(cell) { bulkItems.value[cell.row.index].roleIdsThatCanBeUsedThisEmojiAsReaction = []; },
			},
		},
		{ bindTo: 'type', title: i18n.ts.type, type: 'text', editable: false, width: 110 },
		{ bindTo: 'updatedAt', title: i18n.ts.updatedAt, type: 'text', editable: false, width: 180 },
		{ bindTo: 'publicUrl', title: 'publicUrl', type: 'text', editable: false, width: 180 },
		{ bindTo: 'originalUrl', title: 'originalUrl', type: 'text', editable: false, width: 180 },
	],
	cells: {
		contextMenuFactory: (_col, _row, _value, context) => {
			const items = bulkItems.value;
			const revision = bulkEditorRevision.value;
			return [{
				text: i18n.ts._customEmojisManager._gridCommon.copySelectionRanges,
				icon: 'ti ti-copy',
				action: () => { if (isCurrentBulkEditor(items, revision)) copyGridDataToClipboard(items, context); },
			}, {
				text: i18n.ts._customEmojisManager._gridCommon.deleteSelectionRanges,
				icon: 'ti ti-trash',
				action: () => {
					if (!isCurrentBulkEditor(items, revision)) return;
					removeDataFromGrid(context, cell => { items[cell.row.index][cell.column.setting.bindTo] = undefined; });
				},
			}, {
				text: i18n.ts._customEmojisManager._local._list.markAsDeleteTargetRanges,
				icon: 'ti ti-trash',
				action: () => {
					if (!isCurrentBulkEditor(items, revision)) return;
					for (const cell of context.rangedCells) items[cell.row.index].checked = true;
				},
			}];
		},
	},
};

function openBulkEditor(event: PointerEvent) {
	if (operationBusy.value || loading.value || !canInteract.value || editingItem.value || bulkEditorOpening.value) return;
	bulkFocusTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
	bulkEditorRevision.value++;
	const items = visibleItems.value.map(copyItem);
	bulkEditorBase = new Map(items.map(item => [item.id, item]));
	bulkItems.value = items.map(item => {
		const bulk: BulkItem = { ...copyItem(item), checked: selectedIds.value.has(item.id) };
		for (const field of item.omittedUpdateFields ?? []) bulk[field] = undefined;
		return bulk;
	});
	const revision = bulkEditorRevision.value;
	bulkGridEvents.value = { event: event => onBulkGridEvent(event, revision) };
	bulkEditorClosing.value = false;
	bulkEditorOpening.value = true;
}

function onBulkGridEvent(event: GridEvent, revision: number) {
	if (event.type !== 'cell-value-change' || bulkEditorClosing.value || !bulkEditorOpening.value || revision !== bulkEditorRevision.value || !canInteract.value) return;
	const item = bulkItems.value[event.row.index];
	if (item) item[event.column.setting.bindTo] = event.newValue;
}

function closeBulkEditor() {
	bulkEditorRevision.value++;
	bulkEditorClosing.value = true;
	bulkEditorWindow.value?.close();
}

function onBulkEditorClosed() {
	bulkEditorOpening.value = false;
	bulkItems.value = [];
	bulkEditorBase.clear();
	const target = bulkFocusTarget;
	bulkFocusTarget = null;
	nextTick(() => { if (canInteract.value && target?.isConnected) target.focus({ preventScroll: true }); });
}

function applyBulkEditor() {
	if (!bulkValid.value || bulkEditorClosing.value || !canInteract.value) return;
	for (const bulk of bulkItems.value) {
		const base = bulkEditorBase.get(bulk.id);
		const original = originals.value.get(bulk.id);
		if (!base || !original) continue;
		if (bulk.checked) selectedIds.value.add(bulk.id);
		else selectedIds.value.delete(bulk.id);
		if (validateBulkItem(bulk) != null) continue;
		// 清空的网格值不提交该字段，也撤销此前草稿中的该字段修改。
		const item: EmojiItem = {
			...base, url: String(bulk.url), name: String(bulk.name), category: typeof bulk.category === 'string' ? bulk.category : original.category,
			aliases: typeof bulk.aliases === 'string' ? bulk.aliases : original.aliases, license: typeof bulk.license === 'string' ? bulk.license : original.license,
			isSensitive: typeof bulk.isSensitive === 'boolean' ? bulk.isSensitive : original.isSensitive, localOnly: typeof bulk.localOnly === 'boolean' ? bulk.localOnly : original.localOnly,
			roleIdsThatCanBeUsedThisEmojiAsReaction: (readBulkRoles(bulk.roleIdsThatCanBeUsedThisEmojiAsReaction) ?? base.roleIdsThatCanBeUsedThisEmojiAsReaction).map(role => ({ ...role })),
			fileId: typeof bulk.fileId === 'string' ? bulk.fileId : undefined,
			publicUrl: String(bulk.publicUrl ?? ''), originalUrl: String(bulk.originalUrl ?? ''),
			type: typeof bulk.type === 'string' ? bulk.type : null,
			omittedUpdateFields: optionalUpdateFields.filter(field => bulk[field] === undefined),
		};
		if (editableValue(item) === editableValue(original)) drafts.value.delete(item.id);
		else drafts.value.set(item.id, item);
	}
	closeBulkEditor();
}

const editingItem = ref<EmojiItem | null>(null);
const editorReadOnly = ref(false);
const editorClosing = ref(false);
const editorWindow = useTemplateRef('editorWindow');
const editorValidation = computed(() => editingItem.value ? validateItem(editingItem.value) : null);
let editorFocusTarget: HTMLElement | null = null;
let editorRevision = 0;
let fileSelectionRevision = 0;
let roleSelectionRevision = 0;

function openEditor(item: EmojiItem, event: MouseEvent, readOnly = false) {
	if (operationBusy.value || loading.value || !canInteract.value || editingItem.value != null) return;
	editorFocusTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
	editorRevision++;
	editorClosing.value = false;
	editorReadOnly.value = readOnly;
	editingItem.value = copyItem(item);
}

function closeEditor() {
	editorRevision++;
	editorClosing.value = true;
	editorWindow.value?.close();
}

function onEditorClosed() {
	editingItem.value = null;
	editorClosing.value = false;
	const target = editorFocusTarget;
	editorFocusTarget = null;
	nextTick(() => {
		if (!canInteract.value) return;
		const nextTarget = target?.isConnected ? target : root.value?.querySelector<HTMLButtonElement>('button');
		nextTarget?.focus({ preventScroll: true });
	});
}

function applyEditor() {
	const item = editingItem.value;
	if (!item || editorReadOnly.value || editorClosing.value || !canInteract.value || validateItem(item) != null) return;
	const original = originals.value.get(item.id);
	if (!original) return;
	const previous = drafts.value.get(item.id) ?? original;
	item.omittedUpdateFields = item.omittedUpdateFields?.filter(field => item[field] === previous[field]);
	if (editableValue(item) === editableValue(original)) drafts.value.delete(item.id);
	else drafts.value.set(item.id, copyItem(item));
	closeEditor();
}

async function selectEditorFile(event: PointerEvent) {
	const item = editingItem.value;
	if (!item || editorReadOnly.value || editorClosing.value || !canInteract.value) return;
	const revision = editorRevision;
	const selection = ++fileSelectionRevision;
	try {
		const file = await selectFile({ anchorElement: event.currentTarget, multiple: false });
		if (!file || editingItem.value !== item || revision !== editorRevision || selection !== fileSelectionRevision || !canInteract.value) return;
		item.url = file.url;
		item.fileId = file.id;
		item.publicUrl = file.url;
		item.originalUrl = file.url;
		item.type = file.type;
	} catch {
		// 文件选择取消或上传失败时保留编辑中的文件。
	}
}

async function selectEditorRoles() {
	const item = editingItem.value;
	if (!item || editorReadOnly.value || editorClosing.value || !canInteract.value) return;
	const revision = editorRevision;
	const selection = ++roleSelectionRevision;
	const result = await os.selectRole({
		initialRoleIds: item.roleIdsThatCanBeUsedThisEmojiAsReaction.map(role => role.id),
		title: i18n.ts.rolesThatCanBeUsedThisEmojiAsReaction, infoMessage: i18n.ts.rolesThatCanBeUsedThisEmojiAsReactionEmptyDescription, publicOnly: true,
	});
	if (result.canceled || editingItem.value !== item || revision !== editorRevision || selection !== roleSelectionRevision || !canInteract.value) return;
	item.roleIdsThatCanBeUsedThisEmojiAsReaction = result.result.map(role => ({ id: role.id, name: role.name }));
}

watch(canInteract, active => {
	if (!active) {
		cancelLoad();
		editorRevision++;
		editingItem.value = null;
		editorFocusTarget = null;
		searchWindowOpening.value = false;
		searchFocusTarget = null;
		logsOpening.value = false;
		bulkEditorRevision.value++;
		bulkEditorOpening.value = false;
		bulkItems.value = [];
		bulkEditorBase.clear();
		bulkFocusTarget = null;
	} else if (interrupted) {
		void loadPage();
	}
}, { flush: 'sync' });
watch([currentPage, pageSize], () => { void loadPage(); });
onMounted(() => { void loadPage(); });
onActivated(() => { componentActive.value = true; });
onDeactivated(() => { componentActive.value = false; });
onUnmounted(() => { componentActive.value = false; cancelLoad(); });
</script>

<style module lang="scss">
.root {
	min-width: 0;
	font-size: 1em;
}

.gallery {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr));
	gap: 16px;
	padding: 0;
	margin: 0;
	list-style: none;
}
.emojiItem {
	position: relative;
	min-width: 0;
	border: var(--MI-divider);
	border-radius: calc(var(--MI-radius) / 2);
	background: var(--MI_THEME-panel);
	overflow: clip;

	&:hover { border-color: var(--MI_THEME-inputBorderHover); }
	&.changedItem { border-color: var(--MI_THEME-accent); }
	&.selectedItem { background: var(--MI_THEME-accentedBg); border-color: var(--MI_THEME-accent); }
	&.invalidItem { border-color: var(--MI_THEME-error); }
}
.preview {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 100%;
	height: 144px;
	box-sizing: border-box;
	padding: 20px;
	background-image: linear-gradient(45deg, var(--MI_THEME-panelHighlight) 25%, transparent 25%, transparent 75%, var(--MI_THEME-panelHighlight) 75%), linear-gradient(45deg, var(--MI_THEME-panelHighlight) 25%, transparent 25%, transparent 75%, var(--MI_THEME-panelHighlight) 75%);
	background-position: 0 0, 8px 8px;
	background-size: 16px 16px;

	> img { display: block; width: 100%; height: 100%; object-fit: contain; }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}
.itemBody { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
.itemName { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: start; font-size: 1em; }
.itemName:hover { color: var(--MI_THEME-accent); }
.category { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--MI_THEME-fgTransparentWeak); }
.itemActions { --MI-toolbarFontSize: 1em; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.selectAll { display: inline-flex; align-items: center; gap: 8px; padding-block: 8px; }
.checkbox { margin: 0; width: 16px; height: 16px; accent-color: var(--MI_THEME-accent); }
.itemCheckbox { position: absolute; inset-inline-start: 10px; top: 10px; z-index: 1; }
.statuses { display: flex; flex-wrap: wrap; gap: 4px; }
.validationError { margin: 4px 0 0; color: var(--MI_THEME-error); }
.editor { font-size: 1em; }
.bulkEditor { padding: 16px; }
.bulkGrid { width: max-content; font-size: 1em; }
.editorPreview { display: flex; align-items: center; gap: 16px; }
.editorPreview > img { width: 80px; height: 64px; object-fit: contain; }
.editorFields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.details { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 12px 16px; margin: 0; }
.details > dt { color: var(--MI_THEME-fgTransparentWeak); }
.details > dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }

@media (max-width: 480px) {
	.editorFields { grid-template-columns: minmax(0, 1fr); }
	.details { grid-template-columns: minmax(0, 1fr); gap: 6px; }
	.details > dd { margin-bottom: 10px; }
}
</style>
