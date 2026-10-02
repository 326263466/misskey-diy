<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div class="_gaps _panel _panelPadding">
		<div v-if="!submittedQuery" :class="$style.searchRow">
			<MkInput v-model="searchQuery" :class="$style.query" :large="true" :autofocus="true" type="search" :placeholder="i18n.ts._search.placeholder" @enter.prevent="search">
				<template #label>{{ i18n.ts.search }}</template>
				<template #prefix><i class="ti ti-search"></i></template>
			</MkInput>
			<MkButton large primary gradate rounded :disabled="!searchQuery.trim()" :class="$style.searchAction" @click="search">{{ i18n.ts.search }}</MkButton>
		</div>
		<h2 v-else :class="$style.resultHeading">{{ i18n.tsx._search.resultsFor({ query: submittedQuery }) }}</h2>
		<MkRadios
				v-if="instance.federation !== 'none'"
				v-model="searchOrigin"
				:options="[
					{ value: 'combined', label: i18n.ts.all },
					{ value: 'local', label: i18n.ts.local },
					{ value: 'remote', label: i18n.ts.remote },
				]"
		>
			<template #label>{{ i18n.ts.filter }}</template>
		</MkRadios>
	</div>

	<MkUserList v-if="paginator" :key="`searchUsers:${key}`" :paginator="paginator"/>
</div>
</template>

<script lang="ts" setup>
import { markRaw, ref, shallowRef, watch } from 'vue';
import type { Endpoints } from 'misskey-js';
import MkUserList from '@/components/MkUserList.vue';
import MkInput from '@/components/MkInput.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { Paginator } from '@/utility/paginator.js';

const props = withDefaults(defineProps<{
	query?: string,
	origin?: Endpoints['users/search']['req']['origin'],
}>(), {
	query: '',
	origin: 'combined',
});

const emit = defineEmits<{
	(ev: 'search', query: string): void;
}>();

const key = ref(0);
const paginator = shallowRef<Paginator<'users/search'> | null>(null);

const searchQuery = ref(props.query);
const submittedQuery = ref('');
const searchOrigin = ref(props.origin);

function search() {
	const query = searchQuery.value.toString().trim();

	if (query === '') return;

	showResults(query);
	emit('search', query);
}

function showResults(query: string) {
	query = query.trim();
	if (!query) return;

	submittedQuery.value = query;
	paginator.value = markRaw(new Paginator('users/search', {
		limit: 10,
		offsetMode: true,
		params: {
			query: query,
			origin: instance.federation === 'none' ? 'local' : searchOrigin.value,
		},
	}));

	key.value++;
}

watch(() => props.query, query => {
	if (query.trim() === submittedQuery.value) return;
	searchQuery.value = query;
	if (query.trim()) {
		showResults(query);
	} else {
		submittedQuery.value = '';
		paginator.value = null;
	}
}, { immediate: true });

watch(searchOrigin, () => {
	if (submittedQuery.value) showResults(submittedQuery.value);
});
</script>

<style lang="scss" module>
.searchRow {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: 12px;
}

.query {
	flex: 1 1 240px;
	min-width: 0;
}

.searchAction {
	flex-shrink: 0;
	margin-left: auto;
}

.resultHeading {
	margin: 0;
	font-size: 1.1em;
	overflow-wrap: anywhere;
}
</style>
