/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { inject } from 'vue';
import { page } from '@/router.definition.js';
import { $i } from '@/i.js';
import { Nirax } from '@/lib/nirax.js';
import { ROUTE_DEF } from '@/router.definition.js';
import { analytics } from '@/analytics.js';
import { DI } from '@/di.js';
import { navigateAfterPopupHistory, pushPageHistory, replacePageHistory, setPageHistorySettled, syncPopupHistory } from '@/utility/popup-history.js';
import { ensurePageHistoryEntryId, readPageHistoryEntryId } from '@/utility/page-history.js';

export type Router = Nirax<typeof ROUTE_DEF>;

export function createRouter(fullPath: string, initialEntryId?: string): Router {
	return new Nirax(ROUTE_DEF, fullPath, !!$i, page(() => import('@/pages/not-found.vue')), initialEntryId);
}

export const mainRouter = createRouter(window.location.pathname + window.location.search + window.location.hash, ensurePageHistoryEntryId());
mainRouter.historyTraversal = delta => window.history.go(delta);

window.history.scrollRestoration = 'manual';

let currentHistoryKey = window.navigation.currentEntry!.key;
let traversal: { sourceId: string; sourceKey: string; targetId: string; targetKey: string; phase: 'returning' | 'deciding' | 'replaying'; allowed: boolean | null; movingTo: { key: string } | null } | null = null;
mainRouter.canNavigate = () => traversal == null && readPageHistoryEntryId(window.history.state) === mainRouter.navigationRef.value.entryId;

function moveHistory(pending: NonNullable<typeof traversal>, key: string) {
	if (window.navigation.currentEntry!.key === key || pending.movingTo?.key === key) return;
	const move = { key };
	pending.movingTo = move;
	// 用真实历史项返回和重放，不猜步数，也不改写前进历史。
	void window.navigation.traverseTo(key).finished!.catch(() => {
		if (traversal !== pending || pending.movingTo !== move) return;
		pending.movingTo = null;
		if (!window.navigation.entries().some(entry => entry.key === pending.targetKey)) pending.allowed = false;
		continueTraversal(pending);
	});
}

function continueTraversal(pending: NonNullable<typeof traversal>) {
	if (traversal !== pending) return;
	if (readPageHistoryEntryId(window.history.state) !== pending.sourceId || window.navigation.currentEntry!.key !== pending.sourceKey) {
		moveHistory(pending, pending.sourceKey);
		return;
	}
	if (pending.allowed === false) {
		traversal = null;
		queueMicrotask(syncPopupHistory);
		return;
	}
	if (pending.allowed === true) {
		pending.phase = 'replaying';
		moveHistory(pending, pending.targetKey);
		return;
	}
	if (pending.phase !== 'returning') return;
	pending.phase = 'deciding';
	// 决策复用路由内跳转的确认，且只在原历史项上重放批准的前进后退。
	void Promise.resolve(mainRouter.checkBeforeLeave()).then(allowed => {
		if (traversal !== pending) return;
		pending.allowed = allowed;
		continueTraversal(pending);
	});
}

function onPageHistorySettled() {
	queueMicrotask(syncPopupHistory);
	const entryId = ensurePageHistoryEntryId();
	const key = window.navigation.currentEntry!.key;
	const fullPath = window.location.pathname + window.location.search + window.location.hash;
	const pending = traversal;
	if (pending) {
		pending.movingTo = null;
		if (pending.phase === 'replaying' && entryId === pending.targetId && key === pending.targetKey) {
			traversal = null;
			currentHistoryKey = key;
			mainRouter.traverseByPath(fullPath, entryId, true);
			return;
		}
		continueTraversal(pending);
		return;
	}
	if (entryId === mainRouter.navigationRef.value.entryId && fullPath === mainRouter.getCurrentFullPath()) {
		currentHistoryKey = key;
		return;
	}
	if (mainRouter.beforeLeave && entryId !== mainRouter.navigationRef.value.entryId) {
		mainRouter.cancelPendingNavigation();
		traversal = { sourceId: mainRouter.navigationRef.value.entryId, sourceKey: currentHistoryKey, targetId: entryId, targetKey: key, phase: 'returning', allowed: null, movingTo: null };
		// popstate 时 URL 已切换，先回到原项，页面和草稿保持激活。
		continueTraversal(traversal);
		return;
	}
	currentHistoryKey = key;
	mainRouter.traverseByPath(fullPath, entryId, true);
}

window.addEventListener('popstate', onPageHistorySettled);
setPageHistorySettled(onPageHistorySettled, () => mainRouter.canNavigate!());

mainRouter.addListener('push', ctx => {
	pushPageHistory(ctx.fullPath, ctx.navigation.entryId);
});

mainRouter.addListener('replace', ctx => {
	replacePageHistory(ctx.fullPath, ctx.navigation.entryId);
});

mainRouter.addListener('forceReplace', ctx => {
	navigateAfterPopupHistory(() => window.location.replace(ctx.fullPath));
});

mainRouter.addListener('forcePush', ctx => {
	navigateAfterPopupHistory(() => { window.location.href = ctx.fullPath; });
});

mainRouter.addListener('change', ctx => {
	if (_DEV_) console.log('mainRouter: change', ctx.fullPath);
	analytics.page({
		path: ctx.fullPath,
		title: ctx.fullPath,
	});
});

mainRouter.init();

export function useRouter(): Router {
	return inject(DI.router, null) ?? mainRouter;
}
