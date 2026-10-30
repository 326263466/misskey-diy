<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<template v-if="!preview">
		<div :class="$style.filters" class="_panel" role="group" :aria-label="i18n.ts.filter">
			<MkSelect v-model="searchScope" :items="searchScopeDef" small :class="[$style.field, $style.scope]">
				<template #label>{{ i18n.ts.filter }}</template>
			</MkSelect>
			<MkInput v-if="instance.federation !== 'none' && searchScope === 'server'" v-model="hostInput" type="search" small :class="[$style.field, $style.server]" :placeholder="i18n.ts._search.serverHostPlaceholder">
				<template #label>{{ i18n.ts.server }}</template>
			</MkInput>
			<div v-if="searchScope === 'user'" :class="$style.userFilter">
				<button type="button" class="_button" :class="$style.filterButton" @click="selectUser"><i class="ti ti-user" aria-hidden="true"></i>{{ user ? '@' + user.username : i18n.ts.selectUser }}</button>
			</div>
			<MkInput v-model="rangeStartAt" type="datetime-local" small :class="[$style.field, $style.date]" :placeholder="i18n.ts.notSet">
				<template #label>{{ i18n.ts._search.postFrom }}</template>
			</MkInput>
			<MkInput v-model="rangeEndAt" type="datetime-local" small :class="[$style.field, $style.date]" :placeholder="i18n.ts.notSet">
				<template #label>{{ i18n.ts._search.postTo }}</template>
			</MkInput>
			<MkSelect v-model="sort" :items="sortOptions" small :class="[$style.field, $style.sort]">
				<template #label>{{ i18n.ts.sort }}</template>
			</MkSelect>
			<button type="button" class="_button" :class="$style.filterButton" :aria-label="`${i18n.ts._search.sortOrder}: ${orderLabel}`" @click="order = order === 'asc' ? 'desc' : 'asc'">
				<i :class="order === 'asc' ? 'ti ti-sort-ascending' : 'ti ti-sort-descending'" aria-hidden="true"></i>{{ orderLabel }}
			</button>
		</div>
		<MkInfo v-if="invalidDateRange" warn>{{ i18n.ts._search.invalidDateRange }}</MkInfo>
		<p v-if="sort === 'popularity'" class="_caption">{{ i18n.ts._search.popularityDescription }}</p>
	</template>
	<div ref="results">
		<MkNotesTimeline v-if="paginator" :key="`searchNotes:${key}`" :paginator="paginator" :withControl="false" :pageEmpty="!preview"/>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { useSearchHighlight } from '@/composables/use-search-highlight.js';
import { host as localHost } from '@@/js/config.js';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkNotesTimeline from '@/components/MkNotesTimeline.vue';
import { Paginator } from '@/utility/paginator.js';
import { searchErrorMessage } from '@/utility/search-error.js';
import type { ItemOption } from '@/components/MkSelect.vue';

const props = withDefaults(defineProps<{
	query?: string;
	userId?: string;
	username?: string;
	host?: string | null;
	channel?: string;
	preview?: boolean;
}>(), {
	query: '',
	userId: undefined,
	username: undefined,
	host: '',
	channel: undefined,
	preview: false,
});

const key = ref(0);
const paginator = shallowRef<Paginator<'notes/search'> | null>(null);

const submittedQuery = ref('');
useSearchHighlight(useTemplateRef('results'), submittedQuery);
const sortOptions = [{ value: 'time', label: i18n.ts._search.sortByTime }, { value: 'popularity', label: i18n.ts._search.sortByPopularity }];
const sort = ref<'time' | 'popularity'>('time');
const order = ref<'asc' | 'desc'>('desc');
const orderLabel = computed(() => order.value === 'asc' ? i18n.ts.ascendingOrder : i18n.ts.descendingOrder);
const hostInput = ref(props.host);
const rangeStartAt = ref<string | null>(null);
const rangeEndAt = ref<string | null>(null);
const invalidDateRange = computed(() => {
	const start = rangeStartAt.value ? new Date(rangeStartAt.value).getTime() : null;
	const end = rangeEndAt.value ? new Date(rangeEndAt.value).getTime() : null;
	return (start != null && !Number.isFinite(start)) || (end != null && !Number.isFinite(end)) || (start != null && end != null && start > end);
});

const user = shallowRef<Misskey.entities.UserDetailed | null>(null);

const noteSearchableScope = instance.noteSearchableScope;

//#region set user
let fetchedUser: Misskey.entities.UserDetailed | null = null;

if (props.userId) {
	fetchedUser = await misskeyApi('users/show', {
		userId: props.userId,
	}).catch(() => null);
}

if (props.username && fetchedUser == null) {
	fetchedUser = await misskeyApi('users/show', {
		username: props.username,
		...(props.host ? { host: props.host } : {}),
	}).catch(() => null);
}

