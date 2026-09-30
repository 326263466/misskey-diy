<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl">
	<div ref="headerEl" :class="$style.header">
		<slot name="header"></slot>
	</div>
	<div
		:class="$style.body"
		:data-sticky-container-header-height="headerHeight"
		:data-sticky-container-footer-height="footerHeight"
	>
		<slot></slot>
	</div>
	<div ref="footerEl" :class="$style.footer">
		<slot name="footer"></slot>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, provide, inject, ref, useTemplateRef } from 'vue';
import { DI } from '@/di.js';

const rootEl = useTemplateRef('rootEl');
const headerEl = useTemplateRef('headerEl');
const footerEl = useTemplateRef('footerEl');

const headerHeight = ref(0);
const parentStickyTop = inject(DI.currentStickyTop, ref(0));
const childStickyTop = computed(() => parentStickyTop.value + headerHeight.value);
provide(DI.currentStickyTop, childStickyTop);

const footerHeight = ref(0);
const parentStickyBottom = inject(DI.currentStickyBottom, ref(0));
const childStickyBottom = computed(() => parentStickyBottom.value + footerHeight.value);
provide(DI.currentStickyBottom, childStickyBottom);

const calc = () => {
	// v-show 等隐藏期间若把高度记为 0，再次显示时 sticky 位置会跳动
	if (rootEl.value == null || rootEl.value.getClientRects().length === 0) return;

	headerHeight.value = headerEl.value?.offsetHeight ?? 0;
	footerHeight.value = footerEl.value?.offsetHeight ?? 0;
};

const observer = new ResizeObserver((entries) => {
	if (entries.every(entry => entry.contentRect.height === 0) && rootEl.value?.getClientRects().length === 0) return;

	for (const entry of entries) {
		const height = entry.borderBoxSize[0]?.blockSize ?? (entry.target as HTMLElement).offsetHeight;
		if (entry.target === headerEl.value) headerHeight.value = height;
		if (entry.target === footerEl.value) footerHeight.value = height;
	}
});

onMounted(() => {
	calc();

	if (headerEl.value != null) {
		observer.observe(headerEl.value);
	}

	if (footerEl.value != null) {
		observer.observe(footerEl.value);
	}
});

onUnmounted(() => {
	observer.disconnect();
});

defineExpose({
	rootEl,
});
</script>

<style lang='scss' module>
.body {
	position: relative;
	z-index: 0;
	--MI-stickyTop: v-bind("childStickyTop + 'px'");
	--MI-stickyBottom: v-bind("childStickyBottom + 'px'");
}

.header {
	position: sticky;
	top: var(--MI-stickyTop, 0);
	z-index: 1;
}

.footer {
	position: sticky;
	bottom: var(--MI-stickyBottom, 0);
	z-index: 1;
}
</style>
