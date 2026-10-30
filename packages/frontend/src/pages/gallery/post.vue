<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="layoutEl" class="_pageLayout" :class="[$style.layout, { _pageLayoutWithSidebar: !narrow }]">
	<PageWithHeader class="_pageContent" :class="$style.main" hideHeader>
		<MkError v-if="error" @retry="fetchPost()"/>
		<MkLoading v-else-if="!post"/>
		<div v-else class="_gaps">
			<section class="_panel" :class="$style.hero">
				<div :class="$style.heroMain">
					<div :class="$style.heroBody">
						<h1 :class="$style.name"><Mfm :text="post.title" :plain="true"/></h1>
						<div :class="$style.meta">
							<span v-tooltip="i18n.ts.numberOfLikes"><i class="ti ti-heart" aria-hidden="true"></i>{{ post.likedCount }}</span>
							<span><i class="ti ti-clock" aria-hidden="true"></i><MkTime :time="post.createdAt"/></span>
							<button type="button" class="_textButton" :class="$style.metaButton" @click="share()"><i class="ti ti-share" aria-hidden="true"></i>{{ i18n.ts.share }}</button>
							<span v-if="post.isSensitive" :class="$style.warn">{{ i18n.ts.sensitive }}</span>
						</div>
					</div>
					<div :class="$style.heroActions">
						<button v-tooltip="post.isLiked ? i18n.ts._gallery.unlike : i18n.ts._gallery.like" type="button" class="_button" :class="[$style.iconButton, { [$style.iconButtonActive]: post.isLiked }]" :aria-label="post.isLiked ? i18n.ts._gallery.unlike : i18n.ts._gallery.like" :aria-pressed="post.isLiked ?? false" @click="post.isLiked ? unlike() : like()"><i :class="post.isLiked ? 'ti ti-heart-filled' : 'ti ti-heart'" aria-hidden="true"></i></button>
						<button v-tooltip="i18n.ts.more" type="button" class="_button" :class="$style.iconButton" :aria-label="i18n.ts.more" aria-haspopup="menu" @click="showMenu"><i class="ti ti-dots" aria-hidden="true"></i></button>
					</div>
				</div>
				<div v-if="post.files?.length" :class="$style.files">
					<img v-for="file in post.files" :key="file.id" :src="file.url" :alt="file.comment ?? ''" :class="$style.file"/>
				</div>
			</section>

			<Teleport :to="sidebarEl ?? 'body'" :disabled="narrow || !sidebarEl">
				<aside :aria-label="i18n.ts.gallery">
					<MkContainer v-if="post.description" :class="$style.sideCard">
						<template #header>{{ i18n.ts.description }}</template>
						<div :class="$style.sideBody"><Mfm :text="post.description"/></div>
					</MkContainer>
					<MkContainer :class="$style.sideCard">
						<template #header>{{ i18n.ts.author }}</template>
						<div :class="$style.sideBody">
							<MkA :to="userPage(post.user)" :class="$style.owner" :title="post.user.name ?? post.user.username">
								<MkAvatar :user="post.user" :class="$style.ownerAvatar" :link="false"/>
								<MkUserName :user="post.user" :class="$style.ownerName"/>
							</MkA>
						</div>
					</MkContainer>
				</aside>
			</Teleport>

			<MkContainer :maxHeight="300" foldable :class="$style.sideCard">
				<template #icon><i class="ti ti-clock" aria-hidden="true"></i></template>
				<template #header>{{ i18n.ts.recentPosts }}</template>
				<MkPagination v-slot="{ items }" :paginator="otherPostsPaginator">
					<div :class="$style.posts">
						<MkGalleryPostPreview v-for="item in items" :key="item.id" :post="item"/>
					</div>
				</MkPagination>
			</MkContainer>
			<MkAd :preferForms="['horizontal', 'horizontal-big']"/>
		</div>
	</PageWithHeader>
	<div v-show="!narrow" ref="sidebarEl" class="_pageNavigation" :class="$style.sidebar"></div>
</div>
</template>

