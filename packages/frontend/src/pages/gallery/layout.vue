<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<XFeatureNavigationLayout path="/gallery" :title="i18n.ts.gallery" icon="ti ti-library-photo" :items="items"/>
</template>

<script setup lang="ts">
import type { FeatureNavigationItem } from '@/pages/feature-navigation.js';
import XFeatureNavigationLayout from '@/pages/feature-navigation-layout.vue';
import { i18n } from '@/i18n.js';

const items: FeatureNavigationItem[] = [
	{ key: 'explore', title: i18n.ts._gallery.all, icon: 'ti ti-library-photo', to: '/gallery', group: 'explore' },
	{ key: 'my', title: i18n.ts._gallery.my, icon: 'ti ti-edit', to: '/gallery/my', group: 'mine' },
	{ key: 'liked', title: i18n.ts._gallery.liked, icon: 'ti ti-heart', to: '/gallery/liked', group: 'mine' },
];
</script>
