/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { inject, ref } from 'vue';
import type { Ref } from 'vue';
import { DI } from '@/di.js';

export function useScrollToTop(scrollContainerRef: Ref<HTMLElement | null | undefined>): () => void {
	const active = inject(DI.pageActive, ref(true));
	const restoring = inject(DI.routeScrollPending, ref(false));
	return () => {
		if (!active.value || restoring.value) return;
		const el = scrollContainerRef.value;
		if (!el?.isConnected) return;
		// 在绘制前定位，避免缓存页先显示旧位置再被延迟恢复。
		el.scrollTo({ top: 0, left: 0, behavior: 'instant' });
	};
}
