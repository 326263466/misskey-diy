<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" class="_panel" :class="$style.root">
	<div :class="$style.banner" :style="user.bannerUrl ? { backgroundImage: `url(${prefer.s.disableShowingAnimatedImages ? getStaticImageUrl(user.bannerUrl) : user.bannerUrl})` } : ''"></div>
	<MkA :to="userPage(user)">
		<MkAvatar :class="$style.avatar" :user="user" indicator/>
	</MkA>
	<div :class="$style.title">
		<MkA :class="$style.name" :to="userPage(user)"><MkUserName :user="user" :nowrap="false"/></MkA>
		<p :class="$style.username"><MkAcct :user="user"/></p>
	</div>
	<span v-if="$i && $i.id !== user.id && user.isFollowed" :class="$style.followed">{{ i18n.ts.followsYou }}</span>
	<div :class="$style.description">
		<dl v-if="user.company || user.jobTitle" :class="$style.work">
			<div v-if="user.company">
				<dt>{{ i18n.ts._profile.company }}</dt>
				<dd>{{ user.company }}</dd>
			</div>
			<div v-if="user.jobTitle">
				<dt>{{ i18n.ts._profile.jobTitle }}</dt>
				<dd>{{ user.jobTitle }}</dd>
			</div>
		</dl>
		<div v-if="user.description" :class="$style.mfm">
			<Mfm :text="user.description" :author="user"/>
		</div>
		<span v-else style="color: var(--MI_THEME-fgTransparentWeak);">{{ i18n.ts.noAccountDescription }}</span>
	</div>
	<div :class="$style.status">
		<MkA :class="$style.statusItem" :to="userPage(user, 'notes')">
			<p :class="$style.statusItemLabel">{{ i18n.ts.notes }}</p><span :class="$style.statusItemValue">{{ number(user.notesCount) }}</span>
		</MkA>
		<MkA v-if="isFollowingVisibleForMe(user)" :class="$style.statusItem" :to="userPage(user, 'following')">
			<p :class="$style.statusItemLabel">{{ i18n.ts.following }}</p><span :class="$style.statusItemValue">{{ number(user.followingCount) }}</span>
		</MkA>
		<MkA v-if="isFollowersVisibleForMe(user)" :class="$style.statusItem" :to="userPage(user, 'followers')">
			<p :class="$style.statusItemLabel">{{ i18n.ts.followers }}</p><span :class="$style.statusItemValue">{{ number(user.followersCount) }}</span>
		</MkA>
	</div>
	<MkFollowButton v-if="user.id != $i?.id" :class="$style.follow" :user="user" mini/>
</div>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkFollowButton from '@/components/MkFollowButton.vue';
import number from '@/filters/number.js';
import { userPage } from '@/filters/user.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { isFollowingVisibleForMe, isFollowersVisibleForMe } from '@/utility/isFfVisibleForMe.js';
import { getStaticImageUrl } from '@/utility/media-proxy.js';
import { prefer } from '@/preferences.js';
import { useUserStatistics } from '@/composables/use-user-statistics.js';
import { useUserStatisticsVisibility } from '@/composables/use-user-statistics-visibility.js';
import { useUserProfile } from '@/composables/use-user-profile.js';

const props = defineProps<{
	user: Misskey.entities.UserDetailed;
}>();

const sourceUser = ref(props.user);
const user = useUserProfile(sourceUser);
const rootEl = useTemplateRef('rootEl');
useUserStatistics(sourceUser, { active: useUserStatisticsVisibility(rootEl) });
watch(() => props.user, value => {
	sourceUser.value = value;
});
</script>

<style lang="scss" module>
.root {
	position: relative;
}

.banner {
	height: 84px;
	background-color: rgba(0, 0, 0, 0.1);
	background-size: cover;
	background-position: center;
}

.avatar {
	display: block;
	position: absolute;
	top: 62px;
	left: 13px;
	z-index: 2;
	width: 58px;
	height: 58px;
	border: solid 4px var(--MI_THEME-panel);
}

.title {
	display: block;
	padding: 10px 0 10px 88px;
}

.name {
	display: inline-block;
	margin: 0;
	font-weight: bold;
	line-height: 16px;
	word-break: break-all;
}

.username {
	display: block;
	margin: 0;
	line-height: 16px;
	font-size: 0.8em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.followed {
	position: absolute;
	top: 12px;
	left: 12px;
	padding: 4px 8px;
	color: #fff;
	background: rgba(0, 0, 0, 0.7);
	font-size: 0.7em;
	border-radius: 6px;
}

.description {
	color: var(--MI_THEME-fgTransparent);
	padding: var(--MI-cardPadding);
	font-size: 0.8em;
	border-top: solid 0.5px var(--MI_THEME-divider);
}

.mfm {
	display: -webkit-box;
	-webkit-line-clamp: 3;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.work {
	display: flex;
	flex-wrap: wrap;
	gap: 4px 16px;
	margin: 0 0 8px;

	> div {
		display: flex;
		gap: 6px;
		min-width: 0;
	}

	dt {
		flex-shrink: 0;
		color: var(--MI_THEME-fgTransparentWeak);
	}

	dd {
		color: var(--MI_THEME-fgTransparentWeak);
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}
}

.status {
	padding: var(--MI-cardPadding);
	border-top: solid 0.5px var(--MI_THEME-divider);
}

.statusItem {
	color: var(--MI_THEME-fgTransparent);
	display: inline-block;
	width: 33%;
}

.statusItemLabel {
	margin: 0;
	font-size: 0.7em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.statusItemValue {
	font-size: 1em;
	color: inherit;
}

.follow {
	position: absolute !important;
	top: 8px;
	right: 8px;
}
</style>
