<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_pageBody">
	<MkPaginationBar v-slot="{ items }" :items="draftItems" :disabled="busy" class="_adminPanel">
		<Teleport defer :to="toolbarTarget">
			<div class="_adminToolbarActions" :class="$style.actions">
				<MkButton small primary :disabled="busy" @click="onFileSelectClicked"><i class="ti ti-upload" aria-hidden="true"></i> {{ i18n.ts.upload }}</MkButton>
				<MkButton small :disabled="busy" @click="onDriveSelectClicked"><i class="ti ti-cloud" aria-hidden="true"></i> {{ i18n.ts.fromDrive }}</MkButton>
				<MkButton small primary :disabled="registerButtonDisabled" :wait="registering" @click="onRegistryClicked"><i class="ti ti-check" aria-hidden="true"></i> {{ i18n.ts.registration }} ({{ draftItems.length }})</MkButton>
				<MkButton small :disabled="draftItems.length === 0 || busy" @click="onClearClicked">{{ i18n.ts.clear }}</MkButton>
				<MkButton small :disabled="draftItems.length === 0 || busy" @click="openBatchEditor(items)"><i class="ti ti-table" aria-hidden="true"></i> {{ i18n.ts.edit }}</MkButton>
				<MkButton v-if="selectedDraftIds.size > 0" small :disabled="busy" @click="copySelected"><i class="ti ti-copy" aria-hidden="true"></i> {{ i18n.ts.copy }} ({{ selectedDraftIds.size }})</MkButton>
				<MkButton v-if="selectedDraftIds.size > 0" small danger :disabled="busy" @click="removeSelected"><i class="ti ti-trash" aria-hidden="true"></i> {{ i18n.ts.delete }}</MkButton>
				<MkButton small :disabled="busy || settingsBusy" @click="openUploadSettings"><i class="ti ti-settings" aria-hidden="true"></i> {{ i18n.ts._customEmojisManager._local._register.uploadSettingTitle }}</MkButton>
				<MkButton small :disabled="requestLogs.length === 0" @click="logsOpen = true"><i class="ti ti-notes" aria-hidden="true"></i> {{ i18n.ts._customEmojisManager._gridCommon.registrationLogs }}</MkButton>
			</div>
		</Teleport>
		<div class="_adminPanelInset _gaps">
			<MkResult v-if="draftItems.length === 0" type="empty" :text="i18n.ts._customEmojisManager._local._list.emojisNothing"/>
			<template v-else>
				<label :class="$style.selectAll"><input type="checkbox" :checked="items.length > 0 && items.every(item => selectedDraftIds.has(item.draftId))" :indeterminate="items.some(item => selectedDraftIds.has(item.draftId)) && !items.every(item => selectedDraftIds.has(item.draftId))" :disabled="busy" @change="togglePageSelection(items)">{{ i18n.ts._customEmojisManager.selectAll }}</label>
				<div :class="$style.emojis" role="list" :aria-label="i18n.ts._customEmojisManager._local.tabTitleRegister" :aria-busy="registering">
					<article v-for="item in items" :key="item.draftId" :class="[$style.emoji, { [$style.invalid]: draftErrors.has(item.draftId), [$style.selected]: selectedDraftIds.has(item.draftId) }]" class="_panel" role="listitem">
						<input type="checkbox" :class="$style.checkbox" :checked="selectedDraftIds.has(item.draftId)" :disabled="busy" :aria-label="item.name" @change="toggleSelection(item)">
						<button type="button" class="_button" :class="$style.preview" :disabled="busy" :aria-label="`${i18n.ts.edit}: ${item.name}`" @click="editDraft(item)"><img :src="item.url" :alt="item.name"/></button>
						<div :class="$style.body">
							<button type="button" class="_button _monospace" :class="$style.name" :disabled="busy" :title="item.name" @click="editDraft(item)">{{ item.name || i18n.ts.notSet }}</button>
							<div :class="$style.category" :title="item.category">{{ item.category || i18n.ts.uncategorized }}</div>
							<div v-if="item.isSensitive || item.localOnly" :class="$style.flags"><span v-if="item.isSensitive" class="_adminTableStatus" style="--admin-statusColor: var(--MI_THEME-warn)">{{ i18n.ts.sensitive }}</span><span v-if="item.localOnly" class="_adminTableStatus">{{ i18n.ts.localOnly }}</span></div>
							<div v-if="draftErrors.has(item.draftId)" :class="$style.validation" :title="draftErrors.get(item.draftId)?.join('\n')"><i class="ti ti-alert-circle" aria-hidden="true"></i> {{ draftErrors.get(item.draftId)?.[0] }}</div>
						</div>
						<div :class="$style.itemActions"><button type="button" class="_button _textButton" :disabled="busy" @click="editDraft(item)">{{ i18n.ts.edit }}</button><button type="button" class="_button _textButton" :class="$style.delete" :disabled="busy" @click="removeDraft(item)">{{ i18n.ts.delete }}</button></div>
					</article>
				</div>
			</template>
		</div>
	</MkPaginationBar>
	<Teleport to="#misskey-popups" defer>
		<MkModalWindow v-if="batchOpen" ref="batchWindow" :width="860" :height="580" autoHeight :closeOnBackdrop="false" @close="requestBatchClose" @esc="requestBatchClose" @closed="closeBatchEditor">
			<template #header>{{ i18n.ts.edit }}</template>
			<div class="_spacer _spacerCard" :inert="batchClosing || !canInteract"><MkGrid :key="batchRevision" :data="batchItems" :settings="batchGridSettings" v-on="batchGridEvents"/></div>
			<template #footer>
				<div class="_buttons">
					<MkButton small primary :disabled="batchInvalid || batchClosing" @click="applyBatchEditor">{{ i18n.ts.apply }}</MkButton>
					<MkButton small @click="requestBatchClose">{{ i18n.ts.cancel }}</MkButton>
				</div>
			</template>
		</MkModalWindow>
		<MkModalWindow v-if="logsOpen" :width="720" :height="560" autoHeight @closed="logsOpen = false">
			<template #header>{{ i18n.ts._customEmojisManager._gridCommon.registrationLogs }}</template>
			<div class="_spacer _spacerCard"><XRegisterLogs :logs="requestLogs"/></div>
		</MkModalWindow>
	</Teleport>
