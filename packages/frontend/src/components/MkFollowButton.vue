<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button
	ref="rootEl"
	v-tooltip="buttonLabel"
	class="_button"
	:class="[$style.root, { [$style.active]: isFollowing || hasPendingFollowRequestFromYou, [$style.full]: full, [$style.large]: large }]"
	:aria-label="buttonLabel"
	:aria-busy="wait"
	:disabled="wait"
	@click="onClick"
>
	<template v-if="hasPendingFollowRequestFromYou">
		<span v-if="full" :class="$style.text">{{ i18n.ts.followRequestPending }}</span><i class="ti ti-hourglass-empty"></i>
	</template>
	<template v-else-if="isFollowing">
		<span v-if="full" :class="$style.text">{{ i18n.ts.youFollowing }}</span><i class="ti ti-minus"></i>
	</template>
	<template v-else-if="user.isLocked">
		<span v-if="full" :class="$style.text">{{ i18n.ts.followRequest }}</span><i class="ti ti-plus"></i>
	</template>
	<template v-else>
		<span v-if="full" :class="$style.text">{{ i18n.ts.follow }}</span><i class="ti ti-plus"></i>
	</template>
</button>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { host } from '@@/js/config.js';
import { misskeyApi } from '@/utility/misskey-api.js';
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
	full?: boolean,
	large?: boolean,
}>(), {
	full: false,
	large: false,
});

const emit = defineEmits<{
	(_: 'update:user', value: Misskey.entities.UserDetailed): void
}>();

const isFollowing = ref(props.user.isFollowing);
const hasPendingFollowRequestFromYou = ref(props.user.hasPendingFollowRequestFromYou);
const wait = ref(false);
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
.root {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	font-weight: bold;
	color: var(--MI-followButton-fg, var(--MI_THEME-fg));
	padding: 0;
	height: 31px;
	font-size: 16px;
	border-radius: 32px;
	background: var(--MI-followButton-bg, color-mix(in srgb, var(--MI_THEME-panel), transparent 10%));
	-webkit-backdrop-filter: var(--MI-followButton-backdropFilter, var(--MI-blur, blur(12px) saturate(180%)));
	backdrop-filter: var(--MI-followButton-backdropFilter, var(--MI-blur, blur(12px) saturate(180%)));

	&.full {
		padding: 0 8px 0 12px;
		font-size: 14px;
	}

	&.large {
		font-size: 16px;
		height: 38px;
		padding: 0 12px 0 16px;
	}

	&:not(.full) {
		width: 31px;
	}

	&:focus-visible {
		outline-offset: 2px;
	}

	&:hover {
		//background: mix($primary, #fff, 20);
	}

	&:active {
		//background: mix($primary, #fff, 40);
	}

	&.active {
		color: var(--MI-followButton-fg, var(--MI_THEME-fgOnAccent));
		background: var(--MI-followButton-bg, var(--MI_THEME-accent));

		&:hover {
			background: var(--MI-followButton-bg, hsl(from var(--MI_THEME-accent) h s calc(l + 10)));
		}

		&:active {
			background: var(--MI-followButton-bg, hsl(from var(--MI_THEME-accent) h s calc(l - 10)));
		}
	}
}

.text {
	margin-right: 6px;
}
</style>
