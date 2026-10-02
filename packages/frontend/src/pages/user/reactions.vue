<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_pageBody">
	<MkPagination v-slot="{items}" :paginator="paginator">
		<div class="_gaps">
			<div v-for="item in items" :key="item.id" class="_panel">
				<MkNote :key="item.id" :note="item.note"/>
			</div>
		</div>
	</MkPagination>
</div>
</template>

<script lang="ts" setup>
import { computed, markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import MkPagination from '@/components/MkPagination.vue';
import MkNote from '@/components/MkNote.vue';
import { Paginator } from '@/utility/paginator.js';

const props = defineProps<{
	user: Misskey.entities.User;
}>();

const paginator = markRaw(new Paginator('users/reactions', {
	limit: 20,
	computedParams: computed(() => ({
		userId: props.user.id,
	})),
}));
</script>
