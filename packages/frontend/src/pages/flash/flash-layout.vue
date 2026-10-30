<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<XFeatureNavigationLayout
	path="/play"
	:title="i18n.ts.play"
	icon="ti ti-apps"
	:items="items"
/>
</template>

<script setup lang="ts">
import type { FeatureNavigationItem } from '@/pages/feature-navigation.js';
import XFeatureNavigationLayout from '@/pages/feature-navigation-layout.vue';
import { i18n } from '@/i18n.js';

const items: FeatureNavigationItem[] = [
	{ key: 'featured', title: i18n.ts._play.featured, icon: 'ti ti-comet', to: '/play', group: 'explore' },
	// 搜索框在内容区顶部一直显示，左侧不再重复展示，仅保留路由匹配
	{ key: 'search', title: i18n.ts.search, icon: 'ti ti-search', to: '/play/search', hidden: true },
	{ key: 'my', title: i18n.ts._play.my, icon: 'ti ti-edit', to: '/play/my', group: 'mine' },
	{ key: 'liked', title: i18n.ts._play.liked, icon: 'ti ti-heart', to: '/play/liked', group: 'mine' },
];
</script>
