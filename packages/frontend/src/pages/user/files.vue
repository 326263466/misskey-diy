<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_pageBody">
	<div>
		<MkPagination v-slot="{items}" :paginator="paginator" withControl controlCard>
			<div :class="$style.stream">
				<MkNoteMediaGrid v-for="note in items" :note="note" square/>
			</div>
		</MkPagination>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import MkNoteMediaGrid from '@/components/MkNoteMediaGrid.vue';
import MkPagination from '@/components/MkPagination.vue';
import { Paginator } from '@/utility/paginator.js';

const props = defineProps<{
	user: Misskey.entities.UserDetailed;
}>();

const paginator = markRaw(new Paginator('users/notes', {
	limit: 15,
	computedParams: computed(() => ({
		userId: props.user.id,
		withFiles: true,
	})),
}));
</script>

<style lang="scss" module>
.stream {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(120px, 100%), 1fr));
	gap: var(--MI-marginHalf);
}

@media screen and (min-width: 600px) {
	.stream {
		grid-template-columns: repeat(auto-fill, minmax(min(160px, 100%), 1fr));
	}

}
</style>
