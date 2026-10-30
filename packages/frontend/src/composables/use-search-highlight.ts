/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { inject, onActivated, onDeactivated, onScopeDispose, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { DI } from '@/di.js';
import { searchRanges } from '@/utility/search-highlight.js';

const activeRanges = new Map<symbol, Range[]>();
const highlightName = 'misskey-search';

function publish(): void {
	if (activeRanges.size === 0) CSS.highlights.delete(highlightName);
	else CSS.highlights.set(highlightName, new Highlight(...[...activeRanges.values()].flat()));
}

export function useSearchHighlight(root: Readonly<Ref<HTMLElement | null>>, query: Readonly<Ref<string>>): void {
	const active = inject(DI.pageActive, ref(true));
	const activated = ref(true);
	const key = Symbol();
	onActivated(() => { activated.value = true; });
	onDeactivated(() => { activated.value = false; });
	const stop = watch([root, query, active, activated], ([element, text, pageActive, componentActive], _, onCleanup) => {
		if (typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight === 'undefined') return;
		if (!element || !text.trim() || !pageActive || !componentActive) return;
		let frame = 0;
		const update = () => {
			frame = 0;
			activeRanges.set(key, searchRanges(element, text));
			publish();
		};
		// 仅绘制 Range，不改 MFM/链接的 DOM，也不把查询拼成 HTML。
		const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(update); });
		observer.observe(element, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
		update();
		onCleanup(() => {
			observer.disconnect();
			cancelAnimationFrame(frame);
			activeRanges.delete(key);
			publish();
		});
	}, { immediate: true, flush: 'post' });
	onScopeDispose(stop);
}
