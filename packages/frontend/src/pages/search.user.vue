<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div v-if="!preview && instance.federation !== 'none'" class="_panel" :class="$style.filters">
		<MkSelect
				v-model="searchOrigin"
				:class="$style.origin"
				small
				:items="[
					{ value: 'combined', label: i18n.ts.all },
					{ value: 'local', label: i18n.ts.local },
					{ value: 'remote', label: i18n.ts.remote },
				]"
		>
			<template #label>{{ i18n.ts.filter }}</template>
		</MkSelect>
	</div>

	<div ref="results">
		<MkUserList v-if="submittedQuery" :paginator="paginator" :pageEmpty="!preview"/>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref, useTemplateRef, watch } from 'vue';
import { useSearchHighlight } from '@/composables/use-search-highlight.js';
import type { Endpoints } from 'misskey-js';
import MkUserList from '@/components/MkUserList.vue';
import MkSelect from '@/components/MkSelect.vue';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { Paginator } from '@/utility/paginator.js';
import { searchErrorMessage } from '@/utility/search-error.js';

const props = withDefaults(defineProps<{
	query?: string,
	origin?: Endpoints['users/search']['req']['origin'],
	preview?: boolean,
}>(), {
	query: '',
	origin: 'combined',
	preview: false,
});

const submittedQuery = computed(() => props.query.trim());
useSearchHighlight(useTemplateRef('results'), submittedQuery);
const searchOrigin = ref(props.origin);
watch(() => props.origin, origin => { searchOrigin.value = origin; });
const paginator = computed(() => markRaw(new Paginator('users/search', {
	limit: props.preview ? 3 : 10,
	noPaging: props.preview,
	getErrorMessage: searchErrorMessage,
	offsetMode: true,
	params: {
		query: submittedQuery.value,
		origin: instance.federation === 'none' ? 'local' : searchOrigin.value,
	},
})));
</script>

<style lang="scss" module>
.filters {
	display: flex;
	flex-wrap: nowrap;
	max-width: 100%;
	padding: 10px 16px;
	box-sizing: border-box;
	overflow-x: auto;
	white-space: nowrap;
}

.origin {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 160px;
	flex-shrink: 0;

	> :first-child { flex-shrink: 0; padding: 0; }
	> :nth-child(2) { flex: 1; min-width: 0; }
}
</style>
