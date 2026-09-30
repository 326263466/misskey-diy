/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { notificationTypes } from 'misskey-js';
import { i18n } from '@/i18n.js';

export type NotificationType = typeof notificationTypes[number];

// Account and service events, rather than activity from another community member.
export const systemNotificationTypes = [
	'system',
	'login',
	'createToken',
	'exportCompleted',
	'roleAssigned',
	'achievementEarned',
	'scheduledNotePosted',
	'scheduledNotePostFailed',
	'test',
] as const satisfies readonly NotificationType[];

export function isSystemNotificationType(type: NotificationType): boolean {
	return (systemNotificationTypes as readonly NotificationType[]).includes(type);
}

export function getNotificationTypeLabel(type: NotificationType): string {
	// Reuse the established translation while newer notification keys are translated.
	return type === 'system' ? i18n.ts.system : i18n.ts._notification._types[type];
}

// 筛选菜单的图标与通知卡片（MkNotification）实际显示的类型图标一一对应，
// 两处共用同一套视觉语言；卡片上用头像的类型这里取其角标语义图标
export function getNotificationTypeIcon(type: NotificationType): string {
	switch (type) {
		case 'note': return 'ti ti-pencil';
		case 'follow': return 'ti ti-plus';
		case 'mention': return 'ti ti-at';
		case 'reply': return 'ti ti-message-circle';
		case 'renote': return 'ti ti-repeat';
		case 'quote': return 'ti ti-quote';
		case 'reaction': return 'ti ti-heart';
		case 'pollEnded': return 'ti ti-chart-arrows';
		case 'scheduledNotePosted': return 'ti ti-send';
		case 'scheduledNotePostFailed': return 'ti ti-alert-triangle';
		case 'receiveFollowRequest': return 'ti ti-clock';
		case 'followRequestAccepted': return 'ti ti-check';
		case 'app': return 'ti ti-plug';
		case 'roleAssigned': return 'ti ti-badges';
		case 'chatRoomInvitationReceived': return 'ti ti-message-dots';
		case 'achievementEarned': return 'ti ti-medal';
		case 'exportCompleted': return 'ti ti-archive';
		case 'test': return 'ti ti-flask';
		case 'login': return 'ti ti-login-2';
		case 'createToken': return 'ti ti-key';
		case 'system': return 'ti ti-shield-check';
		default: return 'ti ti-bell';
	}
}
