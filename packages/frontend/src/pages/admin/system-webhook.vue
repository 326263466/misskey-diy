<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :actions="headerActions" :tabs="headerTabs">
	<div class="_pageBody">
		<SearchMarker path="/admin/system-webhook" :label="i18n.ts.systemWebhook" :keywords="['webhook']" icon="ti ti-webhook">
			<div class="_gaps_m">
				<div class="_adminPanel">
					<div class="_adminToolbar">
						<MkInput v-model="filterText" class="_adminToolbarField" type="search">
							<template #prefix><i class="ti ti-search" aria-hidden="true"></i></template>
							<template #label>{{ i18n.ts.search }}</template>
						</MkInput>
						<div class="_adminToolbarActions">
							<SearchMarker>
								<MkButton small primary @click="onCreateWebhookClicked">
									<i class="ti ti-plus" aria-hidden="true"></i> <SearchLabel>{{ i18n.ts._webhookSettings.createWebhook }}</SearchLabel>
								</MkButton>
							</SearchMarker>
						</div>
					</div>

					<MkPaginationBar v-slot="{ items }" v-model:page="page" :items="filteredWebhooks">
							<div class="_adminTableContainer">
								<table class="_adminTable">
									<thead>
										<tr>
											<th scope="col">{{ i18n.ts.name }}</th>
											<th scope="col">{{ i18n.ts.state }}</th>
											<th scope="col">{{ i18n.ts.latestStatus }}</th>
											<th scope="col">{{ i18n.ts.lastCommunication }}</th>
											<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
										</tr>
									</thead>
									<tbody>
										<XItem v-for="item in items" :key="item.id" :entity="item" @edit="onEditButtonClicked" @delete="onDeleteButtonClicked"/>
										<tr v-if="filteredWebhooks.length === 0"><td colspan="5" class="_adminTableEmpty">{{ i18n.ts.nothing }}</td></tr>
									</tbody>
								</table>
							</div>
					</MkPaginationBar>
				</div>
			</div>
		</SearchMarker>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { entities } from 'misskey-js';
import XItem from './system-webhook.item.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkPaginationBar from '@/components/MkPaginationBar.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { showSystemWebhookEditorDialog } from '@/components/MkSystemWebhookEditor.impl.js';
import * as os from '@/os.js';

const webhooks = ref<entities.SystemWebhook[]>([]);
const filterText = ref('');
const page = ref(1);
const filteredWebhooks = computed(() => {
	const query = filterText.value.trim().toLowerCase();
	return query === '' ? webhooks.value : webhooks.value.filter(webhook => `${webhook.name} ${webhook.url}`.toLowerCase().includes(query));
});

watch(filterText, () => { page.value = 1; });

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

async function onCreateWebhookClicked() {
	await showSystemWebhookEditorDialog({
		mode: 'create',
	});

	await fetchWebhooks();
}

async function onEditButtonClicked(webhook: entities.SystemWebhook) {
	await showSystemWebhookEditorDialog({
		mode: 'edit',
		id: webhook.id,
	});

	await fetchWebhooks();
}

async function onDeleteButtonClicked(webhook: entities.SystemWebhook) {
	const result = await os.confirm({
		type: 'warning',
		title: i18n.ts._webhookSettings.deleteConfirm,
	});
	if (!result.canceled) {
		// 失败提示由 apiWithDialog 处理
		await os.apiWithDialog('admin/system-webhook/delete', {
			id: webhook.id,
		});
		os.toast(i18n.ts.deleteSucceeded, 'success');
		await fetchWebhooks();
	}
}

async function fetchWebhooks() {
	const result = await misskeyApi('admin/system-webhook/list', {});
	webhooks.value = result.sort((a, b) => a.id.localeCompare(b.id));
}

onMounted(async () => {
	await fetchWebhooks();
});

definePage(() => ({
	title: i18n.ts.systemWebhook,
	icon: 'ti ti-webhook',
}));
</script>

<style module lang="scss">

</style>
