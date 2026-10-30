<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :hideHeader="!mobileLayout" hideTitle embedded :class="[$style.page, { [$style.mobile]: mobileLayout }]">
	<template v-if="mobileLayout" #header-actions>
		<div :class="$style.mobileHeader">
			<button type="button" class="_button" :class="$style.mobileHeaderButton" :aria-label="i18n.ts.goBack" @click="goBack"><i class="ti ti-arrow-left" aria-hidden="true"></i></button>
			<button type="button" class="_button" :class="$style.mobileHeaderButton" :disabled="!article" :aria-label="i18n.ts.share" @click="share"><i class="ti ti-share" aria-hidden="true"></i></button>
		</div>
	</template>
	<div v-if="(mobileLayout || !sidebarVisible) && active && pageActive && headings.length > 0" :class="$style.floatingToc">
		<XArticleToc :headings="headings" :previewId="previewId" compact floating/>
	</div>
	<component :is="mobileLayout && prefer.s.enablePullToRefresh ? MkPullToRefresh : 'div'" :refresher="refreshArticle" class="_pageBody" :class="[$style.reader, { [$style.inWindow]: inWindow }]" :aria-busy="loading && !article">
		<div :class="$style.layout">
			<aside v-if="!mobileLayout" :class="$style.sideActions" :aria-label="i18n.ts._article.article" :data-detail-actions="active && pageActive ? 'true' : undefined">
				<button v-tooltip.icon="article?.isLiked ? i18n.ts.unlike : i18n.ts.like" type="button" class="_button" :class="[$style.sideAction, { [$style.liked]: article?.isLiked }]" :aria-label="article?.isLiked ? i18n.ts.unlike : i18n.ts.like" :aria-pressed="article?.isLiked ?? false" :disabled="liking" @click="toggleLike"><i :class="article?.isLiked ? 'ti ti-heart-filled' : 'ti ti-heart'" aria-hidden="true"></i><span v-if="article?.likedCount" :class="$style.count" aria-hidden="true">{{ article.likedCount }}</span></button>
				<button v-tooltip.icon="i18n.ts._article.comment" type="button" class="_button" :class="$style.sideAction" :aria-label="i18n.ts._article.comment" @click="comments?.focus()"><i class="ti ti-message-circle" aria-hidden="true"></i><span v-if="commentsCount" :class="$style.count" aria-hidden="true">{{ commentsCount }}</span></button>
				<button v-tooltip.icon="isFavorited ? i18n.ts.unfavorite : i18n.ts.favorite" type="button" class="_button" :class="[$style.sideAction, { [$style.favorited]: isFavorited }]" :aria-label="isFavorited ? i18n.ts.unfavorite : i18n.ts.favorite" :aria-pressed="isFavorited" :disabled="favoriting" @click="toggleFavorite"><i :class="isFavorited ? 'ti ti-star-filled' : 'ti ti-star'" aria-hidden="true"></i></button>
				<button v-tooltip.icon="i18n.ts.share" type="button" class="_button" :class="$style.sideAction" :aria-label="i18n.ts.share" @click="share"><i class="ti ti-share" aria-hidden="true"></i></button>
				<button v-tooltip.icon="i18n.ts.reload" type="button" class="_button" :class="$style.sideAction" :aria-label="i18n.ts.reload" :disabled="loading" @click="fetchArticle"><i class="ti ti-refresh" aria-hidden="true"></i></button>
				<MkAbuseReportButton :target="article ? { type: 'article', article } : null" :authorId="authorUser?.id" iconOnly :class="$style.sideAction"/>
			</aside>
			<div v-if="article" class="_gaps_m" :class="$style.content">
				<article class="_panel _panelPadding" :class="[$style.article, { [$style.withFloatingToc]: mobileLayout && headings.length > 0 }]" @contextmenu.stop="onContextmenu">
					<header class="_gaps_s" :class="$style.articleHeader">
						<div :class="$style.titleRow">
							<h1 :class="$style.title">{{ article.title }}</h1>
							<MkButton v-if="article.userId === $i?.id" small type="routerLink" :to="`/articles/edit/${article.id}`"><i class="ti ti-pencil" aria-hidden="true"></i> {{ i18n.ts.edit }}</MkButton>
						</div>
						<div :class="$style.meta">
							<MkA :to="userPage(article.user)" :class="$style.author"><MkAvatar :user="article.user" :class="$style.avatar" :link="false" preview/><MkUserName :user="article.user" :class="$style.authorName"/></MkA>
							<MkTime :time="article.createdAt" mode="date"/>
							<span :class="$style.views" :title="i18n.ts.viewsCount"><i class="ti ti-eye" role="img" :aria-label="i18n.ts.viewsCount"></i>{{ (article.articleViews ?? 0).toLocaleString() }}</span>
							<span v-if="article.updatedAt !== article.createdAt">{{ i18n.ts.updatedAt }} <MkTime :time="article.updatedAt"/></span>
						</div>
						<div v-if="!mobileLayout" class="_buttons" :class="$style.inlineActions">
							<MkButton small :primary="article.isLiked" :disabled="liking" :aria-label="article.isLiked ? i18n.ts.unlike : i18n.ts.like" :aria-pressed="article.isLiked" @click="toggleLike"><i class="ti ti-heart" aria-hidden="true"></i> {{ article.likedCount }}</MkButton>
							<MkButton small @click="comments?.focus()"><i class="ti ti-message-circle" aria-hidden="true"></i> {{ i18n.ts._article.comment }} {{ commentsCount }}</MkButton>
							<MkButton small :primary="isFavorited" :disabled="favoriting" :aria-pressed="isFavorited" @click="toggleFavorite"><i class="ti ti-star" aria-hidden="true"></i> {{ isFavorited ? i18n.ts.unfavorite : i18n.ts.favorite }}</MkButton>
							<MkButton small @click="share"><i class="ti ti-share" aria-hidden="true"></i> {{ i18n.ts.share }}</MkButton>
							<MkAbuseReportButton :target="{ type: 'article', article }"/>
							<MkButton small :disabled="loading" @click="fetchArticle"><i class="ti ti-refresh" aria-hidden="true"></i> {{ i18n.ts.reload }}</MkButton>
						</div>
					</header>
					<div class="_gaps_m" :class="[$style.body, { [$style.bodyRefreshing]: loading }]" :aria-busy="loading">
						<MkMarkdown :previewId="previewId" :text="articleBody(article)" @catalog="headings = $event"/>
						<MkTipSection :key="article.id" :class="$style.tipSection" :recipient="article.user" targetType="page" :targetId="article.id"/>
						<div v-if="loading" :class="$style.bodyLoading"><MkLoading/></div>
					</div>
					<div v-if="article.articleTags?.length" :class="$style.tags"><MkA v-for="tag in article.articleTags" :key="tag" :to="`/articles/tag/${encodeURIComponent(tag)}`">#{{ tag }}</MkA></div>
				</article>
				<MkComments ref="comments" :source="{ type: 'article', articleId: article.id, authorId: article.userId, count: commentsCount }" :panel="!mobileLayout" :composerDocked="mobileLayout && active && pageActive" @countChange="difference => commentsCount = Math.max(0, commentsCount + difference)">
					<template #composerActions>
						<button type="button" class="_button" :class="[$style.mobileAction, { [$style.liked]: article.isLiked }]" :aria-label="article.isLiked ? i18n.ts.unlike : i18n.ts.like" :aria-pressed="article.isLiked" :disabled="liking" @click="toggleLike"><i :class="article.isLiked ? 'ti ti-heart-filled' : 'ti ti-heart'" aria-hidden="true"></i><span>{{ article.likedCount }}</span></button>
						<button type="button" class="_button" :class="$style.mobileAction" :aria-label="i18n.ts._article.comment" @click="comments?.focus()"><i class="ti ti-message-circle" aria-hidden="true"></i><span>{{ commentsCount }}</span></button>
						<button type="button" class="_button" :class="[$style.mobileAction, { [$style.favorited]: isFavorited }]" :aria-label="isFavorited ? i18n.ts.unfavorite : i18n.ts.favorite" :aria-pressed="isFavorited" :disabled="favoriting" @click="toggleFavorite"><i :class="isFavorited ? 'ti ti-star-filled' : 'ti ti-star'" aria-hidden="true"></i></button>
					</template>
				</MkComments>
			</div>
			<MkError v-else-if="failed" page @retry="fetchArticle"/>
			<div v-else :class="$style.loading"><MkLoading/></div>
		</div>
		<aside v-if="!inWindow && !mobileLayout" ref="sidebarEl" :class="$style.sidebar" :data-article-sidebar="active && pageActive && sidebarVisible ? 'true' : undefined">
			<template v-if="sidebarVisible && active && pageActive">
				<!-- 缓存和正式数据共用一个卡片实例，文章加载完成时不重建，头像和横幅不重新淡入。 -->
				<MkUserCardMini v-if="authorUser" :user="authorUser" :withChart="false" :cachePath="authorPath" author/>
				<div v-else :class="$style.authorSkeleton" aria-busy="true">
					<div :class="$style.skeletonIdentity" aria-hidden="true"><span></span><span></span></div>
					<div :class="$style.skeletonStats" aria-hidden="true"><span v-for="index in 3" :key="index"></span></div>
				</div>
				<div v-if="article" :class="$style.sidebarSticky" @wheel="onSidebarWheel">
					<XArticleToc v-if="headings.length > 0" :headings="headings" :previewId="previewId" :compact="false"/>
					<MkDetailRecommendations :excludeId="article.id"/>
				</div>
			</template>
		</aside>
	</component>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, inject, onActivated, onBeforeUnmount, onDeactivated, ref, useId, useTemplateRef, watch } from 'vue';
