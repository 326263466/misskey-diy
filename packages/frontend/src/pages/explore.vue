<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :contentCard="tab !== 'featured'" :tabs="narrow ? headerTabs : []" :hideHeader="!narrow" hideTitle :swipable="true">
	<KeepAlive :max="prefer.s.numberOfPageCache">
		<TabPage :key="tab" :component="currentComponent" :identity="tab" :isSelected="isTabSelected"/>
	</KeepAlive>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, inject, KeepAlive, ref } from 'vue';
import XFeatured from './explore.featured.vue';
import XUsers from './explore.users.vue';
import XRoles from './explore.roles.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';
import { DI } from '@/di.js';
import { prefer } from '@/preferences.js';
import { TabPage } from '@/composables/use-tab-page.js';

const props = defineProps<{
	initialTab?: string;
}>();

const router = useRouter();
// 不在左侧菜单布局内使用时保留顶部标签；宽屏时左侧菜单已说明当前位置，不显示重复的标题栏
const narrow = inject(DI.pageNavigationNarrow, ref(true));

const tab = computed<'featured' | 'users' | 'roles'>({
	get: () => props.initialTab === 'users' || props.initialTab === 'roles' ? props.initialTab : 'featured',
	set: (value) => {
		if (value === 'featured') router.push('/explore');
		else router.push('/explore/:initialTab?', { params: { initialTab: value } });
	},
});
const currentComponent = computed(() => ({ featured: XFeatured, users: XUsers, roles: XRoles })[tab.value]);
const isTabSelected = (identity: string) => identity === tab.value;

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
