<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="el" class="_pageLayout" :class="{ _pageLayoutWithSidebar: !narrow }">
	<nav v-if="!narrow" class="_pageNavigation" :aria-label="i18n.ts.explore">
		<MkSuperMenu :def="menuDef"></MkSuperMenu>
	</nav>
	<div class="_pageContent">
		<NestedRouterView :initialRoute="initialRoute"/>
	</div>
</div>
</template>

<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue';
import type { SuperMenuDef } from '@/components/MkSuperMenu.vue';
import MkSuperMenu from '@/components/MkSuperMenu.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { usePageNavigationNarrow } from '@/composables/use-page-navigation-narrow.js';

const router = useRouter();
const initialRoute = router.current.route.path === '/explore' ? router.current : router.resolve('/explore')!;
const currentRoute = shallowRef(initialRoute);
const el = useTemplateRef('el');
const narrow = usePageNavigationNarrow(el);

router.useListener('change', ({ resolved }) => {
	if (resolved.route.path === '/explore') currentRoute.value = resolved;
});

const activeTab = computed(() => {
	const tab = currentRoute.value.child?.props.get('initialTab');
	return tab === 'users' || tab === 'roles' ? tab : 'featured';
});

const menuDef = computed<SuperMenuDef[]>(() => [{
	items: [{
		icon: 'ti ti-bolt',
		text: i18n.ts.featured,
		to: '/explore',
		active: activeTab.value === 'featured',
	}, {
		icon: 'ti ti-users',
		text: i18n.ts.users,
		to: '/explore/users',
		active: activeTab.value === 'users',
	}, {
		icon: 'ti ti-badges',
		text: i18n.ts.roles,
		to: '/explore/roles',
		active: activeTab.value === 'roles',
	}],
}]);

definePage(() => ({
	title: i18n.ts.explore,
	icon: 'ti ti-hash',
}));
</script>
