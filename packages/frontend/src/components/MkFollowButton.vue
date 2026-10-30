<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<!-- 已关注、已申请时悬停切换为撤销文案，提示再次点击的结果；全站关注按钮统一这一形式，不另加提示框。 -->
<button
	ref="rootEl"
	class="_button"
	:class="[$style.root, { [$style.large]: large }]"
	:data-state="state"
	:aria-label="buttonLabel"
	:aria-busy="wait"
	:disabled="wait"
	@click="onClick"
>
	<span :class="$style.labels" :data-hover-label="hoverLabel"><span :class="$style.label">{{ label }}</span></span>
</button>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { host } from '@@/js/config.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import * as os from '@/os.js';
import { useStream } from '@/stream.js';
import { i18n } from '@/i18n.js';
import { claimAchievement } from '@/utility/achievements.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { $i } from '@/i.js';
import { prefer } from '@/preferences.js';
import { haptic } from '@/utility/haptic.js';
import { publishUserStatistics, refreshUserStatistics, useUserStatistics } from '@/composables/use-user-statistics.js';
import { useUserStatisticsVisibility } from '@/composables/use-user-statistics-visibility.js';

const props = withDefaults(defineProps<{
	user: Misskey.entities.UserDetailed,
	large?: boolean,
}>(), {
	large: false,
});

const emit = defineEmits<{
	(_: 'update:user', value: Misskey.entities.UserDetailed): void
}>();

const isFollowing = ref(props.user.isFollowing);
const hasPendingFollowRequestFromYou = ref(props.user.hasPendingFollowRequestFromYou);
const wait = ref(false);
const state = computed(() => hasPendingFollowRequestFromYou.value ? 'pending' : isFollowing.value ? 'following' : 'follow');
const label = computed(() => hasPendingFollowRequestFromYou.value ? i18n.ts.followRequestSent
	: isFollowing.value ? i18n.ts.youFollowing
	: props.user.isLocked ? i18n.ts.followRequest : i18n.ts.follow);
const hoverLabel = computed(() => hasPendingFollowRequestFromYou.value ? i18n.ts.cancelFollowRequest
	: isFollowing.value ? i18n.ts.unfollow : undefined);
const buttonLabel = computed(() => hasPendingFollowRequestFromYou.value ? i18n.ts.followRequestPending
	: isFollowing.value ? i18n.ts.unfollow
	: props.user.isLocked ? i18n.ts.followRequest : i18n.ts.follow);
const connection = useStream().useChannel('main');
let relationshipVersion = 0;
let followingAchievementVersion = 0;
const statisticsUser = ref(props.user);
const rootEl = useTemplateRef('rootEl');
useUserStatistics(statisticsUser, { active: useUserStatisticsVisibility(rootEl) });
watch(() => props.user, value => {
	statisticsUser.value = value;
});
watch([
	() => statisticsUser.value.id,
	() => statisticsUser.value.isFollowing,
	() => statisticsUser.value.hasPendingFollowRequestFromYou,
], ([id, following, pending], [previousId]) => {
	if (id !== previousId || following !== isFollowing.value || pending !== hasPendingFollowRequestFromYou.value) {
		onFollowChange({ id, isFollowing: following, hasPendingFollowRequestFromYou: pending });
	}
});

if (props.user.isFollowing == null && $i) {
	refreshRelationship().catch(console.error);
}

function onFollowChange(user: Partial<Misskey.entities.UserDetailed> | null | undefined, claimAchievementOnFollow = false) {
	if (user?.id !== props.user.id) return;

	relationshipVersion++;
	const wasFollowing = isFollowing.value;
	if (typeof user.isFollowing === 'boolean') isFollowing.value = user.isFollowing;
	if (typeof user.hasPendingFollowRequestFromYou === 'boolean') {
		hasPendingFollowRequestFromYou.value = user.hasPendingFollowRequestFromYou;
	} else if (isFollowing.value) {
		hasPendingFollowRequestFromYou.value = false;
	}

	if (claimAchievementOnFollow && !wasFollowing && isFollowing.value) claimFollowingAchievements();
}

async function refreshRelationship(claimAchievementOnFollow = false) {
	const wasFollowing = isFollowing.value;
	const achievementVersion = followingAchievementVersion;
	await refreshUserStatistics([props.user.id, ...($i ? [$i.id] : [])]);
	await nextTick();
	if (claimAchievementOnFollow && !wasFollowing && isFollowing.value && achievementVersion === followingAchievementVersion) claimFollowingAchievements();
}

function claimFollowingAchievements() {
	if ($i == null) return;
	followingAchievementVersion++;

	claimAchievement('following1');
	if ($i.followingCount >= 10) claimAchievement('following10');
	if ($i.followingCount >= 50) claimAchievement('following50');
	if ($i.followingCount >= 100) claimAchievement('following100');
	if ($i.followingCount >= 300) claimAchievement('following300');
}

async function onClick() {
	if (wait.value) return;

	const isLoggedIn = await pleaseLogin({
		openOnRemote: {
			type: 'web',
			path: `/@${props.user.username}@${props.user.host ?? host}`,
		},
	});
	if (!isLoggedIn || wait.value) return;

	wait.value = true;
	const actionVersion = ++relationshipVersion;
	const isFollowAction = !isFollowing.value && !hasPendingFollowRequestFromYou.value;

	haptic();

	try {
		if (isFollowing.value) {
			await misskeyApi('following/delete', {
				userId: props.user.id,
			});
			if (actionVersion === relationshipVersion) {
				onFollowChange({ id: props.user.id, isFollowing: false, hasPendingFollowRequestFromYou: false });
				publishUserStatistics({ id: props.user.id, isFollowing: false, hasPendingFollowRequestFromYou: false });
			}
		} else if (hasPendingFollowRequestFromYou.value) {
			await misskeyApi('following/requests/cancel', {
				userId: props.user.id,
			});
			if (actionVersion === relationshipVersion) {
				onFollowChange({ id: props.user.id, isFollowing: false, hasPendingFollowRequestFromYou: false });
				publishUserStatistics({ id: props.user.id, isFollowing: false, hasPendingFollowRequestFromYou: false });
			}
		} else {
			await misskeyApi('following/create', {
				userId: props.user.id,
				withReplies: prefer.s.defaultFollowWithReplies,
			});
			emit('update:user', {
				...statisticsUser.value,
				withReplies: prefer.s.defaultFollowWithReplies,
			});
		}
		await refreshRelationship(isFollowAction);
	} catch (err) {
		// 按钮状态即为成功反馈，失败时需要提示
		if (!isAccountSessionErrorHandled(err)) os.toast(i18n.ts.somethingHappened, 'error');
		console.error(err);
	} finally {
		wait.value = false;
	}
}

onMounted(() => {
	connection.on('follow', user => onFollowChange(user, true));
	connection.on('unfollow', onFollowChange);
});

onBeforeUnmount(() => {
	connection.dispose();
});
</script>

<style lang="scss" module>
// 关注为主题色实心按钮；关注中、已申请为灰底，悬停变为警示色并显示撤销文案。
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

	&.large {
		min-width: 88px;
		height: 34px;
		padding: 0 18px;
		font-size: 14px;
	}

	&:is([data-state="following"], [data-state="pending"]) {
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
