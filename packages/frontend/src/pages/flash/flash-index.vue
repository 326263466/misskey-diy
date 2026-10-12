<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" contentCard :actions="headerActions" :tabs="headerTabs" :swipable="true" :loading="paginator?.fetching.value ?? false">
	<template v-if="tab === 'liked'" #header-actions>
		<MkPaginationControl :paginator="likedFlashsPaginator" compact/>
	</template>
	<div class="_pageBody _gaps">
		<div v-if="tab === 'search'">
			<div class="_gaps">
				<div :class="$style.searchRow">
					<MkInput v-model="searchQuery" :class="$style.searchInput" :large="true" type="search">
						<template #prefix><i class="ti ti-search"></i></template>
					</MkInput>
					<MkButton large primary gradate rounded @click="search">{{ i18n.ts.search }}</MkButton>
				</div>
			</div>
		</div>

		<MkButton v-if="tab === 'my'" gradate rounded style="margin: 0 auto;" @click="create()"><i class="ti ti-plus"></i></MkButton>
		<MkPagination v-if="paginator" v-slot="{items}" :paginator="paginator" pageEmpty>
			<div class="_gaps_s">
				<MkFlashPreview v-for="flash in items.map(item => 'flash' in item ? item.flash : item)" :key="flash.id" :flash="flash"/>
			</div>
		</MkPagination>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref, shallowRef } from 'vue';
import MkFlashPreview from '@/components/MkFlashPreview.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkPaginationControl from '@/components/MkPaginationControl.vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { Paginator } from '@/utility/paginator.js';

const router = useRouter();

const tab = ref('featured');

const searchQuery = ref('');
const searchPaginator = shallowRef<Paginator<'flash/search'> | null>(null);

const featuredFlashsPaginator = markRaw(new Paginator('flash/featured', {
	limit: 5,
	offsetMode: true,
}));
const myFlashsPaginator = markRaw(new Paginator('flash/my', {
	limit: 5,
}));
const likedFlashsPaginator = markRaw(new Paginator('flash/my-likes', {
	limit: 5,
	canSearch: true,
	searchParamName: 'search',
}));
const paginator = computed(() => {
	if (tab.value === 'search') return searchPaginator.value;
	if (tab.value === 'my') return myFlashsPaginator;
	if (tab.value === 'liked') return likedFlashsPaginator;
	return featuredFlashsPaginator;
});

function create() {
	router.push('/play/new');
}

function search() {
	if (searchQuery.value.trim() === '') {
		return;
	}

	searchPaginator.value = markRaw(new Paginator('flash/search', {
		params: {
			query: searchQuery.value,
		},
	}));
}

const headerActions = computed(() => [{
	icon: 'ti ti-plus',
	text: i18n.ts.create,
	handler: create,
}]);

const headerTabs = computed(() => [{
	key: 'search',
	title: i18n.ts.search,
	icon: 'ti ti-search',
}, {
	key: 'featured',
	title: i18n.ts._play.featured,
	icon: 'ti ti-flare',
}, {
	key: 'my',
	title: i18n.ts._play.my,
	icon: 'ti ti-edit',
}, {
	key: 'liked',
	title: i18n.ts._play.liked,
	icon: 'ti ti-heart',
}]);

definePage(() => ({
	title: 'Play',
	icon: 'ti ti-player-play',
}));
</script>

<style lang="scss" module>
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
</style>
