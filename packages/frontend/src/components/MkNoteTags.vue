<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<nav v-if="channel || tags.length > 0" :class="$style.root" :aria-label="channel ? `${i18n.ts.channel} / ${i18n.ts.hashtags}` : i18n.ts.hashtags">
	<MkA
		v-if="channel"
		:to="`/channels/${channel.id}`"
		:class="[$style.tag, $style.channel]"
		:title="channel.name"
		:aria-label="channel.name"
		@click.stop
		@keydown.enter.stop
	>
		<i class="ti ti-device-tv" aria-hidden="true"></i>
		<span :class="$style.channelName">{{ channel.name }}</span>
	</MkA>
	<MkA
		v-for="tag in tags"
		:key="tag"
		:to="`/tags/${encodeURIComponent(tag)}`"
		:class="$style.tag"
		:title="`#${tag}`"
		:aria-label="`#${tag}`"
		@click.stop
		@keydown.enter.stop
	>
		#{{ tag }}
	</MkA>
</nav>
</template>

<script lang="ts" setup>
import { i18n } from '@/i18n.js';

defineProps<{
	tags: string[];
	channel?: { id: string; name: string } | null;
}>();
</script>

<style lang="scss" module>
.root {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
	min-width: 0;
	max-width: 100%;
}

.tag {
	display: block;
	box-sizing: border-box;
	min-width: 0;
	max-width: min(100%, 24em);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: calc(1em - 1px);
	line-height: 1.4;
	color: var(--MI_THEME-hashtag);
	background: none;
	text-decoration: none;

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

.channel {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 4px 8px;
	line-height: 1;
	border-radius: 999px;
	color: var(--MI_THEME-accent);
	background: var(--MI_THEME-accentedBg);
	font-size: .85em;

	&:hover {
		text-decoration: none;
		background: color-mix(in srgb, var(--MI_THEME-accent) 20%, var(--MI_THEME-panel));
	}

	> i {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}
}

.channelName {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
}
</style>
