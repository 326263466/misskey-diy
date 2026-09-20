<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 900px;">
		<div class="_gaps">
			<MkPaginationControl :paginator="paginator" canFilter>
				<MkSelect v-model="type" :items="typeDef" style="margin: 0; flex: 1;">
					<template #label>{{ i18n.ts.type }}</template>
				</MkSelect>

				<MkInput v-model="moderatorId" style="margin: 0; flex: 1;">
					<template #label>{{ i18n.ts.moderator }}(ID)</template>
				</MkInput>
			</MkPaginationControl>

			<MkPagination :paginator="paginator">
				<MkTl :events="timeline" groupBy="d">
					<template #left="{ event }">
						<div>
							<MkAvatar :user="event.user" style="width: 26px; height: 26px;"/>
						</div>
					</template>
					<template #right="{ event, timestamp, delta }">
						<div style="margin: 4px 0;">
							<XModLog :key="event.id" :log="event"/>
						</div>
					</template>
				</MkTl>
			</MkPagination>
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
import MkTl from '@/components/MkTl.vue';
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

const timeline = computed(() => {
	return paginator.items.value.map(x => ({
		id: x.id,
		timestamp: new Date(x.createdAt).getTime(),
		data: x as Misskey.entities.ModerationLog,
	}));
});

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.moderationLogs,
	icon: 'ti ti-list-search',
}));
</script>
