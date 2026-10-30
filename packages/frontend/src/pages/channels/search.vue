<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="paginator" :class="$style.root">
	<MkRadios
		v-model="type"
		:options="[
			{ value: 'nameAndDescription', label: i18n.ts._channel.nameAndDescription },
			{ value: 'nameOnly', label: i18n.ts._channel.nameOnly },
		]"
		@update:modelValue="updateType"
	>
	</MkRadios>

	<MkFoldableSection>
		<template #header>{{ i18n.ts.searchResult }}</template>
		<MkChannelList :paginator="paginator"/>
	</MkFoldableSection>
</div>
<MkResult v-else type="empty" :text="i18n.ts._channel.searchPlaceholder"/>
</template>

<script lang="ts" setup>
import { markRaw, ref } from 'vue';
import MkChannelList from '@/components/MkChannelList.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';
import { Paginator } from '@/utility/paginator.js';

type SearchType = 'nameAndDescription' | 'nameOnly';

// 搜索框在频道页外框中；这里按地址里的关键词和范围显示结果。
const props = defineProps<{
	query?: string;
	type?: string;
}>();

const router = useRouter();
const keyword = props.query?.trim() ?? '';
const type = ref<SearchType>(props.type === 'nameOnly' ? 'nameOnly' : 'nameAndDescription');

const paginator = keyword === '' ? null : markRaw(new Paginator('channels/search', {
	limit: 10,
	params: {
		query: keyword,
		type: type.value,
	},
}));

function updateType() {
	if (keyword === '') return;
	router.replaceByPath(`/channels/search?q=${encodeURIComponent(keyword)}&type=${type.value}`);
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: var(--MI-margin);
	width: 100%;
}
</style>
