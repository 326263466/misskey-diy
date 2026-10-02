/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import tinycolor from 'tinycolor2';

export const alpha = (color: string, a: number): string => {
	return tinycolor(color).setAlpha(Number.isFinite(a) ? Math.min(1, Math.max(0, a)) : 0).toRgbString();
};
