<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<article class="_panel" :class="$style.root" @pointerenter="enterHover" @pointerleave="leaveHover">
	<MkA :to="`/gallery/${post.id}`" :class="$style.thumbnail" :aria-label="post.title?.trim() || i18n.ts.noName">
		<Transition>
			<MkImgWithBlurhash
				:class="$style.image"
				:transition="safe ? null : {
					duration: 500,
					leaveActiveClass: $style.transition_toggle_leaveActive,
					leaveToClass: $style.transition_toggle_leaveTo,
				}"
				:src="post.files?.[0]?.thumbnailUrl"
				:hash="post.files?.[0]?.blurhash"
				:forceBlurhash="!show"
			/>
		</Transition>
		<span v-if="fileCount > 1" :class="$style.fileCount" :aria-label="i18n.tsx.withNFiles({ n: fileCount })"><i class="ti ti-photo" aria-hidden="true"></i>{{ fileCount }}</span>
	</MkA>
	<div :class="$style.body">
		<MkA :to="`/gallery/${post.id}`" :class="$style.title"><Mfm :text="post.title" :plain="true"/></MkA>
		<div :class="$style.meta">
			<MkAvatar :user="post.user" :class="$style.avatar" link preview/>
			<MkA :to="userPage(post.user)" :class="$style.author"><MkUserName :user="post.user"/></MkA>
			<span v-if="post.likedCount > 0" :class="$style.likes" :title="i18n.ts.numberOfLikes"><i class="ti ti-heart" aria-hidden="true"></i>{{ post.likedCount }}</span>
		</div>
	</div>
</article>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { computed, ref } from 'vue';
import { userPage } from '@@/js/user.js';
import MkImgWithBlurhash from '@/components/MkImgWithBlurhash.vue';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	post: Misskey.entities.GalleryPost;
}>();

const hover = ref(false);
const fileCount = computed(() => props.post.files?.length ?? 0);
const safe = computed(() => prefer.s.nsfw === 'ignore' || prefer.s.nsfw === 'respect' && !props.post.isSensitive);
const show = computed(() => safe.value || hover.value);

function enterHover(): void {
	hover.value = true;
}

function leaveHover(): void {
	hover.value = false;
}
</script>

<style lang="scss" module>
.root {
	min-width: 0;
	background: var(--MI_THEME-panel);
}

.thumbnail {
	display: block;
	position: relative;
	aspect-ratio: 1 / 1;
	overflow: hidden;
	background: var(--MI_THEME-buttonBg);
}

.image {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.fileCount {
	position: absolute;
	right: var(--MI-marginHalf);
	bottom: var(--MI-marginHalf);
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 3px 7px;
	border-radius: var(--MI-radius);
	background: color-mix(in srgb, var(--MI_THEME-panel) 90%, transparent);
	color: var(--MI_THEME-fg);
	font-size: .8em;
	font-variant-numeric: tabular-nums;
}

.body { display: grid; gap: var(--MI-marginHalf); padding: var(--MI-margin); }
.title {
	display: -webkit-box;
	overflow: hidden;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	color: var(--MI_THEME-fg);
	font-size: 1.05em;
	font-weight: 600;
	line-height: 1.5;
	overflow-wrap: anywhere;
}
.meta { display: flex; align-items: center; gap: var(--MI-marginHalf); min-width: 0; color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; }
.avatar { width: 24px; height: 24px; flex-shrink: 0; }
.author { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.likes { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; margin-left: auto; font-variant-numeric: tabular-nums; }
.root a:hover { color: var(--MI_THEME-accent); text-decoration: none; }
.root a:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }

.transition_toggle_leaveActive {
	transition: opacity .5s;
	position: absolute;
	top: 0;
	left: 0;
}

.transition_toggle_leaveTo {
	opacity: 0;
}
</style>