</div>
</template>

<script setup lang="ts">
import * as Misskey from 'misskey-js';
import { computed, inject, onActivated, onDeactivated, onMounted, onScopeDispose, reactive, ref, useCssModule, useTemplateRef, watch } from 'vue';
import type { RequestLogItem } from '@/pages/admin/custom-emojis-manager.impl.js';
import type { GridEvent } from '@/components/grid/grid-event.js';
import type { GridSetting } from '@/components/grid/grid.js';
import type { GridRow } from '@/components/grid/row.js';
import type { Form } from '@/utility/form.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { emptyStrToEmptyArray, emptyStrToNull, roleIdsParser } from '@/pages/admin/custom-emojis-manager.impl.js';
import { i18n } from '@/i18n.js';
import MkButton from '@/components/MkButton.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkPaginationBar from '@/components/MkPaginationBar.vue';
import MkGrid from '@/components/grid/MkGrid.vue';
import XRegisterLogs from '@/pages/admin/custom-emojis-manager.logs.vue';
import * as os from '@/os.js';
import { chooseDriveFile, chooseFileFromPcAndUpload } from '@/utility/drive.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { genId } from '@/utility/id.js';
import { validators } from '@/components/grid/cell-validators.js';
import { copyGridDataToClipboard } from '@/components/grid/grid-utils.js';
import { DI } from '@/di.js';
import { prefer } from '@/preferences.js';

const toolbarTarget = inject('adminEmojisToolbarTarget', '');

const MAXIMUM_EMOJI_REGISTER_COUNT = 100;
const namePattern = /^[a-zA-Z0-9_]+$/;

type FolderItem = {
	id?: string;
	name: string;
};

type DraftItem = {
	draftId: string;
	fileId: string;
	url: string;
	name: string;
	category: string;
	aliases: string;
	license: string;
	isSensitive: boolean;
	localOnly: boolean;
	roleIdsThatCanBeUsedThisEmojiAsReaction: { id: string; name: string }[];
	type: string | null;
	createdAt: string;
};

