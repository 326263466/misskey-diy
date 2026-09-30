/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import MkCheckinSuccessDialog from '@/components/MkCheckinSuccessDialog.vue';
import I18n from '@/components/global/I18n.vue';
import { hotkeyDirective } from '@/directives/hotkey.js';
import { i18n } from '@/i18n.js';

vi.mock('@/os.js', () => ({ claimZIndex: () => 1000 }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, menuStyle: 'popup' } } }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));

function renderDialog(earnedMakeupCards?: number, returnFocusTo?: HTMLElement) {
	return render(MkCheckinSuccessDialog, {
		props: { points: 1, consecutiveDays: 7, earnedMakeupCards, returnFocusTo },
		global: { components: { I18n }, directives: { hotkey: hotkeyDirective }, stubs: { transition: false } },
	});
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('check-in success dialog', () => {
	test('announces the earned points and streak and initially focuses confirmation', async () => {
		const view = renderDialog();
		const dialog = view.getByRole('dialog', { name: i18n.ts._checkin.successTitle });
		expect(dialog.getAttribute('aria-modal')).toBe('true');
		expect(dialog.textContent).toContain(i18n.tsx._checkin.successReward({ n: '+1' }));
		expect([...dialog.querySelectorAll('strong')].map(element => element.textContent)).toEqual(['+1', '7']);
		expect(dialog.textContent).toContain(i18n.tsx._checkin.successStreak({ n: 7 }));
		expect(dialog.querySelector('.ti-ticket')).toBeNull();
		await waitFor(() => expect(document.activeElement).toBe(view.getByRole('button', { name: i18n.ts.ok })));
	});

	test.each([0, 1, 2])('shows a makeup reward only when %i cards were actually earned', earnedMakeupCards => {
		const view = renderDialog(earnedMakeupCards);
		const reward = view.queryByText(i18n.tsx._checkin.cardRewardReceived({ n: earnedMakeupCards }));
		expect(reward !== null).toBe(earnedMakeupCards > 0);
	});

	test.each(['confirm', 'close', 'escape', 'backdrop'])('closes through %s and restores focus to the caller', async method => {
		const trigger = document.createElement('button');
		document.body.append(trigger);
		try {
			const view = renderDialog(0, trigger);
			await waitFor(() => expect(document.activeElement).toBe(view.getByRole('button', { name: i18n.ts.ok })));
			if (method === 'escape') await fireEvent.keyDown(document, { key: 'Escape', keyCode: 27 });
			else if (method === 'backdrop') await fireEvent.click(view.getByTestId('bg'));
			else await fireEvent.click(view.getByRole('button', { name: method === 'confirm' ? i18n.ts.ok : i18n.ts.close }));
			await waitFor(() => expect(view.emitted().closed).toHaveLength(1));
			expect(document.activeElement).toBe(trigger);
			expect(view.queryByRole('dialog')).toBeNull();
		} finally {
			trigger.remove();
		}
	});
});
