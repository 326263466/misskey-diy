<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div class="_panel _card _panelPadding" :class="$style.categories">
		<label :for="categoryId" :class="$style.label">{{ i18n.ts._article.categories }}</label>
		<CategoryPicker :id="categoryId" v-model="selectedCategory" :title="i18n.ts._article.categories" :nullLabel="i18n.ts._article.allCategories"/>
	</div>
	<div :class="$style.content">
		<NestedRouterView :initialRoute="initialRoute"/>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, useId } from 'vue';
import type { PageMetadata } from '@/page.js';
import CategoryPicker from '@/pages/articles/category-picker.vue';
import { i18n } from '@/i18n.js';
import { definePage, provideMetadataReceiver } from '@/page.js';
import { useRouter } from '@/router.js';

const router = useRouter();
const categoryId = useId();
const initialRoute = router.current.route.name === 'index' ? router.current : router.resolve('/')!;
const activeCategory = ref(initialRoute.child?.props.get('categoryId') as string | undefined);
const selectedCategory = computed({
	get: () => activeCategory.value ?? null,
	set: (categoryId: string | null) => router.pushByPath(categoryId ? `/articles/category/${encodeURIComponent(categoryId)}` : '/'),
});
const metadata = ref<PageMetadata>({ title: i18n.ts.home, icon: 'ti ti-home' });

router.useListener('change', ({ resolved }) => {
	if (resolved.route.name !== 'index') return;
	activeCategory.value = resolved.child?.props.get('categoryId') as string | undefined;
});

definePage(computed(() => metadata.value));
provideMetadataReceiver(getter => { metadata.value = getter(); });
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: var(--MI-pageGap);
	height: 100%;
	min-height: 0;
}

.categories {
	display: var(--MI-articleCategorySelectorDisplay, block);
	flex-shrink: 0;
}

.label {
	display: block;
	margin-bottom: var(--MI-marginHalf);
	font-size: .9em;
}

.content {
	flex: 1;
	min-height: 0;
}
</style>
