/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { reactive } from 'vue';
import type * as Misskey from 'misskey-js';
import { globalEvents } from '@/events.js';

// 服务端负责持久化过滤；本地状态防止已加载或重挂载的评论再次出现。
const userBlockingStates = reactive(new Map<string, boolean>());

export function getUserBlockingState(userId: string): boolean | undefined {
	return userBlockingStates.get(userId);
}

export function isUserBlocked(userId: string): boolean {
	return getUserBlockingState(userId) === true;
}

export function isNoteBlocked(note: Misskey.entities.Note): boolean {
	const pending = [note];
	const visited = new Set<string>();
	while (pending.length > 0) {
		const current = pending.pop()!;
		if (visited.has(current.id)) continue;
		visited.add(current.id);
		if (isUserBlocked(current.userId)) return true;
		if (current.reply) pending.push(current.reply);
		if (current.renote) pending.push(current.renote);
	}
	return false;
}

// 互动被拉黑关系拒绝时服务端返回此错误码，无论哪一方发起拉黑。
export function isBlockedRelationError(err: unknown): boolean {
	return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'YOU_HAVE_BEEN_BLOCKED';
}

export function updateUserBlocking(userId: string, blocking: boolean): void {
	userBlockingStates.set(userId, blocking);
	globalEvents.emit('userBlockingChanged', userId, blocking);
}
