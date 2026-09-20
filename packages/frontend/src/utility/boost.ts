/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function isTextBoost(reaction: string): boolean {
	return reaction.startsWith('text:');
}

export function getBoostText(reaction: string): string {
	return isTextBoost(reaction) ? reaction.slice('text:'.length) : reaction;
}
