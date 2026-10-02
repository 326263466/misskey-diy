<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<template v-if="user">
	<XNotes v-if="page === 'notes'" :user="user"/>
	<XFiles v-else-if="page === 'files'" :user="user"/>
	<XActivity v-else-if="page === 'activity'" :user="user"/>
	<XAchievements v-else-if="page === 'achievements'" :user="user"/>
	<XReactions v-else-if="page === 'reactions'" :user="user"/>
	<XClips v-else-if="page === 'clips'" :user="user"/>
	<XLists v-else-if="page === 'lists'" :user="user"/>
	<XPages v-else-if="page === 'pages'" :user="user"/>
	<XFlashs v-else-if="page === 'flashs'" :user="user"/>
	<XGallery v-else-if="page === 'gallery'" :user="user"/>
	<XRaw v-else-if="page === 'raw'" :user="user"/>
	<XHome v-else :user="user" :refreshUser="refreshUser" :singleColumn="true" @showMoreFiles="showMoreFiles"/>
</template>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, inject } from 'vue';
import { userPageContext } from './context.js';

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

defineProps<{
	page?: string;
}>();

const context = inject(userPageContext);
if (context == null) throw new Error('no user page context provided');
const { user, refreshUser, showMoreFiles } = context;
</script>
