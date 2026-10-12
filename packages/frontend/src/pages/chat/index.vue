<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="container" :class="$style.container">
<div :class="[$style.layout, { [$style.hasSelection]: selectedTo != null }]">
	<aside :class="$style.conversations" role="navigation" :aria-label="i18n.ts._chat.history">
		<header :class="$style.conversationsHeader">
			<label v-if="searchSelected" :class="$style.search">
				<i class="ti ti-search" aria-hidden="true"></i>
				<input ref="searchInput" v-model="query" type="search" :placeholder="i18n.ts.search" :aria-label="i18n.ts.search" autocomplete="off">
			</label>
			<span v-else :class="$style.listTitle">{{ i18n.ts.chat }}</span>
			<button v-tooltip="i18n.ts.more" type="button" class="_button" :class="$style.menuButton" :aria-label="i18n.ts.more" aria-haspopup="menu" @click="openMenu">
				<i class="ti ti-plus" aria-hidden="true"></i>
			</button>
		</header>
		<div class="_scrollbarOnHover" :class="$style.conversationList">
			<MkChatHistories :key="historiesVersion" all compact hideLoading :selectedTo="selectedTo" :query="searchSelected ? query : ''" :roomsOnly="groupsSelected"/>
		</div>
		<nav :class="$style.tabs" :aria-label="i18n.ts.chat">
			<MkA to="/chat" :class="[$style.tab, { [$style.active]: !groupsSelected && !searchSelected }]" :aria-current="!groupsSelected && !searchSelected ? 'page' : undefined">
				<i class="ti ti-message-circle" aria-hidden="true"></i>{{ i18n.ts.chat }}
			</MkA>
			<MkA to="/chat/groups" :class="[$style.tab, { [$style.active]: groupsSelected }]" :aria-current="groupsSelected ? 'page' : undefined">
				<i class="ti ti-users" aria-hidden="true"></i>{{ i18n.ts._chat.groups }}
			</MkA>
			<MkA to="/chat/search" :class="[$style.tab, { [$style.active]: searchSelected }]" :aria-current="searchSelected ? 'page' : undefined">
				<i class="ti ti-search" aria-hidden="true"></i>{{ i18n.ts.search }}
			</MkA>
		</nav>
	</aside>
	<main :class="$style.content">
		<NestedRouterView :initialRoute="initialRoute" hideLoading/>
	</main>
</div>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, inject, nextTick, onBeforeUnmount, onMounted, provide, ref, useTemplateRef, watch } from 'vue';
import type { Ref } from 'vue';
import type { PageMetadata } from '@/page.js';
import { definePage, provideMetadataReceiver } from '@/page.js';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';
import MkChatHistories from '@/components/MkChatHistories.vue';
import * as os from '@/os.js';

