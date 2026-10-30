<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="el" class="_pageLayout" :class="{ _pageLayoutWithSidebar: !narrow }">
	<nav v-if="!narrow" class="_pageNavigation" :aria-label="title">
		<MkSuperMenu :def="menuDef"></MkSuperMenu>
	</nav>
	<div class="_pageContent">
		<NestedRouterView :initialRoute="initialRoute"/>
	</div>
	<slot></slot>
</div>
</template>

<script setup lang="ts">
import { computed, provide, shallowRef, useTemplateRef } from 'vue';
import type { FeatureNavigationItem } from './feature-navigation.js';
import { featureNavigationKey, featureNavigationMenu } from './feature-navigation.js';
import MkSuperMenu from '@/components/MkSuperMenu.vue';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { usePageNavigationNarrow } from '@/composables/use-page-navigation-narrow.js';

const props = defineProps<{
	path: string;
	title: string;
	icon: string;
	items: readonly FeatureNavigationItem[];
}>();

const router = useRouter();
const initialRoute = router.current.route.path === props.path ? router.current : router.resolve(props.path)!;
const currentRoute = shallowRef(initialRoute);
const el = useTemplateRef('el');
const narrow = usePageNavigationNarrow(el);

router.useListener('change', ({ resolved }) => {
	if (resolved.route.path === props.path) currentRoute.value = resolved;
});

const active = computed(() => {
	const name = currentRoute.value.child?.route.name;
	return props.items.find(item => item.key === name)?.key ?? props.items.find(item => item.to === props.path)?.key ?? props.items[0].key;
});

provide(featureNavigationKey, { items: props.items, active });

const menuDef = computed(() => featureNavigationMenu(props.items, active.value));

definePage(() => ({
	title: props.title,
	icon: props.icon,
}));
</script>
