<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<section v-for="group in groups" :key="group.key" class="_gaps" :aria-labelledby="`${id}-${group.key}`">
		<header :class="$style.heading">
			<h2 :id="`${id}-${group.key}`" :class="$style.title"><i :class="group.icon" aria-hidden="true"></i>{{ group.title }}</h2>
			<MkA :to="searchPath(group.key)" :class="$style.more" :aria-label="`${group.title} · ${i18n.ts.showMore}`">{{ i18n.ts.showMore }}<i class="ti ti-chevron-right" aria-hidden="true"></i></MkA>
		</header>
		<Suspense>
			<component :is="group.component" v-bind="resultProps" preview/>
			<template #fallback><MkLoading/></template>
		</Suspense>
	</section>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, useId } from 'vue';
import { i18n } from '@/i18n.js';
import { articlesSearchAvailable, usersSearchAvailable } from '@/utility/check-permissions.js';

const props = defineProps<{
	query: string;
	userId?: string;
	username?: string;
	host?: string | null;
	channel?: string;
	origin?: 'combined' | 'local' | 'remote';
	notesAvailable: boolean;
	searchPath: (type: string) => string;
}>();

const id = useId();
const XArticle = defineAsyncComponent(() => import('./search.article.vue'));
const XNote = defineAsyncComponent(() => import('./search.note.vue'));
const XUser = defineAsyncComponent(() => import('./search.user.vue'));
const resultProps = computed(() => ({ query: props.query, userId: props.userId, username: props.username, host: props.host, channel: props.channel, origin: props.origin }));
const groups = computed(() => [
	{ key: 'article', title: i18n.ts._article.article, icon: 'ti ti-article', component: XArticle, available: articlesSearchAvailable.value },
	{ key: 'note', title: i18n.ts.notes, icon: 'ti ti-pencil', component: XNote, available: props.notesAvailable },
	{ key: 'user', title: i18n.ts.users, icon: 'ti ti-users', component: XUser, available: usersSearchAvailable.value },
].filter(group => group.available));
</script>

<style lang="scss" module>
.heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--MI-margin);
}

.title {
	display: flex;
	align-items: center;
	gap: 8px;
	margin: 0;
	font-size: 1em;
	line-height: 1.5;
}

.more {
	display: inline-flex;
	align-items: center;
	align-self: stretch;
	flex-shrink: 0;
	gap: 4px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .85em;

	&:hover,
	&:focus-visible {
		color: var(--MI_THEME-accent);
	}
}
</style>
