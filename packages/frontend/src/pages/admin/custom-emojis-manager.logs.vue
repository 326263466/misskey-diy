<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkPaginationBar v-slot="{ items, page }" v-model:page="currentPage" :items="filteredLogs">
		<div v-if="logs.length > 0" :class="$style.toolbar">
			<MkSwitch v-model="showingSuccessLogs">
				<template #label>{{ i18n.ts._customEmojisManager._logs.showSuccessLogSwitch }}</template>
			</MkSwitch>
			<MkButton small :disabled="items.length === 0" @click="openCopyWindow(items)"><i class="ti ti-copy" aria-hidden="true"></i> {{ i18n.ts._customEmojisManager._gridCommon.copySelectionRanges }}</MkButton>
		</div>
		<div v-if="items.length > 0" class="_adminTableContainer" tabindex="0" :aria-label="i18n.ts._customEmojisManager._gridCommon.registrationLogs">
			<table class="_adminTable" :class="$style.table">
				<colgroup>
					<col :class="$style.nameColumn"/>
					<col :class="$style.stateColumn"/>
					<col :class="$style.errorColumn"/>
					<col :class="$style.actionsColumn"/>
				</colgroup>
				<thead>
					<tr>
						<th scope="col">{{ i18n.ts.name }}</th>
						<th scope="col">{{ i18n.ts.state }}</th>
						<th scope="col">{{ i18n.ts._customEmojisManager._logs.log }}</th>
						<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="(log, index) in items" :key="`${page}-${index}`">
						<td>
							<div class="_adminTableIdentity">
								<img :src="log.url" class="_adminTableImage" :alt="log.name"/>
								<div><span :class="$style.ellipsis" :title="log.name">{{ log.name }}</span></div>
							</div>
						</td>
						<td><span class="_adminTableStatus" :style="{ '--admin-statusColor': log.failed ? 'var(--MI_THEME-error)' : 'var(--MI_THEME-success)' }">{{ log.failed ? i18n.ts._customEmojisManager._logs.failed : i18n.ts.done }}</span></td>
						<td><span class="_selectable" :class="$style.error">{{ log.error || '-' }}</span></td>
						<td class="_adminTableActions"><button type="button" class="_button _textButton" @click="copyLog(log)">{{ i18n.ts.copy }}</button></td>
					</tr>
				</tbody>
			</table>
		</div>
		<div v-else>{{ logs.length === 0 ? i18n.ts._customEmojisManager._logs.logNothing : i18n.ts._customEmojisManager._logs.failureLogNothing }}</div>
	</MkPaginationBar>
	<Teleport to="#misskey-popups" defer>
		<MkModalWindow v-if="copyOpen" :width="760" :height="480" autoHeight @closed="copyOpen = false">
			<template #header>{{ i18n.ts._customEmojisManager._gridCommon.copySelectionRanges }}</template>
			<div class="_spacer _spacerCard"><MkGrid :data="copyItems" :settings="copyGridSettings"/></div>
		</MkModalWindow>
	</Teleport>
</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { RequestLogItem } from '@/pages/admin/custom-emojis-manager.impl.js';
import type { GridSetting } from '@/components/grid/grid.js';
import MkButton from '@/components/MkButton.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkPaginationBar from '@/components/MkPaginationBar.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkGrid from '@/components/grid/MkGrid.vue';
import { i18n } from '@/i18n.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { copyGridDataToClipboard } from '@/components/grid/grid-utils.js';

const props = defineProps<{
	logs: RequestLogItem[];
}>();

const showingSuccessLogs = ref(false);
const copyOpen = ref(false);
const copyItems = ref<RequestLogItem[]>([]);
const currentPage = ref(1);
const filteredLogs = computed(() => props.logs.filter(log => showingSuccessLogs.value || log.failed));

const copyGridSettings: GridSetting = {
	row: {
		showNumber: false,
		selectable: false,
		minimumDefinitionCount: 1,
		contextMenuFactory: (_, context) => [{
			text: i18n.ts._customEmojisManager._gridCommon.copySelectionRows,
			icon: 'ti ti-copy',
			action: () => copyGridDataToClipboard(copyItems, context),
		}],
	},
	cols: [
		{ bindTo: 'failed', title: i18n.ts._customEmojisManager._logs.failed, type: 'boolean', editable: false, width: 50 },
		{ bindTo: 'url', icon: 'ti-icons', type: 'image', editable: false, width: 64 },
		{ bindTo: 'name', title: i18n.ts.name, type: 'text', editable: false, width: 140 },
		{ bindTo: 'error', title: i18n.ts._customEmojisManager._logs.log, type: 'text', editable: false, width: 440 },
	],
	cells: {
		contextMenuFactory: (_, __, ___, context) => [{
			text: i18n.ts._customEmojisManager._gridCommon.copySelectionRanges,
			icon: 'ti ti-copy',
			action: () => copyGridDataToClipboard(copyItems, context),
		}],
	},
};

function openCopyWindow(items: RequestLogItem[]) {
	copyItems.value = items.map(log => ({ ...log }));
	copyOpen.value = true;
}

function copyLog(log: RequestLogItem) {
	return copyToClipboard([String(log.failed), log.url, log.name, log.error ?? ''].join('\t'));
}

watch([() => props.logs, showingSuccessLogs], () => { currentPage.value = 1; });
</script>

<style module lang="scss">
.table {
	table-layout: fixed;
	min-width: 600px;
}

.toolbar {
	--MI-toolbarFontSize: 1em;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.nameColumn { width: 190px; }
.stateColumn { width: 90px; }
.errorColumn { width: 240px; }
.actionsColumn { width: 80px; }

.ellipsis {
	display: block;
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.error {
	display: block;
	max-height: 4.5em;
	overflow: auto;
	overflow-wrap: anywhere;
}
</style>
