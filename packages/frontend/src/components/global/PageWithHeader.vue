<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="[$style.root, reversed ? '_pageScrollableReversed' : '_pageScrollable']">
	<MkStickyContainer>
		<template v-if="!hideHeader" #header>
			<MkPageHeader v-if="prefer.s.showPageTabBarBottom && (props.tabs?.length ?? 0) > 0" v-bind="pageHeaderPropsWithoutTabs">
				<template v-if="$slots['header-actions']" #actions><slot name="header-actions"></slot></template>
			</MkPageHeader>
			<MkPageHeader v-else v-model:tab="tab" v-bind="pageHeaderProps">
				<template v-if="$slots['header-actions']" #actions><slot name="header-actions"></slot></template>
			</MkPageHeader>
		</template>
		<div :class="$style.body" data-page-body>
			<MkSwiper v-if="prefer.s.enableHorizontalSwipe && swipable && (props.tabs?.length ?? 1) > 1" v-model:tab="tab" :class="$style.swiper" :tabs="props.tabs ?? []">
				<div data-page-body><slot></slot></div>
			</MkSwiper>
			<slot v-else></slot>
		</div>
		<template #footer>
			<slot name="footer"></slot>
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
}>(), {
	reversed: false,
	swipable: true,
	hideHeader: false,
});

const pageHeaderProps = computed(() => {
	const { reversed, tab, hideHeader, ...rest } = props;
	return rest;
});

const pageHeaderPropsWithoutTabs = computed(() => {
	const { reversed, tabs, hideHeader, ...rest } = props;
	return rest;
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
	// Clip the scrolling content to the same outline as the stationary header.
	border-radius: var(--MI-pageHeaderRadius, var(--MI-cardRadius));
	isolation: isolate;
}

.body, .swiper {
	min-height: calc(100cqh - (var(--MI-stickyTop, 0px) + var(--MI-stickyBottom, 0px)));
}

.footerTabs {
	@include page-header.surface;

	> .footerTabItems {
		--height: inherit;
		font-size: inherit;
	}
}
</style>
