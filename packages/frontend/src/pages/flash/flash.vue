<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="layoutEl" class="_pageLayout" :class="[$style.layout, { _pageLayoutWithSidebar: !narrow }]">
	<PageWithHeader class="_pageContent" :class="$style.main" hideHeader>
		<MkError v-if="error" @retry="fetchFlash()"/>
		<MkLoading v-else-if="loading || !flash"/>
		<div v-else class="_gaps">
			<section class="_panel" :class="$style.hero">
				<div :class="$style.heroMain">
					<div :class="$style.thumb">
						<i class="ti ti-apps" aria-hidden="true"></i>
					</div>
					<div :class="$style.heroBody">
						<h1 :class="$style.name">{{ flash.title }}</h1>
						<div :class="$style.meta">
							<MkA :to="userPage(flash.user)" :class="$style.author"><MkAvatar :user="flash.user" :class="$style.avatar" :link="false"/><MkUserName :user="flash.user"/></MkA>
							<span v-tooltip="i18n.ts.numberOfLikes"><i class="ti ti-heart" aria-hidden="true"></i>{{ flash.likedCount }}</span>
							<span v-if="flash.visibility === 'private'"><i class="ti ti-lock" aria-hidden="true"></i>{{ i18n.ts.private }}</span>
						</div>
						<div :class="$style.meta">
							<span :title="i18n.ts.createdAt"><i class="ti ti-clock" aria-hidden="true"></i><MkTime :time="flash.createdAt" mode="date"/></span>
							<span v-if="flash.createdAt !== flash.updatedAt">{{ i18n.ts.updatedAt }} <MkTime :time="flash.updatedAt" mode="date"/></span>
						</div>
					</div>
					<div :class="$style.heroActions">
						<MkButton rounded :class="$style.action" @click="runnerEl?.run()"><i class="ti ti-refresh" aria-hidden="true"></i>{{ i18n.ts._play.restart }}</MkButton>
						<button v-tooltip="flash.isLiked ? i18n.ts.unlike : i18n.ts.like" type="button" class="_button" :class="[$style.iconButton, { [$style.iconButtonActive]: flash.isLiked }]" :aria-label="flash.isLiked ? i18n.ts.unlike : i18n.ts.like" :aria-pressed="flash.isLiked ?? false" @click="toggleFlashLike(flash)"><i :class="flash.isLiked ? 'ti ti-heart-filled' : 'ti ti-heart'" aria-hidden="true"></i></button>
						<button v-tooltip="i18n.ts.share" type="button" class="_button" :class="$style.iconButton" :aria-label="i18n.ts.share" @click="shareFlash(flash)"><i class="ti ti-share" aria-hidden="true"></i></button>
						<button v-tooltip="i18n.ts.more" type="button" class="_button" :class="$style.iconButton" :aria-label="i18n.ts.more" aria-haspopup="menu" @click="showMenu"><i class="ti ti-dots" aria-hidden="true"></i></button>
						<button v-if="isOwner" v-tooltip="i18n.ts._play.sourceOnlyForAuthor" type="button" class="_button" :class="[$style.sourceToggle, { [$style.sourceToggleActive]: sourceOpen }]" :aria-expanded="sourceOpen" :aria-controls="sourceId" @click="sourceOpen = !sourceOpen">
							<i class="ti ti-code" aria-hidden="true"></i>{{ i18n.ts._play.viewSource }}<i class="ti ti-lock" aria-hidden="true"></i>
						</button>
					</div>
				</div>
				<!-- 打开即运行，不再需要点击开始。 -->
				<div :class="$style.stage">
					<MkFlashRunner :key="flash.id" ref="runnerEl" :flash="flash" :class="$style.runner"/>
				</div>
				<div v-if="isOwner && sourceOpen" :id="sourceId" :class="$style.sourcePanel">
					<div :class="$style.sourceHeader">
						<h2 :class="$style.sourceTitle"><i class="ti ti-code" aria-hidden="true"></i>{{ i18n.ts.sourceCode }}</h2>
						<span :class="$style.sourceVisibility"><i class="ti ti-lock" aria-hidden="true"></i>{{ i18n.ts._play.sourceOnlyForAuthor }}</span>
						<MkButton type="routerLink" :to="`/play/${flash.id}/edit`" small transparent><i class="ti ti-pencil" aria-hidden="true"></i>{{ i18n.ts.edit }}</MkButton>
					</div>
					<MkCode :code="flash.script" lang="is" class="_monospace"/>
				</div>
			</section>
		</div>

		<Teleport v-if="flash" :to="sidebarEl ?? 'body'" :disabled="narrow || !sidebarEl">
			<aside :class="$style.sidebarContents" :aria-label="i18n.ts.details" :aria-busy="loading || undefined">
				<MkContainer :class="$style.sideCard" :stickyHeader="false">
					<template #icon><i class="ti ti-info-circle" aria-hidden="true"></i></template>
					<template #header>{{ i18n.ts._play.introduction }}</template>
					<div :class="$style.instructions">
						<Mfm v-if="flash.summary.trim()" :text="flash.summary" :author="flash.user"/>
						<p v-else :class="$style.noSummary">{{ i18n.ts._play.noSummary }}</p>
						<p :class="$style.howToPlay">{{ i18n.ts._play.howToPlay }}</p>
					</div>
				</MkContainer>
				<MkContainer :class="$style.sideCard" :stickyHeader="false">
					<template #header>{{ i18n.ts.author }}</template>
					<div :class="$style.sideBody">
						<MkA :to="userPage(flash.user)" :class="$style.owner" :title="flash.user.name ?? flash.user.username">
							<MkAvatar :user="flash.user" :class="$style.ownerAvatar" :link="false"/>
							<div :class="$style.ownerBody">
								<MkUserName :user="flash.user" :class="$style.ownerName"/>
								<MkAcct :user="flash.user" :class="$style.ownerAcct"/>
							</div>
						</MkA>
					</div>
				</MkContainer>
				<MkContainer :class="$style.sideCard" :stickyHeader="false">
					<template #header>{{ i18n.ts._play.moreFromAuthor }}</template>
					<template #func="{ buttonStyleClass }"><MkA :to="userPage(flash.user, 'flashs')" :class="buttonStyleClass">{{ i18n.ts.all }}</MkA></template>
					<MkPagination :paginator="otherFlashsPaginator" :pullToRefresh="false">
						<template #empty><MkResult type="empty" :text="i18n.ts._play.noOtherFlashs"/></template>
						<template #default>
							<div v-if="otherFlashs.length > 0" :class="$style.otherFlashs">
								<MkFlashPreview v-for="item in otherFlashs" :key="item.id" :flash="item" compact @deleted="otherFlashsPaginator.removeItem(item.id)"/>
							</div>
							<MkResult v-else type="empty" :text="i18n.ts._play.noOtherFlashs"/>
						</template>
					</MkPagination>
				</MkContainer>
			</aside>
		</Teleport>
	</PageWithHeader>
	<div v-show="!narrow" ref="sidebarEl" class="_pageNavigation" :class="$style.sidebar"></div>