type BatchItem = Omit<DraftItem, 'roleIdsThatCanBeUsedThisEmojiAsReaction'> & {
	roleIdsThatCanBeUsedThisEmojiAsReaction: unknown;
};
type EmojiRole = DraftItem['roleIdsThatCanBeUsedThisEmojiAsReaction'][number];

const uploadFolders = ref<FolderItem[]>([]);
const selectedFolderId = ref(prefer.s.uploadFolder);
const directoryToCategory = ref(false);
const draftItems = ref<DraftItem[]>([]);
const selectedDraftIds = ref(new Set<string>());
const registering = ref(false);
const editing = ref(false);
const clearing = ref(false);
const settingsBusy = ref(false);
const batchOpen = ref(false);
const batchItems = ref<BatchItem[]>([]);
const batchInvalid = computed(() => batchItems.value.some(item =>
	!item.url || !item.name || !namePattern.test(item.name) || readBatchRoles(item.roleIdsThatCanBeUsedThisEmojiAsReaction) == null || batchItems.value.some(other => other.draftId !== item.draftId && other.name === item.name),
));
const batchClosing = ref(false);
const batchWindow = useTemplateRef('batchWindow');
let batchPageIds = new Set<string>();
const batchRevision = ref(0);
const batchGridEvents = ref({ event: (_event: GridEvent) => {} });
const busy = computed(() => registering.value || editing.value || clearing.value || batchOpen.value);
const requestLogs = ref<RequestLogItem[]>([]);
const logsOpen = ref(false);
const active = ref(true);
const pageActive = inject(DI.pageActive, ref(true));
const canInteract = computed(() => active.value && pageActive.value);
let disposed = false;
const $style = useCssModule();

function readBatchRoles(value: unknown): EmojiRole[] | null {
	if (!Array.isArray(value) || !value.every(role => role != null && typeof role === 'object' && typeof role.id === 'string' && typeof role.name === 'string')) return null;
	return value as EmojiRole[];
}

function isCurrentBatch(items: BatchItem[], revision: number) {
	return batchOpen.value && !batchClosing.value && canInteract.value && batchItems.value === items && batchRevision.value === revision;
}

const batchGridSettings = computed<GridSetting>(() => {
	const items = batchItems.value;
	const revision = batchRevision.value;
	return {
		row: {
			showNumber: true,
			selectable: true,
			minimumDefinitionCount: 1,
			styleRules: [{
				condition: ({ cells }) => cells.some(cell => !cell.violation.valid),
				applyStyle: { className: $style.gridInvalid },
			}],
			contextMenuFactory: (_, context) => [{
				text: i18n.ts._customEmojisManager._gridCommon.copySelectionRows,
				icon: 'ti ti-copy',
				action: () => { if (isCurrentBatch(items, revision)) copyGridDataToClipboard(items, context); },
			}, {
				text: i18n.ts._customEmojisManager._gridCommon.deleteSelectionRows,
				icon: 'ti ti-trash',
				action: () => removeBatchRows(context.rangedRows, items, revision),
			}],
			events: { delete: rows => removeBatchRows(rows, items, revision) },
		},
		cols: [
			{ bindTo: 'url', icon: 'ti-icons', type: 'image', editable: false, width: 64, validators: [validators.required()] },
			{ bindTo: 'name', title: i18n.ts.name, type: 'text', editable: true, width: 140, validators: [validators.required(), validators.regex(namePattern), validators.unique()] },
			{ bindTo: 'category', title: i18n.ts.category, type: 'text', editable: true, width: 140 },
			{ bindTo: 'aliases', title: i18n.ts._customEmojisManager._gridCommon.aliases, type: 'text', editable: true, width: 140 },
			{ bindTo: 'license', title: i18n.ts.license, type: 'text', editable: true, width: 140 },
			{ bindTo: 'isSensitive', title: i18n.ts.sensitive, type: 'boolean', editable: true, width: 90 },
			{ bindTo: 'localOnly', title: i18n.ts.localOnly, type: 'boolean', editable: true, width: 90 },
			{
				bindTo: 'roleIdsThatCanBeUsedThisEmojiAsReaction', title: i18n.ts.role, type: 'text', editable: true, width: 140,
				valueTransformer: row => (readBatchRoles(items[row.index]?.roleIdsThatCanBeUsedThisEmojiAsReaction) ?? []).map(role => role.name).join(','),
				customValueEditor: async row => {
					const item = items[row.index];
					const current = readBatchRoles(item?.roleIdsThatCanBeUsedThisEmojiAsReaction) ?? [];
					if (!item || !isCurrentBatch(items, revision)) return current;
					const result = await os.selectRole({
						initialRoleIds: current.map(role => role.id),
						title: i18n.ts.rolesThatCanBeUsedThisEmojiAsReaction,
						infoMessage: i18n.ts.rolesThatCanBeUsedThisEmojiAsReactionEmptyDescription,
						publicOnly: true,
					});
					if (result.canceled || !isCurrentBatch(items, revision) || items[row.index] !== item) return current;
					const roles = result.result.map(role => ({ id: role.id, name: role.name }));
					item.roleIdsThatCanBeUsedThisEmojiAsReaction = roles;
					return roles;
				},
				events: {
					paste: roleIdsParser,
					delete: cell => { if (isCurrentBatch(items, revision) && items[cell.row.index]) items[cell.row.index].roleIdsThatCanBeUsedThisEmojiAsReaction = []; },
				},
			},
			{ bindTo: 'type', type: 'text', editable: false, width: 90 },
		],
		cells: {
			contextMenuFactory: (_, __, ___, context) => [{
				text: i18n.ts._customEmojisManager._gridCommon.copySelectionRanges,
				icon: 'ti ti-copy',
				action: () => { if (isCurrentBatch(items, revision)) copyGridDataToClipboard(items, context); },
			}, {
				text: i18n.ts._customEmojisManager._gridCommon.deleteSelectionRanges,
				icon: 'ti ti-trash',
				action: () => removeBatchRows(context.rangedCells.map(cell => cell.row), items, revision),
			}],
		},
	};
});

