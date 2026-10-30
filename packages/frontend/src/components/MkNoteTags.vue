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
		:style="{ '--MI-channelColor': channel.color ?? 'var(--MI_THEME-accent)' }"
		:title="channel.name"
		:aria-label="channel.name"
		@click.stop
		@keydown.enter.stop
	>
		<i class="ti ti-broadcast" aria-hidden="true"></i>
		<span :class="$style.channelName"><Mfm :text="channel.name" :plain="true" :nowrap="true"/></span>
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
	channel?: { id: string; name: string; color?: string } | null;
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
	gap: 5px;
	padding: 0;
	line-height: 1.4;
	color: var(--MI_THEME-fgHighlighted);
	background: none;

	&:hover {
		text-decoration: none;
		color: color-mix(in srgb, var(--MI-channelColor) 60%, var(--MI_THEME-fgHighlighted));
	}

	> i {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		font-size: 15px;
		color: color-mix(in srgb, var(--MI-channelColor) 80%, var(--MI_THEME-fg));
	}
}

.channelName {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	font-weight: normal;
}

</style>
