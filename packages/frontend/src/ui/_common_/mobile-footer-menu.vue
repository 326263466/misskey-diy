<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<nav :class="$style.root" :aria-label="i18n.ts.navbar">
	<button type="button" :class="$style.item" class="_button" :aria-label="i18n.ts.menu" :aria-expanded="drawerMenuShowing" @click="drawerMenuShowing = true">
		<div :class="$style.itemInner">
			<span :class="$style.itemIcon">
				<i class="ti ti-menu-2" aria-hidden="true"></i>
				<span v-if="menuIndicated" :class="$style.itemIndicator" class="_blink"><i class="_indicatorCircle"></i></span>
			</span>
		</div>
		<span :class="$style.itemText">{{ i18n.ts.menu }}</span>
	</button>

	<button type="button" :class="[$style.item, { [$style.active]: homeActive }]" class="_button" :aria-current="homeActive ? 'page' : undefined" @click="mainRouter.push('/')">
		<div :class="$style.itemInner">
			<span :class="$style.itemIcon"><i :class="navigationIcons.home" aria-hidden="true"></i></span>
		</div>
		<span :class="$style.itemText">{{ i18n.ts.home }}</span>
	</button>
	<button type="button" :class="[$style.item, { [$style.active]: pageActive('/timeline') }]" class="_button" :aria-current="pageActive('/timeline') ? 'page' : undefined" @click="mainRouter.push('/timeline')">
		<div :class="$style.itemInner">
			<span :class="$style.itemIcon"><i :class="navigationIcons.timeline" aria-hidden="true"></i></span>
		</div>
		<span :class="$style.itemText">{{ i18n.ts.timeline }}</span>
	</button>

	<button v-if="$i && $i.policies.chatAvailability !== 'unavailable'" type="button" :class="[$style.item, { [$style.active]: chatOpen || pathActive('/chat') }]" class="_button" :aria-label="i18n.ts.chat" :aria-current="pageActive('/chat') ? 'page' : undefined" @click="openChat ? openChat() : mainRouter.push('/chat')">
		<div :class="$style.itemInner">
			<span ref="chatIcon" :class="$style.itemIcon">
				<i :class="navigationIcons.chat" aria-hidden="true"></i>
				<span v-if="$i.hasUnreadChatMessages" :class="$style.itemIndicator">
					<i class="_indicatorCircle"></i>
				</span>
			</span>
		</div>
		<span :class="$style.itemText">{{ i18n.ts.chat }}</span>
	</button>
	<button v-else-if="!pageHasSearch" type="button" :class="[$style.item, { [$style.active]: pageActive('/search') }]" class="_button" :aria-label="i18n.ts.search" :aria-current="pageActive('/search') ? 'page' : undefined" @click="mainRouter.push('/search')">
		<div :class="$style.itemInner"><span :class="$style.itemIcon"><i :class="navigationIcons.search" aria-hidden="true"></i></span></div>
		<span :class="$style.itemText">{{ i18n.ts.search }}</span>
	</button>
	<button v-else-if="$i" type="button" :class="[$style.item, { [$style.active]: pageActive('/my/notifications') }]" class="_button" :aria-label="i18n.ts.notifications" :aria-current="pageActive('/my/notifications') ? 'page' : undefined" @click="mainRouter.pushByPath('/my/notifications')">
		<div :class="$style.itemInner">
			<span :class="$style.itemIcon">
				<i :class="navigationIcons.notifications" aria-hidden="true"></i>
				<span v-if="$i.hasUnreadNotification || $i.hasUnreadAnnouncement" :class="$style.itemIndicator"><i class="_indicatorCircle"></i></span>
			</span>
		</div>
		<span :class="$style.itemText">{{ i18n.ts.notifications }}</span>
	</button>
	<button v-else type="button" :class="[$style.item, { [$style.active]: pageActive('/announcements') }]" class="_button" :aria-label="i18n.ts.announcements" :aria-current="pageActive('/announcements') ? 'page' : undefined" @click="mainRouter.pushByPath('/announcements')">
		<div :class="$style.itemInner"><span :class="$style.itemIcon"><i :class="navigationIcons.announcements" aria-hidden="true"></i></span></div>
		<span :class="$style.itemText">{{ i18n.ts.announcements }}</span>
	</button>

	<button v-if="$i" type="button" :class="$style.item" class="_button" :aria-label="i18n.ts.widgets" :aria-expanded="widgetsShowing" @click="widgetsShowing = true">
		<div :class="$style.itemInner">
			<span :class="$style.itemIcon"><i :class="navigationIcons.widgets" aria-hidden="true"></i></span>
		</div>
		<span :class="$style.itemText">{{ i18n.ts.widgets }}</span>
	</button>
	<button v-else type="button" :class="$style.item" class="_button" :aria-label="i18n.ts.login" @click="pleaseLogin({ message: '' })">
		<div :class="$style.itemInner"><span :class="$style.itemIcon"><i class="ti ti-login-2" aria-hidden="true"></i></span></div>
		<span :class="$style.itemText">{{ i18n.ts.login }}</span>
	</button>
	<button v-if="showPost && postAvailable && !drawerMenuShowing && !widgetsShowing" type="button" class="_button" :class="$style.post" :aria-label="homeActive ? i18n.ts._article.publish : i18n.ts._postForm.post" @click="mainRouter.pushByPath(homeActive ? '/articles/new' : '/compose')">
		<i class="ti ti-plus" aria-hidden="true"></i>
	</button>
