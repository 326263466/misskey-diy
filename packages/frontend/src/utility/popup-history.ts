/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

type PopupHistoryEntry = {
	id: string;
	guard: boolean;
};

type Guard = {
	id: string;
	state: unknown;
	fromForward?: boolean;
};

const stateKey = '__misskeyPopup';
let getDismissal: () => (() => void) | undefined = () => undefined;
let guard: Guard | undefined;
let removing: Guard | undefined;
const pendingNavigations: (() => void)[] = [];

function entry(state: unknown): PopupHistoryEntry | undefined {
	return (state as Record<string, PopupHistoryEntry> | null)?.[stateKey];
}

function withEntry(state: unknown, value: PopupHistoryEntry) {
	return { ...(state as object | null), [stateKey]: value };
}

function withoutEntry(state: unknown) {
	const clean = { ...(state as object | null) } as Record<string, unknown>;
	delete clean[stateKey];
	return clean;
}

export function setPopupHistoryDismissal(getTopDismissal: typeof getDismissal) {
	getDismissal = getTopDismissal;
}

function removeGuard() {
	if (!guard || removing) return;
	if (entry(window.history.state)?.id !== guard.id) {
		guard = undefined;
		return;
	}
	removing = guard;
	guard = undefined;
	window.history.back();
}

export function syncPopupHistory() {
	if (removing) return;
	if (!getDismissal()) {
		removeGuard();
		return;
	}
	if (guard) return;
	guard = { id: crypto.randomUUID(), state: window.history.state };
	// 所有弹窗共用一项保护历史；嵌套弹窗不会留下多层空白页面。
	window.history.replaceState(withEntry(guard.state, { id: guard.id, guard: false }), '');
	window.history.pushState(withEntry(guard.state, { id: guard.id, guard: true }), '');
}

function finishRemoval(targetState: unknown) {
	const removed = removing!;
	removing = undefined;
	window.history.replaceState(removed.fromForward ? targetState : removed.state, '');
	for (const navigate of pendingNavigations.splice(0)) navigate();
	queueMicrotask(syncPopupHistory);
}

window.addEventListener('popstate', event => {
	const target = entry(event.state);
	if (removing && (removing.fromForward || (target?.id === removing.id && !target.guard))) {
		event.stopImmediatePropagation();
		finishRemoval(event.state);
		return;
	}
	if (guard && target?.id === guard.id && !target.guard) {
		event.stopImmediatePropagation();
		const previous = guard;
		guard = undefined;
		window.history.replaceState(previous.state, '');
		// 取消由组件原有的关闭守卫决定；拒绝关闭时重新建立保护项。
		try { getDismissal()?.(); } finally { queueMicrotask(syncPopupHistory); }
		return;
	}
	if (target?.guard) {
		// Forward 可能命中已关闭弹窗留下的保护项，不重新打开或触发路由。
		event.stopImmediatePropagation();
		removing = { id: target.id, state: undefined, fromForward: true };
		window.history.back();
	}
}, true);

// 刷新后弹窗已销毁，消费旧保护项，避免下一次返回停在相同页面。
const restoredEntry = entry(window.history.state);
if (restoredEntry?.guard) {
	removing = { id: restoredEntry.id, state: withoutEntry(window.history.state) };
	window.history.back();
} else if (restoredEntry) {
	window.history.replaceState(withoutEntry(window.history.state), '');
}

export function pushPageHistory(fullPath: string) {
	if (removing) {
		pendingNavigations.push(() => pushPageHistory(fullPath));
		return;
	}
	if (guard && entry(window.history.state)?.id === guard.id) {
		// 弹窗内跳转直接复用保护项，关闭动画结束后不会误退新页面。
		guard = undefined;
		window.history.replaceState({}, '', fullPath);
	} else {
		window.history.pushState({}, '', fullPath);
	}
	queueMicrotask(syncPopupHistory);
}

export function navigateAfterPopupHistory(navigate: () => void) {
	removeGuard();
	if (removing) pendingNavigations.push(navigate);
	else navigate();
}

export function replacePageHistory(fullPath: string) {
	navigateAfterPopupHistory(() => {
		window.history.replaceState({}, '', fullPath);
		queueMicrotask(syncPopupHistory);
	});
}