const router = useRouter();
const floatingLayout = inject<Readonly<Ref<boolean>> | null>('chatFloatingLayout', null);
const container = useTemplateRef('container');
const compactLayout = ref(floatingLayout?.value ?? window.matchMedia('(max-width: 800px)').matches);
const layoutObserver = new ResizeObserver(([entry]) => { compactLayout.value = entry.contentRect.width <= 800; });
provide('chatCompactLayout', compactLayout);
const initialRoute = router.current.route.name === 'chat' ? router.current : router.resolve('/chat')!;
const query = ref('');
const searchInput = useTemplateRef('searchInput');
const historiesVersion = ref(0);
const currentPath = computed(() => router.currentRef.value._parsedRoute.fullPath.split(/[?#]/)[0]);
const groupsSelected = computed(() => currentPath.value === '/chat/groups');
const searchSelected = computed(() => currentPath.value === '/chat/search');
const metadata = ref<PageMetadata>({ title: i18n.ts.chat, icon: 'ti ti-message-circle' });
const selectedTo = computed(() => {
	const path = router.currentRef.value._parsedRoute.fullPath;
	return path.startsWith('/chat/user/') || path.startsWith('/chat/room/') ? path : null;
});

onMounted(() => {
	if (!container.value) return;
	compactLayout.value = container.value.clientWidth <= 800;
	layoutObserver.observe(container.value);
});

onBeforeUnmount(() => {
	layoutObserver.disconnect();
});

watch(searchSelected, async selected => {
	if (!selected) return;
	await nextTick();
	searchInput.value?.focus();
}, { immediate: true });

function openMenu(ev: MouseEvent) {
	os.popupMenu([{
		text: i18n.ts._chat.newDirectMessage,
		icon: 'ti ti-message-plus',
		action: async () => {
			const user = await os.selectUser({ includeSelf: false, localOnly: true });
			router.push('/chat/user/:userId', { params: { userId: user.id } });
		},
	}, {
		text: i18n.ts._chat.createRoom,
		icon: 'ti ti-users-plus',
		action: () => { void createRoom(); },
	}, {
		text: i18n.ts._chat.joinRoom,
		icon: 'ti ti-login-2',
		action: () => { void joinRoom(); },
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

definePage(() => metadata.value);
provideMetadataReceiver(getter => { metadata.value = getter(); });
</script>

<style lang="scss" module>
.container {
	container-type: inline-size;
	height: 100%;
	min-height: 0;
}

.layout {
	display: grid;
	grid-template-columns: minmax(200px, var(--MI-chatListWidth, 220px)) minmax(0, 1fr);
	height: 100%;
	min-height: 0;
	overflow: clip;
	background: var(--MI_THEME-panel);
}

.conversations {
	display: flex;
	flex-direction: column;
	min-width: 0;
	min-height: 0;
	border-right: var(--MI-divider);
	background: var(--MI_THEME-panel);
}

.conversationsHeader {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	gap: 8px;
	height: 52px;
	box-sizing: border-box;
	padding: 8px 12px;
	border-bottom: var(--MI-divider);
}

.listTitle {
	flex: 1;
	min-width: 0;
	padding-left: 4px;
	font-size: 1.15em;
	font-weight: 700;
}

.search {
	display: flex;
	flex: 1;
	align-items: center;
	gap: 8px;
	min-width: 0;
	height: 36px;
	box-sizing: border-box;
	padding: 0 10px;
	border: 1px solid transparent;
	border-radius: 8px;
	background: var(--MI_THEME-buttonBg);
	color: var(--MI_THEME-fgTransparentWeak);

	&:focus-within { border-color: var(--MI_THEME-accent); }
	> i { flex-shrink: 0; font-size: 1em; }
	> input {
		min-width: 0;
		width: 100%;
		padding: 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--MI_THEME-fg);
		font: inherit;

		&::placeholder { color: var(--MI_THEME-fgTransparentWeak); opacity: 1; }
	}
}

.menuButton {
	display: grid;
	flex: 0 0 28px;
	place-items: center;
	width: 28px;
	height: 28px;
	border-radius: 8px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 1em;
	pointer-events: auto;

	// 与聊天窗口的最小化、最大化、关闭按钮同一尺寸和悬停效果。
	> i { font-size: 1.1em; }

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
		color: var(--MI_THEME-fg);
	}
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}

.conversationList {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
}

.content {
	position: relative;
	min-width: 0;
	min-height: 0;
	overflow: clip;
	// 子路由尚未加载时保留会话底色，避免切换时闪出不同背景。
	background-color: var(--MI_THEME-buttonBg);
}

.tabs {
	display: flex;
	flex-shrink: 0;
	gap: 4px;
	padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
	border-top: var(--MI-divider);
}

.tab {
	display: flex;
	flex: 1;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-width: 0;
	min-height: 40px;
	border-radius: 8px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 13px;
	text-decoration: none;

	> i { font-size: 1.25em; }
	&:hover { color: var(--MI_THEME-accent); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
	&.active { color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); font-weight: 600; }
}

@container (max-width: 800px) {
	.conversationsHeader {
		padding-right: calc(12px + var(--MI-chatWindowControlsWidth, 0px));
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
