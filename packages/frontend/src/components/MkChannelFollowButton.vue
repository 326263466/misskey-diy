<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<!-- 已关注时悬停切换为取消文案，提示再次点击的结果；样式与用户关注按钮（MkFollowButton）一致。 -->
<button
	class="_button"
	:class="$style.root"
	:data-state="isFollowing ? 'following' : 'follow'"
	:aria-label="isFollowing ? i18n.ts.unfollow : i18n.ts.follow"
	:aria-busy="wait"
	:disabled="wait"
	@click="onClick"
>
	<span :class="$style.labels" :data-hover-label="isFollowing ? i18n.ts.unfollow : undefined"><span :class="$style.label">{{ label }}</span></span>
</button>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	channel: Misskey.entities.Channel;
}>();

const isFollowing = ref(props.channel.isFollowing);
const wait = ref(false);
const label = computed(() => isFollowing.value ? i18n.ts.youFollowing : i18n.ts.follow);

async function onClick() {
	if (wait.value) return;

	wait.value = true;

	try {
		if (isFollowing.value) {
			await misskeyApi('channels/unfollow', {
				channelId: props.channel.id,
			});
			isFollowing.value = false;
		} else {
			await misskeyApi('channels/follow', {
				channelId: props.channel.id,
			});
			isFollowing.value = true;
		}
	} catch (err) {
		// 按钮状态即为成功反馈，失败时需要提示
		if (!isAccountSessionErrorHandled(err)) os.toast(i18n.ts.somethingHappened, 'error');
		console.error(err);
	} finally {
		wait.value = false;
	}
}
</script>

<style lang="scss" module>
// 关注为主题色实心按钮；已关注为灰底，悬停变为警示色并显示取消文案。
.root {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 64px;
	height: 28px;
	padding: 0 14px;
	box-sizing: border-box;
	border-radius: 999px;
	font-size: 13px;
	white-space: nowrap;
	color: var(--MI_THEME-fgOnAccent);
	background: var(--MI_THEME-accent);
	transition: background-color .15s ease, color .15s ease;

	&:not(:disabled):hover {
		background: hsl(from var(--MI_THEME-accent) h s calc(l + 6));
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}

	&:disabled {
		cursor: progress;
		opacity: .7;
	}

	&:is([data-state="following"]) {
		color: var(--MI_THEME-fg);
		background: var(--MI_THEME-buttonBg);

		&:not(:disabled):is(:hover, :focus-visible) {
			color: var(--MI_THEME-error);
			background: color-mix(in srgb, var(--MI_THEME-error) 10%, var(--MI_THEME-buttonBg));
		}
	}

	&:not(:disabled):is(:hover, :focus-visible) > .labels[data-hover-label] {
		> .label { visibility: hidden; }
		&::after { visibility: visible; }
	}
}

// 两种文案叠在同一格内，按钮宽度取较宽者，悬停切换时不跳动。
.labels {
	display: inline-grid;
	place-items: center;

	> .label,
	&::after {
		grid-area: 1 / 1;
	}

	&::after {
		content: attr(data-hover-label);
		visibility: hidden;
	}
}

@media (prefers-reduced-motion: reduce) {
	.root { transition: none; }
}
</style>
