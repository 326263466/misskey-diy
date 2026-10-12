/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test, vi } from 'vitest';
import { MFM_TAGS, MFM_PARAMS } from '@@/js/const.js';
import { mfmFunctionPicker } from '@/utility/mfm-function-picker.js';
import { mfmFunctionLabel, mfmParameterLabel } from '@/utility/mfm-function-label.js';
import type { MenuItem } from '@/types/menu.js';

const mocks = vi.hoisted(() => ({ popupMenu: vi.fn() }));
vi.mock('@/os.js', () => ({ popupMenu: mocks.popupMenu }));

test('every offered MFM function and parameter has a translated explanation', () => {
	for (const tag of MFM_TAGS) expect(mfmFunctionLabel(tag)).toMatch(new RegExp(`^${tag} \\([^a-zA-Z]+\\)$`));
	for (const param of new Set(Object.values(MFM_PARAMS).flat())) {
		expect(mfmParameterLabel(param).slice(param.length)).toMatch(/^ \([^a-zA-Z]+\)$/);
	}
});

test('the translated picker inserts the original MFM function name', () => {
	const chosen = vi.fn();
	mfmFunctionPicker(null, chosen);
	const items = mocks.popupMenu.mock.lastCall![0] as MenuItem[];
	const rainbow = items.find(item => item && 'text' in item && item.text === 'rainbow (彩虹)');
	expect(rainbow).toBeDefined();
	if (rainbow && 'action' in rainbow) rainbow.action!(new PointerEvent('click'));
	expect(chosen).toHaveBeenCalledExactlyOnceWith('rainbow');
});
