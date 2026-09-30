/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

let activePopup: { close: () => void } | null = null;

export function claimUserPopup(close: () => void): () => void {
	const previous = activePopup;
	const current = { close };
	activePopup = current;
	previous?.close();
	return () => {
		if (activePopup === current) activePopup = null;
	};
}
