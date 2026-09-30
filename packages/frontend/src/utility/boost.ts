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

export const MAX_BOOSTS_PER_NOTE = 20;

export function countBoosts(reactions: Record<string, number>): number {
	let count = 0;
	for (const [reaction, n] of Object.entries(reactions)) {
		if (isTextBoost(reaction)) count += n;
	}
	return count;
}

export function isBoostFull(reactions: Record<string, number>): boolean {
	return countBoosts(reactions) >= MAX_BOOSTS_PER_NOTE;
}
