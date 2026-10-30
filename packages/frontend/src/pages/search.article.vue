<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="results">
	<MkPagination v-if="submittedQuery" :paginator="paginator" :pageEmpty="!preview">
		<template #default="{ items }">
			<div class="_gaps_s">
				<MkArticlePreview v-for="article in items" :key="article.id" :article="article" :searchQuery="submittedQuery"/>
			</div>
		</template>
	</MkPagination>
</div>
</template>

<script lang="ts" setup>
import { computed, markRaw, useTemplateRef } from 'vue';
import { useSearchHighlight } from '@/composables/use-search-highlight.js';
import MkArticlePreview from '@/components/MkArticlePreview.vue';
import MkPagination from '@/components/MkPagination.vue';
import { Paginator } from '@/utility/paginator.js';
import { searchErrorMessage } from '@/utility/search-error.js';

const props = withDefaults(defineProps<{
	query?: string;
	userId?: string;
	preview?: boolean;
}>(), {
	query: '',
	userId: undefined,
	preview: false,
});

const submittedQuery = computed(() => props.query.trim());
useSearchHighlight(useTemplateRef('results'), submittedQuery);
const paginator = computed(() => markRaw(new Paginator('articles/list', {
	limit: props.preview ? 3 : 10,
	noPaging: props.preview,
	getErrorMessage: searchErrorMessage,
	params: { query: submittedQuery.value, sort: 'latest', userId: props.userId },
})));
</script>
