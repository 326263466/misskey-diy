<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal :manualShowing="dialogShowing" preferType="dialog" zPriority="veryLow" :closeOnBackdrop="false" :returnFocusTo="dialogReturnFocus" @close="open = false">
	<div ref="dialogTarget" :class="$style.dialogTarget"></div>
</MkModal>
<div v-show="visible" :class="$style.host" :style="{ top: `${narrow ? 0 : top}px` }">
	<Teleport :to="dialogTarget ?? 'body'" :disabled="!dialogShowing || dialogTarget == null">
		<section v-show="open" data-popup-boundary role="dialog" :aria-modal="dialogShowing || undefined" :class="[$style.window, { [$style.maximized]: dialogShowing, [$style.minimized]: minimized }]" :style="{ '--MI-chatWindowControlsWidth': showWindowControls ? '72px' : '28px' }" :aria-label="i18n.ts.chat">
	<button v-if="minimized" type="button" class="_button" :class="$style.restoreArea" :aria-label="i18n.ts.windowRestore" :aria-expanded="false" @click="minimized = false"></button>
	<header v-if="minimized" :class="$style.header">
		<div :class="$style.title">
			<span :class="$style.titleText"><Mfm :text="pageMetadata?.title || i18n.ts.chat" :plain="true" :nowrap="true"/></span>
		</div>
	</header>
	<div :class="$style.controls">
		<button v-if="!minimized && showWindowControls" v-tooltip="i18n.ts.windowMinimize" type="button" class="_button" :class="$style.control" :aria-label="i18n.ts.windowMinimize" @click="minimized = true"><i class="ti ti-minus" aria-hidden="true"></i></button>
		<button v-if="!minimized && showWindowControls" v-tooltip="maximized ? i18n.ts.windowRestore : i18n.ts.windowMaximize" type="button" class="_button" :class="$style.control" :aria-label="maximized ? i18n.ts.windowRestore : i18n.ts.windowMaximize" :aria-pressed="maximized" @click="toggleMaximized"><i :class="maximized ? 'ti ti-arrows-minimize' : 'ti ti-arrows-maximize'" aria-hidden="true"></i></button>
		<button v-tooltip="i18n.ts.close" type="button" class="_button" :class="$style.control" :aria-label="i18n.ts.close" @click="open = false"><i class="ti ti-x" aria-hidden="true"></i></button>
	</div>
	<div :class="$style.content">
		<KeepAlive>
			<RouterView v-if="open && !minimized && visible" :router="chatRouter"/>
		</KeepAlive>
	</div>
</section>
	</Teleport>
</div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, provide, ref, useTemplateRef, watch } from 'vue';
import MkModal from '@/components/MkModal.vue';
import RouterView from '@/components/global/RouterView.vue';
import type { PageMetadata } from '@/page.js';
import { createRouter, mainRouter } from '@/router.js';
import { provideMetadataReceiver } from '@/page.js';
import { DI } from '@/di.js';
import { i18n } from '@/i18n.js';

const open = defineModel<boolean>('open', { default: false });
const props = withDefaults(defineProps<{
	visible?: boolean;
	top?: number;
	restoreKey?: number;
	path?: string;
	maximize?: boolean;
}>(), { visible: true, top: 0, restoreKey: 0, path: '/chat', maximize: false });
const minimized = ref(false);
const maximized = ref(false);
const narrowViewport = window.matchMedia('(max-width: 500px)');
const narrow = ref(narrowViewport.matches);
const showWindowControls = computed(() => !narrow.value || maximized.value);
const dialogTarget = useTemplateRef('dialogTarget');
const dialogReturnFocus = ref<HTMLElement | null>(null);
const dialogShowing = computed(() => open.value && props.visible && !minimized.value && (narrow.value || maximized.value));

function updateViewport(event: MediaQueryListEvent) {
	narrow.value = event.matches;
	minimized.value = false;
}

narrowViewport.addEventListener('change', updateViewport);

function toggleMaximized(event: MouseEvent) {
	if (!maximized.value && event.currentTarget instanceof HTMLElement) dialogReturnFocus.value = event.currentTarget;

	maximized.value = !maximized.value;
}

onBeforeUnmount(() => narrowViewport.removeEventListener('change', updateViewport));

watch([open, () => props.visible, minimized], ([isOpen, isVisible, isMinimized]) => {
	if (!isOpen || !isVisible || isMinimized) maximized.value = false;
}, { flush: 'sync' });
const chatRouter = createRouter(props.path);
const pageMetadata = ref<PageMetadata | null>(null);

