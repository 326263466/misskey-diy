<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div class="_gaps _panel _panelPadding">
		<div v-if="!submittedQuery" :class="$style.searchRow">
			<MkInput
				v-model="searchQuery"
				:class="$style.query"
				large
				autofocus
				type="search"
				:placeholder="i18n.ts._search.placeholder"
				@enter.prevent="search"
			>
				<template #label>{{ i18n.ts.search }}</template>
				<template #prefix><i class="ti ti-search"></i></template>
			</MkInput>
			<MkButton large primary gradate rounded :disabled="searchParams == null" :class="$style.searchAction" @click="search">
				{{ i18n.ts.search }}
			</MkButton>
		</div>
		<template v-else>
			<h2 :class="$style.resultHeading">{{ i18n.tsx._search.resultsFor({ query: submittedQuery }) }}</h2>
			<div :class="$style.sortRow">
				<MkSelect v-model="sort" :items="sortOptions" small :class="$style.sortSelect"><template #label>{{ i18n.ts.sort }}</template></MkSelect>
				<MkSelect v-model="order" :items="orderOptions" small :class="$style.sortSelect"><template #label>{{ i18n.ts._search.sortOrder }}</template></MkSelect>
			</div>
			<div v-if="sort === 'popularity'" style="color: var(--MI_THEME-fgTransparentWeak);">{{ i18n.ts._search.popularityDescription }}</div>
		</template>
		<MkFoldableSection :expanded="false">
			<template #header>{{ i18n.ts.filter }}</template>

			<div class="_gaps_m">
				<div :class="$style.dateRange">
					<MkInput v-model="rangeStartAt" type="datetime-local">
						<template #label>{{ i18n.ts._search.postFrom }}</template>
					</MkInput>
					<MkInput v-model="rangeEndAt" type="datetime-local">
						<template #label>{{ i18n.ts._search.postTo }}</template>
					</MkInput>
				</div>
				<MkInfo v-if="invalidDateRange" warn>{{ i18n.ts._search.invalidDateRange }}</MkInfo>

				<MkRadios
					v-model="searchScope"
					:options="searchScopeDef"
				>
				</MkRadios>

				<div v-if="instance.federation !== 'none' && searchScope === 'server'" :class="$style.subOptionRoot">
					<MkInput
						v-model="hostInput"
						:debounce="300"
						:placeholder="i18n.ts._search.serverHostPlaceholder"
					>
						<template #label>{{ i18n.ts._search.pleaseEnterServerHost }}</template>
						<template #prefix><i class="ti ti-server"></i></template>
					</MkInput>
				</div>

				<div v-if="searchScope === 'user'" :class="$style.subOptionRoot">
					<div :class="$style.userSelectLabel">{{ i18n.ts._search.pleaseSelectUser }}</div>
					<div class="_gaps">
						<div v-if="user == null" :class="$style.userSelectButtons">
							<div v-if="$i != null">
								<MkButton
									transparent
									:class="$style.userSelectButton"
									@click="selectSelf"
								>
									<div :class="$style.userSelectButtonInner">
										<span><i class="ti ti-plus"></i><i class="ti ti-user"></i></span>
										<span>{{ i18n.ts.selectSelf }}</span>
									</div>
								</MkButton>
							</div>
							<div :style="$i == null ? 'grid-column: span 2;' : undefined">
								<MkButton
									transparent
									:class="$style.userSelectButton"
									@click="selectUser"
								>
									<div :class="$style.userSelectButtonInner">
										<span><i class="ti ti-plus"></i></span>
										<span>{{ i18n.ts.selectUser }}</span>
									</div>
								</MkButton>
							</div>
						</div>
						<div v-else :class="$style.userSelectedButtons">
							<div style="overflow: hidden;">
								<MkUserCardMini
									:user="user"
									:withChart="false"
								/>
							</div>
							<div>
								<button
									class="_button"
									:class="$style.userSelectedRemoveButton"
									:aria-label="i18n.ts.remove"
									@click="removeUser"
								>
									<i class="ti ti-x"></i>
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</MkFoldableSection>
	</div>

	<MkNotesTimeline v-if="paginator" :key="`searchNotes:${key}`" :paginator="paginator" :withControl="false"/>
