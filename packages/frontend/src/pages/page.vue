<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="layoutEl" class="_pageLayout" :class="[$style.layout, { _pageLayoutWithSidebar: !narrow }]">
	<PageWithHeader class="_pageContent" :class="$style.main" hideHeader>
		<MkError v-if="error" @retry="fetchPage()"/>
		<MkLoading v-else-if="!page"/>
		<div v-else class="_gaps">
			<section class="_panel" :class="$style.hero">
				<div v-if="page.eyeCatchingImageId" :class="$style.cover">
					<MkMediaImage
						:image="page.eyeCatchingImage!"
						:cover="true"
						:disableImageLink="true"
						:class="$style.coverImage"
					/>
				</div>
				<div :class="$style.heroMain">
					<div :class="$style.heroBody">
						<h1 :class="$style.title"><Mfm :text="page.title || page.name" :plain="true"/></h1>
						<p v-if="page.summary" :class="$style.summary"><Mfm :text="page.summary" :plain="true"/></p>
						<div :class="$style.meta">
							<MkA :to="`/@${username}`" :class="$style.author"><MkAvatar :user="page.user" :class="$style.avatar" :link="false" preview/><MkUserName :user="page.user" :class="$style.authorName"/></MkA>
							<span><i class="ti ti-clock" aria-hidden="true"></i><MkTime :time="page.createdAt" mode="date"/></span>
							<span v-if="page.createdAt !== page.updatedAt"><i class="ti ti-clock-edit" aria-hidden="true"></i>{{ i18n.ts.updatedAt }} <MkTime :time="page.updatedAt" mode="date"/></span>
							<span :title="i18n.ts.viewsCount"><i class="ti ti-eye" aria-hidden="true"></i>{{ (page.articleViews ?? 0).toLocaleString() }}</span>
							<span :title="i18n.ts.numberOfLikes"><i :class="page.isLiked ? 'ti ti-heart-filled' : 'ti ti-heart'" aria-hidden="true"></i>{{ page.likedCount.toLocaleString() }}</span>
						</div>
					</div>
					<div :class="$style.heroActions">
						<button v-tooltip="page.isLiked ? i18n.ts._pages.unlike : i18n.ts._pages.like" type="button" class="_button" :class="[$style.iconButton, { [$style.iconButtonActive]: page.isLiked }]" :aria-label="page.isLiked ? i18n.ts._pages.unlike : i18n.ts._pages.like" :aria-pressed="page.isLiked" @click="like()"><i :class="page.isLiked ? 'ti ti-heart-filled' : 'ti ti-heart'" aria-hidden="true"></i></button>
						<button v-tooltip="i18n.ts.copyLink" type="button" class="_button" :class="$style.iconButton" :aria-label="i18n.ts.copyLink" @click="copyLink"><i class="ti ti-link" aria-hidden="true"></i></button>
						<button v-tooltip="i18n.ts.share" type="button" class="_button" :class="$style.iconButton" :aria-label="i18n.ts.share" @click="share"><i class="ti ti-share" aria-hidden="true"></i></button>
						<button v-if="page.userId === $i?.id" v-tooltip="i18n.ts._pages.editThisPage" type="button" class="_button" :class="$style.iconButton" :aria-label="i18n.ts._pages.editThisPage" @click="edit"><i class="ti ti-pencil" aria-hidden="true"></i></button>
						<button v-if="$i" v-tooltip="i18n.ts.more" type="button" class="_button" :class="$style.iconButton" :aria-label="i18n.ts.more" aria-haspopup="menu" @click="showMenu"><i class="ti ti-dots" aria-hidden="true"></i></button>
					</div>
				</div>
			</section>

			<div class="_panel _panelPadding">
				<XPage :page="page"/>
			</div>

			<Teleport :to="sidebarEl ?? 'body'" :disabled="narrow || !sidebarEl">
				<aside :aria-label="i18n.ts.details">
					<!-- 作者卡用公共用户卡片：关注和私信（联系作者）按钮由它统一提供。 -->
					<MkUserCardMini :class="$style.sideCard" :user="page.user" :withChart="false" :cachePath="`/@${username}/pages`" author/>
					<MkContainer :class="$style.sideCard">
						<template #header>{{ i18n.ts.details }}</template>
						<div :class="$style.sideBody">
							<div :class="$style.detailRow"><i class="ti ti-clock" aria-hidden="true"></i><span :class="$style.detailLabel">{{ i18n.ts.createdAt }}</span><MkTime :time="page.createdAt" mode="detail"/></div>
							<div v-if="page.createdAt !== page.updatedAt" :class="$style.detailRow"><i class="ti ti-clock-edit" aria-hidden="true"></i><span :class="$style.detailLabel">{{ i18n.ts.updatedAt }}</span><MkTime :time="page.updatedAt" mode="detail"/></div>
						</div>
					</MkContainer>
					<MkContainer :class="$style.sideCard">
						<template #header>{{ i18n.ts.recentPosts }}</template>
						<MkPagination v-slot="{items}" :paginator="otherPagesPaginator">
							<ul :class="$style.otherPages">
								<li v-for="item in items" :key="item.id">
									<MkA :to="isArticle(item) ? `/articles/${item.id}` : `/@${item.user.username}/pages/${item.name}`" :target="isArticle(item) ? '_blank' : undefined" :class="$style.otherPagesItem" :title="item.title || item.name">
										<span :class="$style.otherPagesTitle"><Mfm :text="item.title || item.name" :plain="true"/></span>
										<span v-if="item.summary" :class="$style.otherPagesSummary"><Mfm :text="item.summary" :plain="true" :nowrap="true"/></span>
										<span :class="$style.otherPagesMeta">
											<MkTime :time="item.createdAt"/>
											<span v-if="item.likedCount > 0" :class="$style.otherPagesLikes" :title="i18n.ts.numberOfLikes"><i class="ti ti-heart" aria-hidden="true"></i>{{ item.likedCount.toLocaleString() }}</span>
										</span>
									</MkA>
								</li>
							</ul>
						</MkPagination>
					</MkContainer>
				</aside>
			</Teleport>

			<MkAd :preferForms="['horizontal', 'horizontal-big']"/>
		</div>
	</PageWithHeader>
	<div v-show="!narrow" ref="sidebarEl" class="_pageNavigation" :class="$style.sidebar"></div>
