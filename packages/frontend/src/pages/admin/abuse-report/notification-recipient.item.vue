<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<tr>
	<td><span :class="`ti ${methodIcon}`" aria-hidden="true"></span> {{ methodName }}</td>
	<td class="_adminTableMain">{{ entity.name }}</td>
	<td class="_adminTableMain">
		<div v-if="method === 'email' && user">
			{{ i18n.ts._abuseReport._notificationRecipient.notifiedUser }}: <MkUserName :user="user"/><template v-if="user.name">({{ user.username }})</template>
		</div>
		<div v-if="method === 'webhook' && systemWebhook">
			{{ `${i18n.ts._abuseReport._notificationRecipient.notifiedWebhook}: ` + systemWebhook.name }}
		</div>
	</td>
	<td class="_adminTableActions">
		<div class="_adminTableTools">
			<button type="button" class="_textButton" @click="onEditButtonClicked()">
				<span class="ti ti-settings" aria-hidden="true"></span> {{ i18n.ts.edit }}
			</button>
			<button type="button" class="_textButton" :style="{ color: 'var(--MI_THEME-error)' }" @click="onDeleteButtonClicked()">
				<span class="ti ti-trash" aria-hidden="true"></span> {{ i18n.ts.delete }}
			</button>
		</div>
	</td>
</tr>
</template>

<script setup lang="ts">
import { entities } from 'misskey-js';
import { computed, toRefs } from 'vue';
import { i18n } from '@/i18n.js';

const emit = defineEmits<{
	(ev: 'edit', id: entities.AbuseReportNotificationRecipient['id']): void;
	(ev: 'delete', id: entities.AbuseReportNotificationRecipient['id']): void;
}>();

const props = defineProps<{
	entity: entities.AbuseReportNotificationRecipient;
}>();

const { entity } = toRefs(props);

const method = computed(() => entity.value.method);
const user = computed(() => entity.value.user);
const systemWebhook = computed(() => entity.value.systemWebhook);
const methodIcon = computed(() => {
	switch (entity.value.method) {
		case 'email':
			return 'ti-mail';
		case 'webhook':
			return 'ti-webhook';
		default:
			return 'ti-help';
	}
});
const methodName = computed(() => {
	switch (entity.value.method) {
		case 'email':
			return i18n.ts._abuseReport._notificationRecipient._recipientType.mail;
		case 'webhook':
			return i18n.ts._abuseReport._notificationRecipient._recipientType.webhook;
		default:
			return i18n.ts.unknown;
	}
});

function onEditButtonClicked() {
	emit('edit', entity.value.id);
}

function onDeleteButtonClicked() {
	emit('delete', entity.value.id);
}
</script>