<script lang="ts" setup>
import { computed, watch, ref, markRaw, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import { userPage } from '@@/js/user.js';
import type { MenuItem } from '@/types/menu.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkContainer from '@/components/MkContainer.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkGalleryPostPreview from '@/components/MkGalleryPostPreview.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { $i } from '@/i.js';
import { openShareDialog } from '@/utility/share-dialog.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { getAbuseReportMenu } from '@/utility/abuse-report.js';
import { useRouter } from '@/router.js';
import { Paginator } from '@/utility/paginator.js';
import { usePageNavigationNarrow } from '@/composables/use-page-navigation-narrow.js';

const router = useRouter();

const props = defineProps<{
	postId: string;
}>();

const layoutEl = useTemplateRef('layoutEl');
const sidebarEl = useTemplateRef('sidebarEl');
const narrow = usePageNavigationNarrow(layoutEl);
const post = ref<Misskey.entities.GalleryPost | null>(null);
const error = ref<any>(null);
const isOwner = computed(() => $i != null && post.value != null && $i.id === post.value.userId);
const otherPostsPaginator = markRaw(new Paginator('users/gallery/posts', {
	limit: 6,
	computedParams: computed(() => ({
		userId: post.value!.user.id,
	})),
}));

function fetchPost() {
	error.value = null;
	post.value = null;
	misskeyApi('gallery/posts/show', {
		postId: props.postId,
	}).then(_post => {
		post.value = _post;
	}).catch(_error => {
		error.value = _error;
	});
}

function copyLink() {
	if (!post.value) return;
	copyToClipboard(`${url}/gallery/${post.value.id}`);
}

function share() {
	if (!post.value) return;
	openShareDialog({
		title: post.value.title,
		text: post.value.description ?? undefined,
		url: `${url}/gallery/${post.value.id}`,
	}, { shareWithNote });
}

function shareWithNote() {
	if (!post.value) return;
	os.post({
		initialText: `${post.value.title} ${url}/gallery/${post.value.id}`,
		instant: true,
	});
}

function like() {
	if (!post.value) return;
	os.apiWithDialog('gallery/posts/like', {
		postId: props.postId,
	}).then(() => {
		post.value!.isLiked = true;
		post.value!.likedCount++;
	});
}

async function unlike() {
	if (!post.value) return;
	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.unlikeConfirm,
	});
	if (confirm.canceled) return;
	os.apiWithDialog('gallery/posts/unlike', {
		postId: props.postId,
	}).then(() => {
		post.value!.isLiked = false;
		post.value!.likedCount--;
	});
}

function edit() {
	router.push('/gallery/:postId/edit', {
		params: {
			postId: props.postId,
		},
	});
}

function showMenu(ev: PointerEvent) {
	if (!post.value) return;
	const _post = post.value;

	const menuItems: MenuItem[] = [{
		icon: 'ti ti-link',
		text: i18n.ts.copyUrl,
		action: copyLink,
	}];

	if (isOwner.value) {
		menuItems.push({
			icon: 'ti ti-pencil',
			text: i18n.ts.edit,
			action: edit,
		});
	} else if ($i) {
		menuItems.push(getAbuseReportMenu({ type: 'gallery', post: _post }));

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
					if (canceled) return;

					os.apiWithDialog('gallery/posts/delete', { postId: _post.id });
				}),
			});
		}
	}

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}

watch(() => props.postId, fetchPost, { immediate: true });

definePage(() => ({
	title: post.value ? post.value.title : i18n.ts.gallery,
	...post.value ? {
		avatar: post.value.user,
	} : { icon: 'ti ti-library-photo' },
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
	background: none;
}

.hero {
	display: flex;
	flex-direction: column;
	gap: 16px;
	padding: var(--MI-cardPadding);
}

.heroMain {
	display: flex;
	align-items: center;
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

	> .warn {
		color: var(--MI_THEME-warn);
	}
}

.metaButton {
	color: inherit;

	&:hover {
		color: var(--MI_THEME-accent);
	}
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
	color: var(--MI_THEME-love);

	&:hover {
		color: var(--MI_THEME-love);
	}
}

.files {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.file {
	display: block;
	max-width: 100%;
	max-height: 500px;
	margin: 0 auto;
	border-radius: calc(var(--MI-radius) / 2);
}

.posts {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr));
	gap: 12px;
	padding: var(--MI-cardPadding);
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
	flex-direction: column;
	align-self: flex-start;
	align-items: flex-start;
	gap: 4px;
	max-width: 100%;
}

.ownerAvatar {
	width: 40px;
	height: 40px;
}

// 侧栏卡片的内容统一用正文字号。
.ownerName {
	font-size: 1em;
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

