<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div class="_gaps">
		<div :class="$style.searchRow">
			<MkInput v-model="query" :class="$style.searchInput" :large="true" :autofocus="true" type="search" @enter="search">
				<template #label>{{ i18n.ts.search }}</template>
				<template #prefix><i class="ti ti-search"></i></template>
			</MkInput>
			<MkButton large primary gradate rounded @click="search">{{ i18n.ts.search }}</MkButton>
		</div>
		<MkRadios
			v-model="type"
			:options="[
				{ value: 'nameAndDescription', label: i18n.ts._channel.nameAndDescription },
				{ value: 'nameOnly', label: i18n.ts._channel.nameOnly },
			]"
			@update:modelValue="search()"
		>
		</MkRadios>
	</div>

	<MkFoldableSection v-if="paginator">
		<template #header>{{ i18n.ts.searchResult }}</template>
		<MkChannelList :key="key" :paginator="paginator"/>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { markRaw, ref, shallowRef } from 'vue';
import MkChannelList from '@/components/MkChannelList.vue';
import MkInput from '@/components/MkInput.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkButton from '@/components/MkButton.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import { i18n } from '@/i18n.js';
import { Paginator } from '@/utility/paginator.js';

type SearchType = 'nameAndDescription' | 'nameOnly';

const key = ref('');
const query = ref('');
const type = ref<SearchType>('nameAndDescription');
const paginator = shallowRef<Paginator<'channels/search'> | null>(null);

function search() {
	const trimmed = query.value.toString().trim();
	if (trimmed === '') return;

	paginator.value = markRaw(new Paginator('channels/search', {
		limit: 10,
		params: {
			query: trimmed,
			type: type.value,
		},
	}));

	key.value = trimmed + type.value;
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: var(--MI-margin);
	width: 100%;
}

.searchRow {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: 10px;
}

.searchInput {
	flex: 1 1 220px;
	min-width: 0;
}
</style>
