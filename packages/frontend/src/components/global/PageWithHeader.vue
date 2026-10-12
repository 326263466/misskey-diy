<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" data-popup-boundary :class="[$style.root, { [$style.contentCard]: contentCard, [$style.fillHeight]: contentCard && fillHeight }, reversed ? '_pageScrollableReversed' : '_pageScrollable']">
	<MkStickyContainer :class="contentCard && !fillHeight ? $style.cardShell : undefined">
		<template v-if="!hideHeader" #header>
			<MkPageHeader v-if="prefer.s.showPageTabBarBottom && (props.tabs?.length ?? 0) > 0" v-bind="pageHeaderPropsWithoutTabs">
				<template v-if="$slots['header-actions']" #actions><slot name="header-actions"></slot></template>
			</MkPageHeader>
			<MkPageHeader v-else v-model:tab="tab" v-bind="pageHeaderProps">
				<template v-if="$slots['header-actions']" #actions><slot name="header-actions"></slot></template>
			</MkPageHeader>
		</template>
		<div ref="bodyEl" :class="[$style.body, { [$style.cardBody]: contentCard }]" :style="pendingHeight != null ? { minHeight: `${pendingHeight}px` } : undefined" data-page-body>
			<MkSwiper v-if="prefer.s.enableHorizontalSwipe && swipable && (props.tabs?.length ?? 1) > 1" v-model:tab="tab" :class="$style.swiper" :tabs="props.tabs ?? []">
				<div :class="$style.swiperBody" data-page-body><slot></slot></div>
			</MkSwiper>
			<slot v-else></slot>
		</div>
		<template #footer>
			<div v-if="contentCard && $slots.footer" :class="$style.cardFooter"><slot name="footer"></slot></div>
			<slot v-else name="footer"></slot>
			<div v-if="prefer.s.showPageTabBarBottom && (props.tabs?.length ?? 0) > 0" :class="$style.footerTabs">
				<MkTabs v-model:tab="tab" :class="$style.footerTabItems" :tabs="props.tabs" :centered="true" :tabHighlightUpper="true"/>
			</div>
		</template>
	</MkStickyContainer>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { scrollInContainer } from '@@/js/scroll.js';
import type { PageHeaderProps } from './MkPageHeader.vue';
import { useScrollToTop } from '@/composables/use-scroll-to-top.js';
import MkSwiper from '@/components/MkSwiper.vue';
import { useRouter } from '@/router.js';
import { prefer } from '@/preferences.js';
import MkTabs from '@/components/MkTabs.vue';

const props = withDefaults(defineProps<PageHeaderProps & {
	reversed?: boolean;
	swipable?: boolean;
	hideHeader?: boolean;
	contentCard?: boolean;
	fillHeight?: boolean;
	loading?: boolean;
}>(), {
	reversed: false,
	swipable: true,
	hideHeader: false,
	contentCard: false,
	fillHeight: false,
	loading: false,
});

const pageHeaderProps = computed(() => {
	const { reversed, tab, hideHeader, contentCard, fillHeight, loading, ...rest } = props;
	return { ...rest, embedded: contentCard || rest.embedded };
});

const pageHeaderPropsWithoutTabs = computed(() => {
	const { reversed, tabs, hideHeader, contentCard, fillHeight, loading, ...rest } = props;
	return { ...rest, embedded: contentCard || rest.embedded };
});

const tab = defineModel<string>('tab');
const rootEl = useTemplateRef('rootEl');
const bodyEl = useTemplateRef('bodyEl');
const resetScroll = useScrollToTop(rootEl);
const pendingHeight = ref<number | null>(null);
let tabChangeId = 0;

watch(tab, async () => {
	const changeId = ++tabChangeId;
	resetScroll();
	// 异构标签可能重建整个列表，由页面明确提供加载状态来保留正文高度。
	pendingHeight.value = bodyEl.value?.getBoundingClientRect().height ?? null;
	await nextTick();
	if (changeId === tabChangeId && !props.loading) pendingHeight.value = null;
}, { flush: 'sync' });

watch(() => props.loading, loading => {
	if (!loading) pendingHeight.value = null;
}, { flush: 'post' });

const router = useRouter();

router.useListener('change', resetScroll);

router.useListener('same', () => {
	scrollToTop();
});

function scrollToTop() {
	if (props.onScrollToTop) {
		props.onScrollToTop();
	} else if (rootEl.value) {
		scrollInContainer(rootEl.value, { top: 0, behavior: 'instant' });
	}
}

defineExpose({
	scrollToTop,
});
</script>

<style lang="scss" module>
@use "../../styles/page-header.scss";

.root {
	--MI-formGroupInset: 0px;
	--MI-formGroupRadius: initial;
	// Clip the scrolling content to the same outline as the stationary header.
	border-radius: var(--MI-pageHeaderRadius, var(--MI-cardRadius));
	isolation: isolate;
}

.body, .swiper {
	min-height: calc(100cqh - (var(--MI-stickyTop, 0px) + var(--MI-stickyBottom, 0px)));
}

.contentCard {
	// 根元素是占满整列的滚动容器，背景涂在这里会让卡片拖满整列，
	// 内容不足一屏时下方留出大片空白。默认改为透明，由 .cardShell 承担卡片背景。
	background: none;
}

// contentCard 的视觉卡片壳：包住粘性页头、正文和页脚，高度跟随内容。
// overflow 用 clip 而不是 hidden，不会产生滚动容器，页头页脚的 sticky 仍相对外层滚动容器定位。
.cardShell {
	background: var(--MI-pageCardBg, var(--MI_THEME-panel));
	border-radius: var(--MI-cardRadius);
	overflow: clip;
}

.cardFooter {
	background: var(--MI-pageFooterBg, var(--MI_THEME-panel));
}

.cardBody {
	// 页面已有卡片时，主空状态的四周留白也由外层统一提供。
	--MI-pageStatePadding: 0px;
	display: flex;
	flex-direction: column;
	// 卡片贴内容高，不吃满滚动容器；需要占满整列的页面用 .fillHeight 恢复
	min-height: 0;
	padding: var(--MI-pageContentPadding, var(--MI-cardPadding));
	box-sizing: border-box;
	background: var(--MI_THEME-panel);

	// The outer card already owns all four content insets.
	> :global(._pageBody),
	.swiperBody > :global(._pageBody) {
		padding: 0;
	}

	> .swiper {
		flex: 1;
		min-height: 0;

		// Carry the available card height through the swipe transition wrapper.
		> div,
		.swiperBody {
			display: flex;
			flex: 1;
			flex-direction: column;
			min-width: 0;
		}
	}
}

// 聊天会话等需要占满整列的卡片：背景回到滚动容器，正文恢复满高拉伸
// （优先级需高于 .cardBody 的 min-height: 0）
.fillHeight {
	background: var(--MI-pageCardBg, var(--MI_THEME-panel));
	border-radius: var(--MI-cardRadius);

	.body {
		min-height: calc(100cqh - (var(--MI-stickyTop, 0px) + var(--MI-stickyBottom, 0px)));
	}
}

.footerTabs {
	@include page-header.surface;

	> .footerTabItems {
		--height: inherit;
		font-size: inherit;
	}
}
</style>
