/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';

export const AUTO_REPLY_TEXT_LIMIT = 500;
export type AutoReplyStatus = 'away' | 'busy' | 'doNotDisturb';
export type AutoReplyPreset = 'away' | 'work' | 'meal';

export function getAutoReplyPresets(): { value: AutoReplyPreset; text: string }[] {
	return [
		{ value: 'away', text: i18n.ts._onlineStatus._autoReplyPresets.away },
		{ value: 'work', text: i18n.ts._onlineStatus._autoReplyPresets.work },
		{ value: 'meal', text: i18n.ts._onlineStatus._autoReplyPresets.meal },
	];
}
