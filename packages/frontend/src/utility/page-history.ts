/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const stateKey = '__misskeyPageId';

export function createPageHistoryEntryId(): string {
	return crypto.randomUUID();
}

export function readPageHistoryEntryId(state: unknown): string | null {
	if (state == null || typeof state !== 'object') return null;
	const id = (state as Record<string, unknown>)[stateKey];
	return typeof id === 'string' && id.length > 0 ? id : null;
}

export function withPageHistoryEntryId(state: unknown, id: string): Record<string, unknown> {
	return { ...(state != null && typeof state === 'object' ? state : {}), [stateKey]: id };
}

export function ensurePageHistoryEntryId(history: Pick<History, 'state' | 'replaceState'> = window.history): string {
	const existingId = readPageHistoryEntryId(history.state);
	const id = existingId ?? createPageHistoryEntryId();
	if (existingId != null) return id;
	// 页面只写入标识，滚动和已加载内容留在内存中，不覆盖弹窗或其他历史状态。
	const state = withPageHistoryEntryId(history.state, id);
	history.replaceState(state, '');
	return id;
}
