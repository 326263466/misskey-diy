<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkWindow
	ref="windowEl"
	:initialWidth="plainCanvas ? 640 : undefined"
	:initialHeight="plainCanvas ? 600 : undefined"
	:headerIcon="pageMetadata?.icon ?? undefined"
	:canResize="true"
	:closeButton="true"
	:buttonsLeft="buttonsLeft"
	:buttonsRight="buttonsRight"
	:contextmenu="contextmenu"
	@closed="emit('closed')"
>
	<template #header>
		<template v-if="pageMetadata">
			<span><Mfm v-if="pageMetadata.title" :text="pageMetadata.title" :plain="true" :nowrap="true" :author="pageMetadata.avatar ?? undefined" :emojiUrls="pageMetadata.avatar?.emojis"/></span>
		</template>
	</template>

	<div :class="[$style.root, { [$style.plainCanvas]: plainCanvas }]" class="_forceShrinkSpacer _pageContent">
		<StackingRouterView v-if="prefer.s['experimental.stackingRouterView']" :key="reloadCount.toString() + ':stacking'" :router="windowRouter"/>
		<RouterView v-else :key="reloadCount.toString() + ':non-stacking'" :router="windowRouter"/>
	</div>
</MkWindow>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, provide, ref, useTemplateRef, nextTick } from 'vue';
import { url } from '@@/js/config.js';
import type { PageMetadata } from '@/page.js';
import RouterView from '@/components/global/RouterView.vue';
import MkWindow from '@/components/MkWindow.vue';
import { popout as _popout } from '@/utility/popout.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { i18n } from '@/i18n.js';
import { provideMetadataReceiver, provideReactiveMetadata } from '@/page.js';
import { openingWindowsCount } from '@/os.js';
import { claimAchievement } from '@/utility/achievements.js';
import { createRouter, mainRouter } from '@/router.js';
import { analytics } from '@/analytics.js';
import { DI } from '@/di.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{
	initialPath: string;
	plainCanvas?: boolean;
}>();

const adminPage = /^\/admin(?:\/|$)/.test(props.initialPath);
const plainCanvas = props.plainCanvas ?? adminPage;

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const windowRouter = createRouter(props.initialPath);

const pageMetadata = ref<null | PageMetadata>(null);
const windowEl = useTemplateRef('windowEl');
const buttonsLeft = computed(() => {
	return windowRouter.canGoBack.value ? [{
		icon: 'ti ti-arrow-left',
		title: i18n.ts.goBack,
		onClick: back,
	}] : [];
});
const buttonsRight = computed(() => {
	const buttons = [{
		icon: 'ti ti-refresh',
		title: i18n.ts.reload,
		onClick: reload,
	}, {
		icon: 'ti ti-player-eject',
		title: i18n.ts.showInPage,
		onClick: expand,
	}];

	return buttons;
});
const reloadCount = ref(0);

function getSearchMarker(path: string) {
	const hash = path.split('#')[1];
	if (hash == null) return null;
	return hash;
}

const searchMarkerId = ref<string | null>(getSearchMarker(props.initialPath));

windowRouter.addListener('forcePush', ctx => {
	window.open(url + ctx.fullPath, '_blank', 'noopener');
	if (ctx.onInit) {
		nextTick(() => {
			windowEl.value?.close();
		});
	}
});

windowRouter.addListener('forceReplace', ctx => {
	window.open(url + ctx.fullPath, '_blank', 'noopener');
	if (ctx.onInit) {
		nextTick(() => {
			windowEl.value?.close();
		});
	}
});

windowRouter.addListener('change', ctx => {
	if (_DEV_) console.log('windowRouter: change', ctx.fullPath);
	searchMarkerId.value = getSearchMarker(ctx.fullPath);
	analytics.page({
		path: ctx.fullPath,
		title: ctx.fullPath,
	});
});

windowRouter.init(true);

provide(DI.router, windowRouter);
provide(DI.inAppSearchMarkerId, searchMarkerId);
provideMetadataReceiver((metadataGetter) => {
	const info = metadataGetter();
	pageMetadata.value = info;
});
provideReactiveMetadata(pageMetadata);
provide('shouldOmitHeaderTitle', true);
provide('shouldHeaderThin', true);
provide('shouldOmitHeaderBackButton', true);
provide('pagePlainCanvas', plainCanvas);
provide('adminTableMode', plainCanvas);
provide('pageWindowClose', close);

const contextmenu = computed(() => ([{
	icon: 'ti ti-player-eject',
	text: i18n.ts.showInPage,
	action: expand,
}, {
	icon: 'ti ti-window-maximize',
	text: i18n.ts.popout,
	action: popout,
}, {
	icon: 'ti ti-external-link',
	text: i18n.ts.openInNewTab,
	action: () => {
		window.open(url + windowRouter.getCurrentFullPath(), '_blank', 'noopener');
		windowEl.value?.close();
	},
}, {
	icon: 'ti ti-link',
	text: i18n.ts.copyLink,
	action: () => {
		copyToClipboard(url + windowRouter.getCurrentFullPath());
	},
}]));

function back() {
	windowRouter.back();
}

function reload() {
	reloadCount.value++;
}

function close() {
	windowEl.value?.close();
}

function expand() {
	mainRouter.pushByPath(windowRouter.getCurrentFullPath(), 'forcePage');
	windowEl.value?.close();
}

function popout() {
	_popout(windowRouter.getCurrentFullPath(), windowEl.value?.$el);
	windowEl.value?.close();
}

onMounted(() => {
	analytics.page({
		path: props.initialPath,
		title: props.initialPath,
	});

	openingWindowsCount.value++;
	if (openingWindowsCount.value >= 3) {
		claimAchievement('open3windows');
	}
});

onUnmounted(() => {
	openingWindowsCount.value--;
});

defineExpose({
	close,
});
</script>

<style lang="scss" module>
.root {
	height: 100%;
	padding: var(--MI-cardPadding) var(--MI-cardPadding) 0;
	box-sizing: border-box;
	background: var(--MI_THEME-bg);

	--MI-margin: var(--MI-marginHalf);

	:global(._pageContainer),
	:global(._pageScrollable),
	:global(._pageScrollableReversed) {
		scrollbar-width: none;

		&::-webkit-scrollbar {
			display: none;
		}
	}

	:global(._pageContainer > [data-route-active] > ._pageLayout) {
		padding: 0;
	}

	:global(._pageContainer > [data-route-active] > ._standalonePage) {
		padding-top: 0;
	}

	:global(._pageBody) {
		padding-bottom: 0;
	}
}

.plainCanvas {
	--MI-formLabelFontSize: 1em;
	--MI-formCaptionFontSize: 0.9em;
	font-size: 1em;
}
</style>
