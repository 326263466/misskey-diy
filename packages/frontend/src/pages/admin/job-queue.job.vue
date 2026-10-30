<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder @opened="folderOpened = true" @closed="folderOpened = false">
	<template #label>
		<span v-if="job.opts.repeat != null" style="margin-right: 1em;">{{ i18n.ts._queue.repeat }}</span>
		<span v-else style="margin-right: 1em;">#{{ job.id }}</span>
		<span>{{ job.name }}</span>
	</template>
	<template #suffix>
		<MkTime :time="job.finishedOn ?? job.processedOn ?? job.timestamp" mode="relative"/>
		<span v-if="typeof job.progress === 'number' && job.progress > 0" style="margin-left: 1em;">{{ Math.floor(job.progress) }}%</span>
		<span v-if="job.opts.attempts != null && job.opts.attempts > 0 && job.attempts > 1" style="margin-left: 1em; color: var(--MI_THEME-warn); font-variant-numeric: diagonal-fractions;">{{ job.attempts }}/{{ job.opts.attempts }}</span>
		<span v-if="job.finishedOn != null && job.isFailed" style="margin-left: 1em; color: var(--MI_THEME-error)"><i class="ti ti-circle-x"></i></span>
		<span v-else-if="job.finishedOn != null" style="margin-left: 1em; color: var(--MI_THEME-success)"><i class="ti ti-check"></i></span>
		<span v-else-if="job.delay > 0" style="margin-left: 1em;"><i class="ti ti-clock"></i></span>
		<span v-else-if="job.processedOn != null" style="margin-left: 1em; color: var(--MI_THEME-success)"><i class="ti ti-player-play"></i></span>
	</template>
	<XJobDetails
		:job="job"
		:queueType="queueType"
		:visible="folderOpened && visible"
		:disabled="disabled"
		@updated="emit('updated', queueType, $event)"
		@removed="emit('removed', queueType, $event)"
		@busyChanged="emit('busyChanged', queueType, job.id, $event)"
	/>
</MkFolder>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import type * as Misskey from 'misskey-js';
import XJobDetails from './job-queue.job-details.vue';
import MkFolder from '@/components/MkFolder.vue';
import { i18n } from '@/i18n.js';

withDefaults(defineProps<{
	job: Misskey.entities.QueueJob;
	queueType: typeof Misskey.queueTypes[number];
	visible?: boolean;
	disabled?: boolean;
}>(), { visible: true, disabled: false });

const emit = defineEmits<{
	(ev: 'updated', queue: typeof Misskey.queueTypes[number], job: Misskey.entities.QueueJob): void;
	(ev: 'removed', queue: typeof Misskey.queueTypes[number], jobId: string): void;
	(ev: 'busyChanged', queue: typeof Misskey.queueTypes[number], jobId: string, value: boolean): void;
}>();

const folderOpened = ref(false);
</script>
