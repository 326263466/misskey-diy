<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :tabs="headerTabs" :swipable="true" :loading="loading" :hideHeader="headerTabs.length === 0" hideTitle>
	<div class="_pageBody _gaps" :class="$style.root">
		<XFeatureToolbar v-if="tab === 'explore' || $i">
			<MkTabs v-if="tab === 'explore'" v-model:tab="gallerySort" :tabs="sortTabs" :class="$style.sortTabs"/>
			<template v-if="$i" #actions>
				<MkButton type="routerLink" to="/gallery/new" primary rounded><i class="ti ti-plus" aria-hidden="true"></i>{{ i18n.ts.postToGallery }}</MkButton>
			</template>
		</XFeatureToolbar>
		<MkTip k="gallery">{{ i18n.ts._gallery.tip }}</MkTip>
		<div v-if="tab === 'explore'">
			<MkPagination :paginator="explorePaginator" pageEmpty>
				<template #default="{ items }">
					<div :class="$style.items">
						<MkGalleryPostPreview v-for="post in items" :key="post.id" :post="post"/>
					</div>
				</template>
				<template v-if="gallerySort === 'popular'" #empty><MkResult type="empty"/></template>
			</MkPagination>
		</div>
		<div v-else-if="tab === 'liked'">
			<MkPagination v-slot="{items}" :paginator="likedPostsPaginator" pageEmpty>
				<div :class="$style.items">
					<MkGalleryPostPreview v-for="like in items" :key="like.id" :post="like.post" class="post"/>
				</div>
			</MkPagination>
		</div>
		<div v-else-if="tab === 'my'">
			<MkPagination v-slot="{items}" :paginator="myPostsPaginator" pageEmpty>
				<div :class="$style.items">
					<MkGalleryPostPreview v-for="post in items" :key="post.id" :post="post" class="post"/>
				</div>
			</MkPagination>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, markRaw } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkTabs from '@/components/MkTabs.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkGalleryPostPreview from '@/components/MkGalleryPostPreview.vue';
import XFeatureToolbar from '@/pages/feature-toolbar.vue';
import { $i } from '@/i.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { Paginator } from '@/utility/paginator.js';
import { useFeatureNavigationTab } from '@/pages/feature-navigation.js';

const { tab, headerTabs } = useFeatureNavigationTab();
const gallerySort = ref('recent');
const sortTabs = [
	{ key: 'recent', title: i18n.ts._article.latest },
	{ key: 'popular', title: i18n.ts.featured },
];

const recentPostsPaginator = markRaw(new Paginator('gallery/posts', {
	limit: 6,
}));
const popularPostsPaginator = markRaw(new Paginator('gallery/featured', {
	noPaging: true,
}));
const myPostsPaginator = markRaw(new Paginator('i/gallery/posts', {
	limit: 5,
}));
const likedPostsPaginator = markRaw(new Paginator('i/gallery/likes', {
	limit: 5,
}));
const explorePaginator = computed(() => gallerySort.value === 'popular' ? popularPostsPaginator : recentPostsPaginator);
const loading = computed(() => tab.value === 'my' ? myPostsPaginator.fetching.value : tab.value === 'liked' ? likedPostsPaginator.fetching.value : explorePaginator.value.fetching.value);

definePage(() => ({
	title: i18n.ts.gallery,
	icon: 'ti ti-library-photo',
}));
</script>

<style lang="scss" module>
.root { min-width: 0; container-type: inline-size; background: var(--MI_THEME-bg); }
.sortTabs { flex: 1; min-width: 0; }
.items {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr));
	gap: 12px;
}
</style>
