<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="[$style.root, { [$style.author]: author, _panel: author }]">
	<template v-if="author">
		<div :class="[$style.authorHeader, { [$style.headerWithActions]: user.id !== $i?.id }]">
			<img v-if="bannerUrl" :class="$style.banner" :src="bannerUrl" alt=""/>
			<div :class="$style.authorIdentity">
				<MkAvatar :class="$style.authorAvatar" :user="user" indicator/>
				<div :class="$style.authorTitle">
					<MkA :class="$style.authorName" :to="userPage(user)"><MkUserName :user="user"/></MkA>
					<span :class="$style.authorDescription" :title="authorDescription || i18n.ts.noAccountDescription"><Mfm v-if="authorDescription" :text="authorDescription" :plain="true" :nowrap="true" :author="user"/><template v-else>{{ i18n.ts.noAccountDescription }}</template></span>
				</div>
			</div>
		</div>
		<div :class="[$style.authorBody, { [$style.bodyWithActions]: user.id !== $i?.id }]">
			<div :class="$style.statistics">
				<MkA :class="$style.statistic" :to="userPage(user, 'pages')">
					<span :class="$style.statisticValue">{{ articleStats ? number(articleStats.articlesCount) : '—' }}</span>
					<span :class="$style.statisticLabel">{{ i18n.ts._article.article }}</span>
				</MkA>
				<div :class="$style.statistic">
					<span :class="$style.statisticValue">{{ articleStats ? number(articleStats.articleViewsCount) : '—' }}</span>
					<span :class="$style.statisticLabel">{{ i18n.ts._article.views }}</span>
				</div>
				<MkA v-if="detailedUser && isFollowersVisibleForMe(detailedUser)" :class="$style.statistic" :to="userPage(user, 'followers')">
					<span :class="$style.statisticValue">{{ number(detailedUser.followersCount) }}</span>
					<span :class="$style.statisticLabel">{{ i18n.ts.followers }}</span>
				</MkA>
				<div v-else :class="$style.statistic">
					<span :class="$style.statisticValue">{{ !detailedUser && cachedCard?.followersCount != null ? number(cachedCard.followersCount) : '—' }}</span>
					<span :class="$style.statisticLabel">{{ i18n.ts.followers }}</span>
				</div>
			</div>
			<div v-if="user.id !== $i?.id" :class="$style.actions">
				<MkFollowButton v-if="detailedUser" :class="[$style.action, $style.followAction]" :user="detailedUser" full textOnly @update:user="sourceUser = $event"/>
				<MkA v-if="canChat" :class="[$style.action, $style.messageAction]" :to="`/chat/user/${user.id}`">{{ i18n.ts.directMessage }}</MkA>
			</div>
		</div>
	</template>
	<template v-else>
		<MkAvatar :class="$style.avatar" :user="user" indicator title=""/>
		<div :class="$style.body">
			<span :class="$style.name"><MkUserName :user="user"/></span>
			<span v-tooltip="subTooltip" :class="$style.sub"><slot name="sub"><span class="_monospace">@{{ acct(user) }}</span></slot></span>
		</div>
		<MkMiniChart v-if="chartValues" :class="$style.chart" :src="chartValues"/>
	</template>
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue';
import MkMiniChart from '@/components/MkMiniChart.vue';
import MkFollowButton from '@/components/MkFollowButton.vue';
import { misskeyApi, misskeyApiGet } from '@/utility/misskey-api.js';
import { acct, userPage } from '@@/js/user.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import number from '@/filters/number.js';
import { getStaticImageUrl } from '@/utility/media-proxy.js';
import { isFollowersVisibleForMe } from '@/utility/isFfVisibleForMe.js';
import { useUserProfile } from '@/composables/use-user-profile.js';
import { useUserStatistics } from '@/composables/use-user-statistics.js';
import { useUserStatisticsVisibility } from '@/composables/use-user-statistics-visibility.js';
import { readAuthorCard, saveAuthorCard } from '@/utility/author-card-cache.js';

const props = withDefaults(defineProps<{
	user: Misskey.entities.User;
	withChart?: boolean;
	author?: boolean;
	cachePath?: string;
	preview?: boolean;
	subTooltip?: string;
}>(), {
	withChart: true,
	author: false,
});

