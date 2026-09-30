<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="layoutEl" class="_pageLayout" :class="[$style.layout, narrow ? $style.narrow : '_pageLayoutWithSidebar']">
	<nav class="_pageNavigation" :aria-label="i18n.ts.communityRanking">
		<div class="_gaps_s">
			<div v-if="$i && !narrow" :class="$style.profile">
				<MkAvatar :user="$i" :class="$style.avatar"/>
				<MkUserName :user="$i" :class="$style.name"/>
			</div>
			<MkSuperMenu :def="menuDef" :grid="narrow"/>
		</div>
	</nav>
	<PageWithHeader class="_pageContent" hideHeader>
		<slot></slot>
	</PageWithHeader>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import type { SuperMenuDef } from '@/components/MkSuperMenu.vue';
import MkSuperMenu from '@/components/MkSuperMenu.vue';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ active: 'checkin' | 'ranking' | 'achievements' | 'benefits' }>();

const NARROW_THRESHOLD = 800;
const layoutEl = useTemplateRef<HTMLElement>('layoutEl');
const narrow = ref(window.innerWidth < NARROW_THRESHOLD);

const ro = new ResizeObserver(entries => {
	if (entries.length === 0) return;
	narrow.value = entries[0].borderBoxSize[0].inlineSize < NARROW_THRESHOLD;
});

onMounted(() => {
	if (layoutEl.value == null) return;
	ro.observe(layoutEl.value);
	narrow.value = layoutEl.value.offsetWidth < NARROW_THRESHOLD;
});

onUnmounted(() => {
	ro.disconnect();
});

const menuDef = computed<SuperMenuDef[]>(() => [{
	items: [
		{ icon: 'ti ti-calendar-check', text: i18n.ts._checkin.dailyCheckin, to: '/checkin', active: props.active === 'checkin' },
		{ icon: 'ti ti-trophy', text: i18n.ts.communityRanking, to: '/community-ranking', active: props.active === 'ranking' },
		{ icon: 'ti ti-medal', text: i18n.ts.achievements, to: '/my/achievements', active: props.active === 'achievements' },
		{ icon: 'ti ti-gift', text: i18n.ts._benefits.title, to: '/my/benefits', active: props.active === 'benefits' },
	],
}]);
</script>

<style lang="scss" module>
.layout {
	--MI-communityBodyFontSize: 1rem;
	font-size: var(--MI-communityBodyFontSize);
}

// narrow 时纵向堆叠：导航条在上、内容区在下，内容区自身独立滚动
.layout.narrow {
	grid-template-rows: auto minmax(0, 1fr);
	gap: var(--MI-pageGap);
}

.profile {
	display: flex;
	align-items: center;
	flex-direction: column;
	gap: 12px;
	padding: 16px 12px 20px;
	text-align: center;
}

.avatar {
	width: 64px;
	height: 64px;
}

.name {
	max-width: 100%;
	overflow-wrap: anywhere;
	font-weight: bold;
}
</style>