</div>
</template>

<script lang="ts" setup>
import { computed, markRaw, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { userPage } from '@@/js/user.js';
import MkButton from '@/components/MkButton.vue';
import MkFlashRunner from '@/components/MkFlashRunner.vue';
import MkFlashPreview from '@/components/MkFlashPreview.vue';
import MkPagination from '@/components/MkPagination.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkContainer from '@/components/MkContainer.vue';
import MkCode from '@/components/MkCode.vue';
import { $i } from '@/i.js';
import { getFlashMenu, shareFlash, toggleFlashLike } from '@/utility/flash-actions.js';
import { usePageNavigationNarrow } from '@/composables/use-page-navigation-narrow.js';
import { useRouter } from '@/router.js';
import { Paginator } from '@/utility/paginator.js';

const props = defineProps<{
	id: string;
}>();

const router = useRouter();
const layoutEl = useTemplateRef('layoutEl');
const sidebarEl = useTemplateRef('sidebarEl');
const runnerEl = useTemplateRef('runnerEl');
const narrow = usePageNavigationNarrow(layoutEl);
const flash = ref<Misskey.entities.Flash | null>(null);
const error = ref<unknown>(null);
const loading = ref(true);
const isOwner = computed(() => $i != null && flash.value != null && $i.id === flash.value.userId);
const sourceOpen = ref(false);
const sourceId = useId();
const authorId = computed(() => flash.value?.userId);
let request = 0;
let controller: AbortController | null = null;

// 接口仅返回公开作品，排除当前作品，不改变作者设置的可见范围。
const otherFlashsPaginator = markRaw(new Paginator('users/flashs', {
	limit: 6,
	canFetchDetection: 'limit',
	computedParams: computed(() => authorId.value ? { userId: authorId.value } : undefined),
}));
const otherFlashs = computed(() => otherFlashsPaginator.items.value.filter(item => item.id !== flash.value?.id));

async function fetchFlash() {
	const sequence = ++request;
	controller?.abort();
	controller = new AbortController();
	loading.value = true;
	error.value = null;
	sourceOpen.value = false;
	try {
		const result = await misskeyApi('flash/show', { flashId: props.id }, undefined, controller.signal);
		if (sequence !== request) return;
		flash.value = result;
	} catch (err) {
		if (sequence !== request) return;
		error.value = err;
	} finally {
		if (sequence === request) loading.value = false;
	}
}

watch(() => props.id, fetchFlash, { immediate: true });
onBeforeUnmount(() => {
	request++;
	controller?.abort();
});

function showMenu(ev: PointerEvent) {
	if (!flash.value) return;
	os.popupMenu(getFlashMenu(flash.value, router, {
		onDeleted: () => router.pushByPath('/play'),
	}), ev.currentTarget ?? ev.target);
}

definePage(() => ({
	title: flash.value ? flash.value.title : i18n.ts.play,
	...flash.value ? {
		avatar: flash.value.user,
		path: `/play/${flash.value.id}`,
		share: {
			title: flash.value.title,
			text: flash.value.summary,
		},
	} : { icon: 'ti ti-apps' },
}));
</script>

<style lang="scss" module>
@use '../../styles/layout.scss' as layout;

.layout:global(._pageLayoutWithSidebar) {
	// 与频道详情一致：主列与信息栏各自滚动，列宽在资料加载前就确定。
	grid-template-columns: minmax(0, 1fr) layout.$sidebarWidth;

	> .main {
		grid-column: 1;
	}
}

.sidebar {
	grid-column: 2;
	padding: 0;
	overscroll-behavior: none;
	overflow-anchor: none;
	background: var(--MI_THEME-bg);
}

.sidebarContents {
	// 信息卡片作为一个整体滚动，标题不再独立吸顶并与正文错位。
	transform: translateZ(0);
}

.hero {
	display: flex;
	flex-direction: column;
	gap: 16px;
	min-height: 100cqh;
	padding: var(--MI-cardPadding);
	box-sizing: border-box;
}

.heroMain {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 16px;
	min-width: 0;
}

.thumb {
	flex-shrink: 0;
	display: grid;
	place-items: center;
	width: 72px;
	height: 72px;
	overflow: hidden;
	border-radius: calc(var(--MI-radius) / 2);
	background-image: linear-gradient(135deg, var(--MI_THEME-accentedBg), var(--MI_THEME-panelHighlight));
	color: var(--MI_THEME-accent);
	font-size: 28px;
}

.heroBody {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
}

.name {
	margin: 0;
	font-size: 1.4em;
	font-weight: 700;
	line-height: 1.4;
	overflow-wrap: anywhere;
}

.meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 16px;
	font-size: 0.9em;
	color: var(--MI_THEME-fgTransparentWeak);

	> span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
}

