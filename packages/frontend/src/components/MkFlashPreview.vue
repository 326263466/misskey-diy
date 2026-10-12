<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkA :to="`/play/${flash.id}`" class="_panel" :class="$style.root">
	<div :class="$style.cover" :style="{ '--hue': hue }" aria-hidden="true">
		<i class="ti ti-player-play" :class="$style.coverIcon"></i>
		<span v-if="flash.visibility === 'private'" v-tooltip="i18n.ts.private" :class="$style.badge"><i class="ti ti-lock"></i></span>
	</div>
	<div :class="$style.body">
		<h3 :class="$style.title" :title="flash.title"><Mfm :text="flash.title" :plain="true" :nowrap="true"/></h3>
		<p :class="$style.summary" :title="flash.summary || undefined">
			<Mfm v-if="flash.summary" :text="flash.summary" :plain="true"/>
		</p>
		<footer :class="$style.footer">
			<img :class="$style.avatar" :src="getUserAvatar(flash.user).avatarUrl" alt=""/>
			<MkUserName :user="flash.user" :class="$style.author"/>
			<span v-if="flash.likedCount > 0" :class="$style.likes" :title="i18n.ts.like"><i :class="flash.isLiked ? 'ti ti-heart-filled' : 'ti ti-heart'" aria-hidden="true"></i>{{ flash.likedCount }}</span>
		</footer>
	</div>
</MkA>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import { getUserAvatar } from '@/utility/get-user-avatar.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	flash: Misskey.entities.Flash;
}>();

// 互动应用没有封面图，按 ID 取固定色相，同一个应用每次显示的颜色相同。
const hue = computed(() => [...props.flash.id].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 0));
</script>

<style lang="scss" module>
// 以 14px 为基准：标题略大，描述和作者使用基准字号。
.root {
	display: flex;
	flex-direction: column;
	min-width: 0;
	overflow: clip;
	border-radius: var(--MI-radius);
	color: var(--MI_THEME-fg);
	text-decoration: none;
	transition: box-shadow .15s ease, transform .15s ease;

	&:hover {
		text-decoration: none;
		box-shadow: 0 6px 20px var(--MI_THEME-shadow);

		.title { color: var(--MI_THEME-accent); }
		.coverIcon { transform: scale(1.1); }
	}

	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
}

.cover {
	position: relative;
	display: grid;
	place-items: center;
	aspect-ratio: 16 / 7;
	background: linear-gradient(135deg, hsl(var(--hue) 70% 58%), hsl(calc(var(--hue) + 40) 75% 45%));
	color: #fff;
}

.coverIcon {
	display: grid;
	place-items: center;
	width: 44px;
	height: 44px;
	border-radius: 50%;
	background: rgb(255 255 255 / 22%);
	font-size: 22px;
	transition: transform .15s ease;
}

.badge {
	position: absolute;
	top: 8px;
	right: 8px;
	display: grid;
	place-items: center;
	width: 24px;
	height: 24px;
	border-radius: 50%;
	background: rgb(0 0 0 / 35%);
	font-size: 13px;
}

.body {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 6px;
	min-width: 0;
	padding: 12px 14px 14px;
}

.title {
	margin: 0;
	overflow: hidden;
	font-size: 1.1em;
	font-weight: 700;
	line-height: 1.5;
	text-overflow: ellipsis;
	white-space: nowrap;
	transition: color .15s ease;
}

// 描述固定两行高度，卡片在网格中保持等高。
.summary {
	display: -webkit-box;
	min-height: calc(1.6em * 2);
	margin: 0;
	overflow: hidden;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: 1.6;
	overflow-wrap: anywhere;
}

.footer {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	margin-top: auto;
	padding-top: 4px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.95em;
}

.avatar {
	flex-shrink: 0;
	width: 20px;
	height: 20px;
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

@media (prefers-reduced-motion: reduce) {
	.root, .title, .coverIcon { transition: none; }
}
</style>
