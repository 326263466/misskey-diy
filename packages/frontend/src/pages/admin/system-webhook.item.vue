<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<tr>
	<td class="_adminTableMain">
		<div>{{ entity.name || entity.url }}</div>
		<div v-if="entity.name" class="_adminTableSecondary _selectable">{{ entity.url }}</div>
	</td>
	<td>
		<span class="_adminTableStatus" :style="!entity.isActive ? { '--admin-statusColor': 'var(--MI_THEME-fgTransparentWeak)' } : undefined">{{ entity.isActive ? i18n.ts.enabled : i18n.ts.disabled }}</span>
	</td>
	<td>
		<i v-if="!entity.isActive" class="ti ti-player-pause" aria-hidden="true"></i>
		<i v-else-if="entity.latestStatus === null" class="ti ti-circle" aria-hidden="true"></i>
		<i
			v-else-if="[200, 201, 204].includes(entity.latestStatus)"
			class="ti ti-check"
			:style="{ color: 'var(--MI_THEME-success)' }"
			aria-hidden="true"
		></i>
		<i v-else class="ti ti-alert-triangle" :style="{ color: 'var(--MI_THEME-error)' }" aria-hidden="true"></i>
		{{ entity.latestStatus ?? '-' }}
	</td>
	<td>
		<MkTime v-if="entity.latestSentAt" :time="entity.latestSentAt"/>
		<span v-else>-</span>
	</td>
	<td class="_adminTableActions">
		<div class="_adminTableTools">
			<button type="button" class="_textButton" @click="onEditClick">
				<i class="ti ti-settings" aria-hidden="true"></i> {{ i18n.ts.edit }}
			</button>
			<button type="button" class="_textButton" :style="{ color: 'var(--MI_THEME-error)' }" @click="onDeleteClick">
				<i class="ti ti-trash" aria-hidden="true"></i> {{ i18n.ts.delete }}
			</button>
		</div>
	</td>
</tr>
</template>

<script lang="ts" setup>
import { entities } from 'misskey-js';
import { toRefs } from 'vue';
import { i18n } from '@/i18n.js';

const emit = defineEmits<{
	(ev: 'edit', value: entities.SystemWebhook): void;
	(ev: 'delete', value: entities.SystemWebhook): void;
}>();

const props = defineProps<{
	entity: entities.SystemWebhook;
}>();

const { entity } = toRefs(props);

function onEditClick() {
	emit('edit', entity.value);
}

function onDeleteClick() {
	emit('delete', entity.value);
}

</script>
