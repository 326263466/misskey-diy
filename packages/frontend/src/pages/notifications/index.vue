<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_pageLayout _pageLayoutWithSidebar" :class="$style.layout">
	<nav class="_pageNavigation" :class="$style.navigation" :aria-label="i18n.ts.notifications">
		<div ref="scrollerEl" :class="$style.scroller" @scroll="updateScrollButtons">
			<MkA
				v-for="item in menuItems"
				:key="item.key"
				class="_button"
				:class="[$style.item, { [$style.active]: activeTab === item.key }]"
				:to="item.to"
				:aria-current="activeTab === item.key ? 'page' : undefined"
			>
				<i :class="item.icon" aria-hidden="true"></i>
				<span>{{ item.title }}</span>
				<i v-if="item.indicated" :class="$style.indicator" class="_indicatorCircle _blink" aria-hidden="true"></i>
			</MkA>
		</div>
		<!-- 窄屏横排放不下时，与页头标签相同提供左右切换 -->
		<button v-if="canScrollLeft" v-tooltip="i18n.ts.scrollLeft" type="button" class="_button" :class="[$style.scrollButton, $style.scrollLeft]" :aria-label="i18n.ts.scrollLeft" @click="scrollMenu(-1)"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
		<button v-if="canScrollRight" v-tooltip="i18n.ts.scrollRight" type="button" class="_button" :class="[$style.scrollButton, $style.scrollRight]" :aria-label="i18n.ts.scrollRight" @click="scrollMenu(1)"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
	</nav>
	<div class="_pageContent _pageContainer">
		<NestedRouterView :initialRoute="initialRoute"/>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { getNotificationCategoryIcon, getNotificationCategoryLabel, isNotificationCategory } from '@/utility/notification-types.js';
import type { NotificationCategory } from '@/utility/notification-types.js';

const router = useRouter();
const initialRoute = router.current.route.path === '/my/notifications' ? router.current : router.resolve('/my/notifications')!;
const currentRoute = shallowRef(initialRoute);
const activeTab = computed(() => {
	const child = currentRoute.value.child;
	if (child?.route.path === '/follow-requests') return 'followRequests';
	if (child?.route.path === '/announcements') return 'announcements';
	const tab = child?.props.get('initialTab');
	if (tab === 'direct-notes') return 'directNotes';
	return isNotificationCategory(tab) ? tab : 'all';
});

router.useListener('change', ({ resolved }) => {
	if (resolved.route.path === '/my/notifications') currentRoute.value = resolved;
});

// 窄屏下菜单横向滚动，直接打开靠后的分类时把选中项滚到可见范围。
const scrollerEl = useTemplateRef('scrollerEl');
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

function updateScrollButtons() {
	const scroller = scrollerEl.value;
	if (scroller == null) return;
	canScrollLeft.value = scroller.scrollLeft > 1;
	canScrollRight.value = scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 1;
}

function scrollMenu(direction: number) {
	const scroller = scrollerEl.value;
	if (scroller == null) return;
	scroller.scrollBy({ left: direction * scroller.clientWidth * 0.8, behavior: prefer.s.animation ? 'smooth' : 'instant' });
}

let resizeObserver: ResizeObserver | undefined;
onMounted(() => {
	resizeObserver = new ResizeObserver(updateScrollButtons);
	if (scrollerEl.value) resizeObserver.observe(scrollerEl.value);
	updateScrollButtons();
});
onUnmounted(() => resizeObserver?.disconnect());

watch(activeTab, async () => {
	await nextTick();
	const scroller = scrollerEl.value;
	const active = scroller?.querySelector<HTMLElement>('[aria-current="page"]');
	if (scroller == null || active == null || scroller.scrollWidth <= scroller.clientWidth) return;
	const scrollerRect = scroller.getBoundingClientRect();
	const activeRect = active.getBoundingClientRect();
	if (activeRect.left < scrollerRect.left || activeRect.right > scrollerRect.right) {
		scroller.scrollLeft += activeRect.left - scrollerRect.left - (scrollerRect.width - activeRect.width) / 2;
	}
	updateScrollButtons();
}, { immediate: true, flush: 'post' });

const category = (key: NotificationCategory) => ({
	key,
	title: getNotificationCategoryLabel(key),
	icon: getNotificationCategoryIcon(key),
	to: `/my/notifications/${key}`,
	indicated: false,
});

// 顺序参考主流产品：互动类在前，关注相关相邻，系统通知和站方公告放最后。
const menuItems = computed(() => [{
	key: 'all',
	title: i18n.ts.all,
	icon: 'ti ti-inbox',
	to: '/my/notifications',
	indicated: false,
}, category('mentions'), category('reactions'), category('follows'), {
	key: 'followRequests',
	title: i18n.ts.followRequests,
	icon: 'ti ti-user-plus',
	to: '/my/notifications/follow-requests',
	indicated: $i?.hasPendingReceivedFollowRequest === true,
}, {
	key: 'directNotes',
	title: i18n.ts.directNotes,
	icon: 'ti ti-mail',
	to: '/my/notifications/direct-notes',
	indicated: false,
}, category('system'), {
	key: 'announcements',
	title: i18n.ts.announcements,
	icon: 'ti ti-speakerphone',
	to: '/my/notifications/announcements',
	indicated: $i?.hasUnreadAnnouncement === true,
}]);

definePage(() => ({
	title: i18n.ts.notifications,
	icon: 'ti ti-bell',
}));
</script>

<style lang="scss" module>
.navigation {
	position: relative;
}

.scroller {
	display: flex;
	flex-direction: column;
	gap: 2px;
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}
}

// 样式同 MkPageHeader.tabs 的左右切换按钮
.scrollButton {
	position: absolute;
	top: 0;
	bottom: 0;
	z-index: 1;
	display: grid;
	place-items: center;
	width: 32px;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fgTransparent);
	outline-offset: -3px;

	&:hover {
		color: var(--MI_THEME-fgHighlighted);
	}
}

.scrollLeft {
	left: 0;
	box-shadow: 8px 0 12px var(--MI_THEME-panel);
}

.scrollRight {
	right: 0;
	box-shadow: -8px 0 12px var(--MI_THEME-panel);
}

.item {
	display: flex;
	align-items: center;
	gap: 10px;
	min-height: 44px;
	padding: 10px 12px;
	box-sizing: border-box;
	border-radius: var(--MI-cardRadius);
	font-size: 1em;
	color: var(--MI_THEME-fg);

	> i {
		flex-shrink: 0;
	}

	// 悬停不加深色背景，与其他左侧菜单一致只改变文字颜色
	&:hover {
		text-decoration: none;
		background: none;
		color: var(--MI_THEME-accent);
	}

	&.active {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-accentedBg);
	}
}

.indicator {
	margin-left: auto;
	font-size: 8px;
	color: var(--MI_THEME-indicator);
}

// 与 universal.vue 的 dock 折叠点一致（dock 隐藏时中栏最宽 719px）
@container (max-width: 719px) {
	.layout:global(._pageLayoutWithSidebar) {
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: auto minmax(0, 1fr);

		> :global(._pageContent) {
			grid-column: 1;
			grid-row: 2;
		}
	}

	.scroller {
		flex-direction: row;
		overflow-x: auto;
	}

	.item {
		flex-shrink: 0;
		white-space: nowrap;
	}
}
</style>