if (fetchedUser != null) {
	if (!(noteSearchableScope === 'local' && fetchedUser.host != null)) {
		user.value = fetchedUser;
	}
}
//#endregion

const searchScope = ref<'all' | 'local' | 'server' | 'user'>((() => {
	if (user.value != null) return 'user';
	if (instance.federation === 'none' || noteSearchableScope === 'local') return 'local';
	if (hostInput.value) return 'server';
	return 'all';
})());

const searchScopeDef = computed<ItemOption<'all' | 'local' | 'server' | 'user'>[]>(() => {
	const options: ItemOption<'all' | 'local' | 'server' | 'user'>[] = [];

	if (instance.federation !== 'none' && noteSearchableScope === 'global') {
		options.push({ value: 'all', label: i18n.ts._search.searchScopeAll });
	}

	options.push({ value: 'local', label: instance.federation === 'none' ? i18n.ts._search.searchScopeAll : i18n.ts._search.searchScopeLocal });

	if (instance.federation !== 'none' && noteSearchableScope === 'global') {
		options.push({ value: 'server', label: i18n.ts._search.searchScopeServer });
	}

	options.push({ value: 'user', label: i18n.ts._search.searchScopeUser });

	return options;
});

type SearchParams = {
	readonly query: string;
	readonly host?: string;
	readonly userId?: string;
	readonly rangeStartAt?: number | null;
	readonly rangeEndAt?: number | null;
};

const fixHostIfLocal = (target: string | null | undefined) => {
	if (!target || target === localHost) return '.';
	return target;
};

const searchRange = () => {
	return {
		rangeStartAt: rangeStartAt.value ? new Date(rangeStartAt.value).getTime() : null,
		rangeEndAt: rangeEndAt.value ? new Date(rangeEndAt.value).getTime() : null,
	};
};

function getSearchParams(query: string): SearchParams | null {
	const trimmedQuery = query.trim();
	if (!trimmedQuery || invalidDateRange.value) return null;

	if (searchScope.value === 'user') {
		if (user.value == null) return null;
		return {
			query: trimmedQuery,
			host: fixHostIfLocal(user.value.host),
			userId: user.value.id,
			...searchRange(),
		};
	}

	if (instance.federation !== 'none' && searchScope.value === 'server') {
		let trimmedHost = hostInput.value?.trim();
		if (!trimmedHost) return null;
		if (trimmedHost.startsWith('https://') || trimmedHost.startsWith('http://')) {
			try {
				trimmedHost = new URL(trimmedHost).host;
			} catch (err) { /* empty */ }
		}
		return {
			query: trimmedQuery,
			host: fixHostIfLocal(trimmedHost),
			...searchRange(),
		};
	}

	if (instance.federation === 'none' || searchScope.value === 'local') {
		return {
			query: trimmedQuery,
			host: '.',
			...searchRange(),
		};
	}

	return {
		query: trimmedQuery,
		...searchRange(),
	};
}

function selectUser() {
	os.selectUser({
		includeSelf: true,
		localOnly: instance.noteSearchableScope === 'local',
	}).then(_user => {
		user.value = _user;
	});
}

function showResults(query: string) {
	submittedQuery.value = query.trim();
	const params = getSearchParams(query);
	if (params == null) {
		paginator.value = null;
		return;
	}

	paginator.value = markRaw(new Paginator('notes/search', {
		limit: props.preview ? 3 : 10,
		noPaging: props.preview,
		getErrorMessage: searchErrorMessage,
		offsetMode: true,
		canFetchDetection: 'limit',
		params: { ...params, channelId: props.channel, sort: sort.value, order: order.value },
	}));

	key.value++;
}

watch(() => props.query, query => {
	if (query.trim() === submittedQuery.value) return;
	if (query.trim()) {
		showResults(query);
	} else {
		submittedQuery.value = '';
		paginator.value = null;
	}
}, { immediate: true });

watch([searchScope, rangeStartAt, rangeEndAt, hostInput, user, sort, order], () => {
	if (submittedQuery.value) showResults(submittedQuery.value);
});
</script>
<style lang="scss" module>
.filters {
	display: flex;
	align-items: center;
	flex-wrap: nowrap;
	gap: 14px;
	max-width: 100%;
	min-width: 0;
	padding: 10px 16px;
	box-sizing: border-box;
	overflow-x: auto;
	white-space: nowrap;
}

.field {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-shrink: 0;

	> :first-child { flex-shrink: 0; padding: 0; }
	> :nth-child(2) { flex: 1; min-width: 0; }
}

.scope { width: 160px; }
.sort { width: 145px; }
.date { width: 228px; }
.server { width: 245px; }

.userFilter { flex-shrink: 0; }

.filterButton {
	display: inline-flex;
	align-items: center;
	flex-shrink: 0;
	gap: 6px;
	min-height: 33px;
	color: var(--MI_THEME-fgTransparent);

	&:hover { color: var(--MI_THEME-accent); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
}
</style>
