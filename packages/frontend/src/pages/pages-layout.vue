<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<XFeatureNavigationLayout path="/pages" :title="i18n.ts.pages" icon="ti ti-file-description" :items="items"/>
</template>

<script setup lang="ts">
import type { FeatureNavigationItem } from '@/pages/feature-navigation.js';
import XFeatureNavigationLayout from '@/pages/feature-navigation-layout.vue';
import { i18n } from '@/i18n.js';

const items: FeatureNavigationItem[] = [
	{ key: 'featured', title: i18n.ts._pages.featured, icon: 'ti ti-flare', to: '/pages', group: 'explore' },
	{ key: 'my', title: i18n.ts._pages.my, icon: 'ti ti-edit', to: '/pages/my', group: 'mine' },
	{ key: 'liked', title: i18n.ts._pages.liked, icon: 'ti ti-heart', to: '/pages/liked', group: 'mine' },
];
</script>