import type { Ref } from 'vue';
import type { entities } from 'misskey-js';
import { url } from '@@/js/config.js';
import { getScrollContainer } from '@@/js/scroll.js';
import MkMarkdown from '@/components/MkMarkdown.vue';
import type { MarkdownHeading } from '@/components/MkMarkdown.vue';
import MkButton from '@/components/MkButton.vue';
import MkTipSection from '@/components/MkTipSection.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import MkDetailRecommendations from '@/components/MkDetailRecommendations.vue';
import MkComments from '@/components/MkComments.vue';
import MkPullToRefresh from '@/components/MkPullToRefresh.vue';
import XArticleToc from '@/pages/articles/article.toc.vue';
import { DI } from '@/di.js';
import { $i, ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { prefer } from '@/preferences.js';
import { articleBody, isArticle, takePublishedArticle } from '@/utility/article.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { openShareDialog } from '@/utility/share-dialog.js';
import { userPage } from '@@/js/user.js';
import { useRouter } from '@/router.js';
import { getArticleMenu } from '@/utility/get-article-menu.js';
import { readAuthorCard } from '@/utility/author-card-cache.js';
import { getAbuseReportMenu } from '@/utility/abuse-report.js';
import { deviceKind } from '@/utility/device-kind.js';
import type { MenuItem } from '@/types/menu.js';
import MkAbuseReportButton from '@/components/MkAbuseReportButton.vue';
import * as os from '@/os.js';

const props = defineProps<{ articleId: string }>();
const router = useRouter();
const mobileLayout = inject<Readonly<Ref<boolean>>>('mobileLayout', computed(() => deviceKind === 'smartphone' || window.innerWidth <= 500));
const article = ref<entities.Page | null>(null);
const failed = ref(false);
const loading = ref(true);
const liking = ref(false);
const favoriting = ref(false);
const isFavorited = ref(false);
const commentsCount = ref(0);
const comments = useTemplateRef('comments');
const previewId = `article-${useId()}`;
const headings = ref<MarkdownHeading[]>([]);
const active = ref(true);
const pageActive = inject(DI.pageActive, ref(true));
const detailActionsLoading = inject(DI.detailActionsLoading, ref(true));
const inWindow = inject<boolean>('inWindow', false);
const authorPath = computed(() => `/articles/${props.articleId}`);
const cachedAuthor = computed(() => readAuthorCard(authorPath.value));
const authorUser = computed(() => article.value?.user ?? cachedAuthor.value?.user ?? null);
const sidebarEl = useTemplateRef('sidebarEl');
const sidebarVisible = ref(false);
// 列宽和断点由外壳 CSS 首屏决定，这里只决定目录在哪一列挂载。
watch(sidebarEl, (element, _previous, onCleanup) => {
	sidebarVisible.value = false;
	if (!element) return;
	const updateVisibility = () => { sidebarVisible.value = element.getBoundingClientRect().width > 0; };
	const observer = new ResizeObserver(updateVisibility);
	observer.observe(element);
	updateVisibility();
	onCleanup(() => observer.disconnect());
}, { flush: 'post' });
onActivated(() => { active.value = true; });
onDeactivated(() => { active.value = false; });

// 右栏吸顶区本身可以滚动。还没吸顶时，滚轮先滚动页面，让作者卡移出；吸顶后才在右栏内滚动目录和推荐。
function onSidebarWheel(ev: WheelEvent) {
	const region = ev.currentTarget as HTMLElement;
	const page = getScrollContainer(region.parentElement);
	if (page == null || ev.deltaY === 0) return;
	const down = ev.deltaY > 0;
	const stuck = region.getBoundingClientRect().top <= page.getBoundingClientRect().top + (parseFloat(getComputedStyle(region).top) || 0) + 1;
	const regionCanScroll = down ? region.scrollTop + region.clientHeight < region.scrollHeight - 1 : region.scrollTop > 0;
	if (stuck && regionCanScroll) return;
	const pageCanScroll = down ? page.scrollTop + page.clientHeight < page.scrollHeight - 1 : page.scrollTop > 0;
	if (!pageCanScroll) return;
	ev.preventDefault();
	const unit = ev.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : ev.deltaMode === WheelEvent.DOM_DELTA_PAGE ? page.clientHeight : 1;
	page.scrollBy({ top: ev.deltaY * unit, behavior: 'instant' });
}

let request = 0;

function restorePublishedArticle() {
	const published = takePublishedArticle(router, props.articleId);
	if (published === undefined) return false;
	if (published === null) {
		void fetchArticle();
		return true;
	}
	request++;
	article.value = published.article;
	commentsCount.value = published.commentsCount;
	isFavorited.value = published.isFavorited;
	headings.value = [];
	failed.value = false;
	loading.value = false;
	if (active.value && pageActive.value) detailActionsLoading.value = false;
	return true;
}

watch(() => active.value && pageActive.value, visible => {
	if (visible) restorePublishedArticle();
});

async function refreshArticle() {
	if (!loading.value) await Promise.all([fetchArticle(), comments.value?.reload()]);
}

async function fetchArticle() {
	const sequence = ++request;
	loading.value = true;
	failed.value = false;
	try {
		const result = await misskeyApi('articles/show', { articleId: props.articleId });
		if (sequence !== request) return;
		if (!isArticle(result.article)) throw new Error('Not an article');
		article.value = result.article;
		commentsCount.value = result.commentsCount;
		isFavorited.value = result.isFavorited;
	} catch (error) {
		if (sequence !== request) return;
		failed.value = true;
		if (!isAccountSessionErrorHandled(error)) os.toast(i18n.ts.somethingHappened, 'error');
	} finally {
		if (sequence === request) {
			loading.value = false;
			if (active.value && pageActive.value) detailActionsLoading.value = false;
		}
	}
}

async function toggleLike() {
	ensureSignin();
	const current = article.value;
	if (!current || liking.value) return;
	liking.value = true;
	try {
		const result = await misskeyApi('articles/like', { articleId: current.id, liked: !current.isLiked });
		current.likedCount = result.likedCount;
		current.isLiked = result.isLiked;
	} catch (error) { if (!isAccountSessionErrorHandled(error)) os.toast(i18n.ts.somethingHappened, 'error'); } finally { liking.value = false; }
}

async function toggleFavorite() {
	ensureSignin();
	const current = article.value;
	if (!current || favoriting.value) return;
	favoriting.value = true;
	try {
		const result = await misskeyApi('articles/favorite', { articleId: current.id, favorited: !isFavorited.value });
		if (article.value?.id === current.id) isFavorited.value = result.isFavorited;
	} catch (error) { if (!isAccountSessionErrorHandled(error)) os.toast(i18n.ts.somethingHappened, 'error'); } finally { favoriting.value = false; }
}

function share() {
	if (!article.value) return;
	openShareDialog({ title: article.value.title, text: article.value.summary ?? undefined, url: `${url}/articles/${article.value.id}` });
}

function goBack() {
	if (router.canGoBack.value) router.back();
	else router.push('/');
}

function articleMenu(): MenuItem[] {
	const current = article.value;
	if (!current) return [];
	const menu = getArticleMenu(current, router, 'detail');
	if (!mobileLayout.value) return menu;
	const items: MenuItem[] = [];
	if ($i && current.userId !== $i.id) items.push(getAbuseReportMenu({ type: 'article', article: current }, () => article.value?.id === current.id));
	if (items.length > 0) items.push({ type: 'divider' });
	return [...items, ...menu];
}

function onContextmenu(event: PointerEvent) {
	if (!article.value || window.getSelection()?.toString()) return;
	if (event.target instanceof Element && event.target.closest('a[href], img, video, audio, input, textarea, select')) return;
	os.contextMenu(articleMenu(), event);
}

watch(() => props.articleId, () => {
	article.value = null;
	headings.value = [];
	if (!restorePublishedArticle()) void fetchArticle();
}, { immediate: true });
onBeforeUnmount(() => { request++; });
definePage(() => ({ title: article.value?.title ?? i18n.ts._article.article, icon: 'ti ti-file-text' }));
</script>

<style lang="scss" module>
@use '../../styles/page-header.scss';

.page.mobile {
	--MI-pageHeaderRadius: 0px;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	border-radius: 0;
}

.mobile {
	:global([data-page-header]) > div > div:has(> .mobileHeader) {
		flex: 1;
		min-width: 0;
		max-width: none;
		padding: 0;
	}

	.reader {
		--MI-cardPadding: 16px;
		grid-template-columns: minmax(0, 1fr);
		padding: 0 env(safe-area-inset-right, 0px) calc(16px + env(safe-area-inset-bottom, 0px)) env(safe-area-inset-left, 0px);
	}
	.layout { display: block; }
	.content { gap: 0; }
	.article { border-radius: 0; }
	.withFloatingToc .titleRow { padding-inline-end: 52px; }
	.title { font-size: 1.45em; line-height: 1.4; }
}

.floatingToc {
	position: sticky;
	top: calc(var(--MI-stickyTop, 0px) + 12px);
	z-index: 1;
	display: flex;
	justify-content: flex-end;
	height: 0;
	padding-inline-end: max(12px, env(safe-area-inset-right, 0px));
	pointer-events: none;
}

.mobileHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 2px;
	width: 100%;
	min-height: var(--MI-mobileHeaderHeight);
	padding: 0 max(8px, env(safe-area-inset-right, 0px)) 0 max(8px, env(safe-area-inset-left, 0px));
	box-sizing: border-box;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
}
.mobileHeaderButton {
	@include page-header.action;
	--height: var(--MI-mobileTouchTarget);
	--MI-headerActionSize: var(--MI-mobileTouchTarget);
	color: var(--MI_THEME-fg);
	font-size: 18px;
	line-height: 1;

	&:disabled { opacity: .5; }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}
