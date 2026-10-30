<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<section v-if="section" class="_pageBody" :class="$style.sectionPage" :aria-labelledby="titleId">
		<!-- 与会话页顶栏同高，宽屏也显示标题，避免右侧内容贴顶 -->
		<header :class="$style.sectionHeader">
			<MkA v-if="isCompact" v-tooltip="i18n.ts.goBack" to="/chat" class="_button" :class="$style.back" :aria-label="i18n.ts.goBack">
				<i class="ti ti-arrow-left" aria-hidden="true"></i>
			</MkA>
			<h1 :id="titleId" :class="$style.sectionTitle">{{ section.title }}</h1>
		</header>
		<div :class="$style.sectionContent">
			<XInvitations v-if="section.key === 'invitations'"/>
			<XJoiningRooms v-else-if="section.key === 'joiningRooms'"/>
			<XOwnedRooms v-else-if="section.key === 'ownedRooms'"/>
		</div>
	</section>
	<div v-else :class="$style.empty">
		<section :class="$style.welcome" :aria-labelledby="welcomeTitleId">
			<i :class="[$style.emptyIcon, navigationIcons.chat]" aria-hidden="true"></i>
			<h2 :id="welcomeTitleId" :class="$style.prompt">{{ i18n.ts._chat.selectConversation }}</h2>
			<div v-if="quickActions" :class="$style.actions">
				<button type="button" class="_button" :class="$style.primaryAction" @click="quickActions.startDirectMessage">
					<i class="ti ti-message-plus" aria-hidden="true"></i>
					<span>{{ i18n.ts._chat.newDirectMessage }}</span>
				</button>
				<button type="button" class="_button" :class="$style.secondaryAction" @click="quickActions.createRoom">
					<i class="ti ti-users-plus" aria-hidden="true"></i>
					<span>{{ i18n.ts._chat.createRoom }}</span>
				</button>
				<button type="button" class="_button" :class="$style.secondaryAction" @click="quickActions.joinRoom">
					<i class="ti ti-login-2" aria-hidden="true"></i>
					<span>{{ i18n.ts._chat.joinRoom }}</span>
				</button>
			</div>
		</section>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, inject, ref, useId, watch } from 'vue';
import type { Ref } from 'vue';
import { i18n } from '@/i18n.js';
import { navigationIcons } from '@/navigation-icons.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { DI } from '@/di.js';
import XInvitations from './home.invitations.vue';
import XJoiningRooms from './home.joiningRooms.vue';
import XOwnedRooms from './home.ownedRooms.vue';

const router = useRouter();
const pageActive = inject(DI.pageActive, ref(true));
const chatCompactLayout = inject<Readonly<Ref<boolean>> | null>('chatCompactLayout', null);
const quickActions = inject<{
	startDirectMessage: () => void;
	createRoom: () => void;
	joinRoom: () => void;
} | null>('chatQuickActions', null);
const titleId = useId();
const welcomeTitleId = useId();
const currentPath = computed(() => router.currentRef.value._parsedRoute.fullPath.split(/[?#]/)[0]);
// 隐藏的缓存实例保留自己的子页面，避免跟随全局路由重复挂载。
const sectionPath = ref(pageActive.value ? currentPath.value : '');
watch([pageActive, currentPath], ([active, path]) => {
	if (active) sectionPath.value = path;
});
const sections = {
	'/chat/invitations': { key: 'invitations', title: i18n.ts._chat.invitations, icon: 'ti ti-mail-opened' },
	'/chat/joining-rooms': { key: 'joiningRooms', title: i18n.ts._chat.joiningRooms, icon: 'ti ti-users-group' },
	'/chat/owned-rooms': { key: 'ownedRooms', title: i18n.ts._chat.yourRooms, icon: 'ti ti-crown' },
} as const;
const section = computed(() => sections[sectionPath.value as keyof typeof sections] ?? null);
const isCompact = computed(() => chatCompactLayout?.value ?? false);

definePage(() => ({
	title: section.value?.title ?? i18n.ts.chat,
	icon: section.value?.icon ?? navigationIcons.chat,
}));
</script>

<style lang="scss" module>
@use '../../styles/chat-header.scss';

.root {
	height: 100%;
	min-height: 0;
}

.sectionPage {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	padding-bottom: 0;
	overflow: clip;
}

.sectionHeader {
	position: relative;
	z-index: 1;
	display: flex;
	flex: 0 0 var(--MI-chatHeaderHeight);
	align-items: center;
	gap: 8px;
	height: var(--MI-chatHeaderHeight);
	min-height: var(--MI-chatHeaderHeight);
	box-sizing: border-box;
	// 与会话页顶栏一致，右侧给窗口控制按钮留位
	padding: 0 calc(20px + var(--MI-chatWindowControlsWidth, 0px)) 0 16px;
	border-bottom: var(--MI-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 88%, transparent);
}

.sectionTitle {
	flex: 1;
	min-width: 0;
	margin: 0;
	overflow: hidden;
	color: var(--MI_THEME-fg);
	font-size: 1.2em;
	font-weight: 650;
	line-height: 1.5;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.sectionContent {
	flex: 1;
	min-height: 0;
	padding: var(--MI-cardPadding);
	box-sizing: border-box;
	overflow-y: auto;
	overscroll-behavior: contain;
	scrollbar-gutter: stable;
}

.back {
	@include chat-header.action;
}

.empty {
	display: grid;
	height: 100%;
	place-items: center;
	padding: 28px;
	box-sizing: border-box;
	background: var(--MI_THEME-panel);
}

.welcome {
	display: flex;
	flex-direction: column;
	align-items: center;
	width: min(100%, 440px);
	text-align: center;
}

.emptyIcon {
	margin-bottom: 14px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 28px;
}

.prompt {
	max-width: 100%;
	margin: 0;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 15px;
	font-weight: 500;
	line-height: 1.35;
}

.actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 10px;
	margin-top: 20px;
}

.primaryAction,
.secondaryAction {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	min-height: 40px;
	padding: 0 16px;
	box-sizing: border-box;
	border-radius: 8px;
	font-size: 14px;
	font-weight: 600;
	line-height: 1;
	transition: background-color 0.15s, border-color 0.15s;

	> i { font-size: 18px; }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
}

.primaryAction {
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);

	&:hover { background: var(--MI_THEME-accentHover); }
}

.secondaryAction {
	border: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 9%, transparent);
	background: color-mix(in srgb, var(--MI_THEME-panel) 82%, transparent);
	color: var(--MI_THEME-fg);

	&:hover {
		background: var(--MI_THEME-panel);
		border-color: color-mix(in srgb, var(--MI_THEME-fg) 16%, transparent);
	}
}

@media (max-width: 560px) {
	.empty { padding: 24px; }

	.actions {
		width: 100%;
		flex-direction: column;
	}

	.primaryAction,
	.secondaryAction { width: 100%; }
}
</style>
