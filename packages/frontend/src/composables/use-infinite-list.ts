/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, inject, onActivated, onDeactivated, onScopeDispose, ref, shallowRef, watch } from 'vue';
import { DI } from '@/di.js';

export function useInfiniteList<T extends { id: string }, Cursor = string>(fetchPage: (cursor: Cursor | null, signal: AbortSignal) => Promise<{ items: T[]; next: Cursor | null }>) {
	const items = shallowRef<T[]>([]);
	const loading = ref(false);
	const error = ref(false);
	const hasMore = ref(false);
	const active = ref(true);
	const pageActive = inject(DI.pageActive, ref(true));
	const canLoad = computed(() => active.value && pageActive.value);
	let cursor: Cursor | null = null;
	let controller: AbortController | null = null;
	let revision = 0;
	let retryAppend = false;
	let interrupted = false;

	function invalidate() {
		interrupted ||= loading.value;
		revision++;
		controller?.abort();
		loading.value = false;
	}

	async function load(append: boolean) {
		if (!canLoad.value || (append && (loading.value || !hasMore.value))) return;
		interrupted = false;
		controller?.abort();
		controller = new AbortController();
		const request = ++revision;
		const from = append ? cursor : null;
		retryAppend = append;
		loading.value = true;
		error.value = false;
		try {
			const result = await fetchPage(from, controller.signal);
			if (request !== revision) return;
			const previous = append ? items.value : [];
			const seen = new Set(previous.map(item => item.id));
			items.value = [...previous, ...result.items.filter(item => {
				if (seen.has(item.id)) return false;
				seen.add(item.id);
				return true;
			})];
			cursor = result.next;
			hasMore.value = cursor != null && !Object.is(cursor, from);
		} catch {
			if (request === revision) error.value = true;
		} finally {
			if (request === revision) loading.value = false;
		}
	}

	function refresh() {
		// 页面隐藏时保留刷新意图，恢复后从首屏开始而不是沿用旧的续载游标。
		retryAppend = false;
		interrupted = true;
		return load(false);
	}

	function loadMore() { return load(true); }

	function retry() { return load(retryAppend); }

	function reset() {
		invalidate();
		items.value = [];
		cursor = null;
		hasMore.value = false;
		error.value = false;
		return refresh();
	}

	onActivated(() => { active.value = true; });
	onDeactivated(() => { active.value = false; });
	watch(canLoad, value => {
		if (!value) invalidate();
		else if (interrupted) {
			interrupted = false;
			void retry();
		}
	}, { flush: 'sync' });
	onScopeDispose(() => { active.value = false; invalidate(); });

	return { items, loading, error, hasMore, canLoad, refresh, loadMore, retry, reset, invalidate };
}