</div>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import type { MenuItem } from '@/types/menu.js';
import XPage from '@/components/page/page.vue';
import MkContainer from '@/components/MkContainer.vue';
import MkMediaImage from '@/components/MkMediaImage.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { deepClone } from '@/utility/clone.js';
import { $i } from '@/i.js';
import { openShareDialog } from '@/utility/share-dialog.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { useRouter } from '@/router.js';
import { getPluginHandlers } from '@/plugin.js';
import { Paginator } from '@/utility/paginator.js';
import { getAbuseReportMenu } from '@/utility/abuse-report.js';
import { isArticle } from '@/utility/article.js';
import { usePageNavigationNarrow } from '@/composables/use-page-navigation-narrow.js';

const router = useRouter();

const props = defineProps<{
	pageName: string;
	username: string;
}>();

const layoutEl = useTemplateRef('layoutEl');
const sidebarEl = useTemplateRef('sidebarEl');
const narrow = usePageNavigationNarrow(layoutEl);
const page = ref<Misskey.entities.Page | null>(null);
const error = ref<unknown>(null);
let request = 0;

const otherPagesPaginator = markRaw(new Paginator('users/pages', {
	limit: 6,
	computedParams: computed(() => page.value ? ({
		userId: page.value.user.id,
	}) : undefined),
}));
const path = computed(() => props.username + '/' + props.pageName);

async function fetchPage() {
	const sequence = ++request;
	page.value = null;
	error.value = null;
	try {
		const result = await misskeyApi('pages/show', {
			name: props.pageName,
			username: props.username,
		});
		if (sequence !== request) return;
		let value = result;
		// 插件可以改写页面内容
		const pageViewInterruptors = getPluginHandlers('page_view_interruptor');
		if (pageViewInterruptors.length > 0) {
			value = deepClone(result);
			for (const interruptor of pageViewInterruptors) {
				value = await interruptor.handler(value);
			}
		}
		if (sequence !== request) return;
		page.value = value;
	} catch (err) {
		if (sequence !== request) return;
		error.value = err;
	}
}

function edit() {
	if (!page.value) return;
	router.push('/pages/edit/:initPageId', { params: { initPageId: page.value.id } });
}

function share() {
	if (!page.value) return;
	openShareDialog({
		title: page.value.title || page.value.name,
		text: page.value.summary ?? undefined,
		url: `${url}/@${page.value.user.username}/pages/${page.value.name}`,
	}, { shareWithNote });
}

function copyLink() {
	if (!page.value) return;
	copyToClipboard(`${url}/@${page.value.user.username}/pages/${page.value.name}`);
}

function shareWithNote() {
	if (!page.value) return;
	os.post({
		initialText: `${page.value.title || page.value.name}\n${url}/@${page.value.user.username}/pages/${page.value.name}`,
		instant: true,
	});
}

function like() {
	if (!page.value) return;
	if (page.value.isLiked) {
		unlike();
	} else {
		os.apiWithDialog('pages/like', {
			pageId: page.value.id,
		}).then(() => {
			page.value!.isLiked = true;
			page.value!.likedCount++;
		});
	}
}

async function unlike() {
	if (!page.value) return;
	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.unlikeConfirm,
	});
	if (confirm.canceled) return;
	os.apiWithDialog('pages/unlike', {
		pageId: page.value.id,
	}).then(() => {
		page.value!.isLiked = false;
		page.value!.likedCount--;
	});
}

function pin(pin: boolean) {
	if (!page.value) return;
	// 失败提示由 apiWithDialog 处理
	os.apiWithDialog('i/update', {
		pinnedPageId: pin ? page.value.id : null,
	}).then(() => {
		os.toast(pin ? i18n.ts.pagePinned : i18n.ts.pageUnpinned, 'success');
	}, () => {});
}

