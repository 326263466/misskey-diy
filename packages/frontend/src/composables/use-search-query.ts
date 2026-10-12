/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readonly, shallowRef, watch } from 'vue';
import type { Ref } from 'vue';

/** 输入立即更新；只延迟远程搜索参数，清空时立即恢复列表。 */
export function useSearchQuery<T extends string | null>(source: Ref<T>, delay = 250) {
	const query = shallowRef<T>(source.value);
	watch(source, (value, _previous, onCleanup) => {
		if (!value?.trim()) {
			query.value = value;
			return;
		}
		const timer = window.setTimeout(() => { query.value = value; }, delay);
		onCleanup(() => window.clearTimeout(timer));
	}, { flush: 'sync' });
	return readonly(query);
}