function resetBatchGrid(items: BatchItem[]) {
	batchItems.value = items;
	batchRevision.value++;
	const currentItems = batchItems.value;
	const revision = batchRevision.value;
	batchGridEvents.value = { event: event => onBatchGridEvent(event, currentItems, revision) };
}

function openBatchEditor(items: DraftItem[]) {
	if (busy.value || !canInteract.value || items.length === 0) return;
	resetBatchGrid(items.map(item => ({ ...item, roleIdsThatCanBeUsedThisEmojiAsReaction: item.roleIdsThatCanBeUsedThisEmojiAsReaction.map(role => ({ ...role })) })));
	batchPageIds = new Set(batchItems.value.map(item => item.draftId));
	batchClosing.value = false;
	batchOpen.value = true;
}

function removeBatchRows(rows: GridRow[], items: BatchItem[], revision: number) {
	if (!isCurrentBatch(items, revision)) return;
	const indexes = new Set(rows.map(row => row.index));
	// 删除改变行索引，重建当前网格，旧粘贴结果只能回到旧版本。
	resetBatchGrid(items.filter((_, index) => !indexes.has(index)));
}

function onBatchGridEvent(event: GridEvent, items: BatchItem[], revision: number) {
	if (!isCurrentBatch(items, revision)) return;
	if (event.type === 'cell-value-change') {
		const item = items[event.row.index];
		if (item != null && event.column.setting.bindTo in item) {
			(item as Record<string, unknown>)[event.column.setting.bindTo] = event.newValue;
		}
	}
}

