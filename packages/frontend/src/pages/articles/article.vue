<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader hideHeader>
	<div class="_pageBody" :class="$style.layout" :aria-busy="loading && !article">
		<aside :class="$style.sideActions" :aria-label="i18n.ts._article.article" :data-detail-actions="active && pageActive ? 'true' : undefined">
			<button v-tooltip.icon="article?.isLiked ? i18n.ts.unlike : i18n.ts.like" type="button" class="_button" :class="[$style.sideAction, { [$style.liked]: article?.isLiked }]" :aria-label="article?.isLiked ? i18n.ts.unlike : i18n.ts.like" :aria-pressed="article?.isLiked ?? false" :disabled="liking" @click="toggleLike"><i :class="article?.isLiked ? 'ti ti-heart-filled' : 'ti ti-heart'" aria-hidden="true"></i><span v-if="article?.likedCount" :class="$style.count" aria-hidden="true">{{ article.likedCount }}</span></button>
			<button v-tooltip.icon="i18n.ts._article.comment" type="button" class="_button" :class="$style.sideAction" :aria-label="i18n.ts._article.comment" @click="comments?.focus()"><i class="ti ti-message-circle" aria-hidden="true"></i><span v-if="commentsCount" :class="$style.count" aria-hidden="true">{{ commentsCount }}</span></button>
			<button v-tooltip.icon="isFavorited ? i18n.ts.unfavorite : i18n.ts.favorite" type="button" class="_button" :class="[$style.sideAction, { [$style.favorited]: isFavorited }]" :aria-label="isFavorited ? i18n.ts.unfavorite : i18n.ts.favorite" :aria-pressed="isFavorited" :disabled="favoriting" @click="toggleFavorite"><i :class="isFavorited ? 'ti ti-star-filled' : 'ti ti-star'" aria-hidden="true"></i></button>
			<button v-tooltip.icon="i18n.ts.share" type="button" class="_button" :class="$style.sideAction" :aria-label="i18n.ts.share" @click="share"><i class="ti ti-share" aria-hidden="true"></i></button>
			<button v-tooltip.icon="i18n.ts.reload" type="button" class="_button" :class="$style.sideAction" :aria-label="i18n.ts.reload" :disabled="loading" @click="fetchArticle"><i class="ti ti-refresh" aria-hidden="true"></i></button>
			<button v-if="$i && article && $i.id !== article.userId" v-tooltip.icon="i18n.ts.reportAbuse" type="button" class="_button" :class="$style.sideAction" :aria-label="i18n.ts.reportAbuse" @click="reportAbuse"><i class="ti ti-alert-triangle" aria-hidden="true"></i></button>
		</aside>
		<div v-if="article" class="_gaps_m" :class="$style.content">
			<article class="_panel _panelPadding" :class="$style.article" @contextmenu.stop="onContextmenu">
				<header class="_gaps_s">
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
					<div class="_buttons" :class="$style.inlineActions">
						<MkButton small :primary="article.isLiked" :disabled="liking" :aria-label="article.isLiked ? i18n.ts.unlike : i18n.ts.like" :aria-pressed="article.isLiked" @click="toggleLike"><i class="ti ti-heart" aria-hidden="true"></i> {{ article.likedCount }}</MkButton>
						<MkButton small @click="comments?.focus()"><i class="ti ti-message-circle" aria-hidden="true"></i> {{ i18n.ts._article.comment }} {{ commentsCount }}</MkButton>
						<MkButton small :primary="isFavorited" :disabled="favoriting" :aria-pressed="isFavorited" @click="toggleFavorite"><i class="ti ti-star" aria-hidden="true"></i> {{ isFavorited ? i18n.ts.unfavorite : i18n.ts.favorite }}</MkButton>
						<MkButton small @click="share"><i class="ti ti-share" aria-hidden="true"></i> {{ i18n.ts.share }}</MkButton>
						<MkButton v-if="$i && $i.id !== article.userId" small @click="reportAbuse"><i class="ti ti-alert-triangle" aria-hidden="true"></i> {{ i18n.ts.reportAbuse }}</MkButton>
						<MkButton small :disabled="loading" @click="fetchArticle"><i class="ti ti-refresh" aria-hidden="true"></i> {{ i18n.ts.reload }}</MkButton>
					</div>
				</header>
				<div class="_gaps_m" :class="[$style.body, { [$style.bodyRefreshing]: loading }]" :aria-busy="loading">
					<Teleport v-if="active && pageActive && sidebarTarget" :to="sidebarTarget">
						<div class="_gaps">
							<MkUserCardMini :user="article.user" :withChart="false" :cachePath="`/articles/${article.id}`" author/>
							<XArticleToc v-if="headings.length > 0" :headings="headings" :previewId="previewId" :compact="false"/>
							<MkDetailRecommendations :excludeId="article.id"/>
						</div>
					</Teleport>
					<XArticleToc v-else-if="headings.length > 0" :headings="headings" :previewId="previewId" compact/>
					<MkMarkdown :previewId="previewId" :text="articleBody(article)" @catalog="headings = $event"/>
					<div v-if="article.articleTags?.length" :class="$style.tags"><MkA v-for="tag in article.articleTags" :key="tag" :to="`/articles/tag/${encodeURIComponent(tag)}`">#{{ tag }}</MkA></div>
					<MkTipSection :key="article.id" :class="$style.tipSection" :recipient="article.user" targetType="page" :targetId="article.id" :targetTitle="article.title"/>
					<div v-if="loading" :class="$style.bodyLoading"><MkLoading/></div>
				</div>
			</article>
			<XArticleComments ref="comments" :articleId="article.id" :count="commentsCount" @countChange="difference => commentsCount = Math.max(0, commentsCount + difference)"/>
		</div>
		<MkError v-else-if="failed" page @retry="fetchArticle"/>
		<div v-else :class="$style.loading"><MkLoading/></div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, inject, onActivated, onBeforeUnmount, onDeactivated, ref, useId, useTemplateRef, watch } from 'vue';