function showMenu(ev: PointerEvent) {
	if (!page.value) return;
	const menuItems: MenuItem[] = [];

	if ($i && $i.id === page.value.userId) {
		menuItems.push({
			icon: 'ti ti-pencil',
			text: i18n.ts.edit,
			action: edit,
		});

		if ($i.pinnedPageId === page.value.id) {
			menuItems.push({
				icon: 'ti ti-pinned-off',
				text: i18n.ts.unpin,
				action: () => pin(false),
			});
		} else {
			menuItems.push({
				icon: 'ti ti-pin',
				text: i18n.ts.pin,
				action: () => pin(true),
			});
		}
	} else if ($i && $i.id !== page.value.userId) {
		menuItems.push(getAbuseReportMenu({ type: 'page', page: page.value }));

		if ($i.isModerator || $i.isAdmin) {
			menuItems.push({
				type: 'divider',
			}, {
				icon: 'ti ti-trash',
				text: i18n.ts.delete,
				danger: true,
				action: () => os.confirm({
					type: 'warning',
					text: i18n.ts.deleteConfirm,
				}).then(({ canceled }) => {
					if (canceled || !page.value) return;
					// 失败提示由 apiWithDialog 处理
					os.apiWithDialog('pages/delete', { pageId: page.value.id }).then(() => {
						os.toast(i18n.ts.deleteSucceeded, 'success');
					}, () => {});
				}),
			});
		}
	}

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}

watch(() => path.value, fetchPage, { immediate: true });

definePage(() => ({
	title: page.value ? page.value.title || page.value.name : i18n.ts.pages,
	...page.value ? {
		avatar: page.value.user,
		path: `/@${page.value.user.username}/pages/${page.value.name}`,
		share: {
			title: page.value.title || page.value.name,
			text: page.value.summary,
		},
	} : { icon: 'ti ti-file-description' },
}));
</script>

<style lang="scss" module>
@use '../styles/layout.scss' as layout;

// 与频道、作品详情一致：主列与信息栏各自滚动，列宽在数据加载前就确定。
.layout:global(._pageLayoutWithSidebar) {
	grid-template-columns: minmax(0, 1fr) layout.$sidebarWidth;

	> .main {
		grid-column: 1;
	}
}

.sidebar {
	grid-column: 2;
	padding: 0;
	background: none;
}

.hero {
	display: flex;
	flex-direction: column;
	gap: 16px;
	padding: var(--MI-cardPadding);
	container-type: inline-size;
}

.heroMain {
	display: flex;
	align-items: flex-start;
	gap: 16px;
	min-width: 0;
}

.heroBody {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
}

.title {
	margin: 0;
	font-size: 1.5em;
	font-weight: 700;
	line-height: 1.4;
	overflow-wrap: anywhere;
}

.summary {
	margin: 0;
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: 1.7;
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
	gap: 8px;
	min-width: 0;
	max-width: 100%;
}

.avatar {
	flex-shrink: 0;
	width: 24px;
	height: 24px;
}

.authorName {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.heroActions {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 8px;
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
	color: var(--MI_THEME-accent);

	&:hover {
		color: var(--MI_THEME-accent);
	}
}

// 封面在卡片内通栏显示，抵消卡片内边距。
.cover {
	margin: calc(-1 * var(--MI-cardPadding)) calc(-1 * var(--MI-cardPadding)) 0;
	overflow: clip;
}

.coverImage {
	width: 100%;
	height: clamp(160px, 32cqi, 300px);
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

.detailRow {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
	font-size: 0.9em;
	color: var(--MI_THEME-fgTransparentWeak);

	> i {
		flex-shrink: 0;
	}
}

.detailLabel {
	color: var(--MI_THEME-fg);
}

.otherPages {
	margin: 0;
	padding: var(--MI-marginHalf);
	list-style: none;
}

.otherPagesItem {
	display: flex;
	flex-direction: column;
	gap: 5px;
	min-width: 0;
	padding: 10px calc(var(--MI-cardPadding) - var(--MI-marginHalf));
	border-radius: var(--MI-cardRadius);
	color: var(--MI_THEME-fg);
	transition: background-color .15s ease;

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-panelHighlight);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -2px;
	}
}

.otherPagesTitle {
	display: -webkit-box;
	overflow: hidden;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	font-size: 1em;
	font-weight: 600;
	line-height: 1.5;
	overflow-wrap: anywhere;
}

.otherPagesSummary {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	font-size: .9em;
	line-height: 1.5;
	color: var(--MI_THEME-fgTransparentWeak);
}

.otherPagesMeta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-top: 2px;
	font-size: 12px;
	line-height: 1.5;
	color: var(--MI_THEME-fgTransparentWeak);
}

.otherPagesLikes {
	display: inline-flex;
	align-items: center;
	gap: 4px;
}

@media (prefers-reduced-motion: reduce) {
	.otherPagesItem {
		transition: none;
	}
}

@container (max-width: 500px) {
	.heroMain {
		flex-wrap: wrap;
	}

	.heroActions {
		width: 100%;
	}
}
</style>