async function applyBatchEditor() {
	if (batchInvalid.value || batchClosing.value || !canInteract.value) return;
	const editedItems = new Map<string, DraftItem>();
	for (const item of batchItems.value) {
		const roles = readBatchRoles(item.roleIdsThatCanBeUsedThisEmojiAsReaction);
		if (roles == null) return;
		editedItems.set(item.draftId, {
			...item,
			category: item.category ?? '',
			aliases: item.aliases ?? '',
			license: item.license ?? '',
			isSensitive: item.isSensitive === true,
			localOnly: item.localOnly === true,
			roleIdsThatCanBeUsedThisEmojiAsReaction: roles.map(role => ({ ...role })),
		});
	}
	const nextItems = draftItems.value.flatMap(item => !batchPageIds.has(item.draftId) ? [item] : editedItems.has(item.draftId) ? [editedItems.get(item.draftId)!] : []);
	for (const item of batchItems.value) {
		const duplicate = nextItems.some(other => other.draftId !== item.draftId && other.name === item.name);
		if (!item.url || !item.name || !namePattern.test(item.name) || duplicate) {
			const text = !item.url || !item.name ? i18n.ts._gridComponent._error.requiredValue : duplicate ? i18n.ts._gridComponent._error.notUnique : i18n.tsx._gridComponent._error.patternNotMatch({ pattern: namePattern.source });
			await os.alert({ type: 'error', title: i18n.ts.error, text });
			return;
		}
	}
	draftItems.value = nextItems;
	for (const id of selectedDraftIds.value) if (!nextItems.some(item => item.draftId === id)) selectedDraftIds.value.delete(id);
	requestBatchClose();
}

function requestBatchClose() {
	batchClosing.value = true;
	batchWindow.value?.close();
}

function closeBatchEditor() {
	batchOpen.value = false;
	batchItems.value = [];
	batchPageIds.clear();
	batchRevision.value++;
}

function validationErrors(item: Pick<DraftItem, 'draftId' | 'name' | 'url'>) {
	const errors: string[] = [];
	if (!item.url) errors.push(`${i18n.ts.preview}: ${i18n.ts._gridComponent._error.requiredValue}`);
	if (!item.name) errors.push(`${i18n.ts.name}: ${i18n.ts._gridComponent._error.requiredValue}`);
	else if (!namePattern.test(item.name)) errors.push(i18n.tsx._gridComponent._error.patternNotMatch({ pattern: namePattern.source }));
	if (draftItems.value.some(other => other.draftId !== item.draftId && other.name === item.name)) errors.push(i18n.ts._gridComponent._error.notUnique);
	return errors;
}

const draftErrors = computed(() => new Map(draftItems.value.flatMap(item => {
	const errors = validationErrors(item);
	return errors.length > 0 ? [[item.draftId, errors] as const] : [];
})));
const registerButtonDisabled = computed(() => draftItems.value.length === 0 || busy.value || draftErrors.value.size > 0);

function roleNames(item: Pick<DraftItem, 'roleIdsThatCanBeUsedThisEmojiAsReaction'>) {
	return item.roleIdsThatCanBeUsedThisEmojiAsReaction.map(role => role.name).join(', ');
}

function toggleSelection(item: DraftItem) {
	if (busy.value) return;
	if (selectedDraftIds.value.has(item.draftId)) selectedDraftIds.value.delete(item.draftId);
	else selectedDraftIds.value.add(item.draftId);
}

function togglePageSelection(items: DraftItem[]) {
	if (busy.value) return;
	const remove = items.every(item => selectedDraftIds.value.has(item.draftId));
	for (const item of items) {
		if (remove) selectedDraftIds.value.delete(item.draftId);
		else selectedDraftIds.value.add(item.draftId);
	}
}

function removeDraft(item: DraftItem) {
	if (busy.value) return;
	draftItems.value = draftItems.value.filter(other => other.draftId !== item.draftId);
	selectedDraftIds.value.delete(item.draftId);
}

function removeSelected() {
	if (busy.value) return;
	draftItems.value = draftItems.value.filter(item => !selectedDraftIds.value.has(item.draftId));
	selectedDraftIds.value.clear();
}

function copySelected() {
	const lines = draftItems.value.filter(item => selectedDraftIds.value.has(item.draftId)).map(item => [
		item.url,
		item.name,
		item.category,
		item.aliases,
		item.license,
		String(item.isSensitive),
		String(item.localOnly),
		JSON.stringify(item.roleIdsThatCanBeUsedThisEmojiAsReaction),
		item.type ?? '',
	].join('\t'));
	return copyToClipboard(lines.join('\n'));
}

