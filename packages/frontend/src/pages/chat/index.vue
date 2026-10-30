<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="container" :class="[$style.container, { [$style.withWindowControls]: showFullPageWindowControls }]">
<div :class="[$style.layout, { [$style.hasSelection]: selectedTo != null }]">
	<aside :class="$style.conversations" role="navigation" :aria-label="i18n.ts._chat.history">
		<div :class="$style.conversationToolbar">
			<header :class="$style.conversationsHeader">
				<div :class="$style.titleBlock">
					<span :class="$style.listTitle">{{ i18n.ts.chat }}</span>
				</div>
				<button v-tooltip="i18n.ts.more" type="button" class="_button" :class="$style.menuButton" :aria-label="i18n.ts.more" aria-haspopup="menu" @click="openMenu">
					<i class="ti ti-dots" aria-hidden="true"></i>
				</button>
			</header>
			<div :class="$style.navigation">
				<div :class="$style.search">
					<i class="ti ti-search" aria-hidden="true"></i>
					<input ref="searchInput" v-model="query" type="search" :placeholder="i18n.ts._chat.searchMessages" :aria-label="i18n.ts._chat.searchMessages" autocomplete="off" enterkeyhint="search" @keydown="onSearchKeydown">
					<button v-if="query" type="button" class="_button" :class="$style.clearSearch" :aria-label="i18n.ts.clear" @click="clearSearch">
						<i class="ti ti-x" aria-hidden="true"></i>
					</button>
				</div>
				<nav :class="$style.tabs" :aria-label="i18n.ts.chat">
					<MkA to="/chat" :class="[$style.tab, { [$style.active]: chatSelected }]" :aria-current="chatSelected ? 'page' : undefined">
						<i :class="navigationIcons.chat" aria-hidden="true"></i>{{ i18n.ts.chat }}
					</MkA>
					<MkA to="/chat/groups" :class="[$style.tab, { [$style.active]: groupsSelected }]" :aria-current="groupsSelected ? 'page' : undefined">
						<i class="ti ti-users" aria-hidden="true"></i>{{ i18n.ts._chat.groups }}
					</MkA>
				</nav>
			</div>
		</div>
		<div :class="$style.conversationViewport">
			<div :class="$style.conversationList" tabindex="0" :aria-label="i18n.ts._chat.history">
				<MkChatHistories :key="historiesVersion" all compact hideLoading :selectedTo="selectedTo" :query="query" :roomsOnly="groupsSelected"/>
			</div>
		</div>
	</aside>
	<main :class="$style.content">
		<NestedRouterView :initialRoute="initialRoute" hideLoading/>
	</main>
</div>
<div v-if="showFullPageWindowControls" :class="$style.windowControls">
	<button v-tooltip="i18n.ts.windowMinimize" type="button" class="_button" :class="$style.windowControl" :aria-label="i18n.ts.windowMinimize" @click="fullPageChatControls?.minimize()">
		<i class="ti ti-minus" aria-hidden="true"></i>
	</button>
	<button v-tooltip="i18n.ts._chat.openChatWindow" type="button" class="_button" :class="$style.windowControl" :aria-label="i18n.ts._chat.openChatWindow" @click="fullPageChatControls?.restoreWindow()">
		<i class="ti ti-arrows-minimize" aria-hidden="true"></i>
	</button>
</div>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, inject, nextTick, onBeforeUnmount, onMounted, provide, ref, useTemplateRef } from 'vue';
import type { Ref } from 'vue';
import { onSearchKeydown } from '@/utility/search-keydown.js';
import type { PageMetadata } from '@/page.js';
import { definePage, provideMetadataReceiver } from '@/page.js';
import { i18n } from '@/i18n.js';
import { navigationIcons } from '@/navigation-icons.js';
import { useRouter } from '@/router.js';
import MkChatHistories from '@/components/MkChatHistories.vue';
import * as os from '@/os.js';
import { deviceKind } from '@/utility/device-kind.js';

