/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 全局导航和页面标识共用，避免手机与桌面入口使用不同图形。
export const navigationIcons = {
	home: 'ti ti-home',
	timeline: 'ti ti-messages',
	chat: 'ti ti-message-circle-2',
	controlPanel: 'ti ti-shield-cog',
	notifications: 'ti ti-bell',
	search: 'ti ti-search',
	announcements: 'ti ti-speakerphone',
	communityRanking: 'ti ti-trophy',
	settings: 'ti ti-settings',
	widgets: 'ti ti-apps',
	more: 'ti ti-grid-dots',
} as const;
