/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onActivated, watch } from 'vue';
import type { Ref } from 'vue';

export function useScrollToTop(scrollContainerRef: Ref<HTMLElement | null | undefined>): () => void {
	const reset = () => {
		const el = scrollContainerRef.value;
		if (!el?.isConnected) return;
		// 在绘制前定位，避免缓存页先显示旧位置再被延迟恢复。
		el.scrollTo({ top: 0, left: 0, behavior: 'instant' });
	};

	watch(scrollContainerRef, reset, { flush: 'post' });
	onActivated(reset);
	return reset;
}