.author {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	color: inherit;

	&:hover {
		text-decoration: none;
		color: var(--MI_THEME-accent);
	}
}

.avatar {
	flex-shrink: 0;
	width: 22px;
	height: 22px;
}

.heroActions {
	flex: 0 0 100%;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

// 运行区与频道发帖框一样直接放在主卡片内，只用分割线区分，不另加底色。
.stage {
	display: flex;
	flex: 1;
	align-items: center;
	padding-top: 16px;
	border-top: var(--MI-divider);
}

.runner {
	width: 100%;
}

.sourceToggle {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin-inline-start: auto;
	padding: 8px 12px;
	border: var(--MI-divider);
	border-radius: var(--MI-cardRadius);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .9em;

	&:hover,
	&.sourceToggleActive {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-accentedBg);
	}
}

.sourcePanel {
	padding-top: var(--MI-margin);
	border-top: var(--MI-divider);
}

.sourceHeader {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	margin-bottom: var(--MI-marginHalf);
}

.sourceTitle {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin: 0;
	font-size: 1em;
}

.sourceVisibility {
	display: inline-flex;
	flex: 1;
	align-items: center;
	gap: 4px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .85em;
}

.instructions {
	display: flex;
	flex-direction: column;
	gap: var(--MI-margin);
	padding: var(--MI-cardPadding);
	line-height: 1.8;
	overflow-wrap: anywhere;
}

.noSummary,
.howToPlay {
	margin: 0;
	color: var(--MI_THEME-fgTransparentWeak);
}

.howToPlay {
	padding-top: var(--MI-margin);
	border-top: var(--MI-divider);
	font-size: .9em;
}

// 与图标按钮同高，对齐频道详情的关注按钮。
.action:global(._button) {
	height: 36px;
}

.iconButton {
	display: grid;
	place-items: center;
	width: 36px;
	height: 36px;
	border-radius: 50%;
	color: var(--MI_THEME-fgTransparent);

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
		color: var(--MI_THEME-fg);
	}
}

.iconButtonActive {
	color: var(--MI_THEME-love);

	&:hover {
		color: var(--MI_THEME-love);
	}
}

.sideCard {
	--MI-containerHeaderBg: var(--MI_THEME-panel);
}

.sideCard + .sideCard {
	margin-top: var(--MI-margin);
}

.sideBody {
	display: flex;
	flex-direction: column;
	gap: 10px;
	// 标题栏已有下分割线，这里不再画上边框，否则两条线叠在一起。
	padding: 14px var(--MI-cardPadding);
	line-height: 1.7;
	overflow-wrap: anywhere;
}

.owner {
	display: flex;
	align-self: flex-start;
	align-items: center;
	gap: 10px;
	max-width: 100%;
	color: inherit;

	&:hover {
		text-decoration: none;
		color: var(--MI_THEME-accent);
	}
}

.ownerAvatar {
	flex-shrink: 0;
	width: 40px;
	height: 40px;
}

.ownerBody {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.ownerName {
	font-size: 1em;
	overflow-wrap: anywhere;
}

.ownerAcct {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .85em;
	overflow-wrap: anywhere;
}

.otherFlashs {
	display: grid;
	gap: var(--MI-marginHalf);
	padding: var(--MI-marginHalf);
}

@container (max-width: 500px) {
	.heroMain {
		flex-wrap: wrap;
	}

	.thumb {
		width: 56px;
		height: 56px;
	}

	.heroActions {
		width: 100%;
	}
}
</style>
