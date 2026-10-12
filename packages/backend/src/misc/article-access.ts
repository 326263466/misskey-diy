/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { EntityManager } from 'typeorm';
import { MiBlocking } from '@/models/Blocking.js';
import { MiFollowing } from '@/models/Following.js';
import type { MiPage } from '@/models/Page.js';
import { MiUser } from '@/models/User.js';

export function isArticle(page: MiPage): boolean {
	return page.content.length === 1 && page.content[0]?.type === 'markdown' && typeof page.content[0].text === 'string';
}

// 与 isArticle 判定相反的 SQL 条件，自定义页面列表据此排除文章。
export function notArticleCondition(alias: string): string {
	return `NOT (jsonb_array_length(${alias}.content) = 1 AND ${alias}.content->0->>'type' = 'markdown' AND jsonb_typeof(${alias}.content->0->'text') = 'string')`;
}

// 文章详情与资料中的置顶文章共用门禁，避免打包入口绕过可见范围或拉黑限制。
export async function canReadArticle(page: MiPage, viewer: { id: MiUser['id'] } | null | undefined, manager: EntityManager): Promise<boolean> {
	const author = await manager.findOneBy(MiUser, { id: page.userId, isSuspended: false, isDeleted: false });
	if (!author) return false;
	if (viewer?.id === page.userId) return true;
	if (viewer && await manager.existsBy(MiBlocking, [
		{ blockerId: viewer.id, blockeeId: page.userId },
		{ blockerId: page.userId, blockeeId: viewer.id },
	])) return false;
	if (page.visibility === 'public') return true;
	if (!viewer) return false;
	if (page.visibility === 'specified') return page.visibleUserIds.includes(viewer.id);
	return page.visibility === 'followers' && await manager.existsBy(MiFollowing, { followerId: viewer.id, followeeId: page.userId });
}
