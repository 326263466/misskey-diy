<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :actions="headerActions" :tabs="headerTabs">
	<div class="_pageBody">
		<div :class="$style.root" class="_gaps_m">
			<div class="_adminPanel">
				<div class="_adminToolbar">
					<MkSelect v-model="filterMethod" :items="filterMethodDef" class="_adminToolbarField">
						<template #label>{{ i18n.ts._abuseReport._notificationRecipient.recipientType }}</template>
					</MkSelect>
					<MkInput v-model="filterText" type="search" class="_adminToolbarField">
						<template #label>{{ i18n.ts._abuseReport._notificationRecipient.keywords }}</template>
					</MkInput>
					<div class="_adminToolbarActions">
						<MkButton primary @click="onAddButtonClicked">
							<span class="ti ti-plus" aria-hidden="true"></span> {{ i18n.ts._abuseReport._notificationRecipient.createRecipient }}
						</MkButton>
					</div>
				</div>

				<MkPaginationBar v-slot="{ items }" v-model:page="page" :items="filteredRecipients">
					<div class="_adminTableContainer">
						<table class="_adminTable">
							<thead>
								<tr>
									<th scope="col">{{ i18n.ts._abuseReport._notificationRecipient.recipientType }}</th>
									<th scope="col">{{ i18n.ts.name }}</th>
									<th scope="col">{{ i18n.ts.recipient }}</th>
									<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
								</tr>
							</thead>
							<tbody>
								<XRecipient
									v-for="r in items"
									:key="r.id"
									:entity="r"
									@edit="onEditButtonClicked"
									@delete="onDeleteButtonClicked"
								/>
								<tr v-if="filteredRecipients.length === 0"><td colspan="4" class="_adminTableEmpty">{{ i18n.ts.nothing }}</td></tr>
							</tbody>
						</table>
					</div>
				</MkPaginationBar>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script setup lang="ts">
import { entities } from 'misskey-js';
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import XRecipient from './notification-recipient.item.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkButton from '@/components/MkButton.vue';
import MkPaginationBar from '@/components/MkPaginationBar.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useMkSelect } from '@/composables/use-mkselect.js';

const recipients = ref<entities.AbuseReportNotificationRecipient[]>([]);

const {
	model: filterMethod,
	def: filterMethodDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.all, value: null },
		{ label: i18n.ts._abuseReport._notificationRecipient._recipientType.mail, value: 'email' },
		{ label: i18n.ts._abuseReport._notificationRecipient._recipientType.webhook, value: 'webhook' },
	],
	initialValue: null,
});
const filterText = ref<string>('');

const filteredRecipients = computed(() => {
	const method = filterMethod.value;
	const text = filterText.value.trim().length === 0 ? null : filterText.value;

	return recipients.value.filter(it => {
		if (method ?? text) {
			if (text) {
				const keywords = [it.name, it.systemWebhook?.name, it.user?.name, it.user?.username];
				if (keywords.filter(k => k?.includes(text)).length !== 0) {
					return true;
				}
			}

			if (method) {
				return it.method.includes(method);
			}

			return false;
		}

		return true;
	});
});
const page = ref(1);

watch([filterMethod, filterText], () => { page.value = 1; });

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

async function onAddButtonClicked() {
	await showEditor('create');
}

async function onEditButtonClicked(id: string) {
	await showEditor('edit', id);
}

async function onDeleteButtonClicked(id: string) {
	const res = await os.confirm({
		type: 'warning',
		title: i18n.ts._abuseReport._notificationRecipient.deleteConfirm,
	});
	if (!res.canceled) {
		// 失败提示由 apiWithDialog 处理
		await os.apiWithDialog('admin/abuse-report/notification-recipient/delete', { id: id });
		os.toast(i18n.ts.deleteSucceeded, 'success');
		await fetchRecipients();
	}
}

async function showEditor(mode: 'create' | 'edit', id?: string) {
	const { needLoad } = await new Promise<{ needLoad: boolean }>(async resolve => {
		const { dispose } = os.popup(
			defineAsyncComponent(() => import('./notification-recipient.editor.vue')),
			{
				mode,
				id,
			},
			{
				submitted: () => {
					resolve({ needLoad: true });
				},
				canceled: () => {
					resolve({ needLoad: false });
				},
				closed: () => {
					dispose();
				},
			},
		);
	});

	if (needLoad) {
		await fetchRecipients();
	}
}

async function fetchRecipients() {
	const result = await misskeyApi('admin/abuse-report/notification-recipient/list', {
		method: ['email', 'webhook'],
	});

	recipients.value = result.sort((a, b) => (a.method + a.id).localeCompare(b.method + b.id));
}

onMounted(async () => {
	await fetchRecipients();
});

definePage(() => ({
	title: i18n.ts.abuseReportNotificationSettings,
	icon: 'ti ti-bell',
}));
</script>

<style module lang="scss">
.root {
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: stretch;
}

</style>
