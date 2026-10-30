<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkA :to="`/play/${flash.id}`" :class="[$style.root, { [$style.compact]: compact }]">
	<div :class="$style.head">
		<div v-if="rank != null" :class="[$style.index, rank <= 3 && $style.topRank]" role="img" :aria-label="i18n.tsx._play.rankLabel({ rank })">
			<span>#</span>{{ rank }}
		</div>
		<div v-else :class="$style.thumb" aria-hidden="true">
			<i class="ti ti-apps"></i>
		</div>
		<span :class="$style.play" aria-hidden="true"><i class="ti ti-player-play"></i></span>
	</div>
	<div :class="$style.body">
		<div :class="$style.name">
			<span :class="$style.nameText"><Mfm :text="flash.title" :plain="true" :nowrap="true"/></span>
			<span v-if="flash.visibility === 'private'" :class="$style.chip" :title="i18n.ts.private"><i class="ti ti-lock" aria-hidden="true"></i>{{ i18n.ts.private }}</span>
		</div>
		<p v-if="flash.summary" :class="$style.summary" :title="flash.summary"><Mfm :text="flash.summary" :plain="true" :nowrap="true"/></p>
		<div :class="$style.meta">
			<span v-if="!compact" :class="$style.author"><img :class="$style.avatar" :src="avatarUrl" alt=""/><MkUserName :user="flash.user" :nowrap="true"/></span>
			<span :title="i18n.ts.numberOfLikes"><i :class="flash.isLiked ? 'ti ti-heart-filled' : 'ti ti-heart'" aria-hidden="true"></i>{{ flash.likedCount }}</span>
			<span :class="$style.updatedAt"><MkTime :time="flash.updatedAt"/></span>
		</div>
	</div>
</MkA>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { getUserAvatar } from '@/utility/get-user-avatar.js';
import { useGlobalEvent } from '@/events.js';

const props = defineProps<{
	flash: Misskey.entities.Flash;
	/** 热门列表的名次 */
	rank?: number;
	/** 作者推荐栏已展示作者，卡片不再重复作者信息。 */
	compact?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'deleted'): void;
}>();

const avatarUrl = computed(() => getUserAvatar(props.flash.user).avatarUrl);
useGlobalEvent('flashDeleted', id => {
	if (id === props.flash.id) emit('deleted');
});
</script>

<style lang="scss" module>
// 目录式卡片：序号或图标负责定位，标题和摘要负责扫读，点击进入详情。
.root {
	display: flex;
	flex-direction: column;
	gap: 12px;
	width: 100%;
	height: 100%;
	min-width: 0;
	padding: 14px 16px;
	box-sizing: border-box;
	border: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
	border-radius: var(--MI-cardRadius);
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	text-decoration: none;
	transition:
		background-color .18s ease,
		border-color .18s ease,
		box-shadow .18s ease;

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-panelHighlight);
		border-color: color-mix(in srgb, var(--MI_THEME-accent) 28%, var(--MI_THEME-fg) 8%);
		box-shadow: 0 4px 16px color-mix(in srgb, var(--MI_THEME-shadow) 35%, transparent);

		.play {
			color: var(--MI_THEME-accent);
			background: color-mix(in srgb, var(--MI_THEME-accent) 18%, transparent);
			opacity: 1;
		}
	}

	&:active {
		background: color-mix(in srgb, var(--MI_THEME-panelHighlight) 72%, var(--MI_THEME-panel));
	}

	&:focus {
		outline: none;
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

.head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.index,
.thumb {
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: 42px;
	height: 42px;
	box-sizing: border-box;
	border-radius: var(--MI-radius);
}

.index {
	border: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 9%, transparent);
	background: var(--MI_THEME-panelHighlight);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 1.1em;
	font-weight: 800;
	font-variant-numeric: tabular-nums;
	letter-spacing: -.04em;

	> span {
		margin-right: 1px;
		color: currentColor;
		font-size: .55em;
		font-weight: 700;
		vertical-align: .22em;
	}
}

.topRank {
	border-color: color-mix(in srgb, var(--MI_THEME-accent) 20%, transparent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, var(--MI_THEME-panelHighlight));
	color: var(--MI_THEME-accent);
}

.thumb {
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, var(--MI_THEME-panelHighlight));
	color: var(--MI_THEME-accent);
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--MI_THEME-fg) 7%, transparent);
	font-size: 18px;
}

.body {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 7px;
	min-width: 0;
}

.name {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	font-size: 1.05em;
	font-weight: 700;
	line-height: 1.4;
}

.nameText {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.chip {
	flex-shrink: 0;
	display: inline-flex;
	align-items: center;
	gap: 3px;
	padding: 1px 6px;
	border-radius: 6px;
	background: var(--MI_THEME-panelHighlight);
	color: var(--MI_THEME-fgTransparent);
	font-size: .76em;
	font-weight: 600;
}

.rank {
	color: var(--MI_THEME-accent);
	font-variant-numeric: tabular-nums;
}

.summary {
	display: -webkit-box;
	min-height: 3em;
	margin: 0;
	overflow: hidden;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	color: var(--MI_THEME-fgTransparent);
	font-size: .86em;
	line-height: 1.5;
	overflow-wrap: anywhere;
}

.meta {
	display: flex;
	align-items: center;
	gap: 4px 9px;
	min-width: 0;
	margin-top: auto;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .78em;
	line-height: 1.45;

	> span {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		gap: 4px;
		white-space: nowrap;
	}
}

.meta > .author {
	flex-shrink: 1;
	min-width: 0;
	overflow: hidden;
}

.avatar {
	flex-shrink: 0;
	width: 17px;
	height: 17px;
	border-radius: 50%;
}

.updatedAt {
	margin-inline-start: auto;
}

.play {
	display: grid;
	flex-shrink: 0;
	place-items: center;
	width: 32px;
	height: 32px;
	border-radius: 50%;
	background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
	color: var(--MI_THEME-accent);
	font-size: 14px;
	opacity: .75;
	transition: color .18s ease, background-color .18s ease, opacity .18s ease;
}

.compact {
	gap: 8px;
	height: auto;
	padding: 12px;

	.thumb {
		width: 30px;
		height: 30px;
		font-size: 15px;
	}

	.play {
		width: 26px;
		height: 26px;
		font-size: 12px;
	}

	.name {
		font-size: 1em;
	}

	.summary {
		min-height: 0;
	}
}

@media (max-width: 520px) {
	.root {
		padding: 12px;
	}

	.index,
	.thumb {
		width: 40px;
		height: 40px;
	}

	.index {
		font-size: 1.05em;
	}

	.thumb {
		font-size: 17px;
	}

	.updatedAt {
		margin-inline-start: 0;
	}
}

@media (prefers-reduced-motion: reduce) {
	.root,
	.play {
		transition: none;
	}
}
</style>
