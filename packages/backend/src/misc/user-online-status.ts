/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { USER_ACTIVE_THRESHOLD, USER_ONLINE_THRESHOLD } from '@/const.js';
import type { MiUser } from '@/models/User.js';

export const USER_CUSTOM_STATUS_ICONS = [
	'coffee', 'music', 'gamepad', 'briefcase', 'book', 'moon', 'heart', 'plane',
	'food', 'home', 'pet', 'code', 'focus', 'film', 'car', 'vacation',
	'exercise', 'sun', 'cloud', 'battery', 'chat', 'celebrate', 'gift', 'handshake',
] as const;
export const USER_CUSTOM_STATUS_MAX_LENGTH = 8;
export const USER_ONLINE_STATUS_AUTO_REPLY_MAX_LENGTH = 500;
export type UserCustomStatus = { icon: typeof USER_CUSTOM_STATUS_ICONS[number]; text: string };
export type UserOnlineStatusAutoReplies = Partial<Record<'away' | 'busy' | 'doNotDisturb', string | null>>;

export function getUserActivityStatus(user: Pick<MiUser, 'lastActiveDate'>): 'unknown' | 'online' | 'active' | 'offline' {
	if (user.lastActiveDate == null) return 'unknown';
	const elapsed = Date.now() - user.lastActiveDate.getTime();
	if (elapsed >= USER_ACTIVE_THRESHOLD) return 'offline';
	if (elapsed >= USER_ONLINE_THRESHOLD) return 'active';
	return 'online';
}

export function getUserOnlineStatus(user: Pick<MiUser, 'hideOnlineStatus' | 'lastActiveDate' | 'onlineStatusOverride'>): 'unknown' | 'online' | 'active' | 'offline' | 'away' | 'busy' | 'doNotDisturb' | null {
	if (user.hideOnlineStatus) return null;
	if (user.onlineStatusOverride === 'invisible') return 'unknown';
	const activityStatus = getUserActivityStatus(user);
	return activityStatus === 'online' ? user.onlineStatusOverride ?? 'online' : activityStatus;
}

/** A custom status replaces a fixed one, so it expires with activity like the other overrides. */
export function getUserCustomStatus(user: Pick<MiUser, 'hideOnlineStatus' | 'lastActiveDate' | 'onlineStatusOverride' | 'customStatus'>, isSelf = false): UserCustomStatus | null {
	return isSelf || getUserOnlineStatus(user) === 'online' ? user.customStatus ?? null : null;
}

/** A saved automatic reply keeps working while the user is away from their client. */
export function getUserOnlineStatusAutoReply(user: Pick<MiUser, 'hideOnlineStatus' | 'onlineStatusOverride' | 'onlineStatusAutoReplies'>): string | null {
	if (user.hideOnlineStatus || user.onlineStatusOverride === 'online' || user.onlineStatusOverride === 'invisible') return null;
	return user.onlineStatusAutoReplies?.[user.onlineStatusOverride]?.trim() || null;
}
