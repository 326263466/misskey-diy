<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :actions="headerActions" :tabs="headerTabs">
	<div class="_pageBody">
		<div :class="$style.root" class="_gaps">
			<MkTip k="abuses">
				{{ i18n.ts._abuseUserReport.resolveTutorial }}
			</MkTip>

			<div class="_adminPanel">
				<div class="_adminToolbar">
					<MkSelect v-model="state" :items="stateDef" class="_adminToolbarField" style="--admin-fieldWidth: 120px;">
						<template #label>{{ i18n.ts.state }}</template>
					</MkSelect>
					<MkSelect v-model="targetUserOrigin" :items="targetUserOriginDef" class="_adminToolbarField" style="--admin-fieldWidth: 120px;">
						<template #label>{{ i18n.ts.reporteeOrigin }}</template>
					</MkSelect>
					<MkSelect v-model="reporterOrigin" :items="reporterOriginDef" class="_adminToolbarField" style="--admin-fieldWidth: 120px;">
						<template #label>{{ i18n.ts.reporterOrigin }}</template>
					</MkSelect>
					<div class="_adminToolbarActions">
						<MkButton small type="routerLink" to="/admin/abuse-report-notification-recipient">{{ i18n.ts.abuseReportNotificationSettings }}</MkButton>
					</div>
				</div>

				<MkPagination v-slot="{items}" :paginator="paginator" pageEmpty>
					<div class="_adminTableContainer">
						<table class="_adminTable">
							<thead>
								<tr>
									<th scope="col">{{ i18n.ts._abuseUserReport.reportedUser }}</th>
									<th scope="col">{{ i18n.ts._abuseReport.selectReason }}</th>
									<th scope="col">{{ i18n.ts.reporter }}</th>
									<th scope="col">{{ i18n.ts.state }}</th>
									<th scope="col">{{ i18n.ts.createdAt }}</th>
									<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
								</tr>
							</thead>
							<XAbuseReport v-for="report in items" :key="report.id" :report="report" table @resolved="resolved" @refresh="paginator.reload()"/>
						</table>
					</div>
				</MkPagination>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw } from 'vue';
import MkSelect from '@/components/MkSelect.vue';
import MkPagination from '@/components/MkPagination.vue';
import XAbuseReport from '@/components/MkAbuseReport.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useMkSelect } from '@/composables/use-mkselect.js';
import MkButton from '@/components/MkButton.vue';
import { Paginator } from '@/utility/paginator.js';

const {
	model: state,
	def: stateDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.all, value: 'all' },
		{ label: i18n.ts.unresolved, value: 'unresolved' },
		{ label: i18n.ts.resolved, value: 'resolved' },
	],
	initialValue: 'unresolved',
});
const {
	model: reporterOrigin,
	def: reporterOriginDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.all, value: 'combined' },
		{ label: i18n.ts.local, value: 'local' },
		{ label: i18n.ts.remote, value: 'remote' },
	],
	initialValue: 'combined',
});
const {
	model: targetUserOrigin,
	def: targetUserOriginDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.all, value: 'combined' },
		{ label: i18n.ts.local, value: 'local' },
		{ label: i18n.ts.remote, value: 'remote' },
	],
	initialValue: 'combined',
});
const paginator = markRaw(new Paginator('admin/abuse-user-reports', {
	limit: 10,
	computedParams: computed(() => ({
		state: state.value,
		reporterOrigin: reporterOrigin.value,
		targetUserOrigin: targetUserOrigin.value,
	})),
}));

function resolved(reportId: string) {
	paginator.removeItem(reportId);
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.abuseReports,
	icon: 'ti ti-flag',
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
