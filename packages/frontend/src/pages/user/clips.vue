<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_pageBody">
	<div>
		<MkPagination v-slot="{items}" :paginator="paginator" withControl controlCard pageEmpty>
			<MkA v-for="item in items" :key="item.id" :to="`/clips/${item.id}`" :class="$style.item" class="_panel">
				<b><Mfm :text="item.name" :plain="true" :nowrap="true"/></b>
				<div v-if="item.description" :class="$style.description"><Mfm :text="item.description" :plain="true" :nowrap="true"/></div>
			</MkA>
		</MkPagination>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import MkPagination from '@/components/MkPagination.vue';
import { Paginator } from '@/utility/paginator.js';

const props = defineProps<{
	user: Misskey.entities.User;
}>();

const paginator = markRaw(new Paginator('users/clips', {
	limit: 20,
	computedParams: computed(() => ({
		userId: props.user.id,
	})),
}));
</script>

<style lang="scss" module>
.item {
	display: block;
	padding: var(--MI-cardPadding);
}

.description {
	color: var(--MI_THEME-fgTransparentWeak);
	margin-top: 8px;
	padding-top: 8px;
	border-top: var(--MI-divider);
}
</style>
