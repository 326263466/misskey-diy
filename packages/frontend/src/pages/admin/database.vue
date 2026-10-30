<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :actions="headerActions" :tabs="headerTabs">
	<div class="_pageBody">
		<MkSuspense v-slot="{ result: database }" :p="databasePromiseFactory">
			<MkPaginationBar v-slot="{ items }" :items="database" class="_adminPanel">
				<div class="_adminTableContainer">
					<table class="_adminTable">
						<thead>
							<tr>
								<th scope="col">{{ i18n.ts.name }}</th>
								<th scope="col" class="_adminTableNumber">{{ i18n.ts.size }}</th>
								<th scope="col" class="_adminTableNumber">{{ i18n.ts.statistics }}</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="table in items" :key="table[0]">
								<td class="_adminTableMain _selectable">{{ table[0] }}</td>
								<td class="_adminTableNumber">{{ bytes(table[1].size) }}</td>
								<td class="_adminTableNumber">{{ i18n.tsx.nRecords({ n: number(table[1].count) }) }}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</MkPaginationBar>
		</MkSuspense>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import bytes from '@/filters/bytes.js';
import number from '@/filters/number.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkPaginationBar from '@/components/MkPaginationBar.vue';

const databasePromiseFactory = () => misskeyApi('admin/get-table-stats').then(res => Object.entries(res).sort((a, b) => b[1].size - a[1].size));

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.database,
	icon: 'ti ti-database',
}));
</script>
