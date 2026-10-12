<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span class="_userName" :class="[$style.root, { [$style.nowrap]: nowrap }]">
	<Mfm :class="$style.name" :text="user.name ?? user.username" :author="user" :plain="true" :nowrap="nowrap" :emojiUrls="user.emojis" :noEmojiTooltip="noEmojiTooltip"/>
</span>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { useUserProfile } from '@/composables/use-user-profile.js';

const props = withDefaults(defineProps<{
	user: Misskey.entities.User;
	nowrap?: boolean;
	noEmojiTooltip?: boolean;
}>(), {
	nowrap: true,
});

const user = useUserProfile(() => props.user);
</script>

<style lang="scss" module>
.root {
	position: relative;
	display: inline;
	min-width: 0;
	max-width: 100%;
	vertical-align: baseline;
	line-height: inherit;

	&.nowrap {
		display: inline-flex;
		align-items: center;

		> .name {
			display: block;
		}
	}

	// 链接悬停时整段姓名共用一条线，避免表情图片打断文字下划线。
	&::after {
		content: '';
		position: absolute;
		inset-inline: 0;
		bottom: 0;
		border-bottom: 1px solid currentColor;
		opacity: var(--MI-userNameUnderline, 0);
		pointer-events: none;
	}
}

.name {
	// 单行时整段姓名一起截断，避免文字和表情分别占用 flex 列。
	min-width: 0;
}
</style>
