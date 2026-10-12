/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function parseReactionUserPair(pair: string): [string, string] {
	const separator = pair.indexOf('/');
	return [pair.slice(0, separator), pair.slice(separator + 1)];
}