async function editDraft(item: DraftItem) {
	if (busy.value || !canInteract.value) return;
	editing.value = true;
	let selectedRoles = item.roleIdsThatCanBeUsedThisEmojiAsReaction.map(role => ({ ...role }));
	const form = reactive({
		name: { type: 'string', label: i18n.ts.name, default: item.name, required: true },
		category: { type: 'string', label: i18n.ts.category, default: item.category, required: false },
		aliases: { type: 'string', label: i18n.ts._customEmojisManager._gridCommon.aliases, default: item.aliases, required: false },
		license: { type: 'string', label: i18n.ts.license, default: item.license, required: false },
		isSensitive: { type: 'boolean', label: i18n.ts.sensitive, default: item.isSensitive },
		localOnly: { type: 'boolean', label: i18n.ts.localOnly, default: item.localOnly },
		roles: {
			type: 'button',
			content: `${i18n.ts.role}: ${roleNames(item) || i18n.ts.none}`,
			action: async (): Promise<void> => {
				const selection = await os.selectRole({
					initialRoleIds: selectedRoles.map(role => role.id),
					title: i18n.ts.rolesThatCanBeUsedThisEmojiAsReaction,
					infoMessage: i18n.ts.rolesThatCanBeUsedThisEmojiAsReactionEmptyDescription,
					publicOnly: true,
				});
				if (selection.canceled) return;
				selectedRoles = selection.result.map(role => ({ id: role.id, name: role.name }));
				form.roles.content = `${i18n.ts.role}: ${selectedRoles.map(role => role.name).join(', ') || i18n.ts.none}`;
			},
		},
	} satisfies Form);
	try {
		const result = await os.form(`${i18n.ts.edit}: ${item.name}`, form);
		if (result.canceled || disposed || !canInteract.value || !draftItems.value.some(draft => draft.draftId === item.draftId)) return;
		const draft = {
			...item,
			name: result.result.name ?? '',
			category: result.result.category ?? '',
			aliases: result.result.aliases ?? '',
			license: result.result.license ?? '',
			isSensitive: result.result.isSensitive,
			localOnly: result.result.localOnly,
			roleIdsThatCanBeUsedThisEmojiAsReaction: selectedRoles,
		};
		const errors = validationErrors(draft);
		if (errors.length > 0) {
			await os.alert({ type: 'error', title: i18n.ts.error, text: errors.join('\n') });
			return;
		}
		// 弹窗只修改待注册草稿，统一点击注册后才写入服务器。
		Object.assign(item, draft);
	} finally {
		editing.value = false;
	}
}

async function onRegistryClicked() {
	if (registerButtonDisabled.value || !canInteract.value) return;
	registering.value = true;
	try {
		const selection = await os.confirm({
			type: 'info',
			text: i18n.tsx._customEmojisManager._local._register.confirmRegisterEmojisDescription({ count: MAXIMUM_EMOJI_REGISTER_COUNT }),
		});
		if (selection.canceled || disposed || !canInteract.value || draftErrors.value.size > 0) return;
		const targets = draftItems.value.slice(0, MAXIMUM_EMOJI_REGISTER_COUNT);
		const result = await os.promiseDialog(Promise.all(targets.map(item =>
			misskeyApi('admin/emoji/add', {
				name: item.name,
				category: emptyStrToNull(item.category),
				aliases: emptyStrToEmptyArray(item.aliases),
				license: emptyStrToNull(item.license),
				isSensitive: item.isSensitive,
				localOnly: item.localOnly,
				roleIdsThatCanBeUsedThisEmojiAsReaction: item.roleIdsThatCanBeUsedThisEmojiAsReaction.map(role => role.id),
				fileId: item.fileId,
			})
				.then(() => ({ item, success: true, err: undefined }))
				.catch(err => ({ item, success: false, err })),
		)));
		requestLogs.value = result.map(({ item, success, err }) => ({
			failed: !success,
			url: item.url,
			name: item.name,
			error: err ? JSON.stringify(err) : undefined,
		}));
		const successIds = new Set(result.filter(entry => entry.success).map(entry => entry.item.draftId));
		draftItems.value = draftItems.value.filter(item => !successIds.has(item.draftId));
		for (const id of successIds) selectedDraftIds.value.delete(id);
		if (result.some(entry => !entry.success)) {
			await os.alert({ type: 'error', title: i18n.ts.somethingHappened, text: i18n.ts._customEmojisManager._gridCommon.alertEmojisRegisterFailedDescription });
		} else {
			os.toast(i18n.ts.added, 'success');
		}
	} finally {
		registering.value = false;
	}
}

