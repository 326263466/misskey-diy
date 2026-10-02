<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkCommunityHub :active="active" :contentKey="currentPath">
	<NestedRouterView :initialRoute="initialRoute"/>
</MkCommunityHub>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import type { PageMetadata } from '@/page.js';
import MkCommunityHub from '@/components/MkCommunityHub.vue';
import { useRouter } from '@/router.js';
import { definePage, provideMetadataReceiver } from '@/page.js';
import { i18n } from '@/i18n.js';

const router = useRouter();
const initialRoute = router.current.route.name === 'community' ? router.current : router.resolve('/checkin')!;
type CommunityPage = 'checkin' | 'ranking' | 'achievements' | 'benefits';
const active = ref<CommunityPage>(initialRoute.child!.route.name as CommunityPage);
const currentPath = ref(initialRoute._parsedRoute.fullPath);
const metadata = ref<PageMetadata>({ title: i18n.ts._checkin.dailyCheckin });

// 与控制面板一致：保留左栏，只切换右侧页面。
router.useListener('change', ({ resolved }) => {
	if (resolved.route.name !== 'community') return;
	active.value = resolved.child!.route.name as typeof active.value;
	currentPath.value = resolved._parsedRoute.fullPath;
});

definePage(computed(() => ({ ...metadata.value, needWideArea: true })));
provideMetadataReceiver(getter => { metadata.value = getter(); });
</script>
