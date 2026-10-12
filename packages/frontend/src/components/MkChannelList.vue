<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkPagination :paginator="paginator">
	<template #empty><MkResult type="empty"/></template>

	<template #default="{ items }">
		<div :class="$style.root">
			<MkChannelPreview v-for="item in items" :key="item.id" :channel="extractor(item)"/>
		</div>
	</template>
</MkPagination>
</template>

<script lang="ts" setup generic="P extends IPaginator">
import * as Misskey from 'misskey-js';
import type { IPaginator, ExtractorFunction } from '@/utility/paginator.js';
import MkChannelPreview from '@/components/MkChannelPreview.vue';
import MkPagination from '@/components/MkPagination.vue';

const props = withDefaults(defineProps<{
	paginator: P;
	noGap?: boolean;
	extractor?: ExtractorFunction<P, Misskey.entities.Channel>;
}>(), {
	extractor: (item: any) => item as Misskey.entities.Channel,
});
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	width: 100%;

	> * + * {
		border-top: var(--MI-divider);
	}
}
</style>
