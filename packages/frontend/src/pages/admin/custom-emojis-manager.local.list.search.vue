<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="uiWindow"
	headerIcon="ti ti-search"
	:width="580"
	:height="660"
	autoHeight
	:closeOnBackdrop="false"
	@close="closeSearch"
	@esc="closeSearch"
	@closed="emit('closed')"
>
	<template #header>
		{{ i18n.ts.search }}
	</template>
	<div :class="$style.root">
		<div class="_spacer _spacerCard">
			<div class="_gaps">
				<div :class="$style.fields">
					<MkInput
						v-model="model.name"
						type="search"
						autocapitalize="off"
						@enter="onSearchRequest"
					>
						<template #label>{{ i18n.ts.name }}</template>
					</MkInput>
					<MkInput
						v-model="model.category"
						type="search"
						autocapitalize="off"
						@enter="onSearchRequest"
					>
						<template #label>{{ i18n.ts.category }}</template>
					</MkInput>
					<MkInput
						v-model="model.aliases"
						type="search"
						autocapitalize="off"
						@enter="onSearchRequest"
					>
						<template #label>{{ i18n.ts._customEmojisManager._gridCommon.aliases }}</template>
					</MkInput>

					<MkInput
						v-model="model.type"
						type="search"
						autocapitalize="off"
						@enter="onSearchRequest"
					>
						<template #label>{{ i18n.ts.type }}</template>
					</MkInput>
					<MkInput
						v-model="model.license"
						type="search"
						autocapitalize="off"
						@enter="onSearchRequest"
					>
						<template #label>{{ i18n.ts.license }}</template>
					</MkInput>
					<MkSelect
						v-model="model.sensitive"
						:items="[
							{ label: i18n.ts.all, value: null },
							{ label: i18n.ts.yes, value: 'true' },
							{ label: i18n.ts.no, value: 'false' },
						]"
					>
						<template #label>{{ i18n.ts.sensitive }}</template>
					</MkSelect>

					<MkSelect
						v-model="model.localOnly"
						:items="[
							{ label: i18n.ts.all, value: null },
							{ label: i18n.ts.yes, value: 'true' },
							{ label: i18n.ts.no, value: 'false' },
						]"
					>
						<template #label>{{ i18n.ts.localOnly }}</template>
					</MkSelect>
					<MkInput
						v-model="model.updatedAtFrom"
						type="date"
						autocapitalize="off"
					>
						<template #label>{{ i18n.ts._customEmojisManager._gridCommon.updatedAtFrom }}</template>
					</MkInput>
					<MkInput
						v-model="model.updatedAtTo"
						type="date"
						autocapitalize="off"
					>
						<template #label>{{ i18n.ts._customEmojisManager._gridCommon.updatedAtTo }}</template>
					</MkInput>

					<MkInput
						:modelValue="queryRolesText"
						type="text"
						readonly
						autocapitalize="off"
						@click="onQueryRolesEditClicked"
					>
						<template #label>{{ i18n.ts.role }}</template>
						<template #suffix><button type="button" class="_button _iconButton" :aria-label="i18n.ts._customEmojisManager._local._list.dialogSelectRoleTitle" @click.stop="onQueryRolesEditClicked"><i class="ti ti-pencil" aria-hidden="true"></i></button></template>
					</MkInput>
				</div>
				<MkFolder :spacerMax="8" :spacerMin="8">
					<template #icon><i class="ti ti-arrows-sort"></i></template>
					<template #label>{{ i18n.ts._customEmojisManager._gridCommon.sortOrder }}</template>
					<MkSortOrderEditor
						:baseOrderKeyNames="[...gridSortOrderKeys]"
						:currentOrders="model.sortOrders"
						@update="onSortOrderUpdate"
					/>
				</MkFolder>
			</div>
		</div>
	</div>
	<template #footer>
		<div class="_buttons">
			<MkButton small primary @click="onSearchRequest">{{ i18n.ts.search }}</MkButton>
			<MkButton small @click="onQueryResetButtonClicked">{{ i18n.ts.reset }}</MkButton>
			<MkButton small @click="closeSearch">{{ i18n.ts.cancel }}</MkButton>
		</div>
	</template>
</MkModalWindow>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkSortOrderEditor from '@/components/MkSortOrderEditor.vue';

import {
	gridSortOrderKeys,
} from './custom-emojis-manager.impl.js';

import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

import type { EmojiSearchQuery } from './custom-emojis-manager.local.list.vue';
import type { SortOrder } from '@/components/MkSortOrderEditor.define.js';
import type { GridSortOrderKey } from './custom-emojis-manager.impl.js';

const props = defineProps<{
	query: EmojiSearchQuery;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
	(ev: 'queryUpdated', query: EmojiSearchQuery): void;
	(ev: 'sortOrderUpdated', orders: SortOrder<GridSortOrderKey>[]): void;
	(ev: 'search'): void;
}>();

const uiWindow = useTemplateRef('uiWindow');
const model = ref<EmojiSearchQuery>({
	...props.query,
	roles: props.query.roles.map(role => ({ ...role })),
	sortOrders: props.query.sortOrders.map(order => ({ ...order })),
});
const queryRolesText = computed(() => model.value.roles.map(it => it.name).join(','));
let active = true;
let roleSelectionRevision = 0;

function publishQueryDraft() {
	if (!active) return;
	const query = {
		...model.value,
		roles: model.value.roles.map(role => ({ ...role })),
		sortOrders: model.value.sortOrders.map(order => ({ ...order })),
	};
	emit('queryUpdated', query);
	emit('sortOrderUpdated', query.sortOrders);
}

// 输入只保留查询草稿，关闭重开不丢；搜索操作才执行请求。
watch(model, publishQueryDraft, { deep: true, flush: 'sync' });

function onSortOrderUpdate(orders: SortOrder<GridSortOrderKey>[]) {
	if (!active) return;
	model.value.sortOrders = orders;
}

function onSearchRequest() {
	if (!active) return;
	publishQueryDraft();
	emit('search');
	closeSearch();
}

function closeSearch() {
	active = false;
	roleSelectionRevision++;
	uiWindow.value?.close();
}

function onQueryResetButtonClicked() {
	if (!active) return;
	model.value.name = '';
	model.value.category = '';
	model.value.aliases = '';
	model.value.type = '';
	model.value.license = '';
	model.value.sensitive = null;
	model.value.localOnly = null;
	model.value.updatedAtFrom = '';
	model.value.updatedAtTo = '';
	model.value.sortOrders = [];
	roleSelectionRevision++;
}

async function onQueryRolesEditClicked() {
	if (!active) return;
	const revision = ++roleSelectionRevision;
	const result = await os.selectRole({
		initialRoleIds: model.value.roles.map(it => it.id),
		title: i18n.ts._customEmojisManager._local._list.dialogSelectRoleTitle,
		publicOnly: true,
	});
	if (result.canceled || !active || revision !== roleSelectionRevision) {
		return;
	}

	model.value.roles = result.result;
}

onUnmounted(() => { active = false; });
</script>

<style module lang="scss">
.root {
	position: relative;
	font-size: 1em;
}

.fields {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 16px;
}

@media (max-width: 480px) {
	.fields { grid-template-columns: minmax(0, 1fr); }
}
</style>
