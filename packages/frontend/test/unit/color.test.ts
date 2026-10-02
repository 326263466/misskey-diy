/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from 'vitest';
import { alpha } from '@/utility/color.js';

test.each(['#336699', 'rgb(51, 102, 153)', 'rgba(51, 102, 153, 0.8)', 'hsl(210, 50%, 40%)'])('sets chart opacity for %s theme colors', color => {
	expect(alpha(color, 0.5)).toBe('rgba(51, 102, 153, 0.5)');
});

test('clamps chart opacity and makes non-finite values transparent', () => {
	expect(alpha('#369', 2)).toBe('rgb(51, 102, 153)');
	expect(alpha('#369', -1)).toBe('rgba(51, 102, 153, 0)');
	expect(alpha('#369', NaN)).toBe('rgba(51, 102, 153, 0)');
});
