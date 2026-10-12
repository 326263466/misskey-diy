<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_pageBody">
	<MkPagination v-slot="{items}" :paginator="paginator" withControl controlCard pageEmpty>
		<div :class="$style.grid">
			<MkFlashPreview v-for="flash in items" :key="flash.id" :flash="flash"/>
		</div>
	</MkPagination>
</div>
</template>

<script lang="ts" setup>
import { computed, markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import MkFlashPreview from '@/components/MkFlashPreview.vue';
import MkPagination from '@/components/MkPagination.vue';
import { Paginator } from '@/utility/paginator.js';

const props = defineProps<{
	user: Misskey.entities.User;
}>();

const paginator = markRaw(new Paginator('users/flashs', {
	limit: 20,
	computedParams: computed(() => ({
		userId: props.user.id,
	})),
}));
</script>

<style lang="scss" module>
.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr));
	gap: var(--MI-margin);
}
</style>
