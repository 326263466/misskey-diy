<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_pageBody">
	<MkPagination v-slot="{items}" :paginator="paginator" withControl controlCard pageEmpty>
		<div :class="$style.grid">
			<MkFlashPreview v-for="flash in items" :key="flash.id" :flash="flash" @deleted="paginator.removeItem(flash.id)"/>
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
	// 与频道列表一致：单列卡片。
	display: flex;
	flex-direction: column;
	gap: 8px;
}
</style>
