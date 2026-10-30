<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<form :class="$style.root" role="search" :aria-label="i18n.ts.searchByGoogle" @submit.prevent="search">
	<i class="ti ti-search" :class="$style.icon" aria-hidden="true"></i>
	<input v-model="query" :class="$style.input" type="search" enterkeyhint="search" :placeholder="q" :aria-label="i18n.ts.searchByGoogle" @keydown="onSearchKeydown($event, search)">
	<button type="submit" class="_button" :class="$style.button">{{ i18n.ts.searchByGoogle }}</button>
</form>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { i18n } from '@/i18n.js';
import { onSearchKeydown } from '@/utility/search-keydown.js';

const props = defineProps<{
	q: string;
}>();

const query = ref(props.q);

const search = () => {
	const sp = new URLSearchParams();
	sp.append('q', query.value);
	window.open(`https://www.google.com/search?${sp.toString()}`, '_blank', 'noopener');
};
</script>

<style lang="scss" module>
@use '../styles/search.scss' as search;

.root {
	@include search.container;
	margin: 8px 0;
}

.input {
	@include search.input;
}

.icon {
	@include search.icon;
}

.button {
	@include search.button;
}
</style>
