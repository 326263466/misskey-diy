<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_pageBody">
		<div class="_gaps_s">
			<MkUserList :paginator="paginator"/>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw } from 'vue';
import MkUserList from '@/components/MkUserList.vue';
import { definePage } from '@/page.js';
import { Paginator } from '@/utility/paginator.js';

const props = defineProps<{
	tag: string;
}>();

const paginator = markRaw(new Paginator('hashtags/users', {
	limit: 30,
	offsetMode: true,
	computedParams: computed(() => ({
		tag: props.tag,
		origin: 'combined',
		sort: '+follower',
	})),
}));

definePage(() => ({
	title: props.tag,
	icon: 'ti ti-user-search',
}));
</script>

