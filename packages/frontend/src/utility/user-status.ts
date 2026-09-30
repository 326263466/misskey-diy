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
	if (user.onlineStatusOverride === 'invisible') return { status: 'invisible', text: i18n.ts._onlineStatus._display.invisible };

	const custom = user.customStatus;
	if (user.onlineStatus === 'online' && custom && customStatusIconKeys.includes(custom.icon)) {
		return { status: 'custom', icon: custom.icon, text: custom.text };
	}

	switch (user.onlineStatus) {
		case 'online': return { status: 'online', text: i18n.ts._onlineStatus._display.online };
		case 'active': return { status: 'active', text: i18n.ts._onlineStatus._display.active };
		case 'away': return { status: 'away', text: i18n.ts._onlineStatus._display.away };
		case 'busy': return { status: 'busy', text: i18n.ts._onlineStatus._display.busy };
		case 'doNotDisturb': return { status: 'doNotDisturb', text: i18n.ts._onlineStatus._display.doNotDisturb };
		case 'offline': return { status: 'offline', text: i18n.ts._onlineStatus._display.offline };
		default: return { status: 'unknown', text: i18n.ts._onlineStatus._display.unknown };
	}
}
