<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkArticlePreview v-if="isArticle(page)" :article="page"/>
<MkA v-else :to="`/@${page.user.username}/pages/${page.name}`" class="_panel" :class="$style.root" :aria-label="page.title.trim() || i18n.ts.noName">
	<div :class="$style.frame">
		<div :class="$style.media">
			<MediaImage
				v-if="page.eyeCatchingImage"
				:image="page.eyeCatchingImage"
				:disableImageLink="true"
				:controls="false"
				:cover="true"
				:class="$style.eyeCatchingImageRoot"
			/>
			<div v-else :class="$style.mediaFallback" aria-hidden="true">
				<i class="ti ti-file-description"></i>
			</div>
		</div>
		<article :class="$style.body">
			<h3 :class="$style.title" :title="page.title"><Mfm :text="page.title || page.name" :plain="true"/></h3>
			<p v-if="page.summary" :class="$style.summary" :title="page.summary"><Mfm :text="page.summary" :plain="true"/></p>
			<footer :class="$style.footer">
				<img v-if="avatarUrl" :class="$style.avatar" :src="avatarUrl" alt=""/>
				<MkUserName :user="page.user" :class="$style.author"/>
				<span v-if="page.likedCount > 0" :class="$style.likes" :title="i18n.ts.like"><i :class="page.isLiked ? 'ti ti-heart-filled' : 'ti ti-heart'" aria-hidden="true"></i>{{ page.likedCount }}</span>
				<MkTime v-if="page.updatedAt" :class="$style.updatedAt" :time="page.updatedAt"/>
			</footer>
		</article>
	</div>
</MkA>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import MediaImage from '@/components/MkMediaImage.vue';
import MkArticlePreview from '@/components/MkArticlePreview.vue';
import { getUserAvatar } from '@/utility/get-user-avatar.js';
import { isArticle } from '@/utility/article.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	page: Misskey.entities.Page;
}>();

const avatarUrl = computed(() => getUserAvatar(props.page.user).avatarUrl);
</script>

<style lang="scss" module>
.root {
	display: block;
	height: 100%;
	min-width: 0;
	overflow: clip;
	border: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
	background: var(--MI_THEME-panel);
	container-type: inline-size;
	color: var(--MI_THEME-fg);
	transition:
		border-color .18s ease,
		background-color .18s ease,
		box-shadow .18s ease;

	&:hover {
		text-decoration: none;
		border-color: color-mix(in srgb, var(--MI_THEME-accent) 28%, transparent);
		background: var(--MI_THEME-panelHighlight);
		box-shadow: 0 5px 18px color-mix(in srgb, var(--MI_THEME-shadow) 35%, transparent);

		.title {
			color: var(--MI_THEME-accent);
		}

		.media i {
			transform: scale(1.06);
		}
	}

	&:active {
		background: color-mix(in srgb, var(--MI_THEME-panelHighlight) 72%, var(--MI_THEME-panel));
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

.frame {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	height: 100%;
	min-width: 0;
}

.media {
	position: relative;
	aspect-ratio: 16 / 7;
	overflow: clip;
	background: color-mix(in srgb, var(--MI_THEME-accent) 10%, var(--MI_THEME-panelHighlight));
	border-bottom: var(--MI-divider);
}

.eyeCatchingImageRoot {
	position: absolute;
	inset: 0;
	display: block;
	width: 100%;
	height: 100%;
	overflow: hidden;
}

.mediaFallback {
	display: grid;
	place-items: center;
	width: 100%;
	height: 100%;
	background:
		linear-gradient(135deg, color-mix(in srgb, var(--MI_THEME-accent) 17%, transparent), transparent 62%),
		repeating-linear-gradient(135deg, transparent 0 12px, color-mix(in srgb, var(--MI_THEME-fg) 3%, transparent) 12px 13px);
	color: var(--MI_THEME-accent);
	font-size: 34px;

	> i {
		transition: transform .18s ease;
	}
}

.body {
	display: flex;
	flex-direction: column;
	flex: 1;
	gap: 6px;
	min-width: 0;
	padding: 14px 16px 16px;
}

.title {
	display: -webkit-box;
	margin: 0;
	overflow: hidden;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	font-size: 1.12em;
	font-weight: 700;
	line-height: 1.45;
	overflow-wrap: anywhere;
	transition: color .15s ease;
}

.summary {
	display: -webkit-box;
	margin: 0;
	overflow: hidden;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .9em;
	line-height: 1.55;
	overflow-wrap: anywhere;
}

.footer {
	display: flex;
	align-items: center;
	gap: 7px;
	min-width: 0;
	margin-top: auto;
	padding-top: 3px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .8em;
}

.avatar {
	flex-shrink: 0;
	width: 18px;
	height: 18px;
	border-radius: 50%;
}

.author {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.likes {
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	gap: 3px;
}

.updatedAt {
	margin-inline-start: auto;
	white-space: nowrap;
}

@container (min-width: 560px) {
	.frame {
		grid-template-columns: minmax(160px, 34%) minmax(0, 1fr);
	}

	.media {
		height: 100%;
		min-height: 158px;
		aspect-ratio: auto;
		border-right: var(--MI-divider);
		border-bottom: 0;
	}

	.body {
		padding: 16px 18px;
	}
}

@container (max-width: 380px) {
	.media {
		aspect-ratio: 16 / 8;
	}

	.body {
		padding: 12px;
	}

	.summary {
		-webkit-line-clamp: 1;
	}

	.updatedAt {
		display: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	.root,
	.title,
	.mediaFallback > i {
		transition: none;
	}
}
</style>