const chartValues = ref<number[] | null>(null);
const sourceUser = ref<Misskey.entities.UserDetailed | null>(null);
const cachedCard = computed(() => {
	const snapshot = props.cachePath ? readAuthorCard(props.cachePath) : null;
	return snapshot?.user.id === props.user.id ? snapshot : null;
});
const detailedUser = useUserProfile(sourceUser);
const user = useUserProfile(() => sourceUser.value ?? props.user);
const authorDescription = computed(() => {
	const description = detailedUser.value ? detailedUser.value.description : cachedCard.value?.description ?? ('description' in user.value ? user.value.description : null);
	return typeof description === 'string' ? description.trim().replace(/\s+/gu, ' ') : '';
});
const articleStats = ref<Misskey.Endpoints['articles/stats']['res'] | null>(null);
const rootEl = useTemplateRef('rootEl');
const statisticsRootEl = computed(() => props.author ? rootEl.value : null);
useUserStatistics(sourceUser, { active: useUserStatisticsVisibility(statisticsRootEl, computed(() => props.author && !props.preview)) });
const bannerUrl = computed(() => {
	const url = detailedUser.value ? detailedUser.value.bannerUrl : cachedCard.value?.bannerUrl;
	return url && prefer.s.disableShowingAnimatedImages ? getStaticImageUrl(url) : url;
});
const canChat = computed(() => $i?.policies.chatAvailability === 'available' && detailedUser.value?.canChat && user.value.host == null);

watch(() => [props.user, props.author] as const, ([value, author], previous, onCleanup) => {
	// 同一用户重新加载时保留已取得的资料和统计，避免关注、私信按钮闪烁。
	const sameUser = previous?.[0].id === value.id && previous[1] === author;
	if (!sameUser) {
		sourceUser.value = author && 'bannerUrl' in value ? value : null;
		articleStats.value = cachedCard.value?.user.id === value.id ? cachedCard.value.stats : null;
	}
	if (!author || props.preview) return;

	const controller = new AbortController();
	onCleanup(() => controller.abort());
	misskeyApi('users/show', { userId: value.id }, undefined, controller.signal).then(result => {
		if (!controller.signal.aborted) sourceUser.value = result;
	}).catch(() => { /* 资料加载失败时保留已有身份信息。 */ });
	misskeyApi('articles/stats', { userId: value.id }, undefined, controller.signal).then(result => {
		if (!controller.signal.aborted) articleStats.value = result;
	}).catch(() => { /* 未取得的统计保留占位，不显示虚构的零。 */ });
}, { immediate: true });

watch([detailedUser, articleStats], ([value, stats]) => {
	if (!props.cachePath || !value || props.preview) return;
	saveAuthorCard({ path: props.cachePath, user: value, bannerUrl: value.bannerUrl, description: value.description, stats, followersCount: isFollowersVisibleForMe(value) ? value.followersCount : null });
});

onMounted(() => {
	if (props.withChart && !props.author) {
		misskeyApiGet('charts/user/notes', { userId: props.user.id, limit: 16 + 1, span: 'day' }).then(res => {
			// 今日のぶんの値はまだ途中の値であり、それも含めると大抵の場合前日よりも下降しているようなグラフになってしまうため今日は弾く
			res.inc.splice(0, 1);
			chartValues.value = res.inc;
		});
	}
});
</script>

<style lang="scss" module>
$bodyTitleHieght: 18px;
$bodyInfoHieght: 16px;

.root {
	display: flex;
	align-items: center;
	padding: var(--MI-cardPadding);
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
}

.avatar {
	display: block;
	width: ($bodyTitleHieght + $bodyInfoHieght);
	height: ($bodyTitleHieght + $bodyInfoHieght);
	margin-right: 12px;
}

.body {
	flex: 1;
	overflow: hidden;
	font-size: 0.9em;
	color: var(--MI_THEME-fg);
	padding-right: 8px;
}

.name {
	display: flex;
	align-items: center;
	min-height: $bodyTitleHieght;
	width: 100%;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	line-height: $bodyTitleHieght;
}

