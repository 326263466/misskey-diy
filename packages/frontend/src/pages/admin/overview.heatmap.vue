<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_panel">
	<MkSelect v-model="src" :items="srcDef" style="margin: 0 0 12px 0;" small>
	</MkSelect>
	<MkHeatmap :src="src"/>
</div>
</template>

<script lang="ts" setup>
import MkHeatmap from '@/components/MkHeatmap.vue';
import MkSelect from '@/components/MkSelect.vue';
import { useMkSelect } from '@/composables/use-mkselect.js';
import { i18n } from '@/i18n.js';

const {
	model: src,
	def: srcDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts._charts.activeUsers, value: 'active-users' },
		{ label: i18n.ts.notes, value: 'notes' },
		{ label: i18n.ts._dashboard.apRequestsInboxReceived, value: 'ap-requests-inbox-received' },
		{ label: i18n.ts._dashboard.apRequestsDeliverSucceeded, value: 'ap-requests-deliver-succeeded' },
		{ label: i18n.ts._dashboard.apRequestsDeliverFailed, value: 'ap-requests-deliver-failed' },
	],
	initialValue: 'active-users',
});
</script>
