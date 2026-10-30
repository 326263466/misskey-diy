<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<XBars :series="series" :days="chartLimit"/>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, shallowRef } from 'vue';
import * as Misskey from 'misskey-js';
import XBars from './activity.bars.vue';
import type { ActivityBarSeries } from './activity.bars.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	user: Misskey.entities.User;
}>();

const chartLimit = 50;
const series = shallowRef<ActivityBarSeries[] | null>(null);
let disposed = false;

onMounted(async () => {
	const raw = await misskeyApi('charts/user/notes', { userId: props.user.id, limit: chartLimit, span: 'day' });
	if (disposed) return;
	series.value = [
		{ name: i18n.ts._chartSeries.notesNormal, data: raw.diffs.normal, color: 0, stack: 'notes' },
		{ name: i18n.ts.replies, data: raw.diffs.reply, color: 1, stack: 'notes' },
		{ name: i18n.ts.renotes, data: raw.diffs.renote, color: 2, stack: 'notes' },
		{ name: i18n.ts._chartSeries.notesWithFile, data: raw.diffs.withFile, color: 3, stack: 'notes' },
	];
});

onUnmounted(() => {
	disposed = true;
});
</script>
