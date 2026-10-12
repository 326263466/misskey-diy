<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span v-appear="load" :class="$style.root">
	<MkMiniChart v-if="values" :src="values" :class="$style.chart" preserveAspectRatio="none" role="img" :aria-label="i18n.ts._chat.memberActivity"/>
</span>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, ref } from 'vue';
import MkMiniChart from '@/components/MkMiniChart.vue';
import { misskeyApiGet } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ userId: string }>();
const values = ref<number[] | null>(null);
const controller = new AbortController();
let requested = false;

async function load() {
	if (requested) return;
	requested = true;
	try {
		const result = await misskeyApiGet('charts/user/notes', { userId: props.userId, limit: 17, span: 'day' }, controller.signal);
		// 与原成员卡片一致：使用完整的前 16 天，不纳入尚未结束的今天。
		const completeDays = result.inc.slice(1);
		if (!controller.signal.aborted && completeDays.length > 1) values.value = completeDays;
	} catch { /* 活跃数据不可用时保留占位，不影响成员操作。 */ }
}

onBeforeUnmount(() => controller.abort());
</script>

<style lang="scss" module>
.root { display: inline-flex; flex: 0 0 30px; width: 30px; height: 24px; align-items: center; }
.chart { width: 100%; height: 100%; }
.chart :global(polyline) { vector-effect: non-scaling-stroke; stroke-width: 1px; }
</style>
