/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onActivated, onMounted, onUnmounted, provide, ref } from 'vue';
import type { Ref } from 'vue';
import { DI } from '@/di.js';

// 容器宽度低于阈值时隐藏左侧菜单，由子页面改用顶部标签。
// 与 universal.vue 的 dock 折叠点一致：dock 隐藏时中栏最宽 751 - 32 = 719px
const NARROW_THRESHOLD = 720;

export function usePageNavigationNarrow(el: Readonly<Ref<HTMLElement | null>>): Readonly<Ref<boolean>> {
	const narrow = ref(window.innerWidth < NARROW_THRESHOLD);

	const ro = new ResizeObserver((entries) => {
		if (entries.length === 0) return;
		const width = entries[0].borderBoxSize[0].inlineSize;
		// 缓存页隐藏时宽度为零，不能因此卸载左侧菜单。
		if (width > 0) narrow.value = width < NARROW_THRESHOLD;
	});

	function measure() {
		const width = el.value?.offsetWidth ?? 0;
		if (width > 0) narrow.value = width < NARROW_THRESHOLD;
	}

	onMounted(() => {
		if (el.value == null) return;
		ro.observe(el.value);
		measure();
	});

	onActivated(measure);

	onUnmounted(() => {
		ro.disconnect();
	});

	provide(DI.pageNavigationNarrow, narrow);

	return narrow;
}
