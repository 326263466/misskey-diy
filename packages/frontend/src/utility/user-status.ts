/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';
import { customStatusIconKeys } from '@/utility/status-icons.js';
import type { CustomStatus, CustomStatusIcon, StatusIconStatus } from '@/utility/status-icons.js';

/** A custom status is picked instead of a fixed one, so it supplies both the icon and the label. */
export function getUserStatusDisplay(user: {
	onlineStatus?: string | null;
	hideOnlineStatus?: boolean;
	onlineStatusOverride?: string;
	customStatus?: CustomStatus | null;
}): { status: StatusIconStatus; icon?: CustomStatusIcon; text: string } | null {
	if (user.hideOnlineStatus || user.onlineStatus === null) return null;
	const custom = user.customStatus != null && customStatusIconKeys.includes(user.customStatus.icon) ? user.customStatus : null;

	// 只有自己的账户带 onlineStatusOverride。自己正在使用，按所选状态显示，不用加载时的活跃快照。
	if (user.onlineStatusOverride != null) {
		switch (user.onlineStatusOverride) {
			case 'invisible': return { status: 'invisible', text: i18n.ts._onlineStatus._display.invisible };
			case 'away': return { status: 'away', text: i18n.ts._onlineStatus._display.away };
			case 'busy': return { status: 'busy', text: i18n.ts._onlineStatus._display.busy };
			case 'doNotDisturb': return { status: 'doNotDisturb', text: i18n.ts._onlineStatus._display.doNotDisturb };
			default: return custom ? { status: 'custom', icon: custom.icon, text: custom.text } : { status: 'online', text: i18n.ts._onlineStatus._display.online };
		}
	}

	if (user.onlineStatus === 'online' && custom) {
		return { status: 'custom', icon: custom.icon, text: custom.text };
	}

	// 参考 QQ：他人只会看到在线、离开、忙碌、请勿打扰、自定义或离线；隐身对他人就是离线。
	switch (user.onlineStatus) {
		case 'online': return { status: 'online', text: i18n.ts._onlineStatus._display.online };
		case 'away': return { status: 'away', text: i18n.ts._onlineStatus._display.away };
		case 'busy': return { status: 'busy', text: i18n.ts._onlineStatus._display.busy };
		case 'doNotDisturb': return { status: 'doNotDisturb', text: i18n.ts._onlineStatus._display.doNotDisturb };
		// active 来自旧版本缓存，按离线处理。
		case 'offline':
		case 'active': return { status: 'offline', text: i18n.ts._onlineStatus._display.offline };
		// 远程用户或数据尚未加载，没有可信的在线信息，不显示。
		default: return null;
	}
}