provide(DI.router, chatRouter);
provide(DI.routerCurrentDepth, 0);
provide(DI.pageSidebar, computed(() => null));
provide('chatFloatingLayout', computed(() => !maximized.value));
// 浮窗内的页面标题不能覆盖背景页面和浏览器标题。
provideMetadataReceiver(getter => { pageMetadata.value = getter(); });

chatRouter.navHook = (fullPath, flag) => {
	if (fullPath === '/chat' || fullPath.startsWith('/chat/')) return false;
	mainRouter.pushByPath(fullPath, flag);
	open.value = false;
	return true;
};
chatRouter.addListener('forcePush', ({ fullPath }) => {
	mainRouter.pushByPath(fullPath, 'forcePage');
	open.value = false;
});
chatRouter.addListener('forceReplace', ({ fullPath }) => {
	mainRouter.replaceByPath(fullPath);
	open.value = false;
});
chatRouter.init();

// 首次挂载时窗口可能已经打开，需要立即应用请求的会话和最大化状态。
watch([open, () => props.restoreKey], ([value]) => {
	if (!value) return;
	minimized.value = false;
	maximized.value = props.maximize;
	if (chatRouter.getCurrentFullPath() !== props.path) chatRouter.replaceByPath(props.path);
}, { immediate: true });
</script>

<style lang="scss" module>
.host {
	position: absolute;
	inset: 0;
	z-index: 200;
	pointer-events: none;
}

.dialogTarget {
	width: min(1000px, 100%);
	// 使用明确的可用视口高度，避免异步页面和尺寸容器参与百分比高度计算。
	height: min(720px, calc(100dvh - 64px));
	max-height: 100%;
	flex: none;
	min-width: 0;
	min-height: 0;
	margin: auto;

	@media (max-width: 500px) {
		height: min(720px, calc(100dvh - 32px));
	}
}

.window {
	position: absolute;
	// 为右侧悬浮按钮保留按钮宽度和间距。
	right: calc(max(24px, env(safe-area-inset-right, 0px)) + 56px);
	bottom: 0;
	z-index: 200;
	display: flex;
	flex-direction: column;
	width: min(360px, calc(100% - 96px));
	height: min(520px, calc(100% - 16px));
	min-height: 0;
	box-sizing: border-box;
	overflow: clip;
	border: var(--MI-divider);
	border-radius: var(--MI-radius) var(--MI-radius) 0 0;
	background: var(--MI_THEME-panel);
	box-shadow: 0 8px 32px var(--MI_THEME-shadow);
	pointer-events: auto;

	&.maximized {
		--MI-chatListWidth: 220px;
		position: relative;
		right: auto;
		bottom: auto;
		width: 100%;
		height: 100%;
		border-radius: var(--MI-radius);
	}

	&.minimized {
		height: 52px;
	}
}

.restoreArea {
	position: absolute;
	inset: 0;
	z-index: 4;
	width: 100%;
	height: 100%;
	border-radius: inherit;

	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}

.header {
	display: flex;
	flex: 0 0 52px;
	align-items: center;
	gap: 8px;
	padding: 0 44px 0 16px;
	border-bottom: var(--MI-divider);
}

.title {
	display: flex;
	align-items: center;
	flex: 0 1 auto;
	min-width: 0;
	height: 100%;
	overflow: hidden;
	text-align: left;
	font-size: 1em;
}

.titleText {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: 700;
}

.controls {
	position: absolute;
	top: 0;
	right: 6px;
	z-index: 5;
	display: flex;
	align-items: center;
	gap: 0;
	height: 52px;
	pointer-events: none;
}

.control {
	display: grid;
	flex: 0 0 24px;
	place-items: center;
	width: 24px;
	height: 24px;
	border-radius: var(--MI-radius);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 1em;
	pointer-events: auto;

	> i { font-size: 0.8em; }

	&:hover { background: var(--MI_THEME-buttonHoverBg); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); }
}

.content {
	display: grid;
	grid-template-rows: minmax(0, 1fr);
	flex: 1;
	min-width: 0;
	min-height: 0;
	overflow: clip;

	// 聊天列表和会话各自滚动，外层无需再预留滚动条槽位。
	> :global(._pageContainer) {
		overflow: clip;
		scrollbar-gutter: auto;
		background: var(--MI_THEME-panel);
	}
}
</style>
