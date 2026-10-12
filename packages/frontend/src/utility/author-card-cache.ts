/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Endpoints, entities } from 'misskey-js';
import { $i } from '@/i.js';

export type AuthorCardSnapshot = {
	path: string;
	user: entities.UserLite;
	bannerUrl: string | null;
	description?: string | null;
	stats: Endpoints['articles/stats']['res'] | null;
	followersCount: number | null;
	savedAt: number;
};

// 只保留当前标签页最近访问的作者卡展示字段，按登录账号隔离。
const key = () => `author-card:${$i?.id ?? 'guest'}`;
export function readAuthorCard(path: string): AuthorCardSnapshot | null {
	try {
		const value = JSON.parse(window.sessionStorage.getItem(key()) ?? 'null') as AuthorCardSnapshot | null;
		return value && value.path === path && typeof value.user?.id === 'string' && Date.now() - value.savedAt < 10 * 60_000 ? value : null;
	} catch { return null; }
}

export function saveAuthorCard(snapshot: Omit<AuthorCardSnapshot, 'savedAt'>): void {
	const { id, name, username, host, avatarUrl, avatarBlurhash, avatarDecorations, isBot, isCat, emojis } = snapshot.user;
	try {
		window.sessionStorage.setItem(key(), JSON.stringify({
			...snapshot,
			user: { id, name, username, host, avatarUrl, avatarBlurhash, avatarDecorations, isBot, isCat, emojis, onlineStatus: 'unknown' },
			savedAt: Date.now(),
		}));
	} catch { /* 存储不可用时仍正常请求资料。 */ }
}
