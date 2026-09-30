/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function channelColor(color?: string | null): string {
	return color?.trim() || 'var(--MI_THEME-accent)';
}