.mobileAction {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 4px;
	min-width: 40px;
	min-height: 44px;
	padding-inline: 4px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 18px;

	> span { font-size: 13px; }
	&:hover:not(:disabled), &.liked, &.favorited { color: var(--MI_THEME-accent); }
	&:disabled { opacity: .5; }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; border-radius: var(--MI-radius); }
}

.reader {
	display: grid;
	grid-template-columns: var(--MI-detailColumns, minmax(0, 1fr));
	column-gap: var(--MI-detailColumnGap, 0px);
	align-items: stretch;

	&.inWindow { grid-template-columns: minmax(0, 1fr); }
}
.layout { min-width: 0; container-type: inline-size; }
.sidebar {
	display: var(--MI-detailSidebarDisplay, none);
	flex-direction: column;
	gap: var(--MI-margin);
	min-width: 0;
	align-self: stretch;

	> * { flex-shrink: 0; }
}
// 作者卡自然滚出视口；目录和推荐一起吸顶，整栏仍随正文滚动。
// 吸顶后右栏是独立滚动区：上下伸到滚动区边缘，间距放在内边距里，正文到底后右栏仍能继续滚动，不裁切也不被列底边推动。
.sidebarSticky {
	--reach: var(--MI-pageReachTop, 0px);
	position: sticky;
	top: calc(var(--MI-stickyTop, 0px) - var(--reach));
	display: flex;
	flex-direction: column;
	gap: var(--MI-margin);
	max-height: calc(100cqh + var(--reach) - var(--MI-stickyTop, 0px) - var(--MI-stickyBottom, 0px));
	margin-block: calc(-1 * var(--reach)) calc(-1 * var(--MI-pageGap));
	padding-block: var(--reach) var(--MI-pageGap);
	box-sizing: border-box;
	overflow-y: auto;
	overscroll-behavior: contain;
	scrollbar-width: none;
	// 顶部内边距与作者卡底部有少量重叠，不拦截作者卡的点击。
	pointer-events: none;

	&::-webkit-scrollbar { display: none; }
	> * { flex-shrink: 0; pointer-events: auto; }
}
.authorSkeleton { height: 196px; overflow: clip; border-radius: var(--MI-cardRadius); background: var(--MI_THEME-panel); }
.skeletonIdentity {
	display: flex; align-items: center; gap: 12px; height: 116px; padding: 0 20px; background: var(--MI-userBannerBg);
	> span { width: 52px; height: 52px; border-radius: 50%; background: var(--MI_THEME-panel); opacity: .35; }
	> span + span { width: 100px; height: 16px; border-radius: var(--MI-cardRadius); }
}
.skeletonStats { display: flex; justify-content: space-around; align-items: center; height: 80px; }
.skeletonStats > span { width: 36px; height: 32px; border-radius: var(--MI-cardRadius); background: var(--MI_THEME-panelHighlight); }
.article { position: relative; display: flex; flex-direction: column; gap: var(--MI-contentHeaderGap); min-width: 0; }
.articleHeader { padding-bottom: var(--MI-margin); border-bottom: var(--MI-divider); }
.content { min-width: 0; }
.titleRow { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.titleRow > :not(.title) { flex-shrink: 0; }
.titleRow > .title { min-width: 0; flex: 1; }
.title { margin: 0; font-size: 1.7em; overflow-wrap: anywhere; color: var(--MI_THEME-fg); }
.meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; color: var(--MI_THEME-fgTransparentWeak); font-size: .9em; line-height: 1.6; }
.author { display: inline-flex; align-items: center; gap: 8px; min-width: 0; max-width: 100%; }
.authorName { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.avatar { flex-shrink: 0; width: 32px; height: 32px; }
.views { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.tags { display: flex; align-self: flex-start; flex-wrap: wrap; gap: 8px; }
.tags > a { padding: 5px 10px; border-radius: 4px; color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); font-size: .9em; }
// 容器 gap 16px 已计入打赏自带的 60px，这里抵扣差额
.tipSection { margin-top: calc(60px - var(--MI-margin)); }
.loading { display: flex; justify-content: center; align-items: center; min-height: 240px; }
.body { position: relative; }
.bodyRefreshing > :not(.bodyLoading) { opacity: .4; pointer-events: none; transition: opacity .2s; }
// 正文可能很长，转圈吸附在可视区域内
.bodyLoading { position: absolute; inset: 0; display: flex; justify-content: center; align-items: flex-start; }
.bodyLoading > * { position: sticky; top: calc(var(--MI-stickyTop, 0px) + 120px); }
.sideActions { display: none; }
.sideAction { position: relative; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; background: var(--MI_THEME-panel); color: var(--MI_THEME-fgTransparentWeak); font-size: 20px; line-height: 1; transition: color .15s ease; }
// 悬停和已操作统一用主题色，图标与角标同步变色。
.sideAction:hover:not(:disabled), .sideAction:focus-visible, .sideAction.liked, .sideAction.favorited { color: var(--MI_THEME-accent); }
.sideAction:disabled { cursor: wait; opacity: 0.6; }
.count { position: absolute; top: 0; right: -6px; padding: 2px 5px; border-radius: var(--MI-radius); background: var(--MI_THEME-fgTransparentWeak); color: var(--MI_THEME-panel); font-size: 11px; line-height: 1; transition: background-color .15s ease; }
.sideAction:hover:not(:disabled) > .count, .sideAction:focus-visible > .count, .sideAction.liked > .count { background: var(--MI_THEME-accent); color: var(--MI_THEME-fgOnAccent); }
@media (prefers-reduced-motion: reduce) { .sideAction, .count { transition: none; } }
@container (min-width: 700px) {
	.layout { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: var(--MI-margin); align-items: start; }
	.sideActions { position: sticky; top: calc(var(--MI-stickyTop, 0px) + 48px); display: flex; flex-direction: column; align-items: center; gap: 20px; margin-top: 48px; }
	.inlineActions { display: none; }
}
</style>
