<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<div class="_pageBody">
		<div>
			<MkPagination v-slot="{items}" :paginator="paginator" withControl controlCard>
				<MkA v-for="list in items" :key="list.id" class="_panel" :class="$style.list" :to="`/list/${ list.id }`">
					<div>{{ list.name }}</div>
					<MkAvatars v-if="list.userIds != null" :userIds="list.userIds"/>
				</MkA>
			</MkPagination>
		</div>
	</div>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import MkPagination from '@/components/MkPagination.vue';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import MkAvatars from '@/components/MkAvatars.vue';
import { Paginator } from '@/utility/paginator.js';

const props = defineProps<{
	user: Misskey.entities.UserDetailed;
}>();

const paginator = markRaw(new Paginator('users/lists/list', {
	noPaging: true,
	limit: 10,
	params: {
		userId: props.user.id,
	},
}));
</script>

<style lang="scss" module>
.list {
	display: block;
	padding: var(--MI-cardPadding);
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 6px;
	margin-bottom: 8px;

	&:hover {
		border: solid 1px var(--MI_THEME-accent);
		text-decoration: none;
	}
}
</style>
