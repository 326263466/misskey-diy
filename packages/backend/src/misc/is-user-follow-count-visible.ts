/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiUserProfile } from '@/models/UserProfile.js';

export function isUserFollowCountVisible(
	visibility: MiUserProfile['followingVisibility'] | undefined,
	{ isMe, isModerator, isFollowing }: { isMe: boolean; isModerator: boolean; isFollowing: boolean },
): boolean {
	return visibility !== undefined && (visibility === 'public' || isMe || isModerator || (visibility === 'followers' && isFollowing));
}
