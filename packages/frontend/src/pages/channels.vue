<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :tabs="headerTabs" :swipable="true">
	<template v-if="$i?.policies.canCreateChannel" #header-actions>
		<MkButton type="routerLink" primary rounded to="/channels/new"><i class="ti ti-plus"></i> {{ i18n.ts.createNew }}</MkButton>
	</template>
	<div class="_pageBody">
		<div v-if="tab === 'search'" :class="$style.searchRoot">
			<div class="_gaps _panel _panelPadding">
				<div :class="$style.searchRow">
					<MkInput v-model="searchQuery" :class="$style.searchInput" :large="true" :autofocus="true" type="search" @enter="search">
						<template #prefix><i class="ti ti-search"></i></template>
					</MkInput>
					<MkButton large primary gradate rounded @click="search">{{ i18n.ts.search }}</MkButton>
				</div>
				<MkRadios
					v-model="searchType"
					:options="[
						{ value: 'nameAndDescription', label: i18n.ts._channel.nameAndDescription },
						{ value: 'nameOnly', label: i18n.ts._channel.nameOnly },
					]"
					@update:modelValue="search()"
				>
				</MkRadios>
			</div>

			<MkFoldableSection v-if="channelPaginator">
				<template #header>{{ i18n.ts.searchResult }}</template>
				<MkChannelList :key="key" :paginator="channelPaginator"/>
			</MkFoldableSection>
		</div>
		<div v-if="tab === 'featured'">
			<MkPagination v-slot="{items}" :paginator="featuredPaginator">
				<div :class="$style.root">
					<MkChannelPreview v-for="channel in items" :key="channel.id" :channel="channel"/>
				</div>
			</MkPagination>
		</div>
		<div v-else-if="tab === 'favorites'">
			<MkPagination v-slot="{items}" :paginator="favoritesPaginator">
				<div :class="$style.root">
					<MkChannelPreview v-for="channel in items" :key="channel.id" :channel="channel"/>
				</div>
			</MkPagination>
		</div>
		<div v-else-if="tab === 'following'">
			<MkPagination v-slot="{items}" :paginator="followingPaginator">
				<div :class="$style.root">
					<MkChannelPreview v-for="channel in items" :key="channel.id" :channel="channel"/>
				</div>
			</MkPagination>
		</div>
		<div v-else-if="tab === 'owned'" class="_gaps">
			<MkRadios v-model="ownedFilter" class="_panel _panelPadding" :options="[{ value: 'active', label: i18n.ts._channel.owned }, { value: 'archived', label: i18n.ts.archived }]"/>
			<MkPagination :key="ownedFilter" v-slot="{items}" :paginator="ownedFilter === 'archived' ? archivedPaginator : ownedPaginator">
				<div :class="$style.root">
					<MkChannelPreview v-for="channel in items" :key="channel.id" :channel="channel"/>
				</div>
			</MkPagination>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw, onMounted, ref, shallowRef } from 'vue';
import MkChannelPreview from '@/components/MkChannelPreview.vue';
import MkChannelList from '@/components/MkChannelList.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkInput from '@/components/MkInput.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkButton from '@/components/MkButton.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';
import { Paginator } from '@/utility/paginator.js';
import { $i } from '@/i.js';

const router = useRouter();

type SearchType = 'nameAndDescription' | 'nameOnly';

const props = defineProps<{
	query: string;
	type?: SearchType;
}>();

const key = ref('');
const tab = ref('featured');
const searchQuery = ref('');
const searchType = ref<SearchType>('nameAndDescription');
const channelPaginator = shallowRef();
const ownedFilter = ref<'active' | 'archived'>('active');

onMounted(() => {
	searchQuery.value = props.query ?? '';
	searchType.value = props.type ?? 'nameAndDescription';
});

const featuredPaginator = markRaw(new Paginator('channels/featured', {
	limit: 10,
	noPaging: true,
}));
const favoritesPaginator = markRaw(new Paginator('channels/my-favorites', {
	limit: 100,
	noPaging: true,
}));
const followingPaginator = markRaw(new Paginator('channels/followed', {
	limit: 10,
}));
const ownedPaginator = markRaw(new Paginator('channels/owned', {
	limit: 10,
}));
const archivedPaginator = markRaw(new Paginator('channels/owned', {
	limit: 10,
	params: { isArchived: true },
}));

async function search() {
	const query = searchQuery.value.toString().trim();

	if (query == null) return;

	const type = searchType.value.toString().trim();

	if (type !== 'nameAndDescription' && type !== 'nameOnly') {
		console.error(`Unrecognized search type: ${type}`);
		return;
	}

	channelPaginator.value = markRaw(new Paginator('channels/search', {
		limit: 10,
		params: {
			query: searchQuery.value,
			type: type,
		},
	}));

	key.value = query + type;
}

const headerTabs = computed(() => [{
	key: 'search',
	title: i18n.ts.search,
	icon: 'ti ti-search',
}, {
	key: 'featured',
	title: i18n.ts._channel.featured,
	icon: 'ti ti-comet',
}, {
	key: 'favorites',
	title: i18n.ts.favorites,
	icon: 'ti ti-star',
}, {
	key: 'following',
	title: i18n.ts._channel.following,
	icon: 'ti ti-eye',
}, {
	key: 'owned',
	title: i18n.ts._channel.owned,
	icon: 'ti ti-edit',
}]);

definePage(() => ({
	title: i18n.ts.channel,
	icon: 'ti ti-device-tv',
}));
</script>

<style lang="scss" module>
.searchRoot {
	display: flex;
	flex-direction: column;
	gap: var(--MI-margin);
	width: 100%;
}

.searchRow {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.searchInput {
	flex: 1 1 220px;
	min-width: 0;
}

.root {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr));
	gap: var(--MI-margin);
}
</style>
