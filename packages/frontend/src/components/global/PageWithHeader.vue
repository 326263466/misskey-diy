<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="[$style.root, { [$style.contentCard]: contentCard }, reversed ? '_pageScrollableReversed' : '_pageScrollable']">
	<MkStickyContainer>
		<template v-if="!hideHeader" #header>
			<MkPageHeader v-if="prefer.s.showPageTabBarBottom && (props.tabs?.length ?? 0) > 0" v-bind="pageHeaderPropsWithoutTabs">
				<template v-if="$slots['header-actions']" #actions><slot name="header-actions"></slot></template>
			</MkPageHeader>
			<MkPageHeader v-else v-model:tab="tab" v-bind="pageHeaderProps">
				<template v-if="$slots['header-actions']" #actions><slot name="header-actions"></slot></template>
			</MkPageHeader>
		</template>
		<div :class="[$style.body, { [$style.cardBody]: contentCard }]" data-page-body>
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
import { computed, useTemplateRef } from 'vue';
import { scrollInContainer } from '@@/js/scroll.js';
import type { PageHeaderProps } from './MkPageHeader.vue';
import { useScrollPositionKeeper } from '@/composables/use-scroll-position-keeper.js';
import MkSwiper from '@/components/MkSwiper.vue';
import { useRouter } from '@/router.js';
import { prefer } from '@/preferences.js';
import MkTabs from '@/components/MkTabs.vue';

const props = withDefaults(defineProps<PageHeaderProps & {
	reversed?: boolean;
	swipable?: boolean;
	hideHeader?: boolean;
	contentCard?: boolean;
}>(), {
	reversed: false,
	swipable: true,
	hideHeader: false,
	contentCard: false,
});

const pageHeaderProps = computed(() => {
	const { reversed, tab, hideHeader, contentCard, ...rest } = props;
	return { ...rest, embedded: contentCard || rest.embedded };
});

const pageHeaderPropsWithoutTabs = computed(() => {
	const { reversed, tabs, hideHeader, contentCard, ...rest } = props;
	return { ...rest, embedded: contentCard || rest.embedded };
});

const tab = defineModel<string>('tab');
const rootEl = useTemplateRef('rootEl');

useScrollPositionKeeper(rootEl);

const router = useRouter();

router.useListener('same', () => {
	scrollToTop();
});

function scrollToTop() {
	if (rootEl.value) scrollInContainer(rootEl.value, { top: 0, behavior: 'smooth' });
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
	background: var(--MI-pageCardBg, var(--MI_THEME-panel));
	border-radius: var(--MI-cardRadius);
}

.cardFooter {
	background: var(--MI-pageFooterBg, var(--MI_THEME-panel));
}

.cardBody {
	--MI-formGroupInset: var(--MI-cardPadding);
	--MI-formGroupRadius: 0px;
	display: flex;
	flex-direction: column;
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

.footerTabs {
	@include page-header.surface;

	> .footerTabItems {
		--height: inherit;
		font-size: inherit;
	}
}
</style>
