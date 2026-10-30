<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<KeepAlive :max="prefer.s.numberOfPageCache">
	<Suspense v-if="user">
		<TabPage :key="contentKey" :component="currentComponent" :identity="contentKey" :isSelected="isContentSelected" :pageProps="contentProps"/>
	</Suspense>
</KeepAlive>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, inject, KeepAlive } from 'vue';
import type { Component } from 'vue';
import { userPageContext } from './context.js';
import { TabPage } from '@/composables/use-tab-page.js';
import { prefer } from '@/preferences.js';

const XHome = defineAsyncComponent(() => import('./home.vue'));
const XNotes = defineAsyncComponent(() => import('./notes.vue'));
const XFiles = defineAsyncComponent(() => import('./files.vue'));
const XActivity = defineAsyncComponent(() => import('./activity.vue'));
const XAchievements = defineAsyncComponent(() => import('./achievements.vue'));
const XReactions = defineAsyncComponent(() => import('./reactions.vue'));
const XClips = defineAsyncComponent(() => import('./clips.vue'));
const XLists = defineAsyncComponent(() => import('./lists.vue'));
const XPages = defineAsyncComponent(() => import('./pages.vue'));
const XFlashs = defineAsyncComponent(() => import('./flashs.vue'));
const XGallery = defineAsyncComponent(() => import('./gallery.vue'));
const XRaw = defineAsyncComponent(() => import('./raw.vue'));

const props = defineProps<{
	page?: string;
}>();

const context = inject(userPageContext);
if (context == null) throw new Error('no user page context provided');
const { user, refreshUser, showMoreFiles } = context;
const components: Record<string, Component> = {
	notes: XNotes, files: XFiles, activity: XActivity, achievements: XAchievements, reactions: XReactions,
	clips: XClips, lists: XLists, pages: XPages, flashs: XFlashs, gallery: XGallery, raw: XRaw,
};
const currentComponent = computed(() => components[props.page ?? ''] ?? XHome);
const contentKey = computed(() => `${user.value?.id ?? ''}:${props.page ?? 'home'}`);
const isContentSelected = (identity: string) => identity === contentKey.value;
const contentProps = computed(() => ({ user: user.value, refreshUser, singleColumn: true, onShowMoreFiles: showMoreFiles }));
</script>
