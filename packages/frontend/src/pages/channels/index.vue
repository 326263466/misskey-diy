<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="el" class="_pageLayout" :class="{ _pageLayoutWithSidebar: !narrow }">
	<nav v-if="!narrow" class="_pageNavigation" :aria-label="i18n.ts.channel">
		<MkSuperMenu :def="menuDef"></MkSuperMenu>
	</nav>
	<PageWithHeader v-model:tab="tab" contentCard class="_pageContent" :tabs="narrow ? headerTabs : []" :swipable="true">
		<template v-if="$i?.policies.canCreateChannel" #header-actions>
			<MkButton type="routerLink" primary rounded to="/channels/new"><i class="ti ti-plus"></i> {{ i18n.ts.createNew }}</MkButton>
		</template>
		<div class="_pageBody">
			<NestedRouterView :initialRoute="initialRoute"/>
		</div>
	</PageWithHeader>
</div>
</template>

<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue';
import type { SuperMenuDef } from '@/components/MkSuperMenu.vue';
import MkSuperMenu from '@/components/MkSuperMenu.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { usePageNavigationNarrow } from '@/composables/use-page-navigation-narrow.js';

type ChannelsTab = 'featured' | 'search' | 'favorites' | 'following' | 'owned';

const router = useRouter();
const initialRoute = router.current.route.path === '/channels' ? router.current : router.resolve('/channels')!;
const currentRoute = shallowRef(initialRoute);
const el = useTemplateRef('el');
const narrow = usePageNavigationNarrow(el);

router.useListener('change', ({ resolved }) => {
	if (resolved.route.path === '/channels') currentRoute.value = resolved;
});

const items = [{
	key: 'featured',
	title: i18n.ts._channel.featured,
	icon: 'ti ti-comet',
	to: '/channels',
}, {
	key: 'search',
	title: i18n.ts.search,
	icon: 'ti ti-search',
	to: '/channels/search',
}, {
	key: 'favorites',
	title: i18n.ts.favorites,
	icon: 'ti ti-star',
	to: '/channels/favorites',
}, {
	key: 'following',
	title: i18n.ts._channel.following,
	icon: 'ti ti-eye',
	to: '/channels/following',
}, {
	key: 'owned',
	title: i18n.ts._channel.owned,
	icon: 'ti ti-edit',
	to: '/channels/owned',
}] as const satisfies readonly { key: ChannelsTab; title: string; icon: string; to: string; }[];

const tab = computed<ChannelsTab>({
	get: () => items.find(item => item.key === currentRoute.value.child?.route.name)?.key ?? 'featured',
	set: (value) => {
		const item = items.find(item => item.key === value);
		if (item != null) router.push(item.to);
	},
});

const menuDef = computed<SuperMenuDef[]>(() => [{
	items: items.map(item => ({
		icon: item.icon,
		text: item.title,
		to: item.to,
		active: tab.value === item.key,
	})),
}]);

const headerTabs = items.map(({ key, title, icon }) => ({ key, title, icon }));

definePage(() => ({
	title: i18n.ts.channel,
	icon: 'ti ti-device-tv',
}));
</script>
