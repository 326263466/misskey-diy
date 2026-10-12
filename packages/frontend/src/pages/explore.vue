<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :contentCard="tab !== 'featured'" :tabs="narrow ? headerTabs : []" :swipable="true">
	<div v-if="tab === 'featured'" data-page-body>
		<XFeatured/>
	</div>
	<XUsers v-else-if="tab === 'users'"/>
	<XRoles v-else-if="tab === 'roles'"/>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, inject, ref } from 'vue';
import XFeatured from './explore.featured.vue';
import XUsers from './explore.users.vue';
import XRoles from './explore.roles.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';
import { DI } from '@/di.js';

const props = defineProps<{
	initialTab?: string;
}>();

const router = useRouter();
// 不在左侧菜单布局内使用时保留顶部标签
const narrow = inject(DI.pageNavigationNarrow, ref(true));

const tab = computed<'featured' | 'users' | 'roles'>({
	get: () => props.initialTab === 'users' || props.initialTab === 'roles' ? props.initialTab : 'featured',
	set: (value) => {
		if (value === 'featured') router.push('/explore');
		else router.push('/explore/:initialTab?', { params: { initialTab: value } });
	},
});

const headerTabs = computed(() => [{
	key: 'featured',
	icon: 'ti ti-bolt',
	title: i18n.ts.featured,
}, {
	key: 'users',
	icon: 'ti ti-users',
	title: i18n.ts.users,
}, {
	key: 'roles',
	icon: 'ti ti-badges',
	title: i18n.ts.roles,
}]);

definePage(() => ({
	title: i18n.ts.explore,
	icon: 'ti ti-hash',
}));
</script>