async function onClearClicked() {
	if (busy.value || !canInteract.value) return;
	clearing.value = true;
	try {
		const result = await os.confirm({ type: 'warning', text: i18n.ts._customEmojisManager._local._register.confirmClearEmojisDescription });
		if (!result.canceled && !disposed && canInteract.value) {
			draftItems.value = [];
			selectedDraftIds.value.clear();
		}
	} finally {
		clearing.value = false;
	}
}

async function onFileSelectClicked() {
	if (busy.value || !canInteract.value) return;
	try {
		const files = await chooseFileFromPcAndUpload({ multiple: true, folderId: selectedFolderId.value });
		if (!disposed && canInteract.value) draftItems.value.push(...files.map(fromDriveFile));
	} catch {
		// 上传失败由现有上传窗口提示，取消选择不改动草稿。
	}
}

async function onDriveSelectClicked() {
	if (busy.value || !canInteract.value) return;
	const files = await chooseDriveFile({ multiple: true });
	if (!disposed && canInteract.value) draftItems.value.push(...files.map(fromDriveFile));
}

function fromDriveFile(file: Misskey.entities.DriveFile): DraftItem {
	return {
		draftId: genId(),
		fileId: file.id,
		url: file.url,
		name: file.name.replace(/(\.[a-zA-Z0-9]+)+$/, '').replaceAll('-', '_').replaceAll(' ', '_'),
		category: '',
		aliases: '',
		license: '',
		isSensitive: file.isSensitive,
		localOnly: false,
		roleIdsThatCanBeUsedThisEmojiAsReaction: [],
		type: file.type,
		createdAt: file.createdAt,
	};
}

async function refreshUploadFolders() {
	const folders = await misskeyApi('drive/folders', {});
	uploadFolders.value = [{ name: '-' }, ...folders];
}

async function openUploadSettings() {
	if (settingsBusy.value || busy.value || !canInteract.value) return;
	settingsBusy.value = true;
	try {
		try {
			await os.promiseDialog(refreshUploadFolders());
		} catch {
			return;
		}
		if (disposed || !canInteract.value) return;
		const result = await os.form(i18n.ts._customEmojisManager._local._register.uploadSettingTitle, {
			folder: {
				type: 'enum',
				label: i18n.ts.uploadFolder,
				default: selectedFolderId.value ?? '',
				enum: uploadFolders.value.map(folder => ({ label: folder.name, value: folder.id ?? '' })),
			},
			directoryToCategory: {
				type: 'boolean',
				label: i18n.ts._customEmojisManager._local._register.directoryToCategoryLabel,
				default: directoryToCategory.value,
			},
		});
		if (result.canceled || disposed || !canInteract.value) return;
		selectedFolderId.value = result.result.folder || null;
		directoryToCategory.value = result.result.directoryToCategory;
	} finally {
		settingsBusy.value = false;
	}
}

watch(canInteract, value => {
	if (!value) {
		logsOpen.value = false;
		requestBatchClose();
	}
}, { flush: 'sync' });
onActivated(() => { active.value = true; });
onDeactivated(() => { active.value = false; });
onScopeDispose(() => { disposed = true; });
onMounted(() => { void refreshUploadFolders().catch(() => {}); });
</script>

<style module lang="scss">
.actions {
	--MI-toolbarFontSize: 1em;
	margin-inline-start: 0;
}

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

	&.invalid {
		border-color: var(--MI_THEME-warn);
		background: var(--MI_THEME-infoWarnBg);
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

.name,
.category,
.validation {
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

.category {
	margin-top: 4px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.flags {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	margin-top: 8px;
}

.itemActions {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 12px;
	padding: 8px 12px;
	border-top: var(--MI-divider);
}

.gridInvalid {
	background: var(--MI_THEME-infoWarnBg);
}

.validation,
.delete {
	color: var(--MI_THEME-error);
}

.validation {
	margin-top: 3px;
	font-size: 0.9em;
}

</style>