const router = useRouter();
const floatingLayout = inject<Readonly<Ref<boolean>> | null>('chatFloatingLayout', null);
const mobileLayout = inject<Readonly<Ref<boolean>>>('chatMobileLayout', computed(() => deviceKind === 'smartphone' || window.innerWidth <= 500));
const fullPageChatControls = inject<{
	minimize: () => void;
	restoreWindow: () => void;
} | null>('chatFullPageControls', null);
const container = useTemplateRef('container');
const compactLayout = ref(floatingLayout?.value ?? window.matchMedia('(max-width: 800px)').matches);
const layoutObserver = new ResizeObserver(([entry]) => { compactLayout.value = entry.contentRect.width <= 800; });
provide('chatCompactLayout', compactLayout);
const initialRoute = router.current.route.name === 'chat' ? router.current : router.resolve('/chat')!;
const query = ref('');
const searchInput = useTemplateRef('searchInput');
const historiesVersion = ref(0);
const currentPath = computed(() => router.currentRef.value._parsedRoute.fullPath.split(/[?#]/)[0]);
// 群聊邀请、已加入和已创建的群聊从“更多”菜单进入，都归在群组标签下
const roomSectionPaths = ['/chat/invitations', '/chat/joining-rooms', '/chat/owned-rooms'];
const groupsSelected = computed(() => currentPath.value === '/chat/groups' || roomSectionPaths.includes(currentPath.value));
const chatSelected = computed(() => !groupsSelected.value);
const metadata = ref<PageMetadata>({ title: i18n.ts.chat, icon: navigationIcons.chat });
const selectedTo = computed(() => {
	const roomPage = currentPath.value.match(/^\/chat\/room\/([^/]+)\/(?:members|announcement)\/?$/);
	if (roomPage) return `/chat/room/${roomPage[1]}`;
	if (currentPath.value.startsWith('/chat/user/') || currentPath.value.startsWith('/chat/room/') || currentPath.value.startsWith('/chat/messages/')) return currentPath.value;
	// 窄屏下有选中项才显示右侧内容
	if (roomSectionPaths.includes(currentPath.value)) return currentPath.value;
	return null;
});
const showFullPageWindowControls = computed(() => fullPageChatControls != null && floatingLayout?.value !== true && !mobileLayout.value && selectedTo.value == null);

onMounted(() => {
	if (!container.value) return;
	compactLayout.value = container.value.clientWidth <= 800;
	layoutObserver.observe(container.value);
});

onBeforeUnmount(() => {
	layoutObserver.disconnect();
});

function clearSearch() {
	query.value = '';
	void nextTick(() => searchInput.value?.focus());
}

async function startDirectMessage() {
	const user = await os.selectUser({ includeSelf: false, localOnly: true });
	router.push('/chat/user/:userId', { params: { userId: user.id } });
}

function openMenu(ev: MouseEvent) {
	os.popupMenu([{
		text: i18n.ts._chat.newDirectMessage,
		icon: 'ti ti-message-plus',
		action: () => { void startDirectMessage(); },
	}, {
		text: i18n.ts._chat.createRoom,
		icon: 'ti ti-users-plus',
		action: () => { void createRoom(); },
	}, {
		text: i18n.ts._chat.joinRoom,
		icon: 'ti ti-login-2',
		action: () => { void joinRoom(); },
	}, { type: 'divider' }, {
		text: i18n.ts._chat.invitations,
		icon: 'ti ti-mail-opened',
		active: currentPath.value === '/chat/invitations',
		action: () => router.pushByPath('/chat/invitations'),
	}, {
		text: i18n.ts._chat.joiningRooms,
		icon: 'ti ti-users-group',
		active: currentPath.value === '/chat/joining-rooms',
		action: () => router.pushByPath('/chat/joining-rooms'),
	}, {
		text: i18n.ts._chat.yourRooms,
		icon: 'ti ti-crown',
		active: currentPath.value === '/chat/owned-rooms',
		action: () => router.pushByPath('/chat/owned-rooms'),
	}], ev.currentTarget ?? ev.target);
}

function openRoom(roomId: string) {
	historiesVersion.value++;
	router.push('/chat/room/:roomId', { params: { roomId } });
}

function createRoom() {
	const { dispose } = os.popup(defineAsyncComponent(() => import('./group-create-dialog.vue')), {}, {
		created: room => { openRoom(room.id); },
		closed: () => { dispose(); },
	});
}

function joinRoom() {
	const { dispose } = os.popup(defineAsyncComponent(() => import('./group-join-dialog.vue')), {}, {
		selected: room => { openRoom(room.id); },
		closed: () => { dispose(); },
	});
}

provide('chatQuickActions', {
	startDirectMessage: () => { void startDirectMessage(); },
	createRoom,
	joinRoom,
});

definePage(() => metadata.value);
provideMetadataReceiver(getter => { metadata.value = getter(); });
</script>

<style lang="scss" module>
@use '../../styles/search.scss' as search;

@use '../../styles/chat-header.scss';

.container {
	position: relative;
	container-type: inline-size;
	height: 100%;
	min-height: 0;
	overflow: clip;
	background: var(--MI_THEME-panel);
}

.windowControls {
	position: absolute;
	top: 0;
	right: 12px;
	z-index: 2;
	display: flex;
	align-items: center;
	gap: 6px;
	height: 56px;
}

.windowControl {
	@include chat-header.plainAction;
}

.layout {
	// 桌面 IM 使用满宽双栏，外框保持直角；圆角只用于列表项和可交互控件。
	display: grid;
	grid-template-columns: clamp(280px, 25vw, 336px) minmax(0, 1fr);
	grid-template-rows: minmax(0, 1fr);
	height: 100%;
	min-height: 0;
	overflow: clip;
	background: var(--MI_THEME-panel);
}

.conversations {
	display: grid;
	grid-template-rows: auto minmax(0, 1fr);
	min-width: 0;
	min-height: 0;
	overflow: clip;
	border-right: var(--MI-divider);
	background: var(--MI_THEME-panel);
}

.conversationToolbar {
	min-width: 0;
}

.conversationsHeader {
	display: flex;
	align-items: center;
	gap: 8px;
	height: var(--MI-chatHeaderHeight);
	box-sizing: border-box;
	padding: 0 12px 0 16px;
	border-bottom: var(--MI-divider);
	background: var(--MI_THEME-panel);
}

.titleBlock {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-width: 0;
	gap: 0;
}

.listTitle {
	min-width: 0;
	overflow: hidden;
	font-size: 1.125em;
	font-weight: 600;
	line-height: 1.2;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--MI_THEME-fg);
}

.navigation {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 8px 12px;
}

.search {
	@include search.container;
	--MI-searchHeight: 34px;
	width: 100%;
	box-sizing: border-box;
	border-radius: 8px;
	> i { @include search.icon; font-size: 14px; }
	> input {
		@include search.input;
		@include search.hideNativeClear;
	}

	@media (prefers-reduced-motion: no-preference) {
		transition: background-color 0.15s, border-color 0.15s;
	}
}

.clearSearch {
	@include search.clear;
	> i { font-size: 13px; }
}

.menuButton {
	@include chat-header.action;
	width: var(--MI-chatHeaderActionSize);
	height: var(--MI-chatHeaderActionSize);
	flex: 0 0 var(--MI-chatHeaderActionSize);
	border-radius: 8px;
	color: var(--MI_THEME-fgTransparent);
	pointer-events: auto;

	&:hover:not(:disabled) {
		color: var(--MI_THEME-fg);
	}

	> i { font-size: 14px; }
}

.conversationViewport {
	// 滚动内容脱离网格尺寸计算，搜索栏和列表边界不随内容更新移动。
	position: relative;
	min-width: 0;
	min-height: 0;
	contain: size layout paint;
}

.conversationList {
	position: absolute;
	inset: 0;
	overflow-x: hidden;
	overflow-y: auto;
	overscroll-behavior: none;
	overflow-anchor: none;
	scrollbar-gutter: stable;
	padding-bottom: var(--MI-minBottomSpacing);
	box-sizing: border-box;
	scroll-padding-bottom: var(--MI-minBottomSpacing);
	background: var(--MI_THEME-panel);

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -2px;
	}
}

.content {
	position: relative;
	min-width: 0;
	min-height: 0;
	overflow: clip;
	// 子路由尚未加载时保留卡片底色，避免切换时闪出页面背景。
	background: var(--MI_THEME-panel);
}

.tabs {
	display: flex;
	gap: 4px;
	padding: 3px;
	border-radius: 8px;
	background: var(--MI_THEME-buttonBg);
}

.tab {
	display: flex;
	flex: 1;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-width: 0;
	min-height: 32px;
	padding: 0 8px;
	box-sizing: border-box;
	border: 1px solid transparent;
	border-radius: 6px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 13px;
	text-decoration: none;
	transition: background-color 0.15s, border-color 0.15s, color 0.15s;

	> i { font-size: 14px; }
	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
		color: var(--MI_THEME-fg);
	}
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 1px; }

	&.active {
		background: var(--MI_THEME-panel);
		border-color: var(--MI_THEME-divider); // divider-exempt: active room control outline
		color: var(--MI_THEME-accent);
		font-weight: 600;
	}
}

@container (max-width: 800px) {
	.conversationsHeader {
		padding-right: calc(12px + var(--MI-chatWindowControlsWidth, 0px));
	}

	.withWindowControls .conversationsHeader {
		padding-right: 74px;
	}

	.conversations {
		border-right: 0;
	}

	.layout {
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr);

		&.hasSelection > .conversations {
			display: none;
		}

		// 只由聊天布局自身的选中状态切换，不能让其他未选中类的祖先隐藏会话。
		&:not(.hasSelection) > .content {
			display: none;
		}
	}
}
</style>
