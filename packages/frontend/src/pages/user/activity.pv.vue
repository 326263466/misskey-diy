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

const chartLimit = 30;
const series = shallowRef<ActivityBarSeries[] | null>(null);
let disposed = false;

onMounted(async () => {
	const raw = await misskeyApi('charts/user/pv', { userId: props.user.id, limit: chartLimit, span: 'day' });
	if (disposed) return;
	series.value = [
		// 独立访客和总浏览各一组，登录用户用实色、访客用浅色。
		{ name: i18n.ts._chartSeries.uniquePvUser, data: raw.upv.user, color: 0, stack: 'unique' },
		{ name: i18n.ts._chartSeries.uniquePvVisitor, data: raw.upv.visitor, color: 0, stack: 'unique', light: true },
		{ name: i18n.ts._chartSeries.pvUser, data: raw.pv.user, color: 1, stack: 'total' },
		{ name: i18n.ts._chartSeries.pvVisitor, data: raw.pv.visitor, color: 1, stack: 'total', light: true },
	];
});

onUnmounted(() => {
	disposed = true;
});
</script>
