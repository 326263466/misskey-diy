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
	const raw = await misskeyApi('charts/user/following', { userId: props.user.id, limit: chartLimit, span: 'day' });
	if (disposed) return;
	series.value = [
		// 关注和被关注各一组，本地用实色、远程用浅色。
		{ name: i18n.ts._chartSeries.followLocal, data: raw.local.followings.inc, color: 0, stack: 'follow' },
		{ name: i18n.ts._chartSeries.followRemote, data: raw.remote.followings.inc, color: 0, stack: 'follow', light: true },
		{ name: i18n.ts._chartSeries.followedLocal, data: raw.local.followers.inc, color: 1, stack: 'followed' },
		{ name: i18n.ts._chartSeries.followedRemote, data: raw.remote.followers.inc, color: 1, stack: 'followed', light: true },
	];
});

onUnmounted(() => {
	disposed = true;
});
</script>
