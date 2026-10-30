<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :actions="headerActions" :tabs="headerTabs">
	<div class="_pageBody">
		<div class="_gaps">
			<div class="_adminPanel">
				<MkPaginationControl :paginator="paginator" class="_adminPanelHeader">
					<template #header>
						<div class="_adminToolbar">
							<MkSelect v-model="type" :items="typeDef" class="_adminToolbarField" style="--admin-fieldWidth: 200px;">
								<template #label>{{ i18n.ts.type }}</template>
							</MkSelect>

							<MkInput v-model="moderatorId" type="search" class="_adminToolbarField" style="--admin-fieldWidth: 200px;">
								<template #label>{{ i18n.ts.moderator }}(ID)</template>
							</MkInput>
						</div>
					</template>
				</MkPaginationControl>

				<MkPagination v-slot="{ items }" :paginator="paginator" pageEmpty>
					<div class="_adminTableContainer">
						<table class="_adminTable">
							<thead>
								<tr>
									<th scope="col">{{ i18n.ts.type }}</th>
									<th scope="col">{{ i18n.ts.moderator }}</th>
									<th scope="col">{{ i18n.ts.dateAndTime }}</th>
									<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
								</tr>
							</thead>
							<XModLog v-for="log in getLogs(items)" :key="log.id" :log="log"/>
						</table>
					</div>
				</MkPagination>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref, markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import XModLog from './modlog.ModLog.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkInput from '@/components/MkInput.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useMkSelect } from '@/composables/use-mkselect.js';
import MkPagination from '@/components/MkPagination.vue';
import MkPaginationControl from '@/components/MkPaginationControl.vue';
import { Paginator } from '@/utility/paginator.js';

const {
	model: type,
	def: typeDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.all, value: null },
		...Misskey.moderationLogTypes.map(t => ({ label: i18n.ts._moderationLogTypes[t] ?? t, value: t })),
	],
	initialValue: null,
});
const moderatorId = ref('');

const paginator = markRaw(new Paginator('admin/show-moderation-logs', {
	limit: 20,
	canFetchDetection: 'limit',
	canSearch: true,
	computedParams: computed(() => ({
		type: type.value,
		userId: moderatorId.value === '' ? null : moderatorId.value,
	})),
}));

function getLogs(items: typeof paginator.items.value): Misskey.entities.ModerationLog[] {
	return items.map(log => log as Misskey.entities.ModerationLog);
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.moderationLogs,
	icon: 'ti ti-list-search',
}));
</script>
