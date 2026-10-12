<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkA v-user-preview="canonical" :class="[$style.root, { [$style.isMe]: isMe }]" :to="url" :behavior="navigationBehavior">
	<img :class="$style.icon" :src="avatarUrl" alt="">
	<span>
		<span>@{{ username }}</span>
		<span v-if="(host != localHost)" :class="$style.host">@{{ toUnicode(host) }}</span>
	</span>
</MkA>
</template>

<script lang="ts" setup>
import { toUnicode } from 'punycode.js';
import { computed } from 'vue';
import { host as localHost } from '@@/js/config.js';
import type { MkABehavior } from '@/components/global/MkA.vue';
import { $i } from '@/i.js';
import { getStaticImageUrl } from '@/utility/media-proxy.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{
	username: string;
	host: string;
	navigationBehavior?: MkABehavior;
}>();

const canonical = props.host === localHost ? `@${props.username}` : `@${props.username}@${toUnicode(props.host)}`;

const url = `/${canonical}`;

const isMe = computed(() => $i != null && (
	`@${props.username}@${toUnicode(props.host)}`.toLowerCase() === `@${$i.username}@${toUnicode(localHost)}`.toLowerCase()
));

const avatarUrl = computed(() => {
	const url = isMe.value && $i != null ? $i.avatarUrl : `/avatar/@${props.username}@${props.host}`;
	return prefer.s.disableShowingAnimatedImages || prefer.s.dataSaver.avatar ? getStaticImageUrl(url) : url;
});
</script>

<style lang="scss" module>
.root {
	display: inline-flex;
	align-items: center;
	vertical-align: middle;
	padding: 2px 8px 2px 2px;
	border-radius: 999px;
	color: var(--MI_THEME-mention);
	background: color(from var(--MI_THEME-mention) srgb r g b / 0.1);

	&.isMe {
		color: var(--MI_THEME-mentionMe);
		background: color(from var(--MI_THEME-mentionMe) srgb r g b / 0.1);
	}
}

.icon {
	width: 1.4em;
	height: 1.4em;
	object-fit: cover;
	margin: 0 0.25em 0 0;
	border-radius: 100%;
}

.host {
	opacity: 0.5;
}
</style>