</div>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref, shallowRef, watch } from 'vue';
import { host as localHost } from '@@/js/config.js';
import type * as Misskey from 'misskey-js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkButton from '@/components/MkButton.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkNotesTimeline from '@/components/MkNotesTimeline.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { Paginator } from '@/utility/paginator.js';
import type { MkRadiosOption } from '@/components/MkRadios.vue';

const props = withDefaults(defineProps<{
	query?: string;
	userId?: string;
	username?: string;
	host?: string | null;
}>(), {
	query: '',
	userId: undefined,
	username: undefined,
	host: '',
});

const emit = defineEmits<{
	(ev: 'search', query: string): void;
}>();

const key = ref(0);
const paginator = shallowRef<Paginator<'notes/search'> | null>(null);

const searchQuery = ref(props.query);
const submittedQuery = ref('');
const sortOptions = [{ value: 'time', label: i18n.ts._search.sortByTime }, { value: 'popularity', label: i18n.ts._search.sortByPopularity }];
const orderOptions = [{ value: 'desc', label: i18n.ts.descendingOrder }, { value: 'asc', label: i18n.ts.ascendingOrder }];
const sort = ref<'time' | 'popularity'>('time');
const order = ref<'asc' | 'desc'>('desc');
const hostInput = ref(props.host);
const rangeStartAt = ref<string | null>(null);
const rangeEndAt = ref<string | null>(null);
const invalidDateRange = computed(() => {
	const start = rangeStartAt.value ? new Date(rangeStartAt.value).getTime() : null;
	const end = rangeEndAt.value ? new Date(rangeEndAt.value).getTime() : null;
	return (start != null && !Number.isFinite(start)) || (end != null && !Number.isFinite(end)) || (start != null && end != null && start > end);
});

const user = shallowRef<Misskey.entities.UserDetailed | null>(null);

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const noteSearchableScope = instance.noteSearchableScope ?? 'local';

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
	if (noteSearchableScope === 'local') return 'local';
	if (hostInput.value) return 'server';
	return 'all';
})());

const searchScopeDef = computed<MkRadiosOption[]>(() => {
	const options: MkRadiosOption[] = [];

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

const searchParams = computed(() => getSearchParams(searchQuery.value));

function selectUser() {
	os.selectUser({
		includeSelf: true,
		localOnly: instance.noteSearchableScope === 'local',
	}).then(_user => {
		user.value = _user;
	});
}

function selectSelf() {
	user.value = $i;
}

function removeUser() {
	user.value = null;
}

function search() {
	const params = searchParams.value;
	if (params == null) return;

	showResults(params.query);
	emit('search', params.query);
}

function showResults(query: string) {
	submittedQuery.value = query.trim();
	const params = getSearchParams(query);
	if (params == null) {
		paginator.value = null;
		return;
	}

	paginator.value = markRaw(new Paginator('notes/search', {
		limit: 10,
		offsetMode: true,
		canFetchDetection: 'limit',
		params: { ...params, sort: sort.value, order: order.value },
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

watch([searchScope, rangeStartAt, rangeEndAt, hostInput, user, sort, order], () => {
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

.sortRow {
	display: flex;
	flex-wrap: wrap;
	gap: var(--MI-margin);
}

.sortSelect { min-width: 150px; }

.dateRange {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
	gap: 8px;
}

.subOptionRoot {
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
	padding: var(--MI-margin);
}

.userSelectLabel {
	font-size: 0.85em;
	padding: 0 0 8px;
	user-select: none;
}

.userSelectButtons {
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 16px;
}

.userSelectButton {
	width: 100%;
	height: 100%;
	padding: 12px;
	border: 2px dashed color(from var(--MI_THEME-fg) srgb r g b / 0.5);
}

.userSelectButtonInner {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: space-between;
	min-height: 38px;
}

.userSelectedButtons {
	display: grid;
	grid-template-columns: 1fr auto;
	align-items: center;
}

.userSelectedRemoveButton {
	width: 32px;
	height: 32px;
	color: var(--MI_THEME-error);
}
</style>
