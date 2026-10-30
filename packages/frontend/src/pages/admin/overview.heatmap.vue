<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_panel">
	<MkHeatmap :src="src" fill/>
</div>
</template>

<script lang="ts" setup>
import MkHeatmap from '@/components/MkHeatmap.vue';
import type { HeatmapSource } from '@/components/MkHeatmap.vue';

defineProps<{
	src: HeatmapSource;
}>();
</script>
