/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import MkSelect from '@/components/MkSelect.vue';
import * as os from '@/os.js';

vi.mock('@/os.js', () => ({ popupMenu: vi.fn() }));

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

describe('select menu placement', () => {
	test.each(['pointer', 'keyboard'])('anchors the %s menu below the select at its rendered width', async activation => {
		const view = render(MkSelect, {
			props: {
				items: [{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }],
				modelValue: 'newest',
			},
			global: { directives: { 'adaptive-border': () => {} } },
		});
		const anchor = view.container.querySelector<HTMLElement>('[tabindex="0"]')!;
		vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(new DOMRect(600, 100, 162.5, 36));
		vi.spyOn(anchor, 'offsetWidth', 'get').mockReturnValue(163);
		if (activation === 'pointer') {
			await fireEvent.mouseDown(anchor);
		} else {
			await fireEvent.keyDown(anchor, { key: 'Enter' });
		}
		expect(os.popupMenu).toHaveBeenCalledOnce();
		expect(os.popupMenu).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({ text: 'Newest first' }),
				expect.objectContaining({ text: 'Oldest first' }),
			]),
			anchor,
			expect.objectContaining({ placement: 'dropdown', width: 162.5 }),
		);
		expect(document.activeElement).toBe(anchor);
	});
});