.sub {
	display: block;
	width: 100%;
	font-size: 95%;
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: $bodyInfoHieght;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.chart {
	height: 30px;
}

.author {
	display: block;
	padding: 0;
	overflow: clip;
	border-radius: var(--MI-cardRadius);
}

.authorHeader {
	position: relative;
	display: flex;
	align-items: center;
	height: 116px;
	box-sizing: border-box;
	padding: 20px;
	background: var(--MI-userBannerBg);
	color: var(--MI_THEME-fgOnAccent);
}

.banner {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: cover;
	filter: brightness(0.5);
}

.headerWithActions {
	height: 84px;
	padding: 16px;
}

.authorIdentity {
	position: relative;
	display: flex;
	align-items: center;
	gap: 12px;
	min-width: 0;
	width: 100%;
}

.authorAvatar {
	flex-shrink: 0;
	width: 52px;
	height: 52px;
}

.authorTitle {
	display: grid;
	grid-template-rows: 22px 18px;
	gap: 4px;
	min-width: 0;
	flex: 1;
}

.authorName {
	font-size: 1.05em;
	font-weight: 700;
	line-height: 22px;
	color: inherit;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.authorDescription {
	font-size: 0.9em;
	line-height: 18px;
	opacity: 0.85;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.authorBody {
	display: flex;
	flex-direction: column;
	justify-content: center;
	box-sizing: border-box;
	height: 80px;
	gap: 14px;
	padding: 17px 16px;
}

.bodyWithActions {
	// 与无按钮卡片及首屏骨架保持同高，按钮加载不改变外部布局。
	height: 120px;
	padding: 12px 16px;
}

.statistics {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 8px;
}

.statistic {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2px;
}

.statisticValue {
	max-width: 100%;
	height: 24px;
	line-height: 24px;
	font-size: 1.2em;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.statisticLabel {
	height: 20px;
	line-height: 20px;
	font-size: 1em;
	white-space: nowrap;
	color: var(--MI_THEME-fgTransparentWeak);
}

.actions {
	position: relative;
	display: flex;
	gap: 8px;
	height: 36px;
	flex-shrink: 0;
	margin-top: auto;
}

// 叠加类名提高优先级，覆盖 MkFollowButton 自带的尺寸、背景和模糊效果。
.actions > .action.action {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	min-width: 0;
	width: auto;
	height: 36px;
	padding: 0 12px;
	box-sizing: border-box;
	border: 1px solid transparent;
	border-radius: 999px;
	font-size: 1em;
	font-weight: 600;
	text-decoration: none;
	-webkit-backdrop-filter: none;
	backdrop-filter: none;
	transition: background-color .15s ease, color .15s ease, border-color .15s ease, box-shadow .15s ease, transform .1s ease;

	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
	&:not(:disabled):active { transform: scale(.96); }
	&:disabled { cursor: progress; opacity: .7; }
}

// 关注：实心主按钮，悬停提亮并带主题色投影。
.actions > .followAction.followAction {
	color: var(--MI_THEME-fgOnAccent);
	background: var(--MI_THEME-accent);

	&:not(:disabled):hover {
		background: hsl(from var(--MI_THEME-accent) h s calc(l + 6));
		box-shadow: 0 4px 12px color-mix(in srgb, var(--MI_THEME-accent) 35%, transparent);
	}
}

// 已关注、已申请：退为描边次按钮，悬停变为警示色提示可撤销。
.actions > .followAction.followAction:is([data-state="following"], [data-state="pending"]) {
	color: var(--MI_THEME-fgTransparentWeak);
	background: transparent;
	border-color: var(--MI_THEME-divider);

	&:not(:disabled):is(:hover, :focus-visible) {
		color: var(--MI_THEME-error);
		background: color-mix(in srgb, var(--MI_THEME-error) 8%, transparent);
		border-color: color-mix(in srgb, var(--MI_THEME-error) 40%, transparent);
		box-shadow: none;
	}
}

// 私信：主题色描边，悬停填充浅主题色。
.actions > .messageAction.messageAction {
	color: var(--MI_THEME-accent);
	background: transparent;
	border-color: color-mix(in srgb, var(--MI_THEME-accent) 45%, transparent);

	&:hover {
		background: var(--MI_THEME-accentedBg);
		border-color: var(--MI_THEME-accent);
	}
}

@media (prefers-reduced-motion: reduce) {
	.actions > .action.action { transition: none; &:not(:disabled):active { transform: none; } }
}
</style>