import type { entities } from 'misskey-js';
import { url } from '@@/js/config.js';
import MkMarkdown from '@/components/MkMarkdown.vue';
import type { MarkdownHeading } from '@/components/MkMarkdown.vue';
import MkButton from '@/components/MkButton.vue';
import MkTipSection from '@/components/MkTipSection.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import MkDetailRecommendations from '@/components/MkDetailRecommendations.vue';
import XArticleComments from '@/pages/articles/article-comments.vue';
import XArticleToc from '@/pages/articles/article.toc.vue';
import { DI } from '@/di.js';
import { $i, ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { articleBody, isArticle, takePublishedArticle } from '@/utility/article.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { openShareDialog } from '@/utility/share-dialog.js';
import { userPage } from '@@/js/user.js';
import { useRouter } from '@/router.js';
import { getArticleMenu } from '@/utility/get-article-menu.js';
import * as os from '@/os.js';

const props = defineProps<{ articleId: string }>();
const router = useRouter();
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
const pageSidebar = inject(DI.pageSidebar, ref(null));
const inWindow = inject<boolean>('inWindow', false);
const sidebarTarget = computed(() => inWindow ? null : pageSidebar.value);
onActivated(() => { active.value = true; });
onDeactivated(() => { active.value = false; });
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

function onContextmenu(event: PointerEvent) {
	if (!article.value || window.getSelection()?.toString()) return;
	if (event.target instanceof Element && event.target.closest('a[href], img, video, audio, input, textarea, select')) return;
	os.contextMenu(getArticleMenu(article.value, router, 'detail'), event);
}

async function reportAbuse() {
	const current = article.value;
	if (!current) return;
	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkAbuseReportWindow.vue').then(x => x.default), {
		user: current.user,
		reportTarget: { reportType: 'page', targetId: current.id },
		context: { label: i18n.ts._article.article, text: current.title, url: `${url}/articles/${current.id}` },
	}, { closed: () => dispose() });
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
.article { position: relative; display: flex; flex-direction: column; gap: var(--MI-contentHeaderGap); min-width: 0; }
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
.tags { display: flex; flex-wrap: wrap; gap: 8px; }
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
