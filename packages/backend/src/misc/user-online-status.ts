/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { USER_ONLINE_THRESHOLD } from '@/const.js';
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

type PresenceUser = Pick<MiUser, 'hideOnlineStatus' | 'lastActiveDate' | 'onlineStatusOverride'> & Partial<Pick<MiUser, 'host' | 'lastDisconnectedAt'>>;

/** 流式连接期间每 5 分钟刷新活动时间；最后一个连接断开时记录断开时间，立即离线。进程崩溃时按超时离线。 */
function isConnected(user: PresenceUser): boolean {
	if (user.lastActiveDate == null || Date.now() - user.lastActiveDate.getTime() >= USER_ONLINE_THRESHOLD) return false;
	return user.lastDisconnectedAt == null || user.lastDisconnectedAt < user.lastActiveDate;
}

/**
 * 他人看到的状态，参考 QQ：连接中显示所选状态，其余情况一律离线。
 * 隐身和真正离线对他人完全相同；不再有“最近活跃”这类模糊状态。
 * 远程用户没有在线数据，返回 unknown，客户端不显示状态。
 */
export function getUserOnlineStatus(user: PresenceUser): 'unknown' | 'online' | 'offline' | 'away' | 'busy' | 'doNotDisturb' | null {
	if (user.hideOnlineStatus) return null;
	if (user.host != null) return 'unknown';
	if (!isConnected(user) || user.onlineStatusOverride === 'invisible') return 'offline';
	return user.onlineStatusOverride;
}

/**
 * 离线时公开的最后活跃时间；在线、隐藏在线状态和远程用户不返回。
 * 隐身用户使用中也会刷新活动时间，因此改用切换为隐身或可见断开的时间，
 * 否则他人会看到最后活跃时间不断更新，暴露隐身的人。
 */
export function getUserPublicLastActiveDate(user: PresenceUser): Date | null {
	if (getUserOnlineStatus(user) !== 'offline') return null;
	return (user.onlineStatusOverride === 'invisible' ? user.lastDisconnectedAt : user.lastActiveDate) ?? null;
}

/** A custom status replaces a fixed one, so it expires with activity like the other overrides. */
export function getUserCustomStatus(user: PresenceUser & Pick<MiUser, 'customStatus'>, isSelf = false): UserCustomStatus | null {
	return isSelf || getUserOnlineStatus(user) === 'online' ? user.customStatus ?? null : null;
}

/** A saved automatic reply keeps working while the user is away from their client. */
export function getUserOnlineStatusAutoReply(user: Pick<MiUser, 'hideOnlineStatus' | 'onlineStatusOverride' | 'onlineStatusAutoReplies'>): string | null {
	if (user.hideOnlineStatus || user.onlineStatusOverride === 'online' || user.onlineStatusOverride === 'invisible') return null;
	return user.onlineStatusAutoReplies?.[user.onlineStatusOverride]?.trim() || null;
}