</nav>
</template>

<script lang="ts" setup>
import { computed, inject, ref, useTemplateRef } from 'vue';
import { $i } from '@/i.js';
import { mainRouter } from '@/router.js';
import { navbarItemDef } from '@/navbar.js';
import { navigationIcons } from '@/navigation-icons.js';
import { i18n } from '@/i18n.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { useGlobalEvent } from '@/events.js';
import { nudgeChatEntry } from '@/utility/chat-conversations.js';
import { DI } from '@/di.js';
import { instance } from '@/instance.js';

const drawerMenuShowing = defineModel<boolean>('drawerMenuShowing');
const widgetsShowing = defineModel<boolean>('widgetsShowing');

const props = withDefaults(defineProps<{
	openChat?: () => void;
	chatOpen?: boolean;
	showPost?: boolean;
}>(), {
	chatOpen: false,
	showPost: true,
});

const currentPath = computed(() => mainRouter.currentRef.value._parsedRoute.fullPath.split(/[?#]/)[0]);
const hasGlobalSearch = inject(DI.hasGlobalSearch, ref(false));
const chatIcon = useTemplateRef('chatIcon');
useGlobalEvent('chatPoked', () => nudgeChatEntry(chatIcon.value));
const homeActive = computed(() => !props.chatOpen && (currentPath.value === '/' || currentPath.value.startsWith('/articles/category/') || currentPath.value.startsWith('/articles/tag/')));
const pageHasSearch = computed(() => hasGlobalSearch.value || pageActive('/search') || homeActive.value && ($i != null || !instance.requireSetup && instance.clientOptions.openGuestAccess === true));
const postAvailable = computed(() => !props.chatOpen && (homeActive.value || pathActive('/timeline')));

function pageActive(path: string): boolean {
	return !props.chatOpen && pathActive(path);
}

function pathActive(path: string): boolean {
	return currentPath.value === path || currentPath.value.startsWith(`${path}/`);
}

const menuIndicated = computed(() => {
	for (const def in navbarItemDef) {
		if (def === 'chat') continue; // 聊天未读已在底部入口显示。
		if (navbarItemDef[def].indicated) return true;
	}
	return false;
});

</script>

<style lang="scss" module>
.root {
	position: absolute;
	inset-inline: max(var(--MI-mobileFooterInset), env(safe-area-inset-left)) max(var(--MI-mobileFooterInset), env(safe-area-inset-right));
	bottom: max(var(--MI-mobileFooterInset), env(safe-area-inset-bottom));
	z-index: 10;
	padding: 3px;
	display: grid;
	grid-template-columns: repeat(5, minmax(0, 1fr));
	height: var(--MI-mobileFooterHeight);
	max-width: 460px;
	margin-inline: auto;
	box-sizing: border-box;
	border: var(--MI-divider);
	border-radius: calc(var(--MI-mobileFooterHeight) / 2);
	background: linear-gradient(180deg, color-mix(in srgb, var(--MI_THEME-navBg) 86%, transparent), color-mix(in srgb, var(--MI_THEME-navBg) 72%, transparent));
	backdrop-filter: blur(24px) saturate(1.6);
	-webkit-backdrop-filter: blur(24px) saturate(1.6);
	box-shadow: inset 0 1px 0 color-mix(in srgb, var(--MI_THEME-fgOnAccent) 60%, transparent), 0 6px 24px color-mix(in srgb, var(--MI_THEME-shadow) 65%, transparent);
	color: var(--MI_THEME-navFg);
}

.item {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 2px;
	min-width: 0;
	min-height: 48px;
	padding: 2px 0;
	border-radius: 24px;

	&.active {
		color: var(--MI_THEME-navActive);
		background: color-mix(in srgb, var(--MI_THEME-accentedBg) 70%, transparent);
	}

	&:hover { color: var(--MI_THEME-navActive); }
	&:active { opacity: .75; }

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -2px;
	}
}

.post {
	position: absolute;
	right: max(var(--MI-margin), env(safe-area-inset-right, 0px));
	bottom: calc(100% + var(--MI-margin));
	z-index: 2;
	display: grid;
	place-items: center;
	width: 52px;
	height: 52px;
	border-radius: 50%;
	background: linear-gradient(90deg, var(--MI_THEME-buttonGradateA), var(--MI_THEME-buttonGradateB));
	color: var(--MI_THEME-fgOnAccent);
	box-shadow: 0 3px 12px var(--MI_THEME-shadow);
	font-size: 24px;

	&:hover, &:active {
		background: var(--MI_THEME-accent);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 3px;
	}
}

.itemInner {
	position: relative;
	padding: 0;
	width: 24px;
	height: 24px;
	display: flex;
	align-items: center;
	justify-content: center;
}

.itemIcon {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 1.28em;
	height: 1.28em;
	font-size: 18px;
}

.itemText {
	max-width: 100%;
	font-size: 11px;
	font-weight: 500;
	line-height: 14px;
	white-space: nowrap;
}

.itemIndicator {
	position: absolute;
	top: -4px;
	left: 50%;
	transform-origin: top left;
	color: var(--MI_THEME-indicator);
	font-size: 10px;
	pointer-events: none;
}
</style>
