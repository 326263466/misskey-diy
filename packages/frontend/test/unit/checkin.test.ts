/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/vue';
import { nextTick, ref } from 'vue';
import type { entities } from 'misskey-js';
import Checkin from '@/pages/checkin.vue';
import I18n from '@/components/global/I18n.vue';
import { i18n } from '@/i18n.js';
import { DI } from '@/di.js';
import { publishCheckinStatus } from '@/composables/use-checkin-status.js';
import { ACHIEVEMENT_BADGES, claimAchievement, claimedAchievements, SERVER_AWARDED_ACHIEVEMENT_TYPES } from '@/utility/achievements.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn(), alert: vi.fn(), popup: vi.fn(), dispose: vi.fn(), account: { id: 'self', username: 'self', createdAt: '2023-01-01T00:00:00Z', achievements: [] } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/i.js', () => ({ $i: mocks.account, ensureSignin: () => mocks.account }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/os.js', () => ({ alert: mocks.alert, confirm: mocks.confirm, popup: mocks.popup }));
vi.mock('@/composables/use-checkin-status.js', async () => {
	const { shallowRef } = await import('vue');
	const sharedStatus = shallowRef(null);
	return { useCheckinStatus: () => ({ status: sharedStatus }), publishCheckinStatus: vi.fn((_account, value) => { sharedStatus.value = value; }) };
});
vi.mock('@/components/MkCommunityHub.vue', () => ({ default: { template: '<main><slot/></main>' } }));

function status(overrides: Partial<entities.ICheckinStatusResponse> = {}): entities.ICheckinStatusResponse {
	return {
		timeZone: 'Asia/Shanghai', today: '2026-01-15', month: '2026-01', checkedInToday: false,
		totalDays: 0, consecutiveDays: 0, monthlyDays: 0, lastCheckinDate: null,
		checkedInDates: [], achievements: [], points: 0, makeupCards: 0, makeupDates: [], registeredDate: '2023-01-01',
		makeupCardProgress: 0, makeupCardTarget: 7, makeupCardExchangeCost: 7, ...overrides,
	};
}

function signedIn(overrides: Partial<entities.ICheckinResponse> = {}): entities.ICheckinResponse {
	return {
		...status({ checkedInToday: true, checkedInDates: ['2026-01-15'], totalDays: 1, consecutiveDays: 1, monthlyDays: 1, lastCheckinDate: '2026-01-15', achievements: [{ name: 'checkin1', unlockedAt: 1 }] }),
		newlyCheckedIn: true, earnedAchievements: ['checkin1'], points: 1, earnedPoints: 1, earnedMakeupCards: 0, ...overrides,
	};
}

function renderPage(pageActive = ref(true)) {
	return render(Checkin, { global: { components: { I18n }, provide: { [DI.pageActive as symbol]: pageActive }, stubs: {
		PageWithHeader: { template: '<div><slot/></div>' }, MkLoading: true,
		MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
	} } });
}

async function readyPage() {
	const view = renderPage();
	await waitFor(() => expect(view.getByTestId('checkin-calendar')).toBeTruthy());
	return view;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.api.mockReset();
	mocks.confirm.mockReset();
	mocks.confirm.mockResolvedValue({ canceled: false });
	mocks.popup.mockReturnValue({ dispose: mocks.dispose });
	claimedAchievements.splice(0);
	mocks.api.mockImplementation(async (endpoint: string) => endpoint === 'i/checkin' ? signedIn() : status());
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('daily check-in', () => {
	test('uses distinct artwork for check-in milestones without reusing existing achievements', () => {
		const checkins = new Set<string>(SERVER_AWARDED_ACHIEVEMENT_TYPES);
		const artwork = SERVER_AWARDED_ACHIEVEMENT_TYPES.map(name => ACHIEVEMENT_BADGES[name].img);
		const existing = Object.entries(ACHIEVEMENT_BADGES).filter(([name]) => !checkins.has(name)).map(([, badge]) => badge.img);
		expect(new Set(artwork).size).toBe(artwork.length);
		for (const image of artwork) expect(existing).not.toContain(image);
	});

	test('uses the achievement gallery badge artwork and frame for all six milestones', async () => {
		const view = await readyPage();
		const badges = view.container.querySelectorAll('article img');
		expect(badges).toHaveLength(6);
		for (const [index, name] of SERVER_AWARDED_ACHIEVEMENT_TYPES.entries()) {
			const badge = ACHIEVEMENT_BADGES[name];
			expect(badges[index].getAttribute('src')).toBe(badge.img);
			expect(badges[index].parentElement!.parentElement!.className).toContain(`iconFrame_${badge.frame}`);
		}
	});

	test('loads status without checking in automatically and displays unchecked today', async () => {
		const view = await readyPage();
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('i/checkin-status', {});
		expect((view.getByTestId('checkin-submit') as HTMLButtonElement).disabled).toBe(false);
		expect(view.getByTestId('checkin-submit').querySelector('i')).toBeNull();
		const today = view.container.querySelector('[data-checkin-date="2026-01-15"]')!;
		expect(today.getAttribute('aria-current')).toBe('date');
		expect(today.getAttribute('aria-label')).toContain(i18n.ts._checkin.notCheckedIn);
		expect((view.getByRole('button', { name: i18n.ts._checkin.nextMonth }) as HTMLButtonElement).disabled).toBe(false);
	});

	test('ignores repeat clicks while pending then displays the checked date and server-awarded milestone', async () => {
		const pending = Promise.withResolvers<entities.ICheckinResponse>();
		mocks.api.mockImplementation((endpoint: string) => endpoint === 'i/checkin' ? pending.promise : Promise.resolve(status()));
		const view = await readyPage();
		const button = view.getByTestId('checkin-submit') as HTMLButtonElement;
		button.click();
		button.click();
		await nextTick();
		expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'i/checkin')).toHaveLength(1);
		expect(button.disabled).toBe(true);
		expect(button.textContent).toContain(i18n.ts._checkin.checkingIn);
		pending.resolve(signedIn());
		await waitFor(() => expect(button.textContent).toContain(i18n.ts._checkin.checkedIn));
		expect(view.getByTestId('checkin-points').textContent).toBe('1');
		expect(view.getByRole('status').textContent).toContain(i18n.tsx._checkin.rewardReceived({ n: 1 }));
		expect(button.textContent).toContain(i18n.ts._checkin.checkedIn);
		expect(button.disabled).toBe(false);
		expect(mocks.popup).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ points: 1, consecutiveDays: 1, returnFocusTo: button }), expect.anything());
		expect(view.container.querySelector('[data-checkin-date="2026-01-15"]')!.getAttribute('aria-label')).toContain(i18n.ts._checkin.signed);
		const milestone = view.getByRole('heading', { name: i18n.ts._achievements._types._checkin1.title }).closest('article')!;
		expect(within(milestone).getByText(i18n.ts._checkin.earned)).toBeTruthy();
		expect(within(milestone).queryByRole('progressbar')).toBeNull();
	});

	test('reopens the same success reward after closing without submitting again or stacking dialogs', async () => {
		mocks.api.mockResolvedValueOnce(status({ makeupCardProgress: 6 })).mockResolvedValueOnce(signedIn({ earnedMakeupCards: 1, makeupCards: 1, consecutiveDays: 7 }));
		const view = await readyPage();
		const button = view.getByTestId('checkin-submit');
		await fireEvent.click(button);
		await waitFor(() => expect(mocks.popup).toHaveBeenCalledTimes(1));
		const firstProps = mocks.popup.mock.calls[0][1];
		expect(firstProps).toEqual({ points: 1, consecutiveDays: 7, earnedMakeupCards: 1, returnFocusTo: button });
		await fireEvent.click(button);
		expect(mocks.popup).toHaveBeenCalledTimes(1);
		mocks.popup.mock.calls[0][2].closed();
		await fireEvent.click(button);
		expect(mocks.popup).toHaveBeenCalledTimes(2);
		expect(mocks.popup.mock.calls[1][1]).toEqual(firstProps);
		expect(mocks.api).toHaveBeenCalledTimes(2);
		view.unmount();
		expect(mocks.dispose).toHaveBeenCalledTimes(2);
	});

	test('shows today reward from loaded status without claiming it again', async () => {
		mocks.api.mockResolvedValueOnce(signedIn({ points: 50, consecutiveDays: 3 }));
		const view = await readyPage();
		expect(mocks.popup).not.toHaveBeenCalled();
		await fireEvent.click(view.getByTestId('checkin-submit'));
		expect(mocks.popup.mock.calls[0][1]).toMatchObject({ points: 1, consecutiveDays: 3, earnedMakeupCards: 0 });
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('i/checkin-status', {});
	});

	test('exchanges seven points, refreshes selected month, and broadcasts new balances', async () => {
		mocks.api.mockResolvedValueOnce(status({ month: '2025-12', points: 7 }))
			.mockResolvedValueOnce({ points: 0, makeupCards: 1, exchanged: true })
			.mockResolvedValueOnce(status({ month: '2025-12', makeupCards: 1 }));
		const view = await readyPage();
		await fireEvent.click(view.getByTestId('checkin-exchange'));
		await waitFor(() => expect(view.getByTestId('checkin-makeup-cards').textContent).toBe('1'));
		expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ text: i18n.tsx._checkin.exchangeConfirm({ cost: 7 }) }));
		expect(mocks.api).toHaveBeenNthCalledWith(2, 'i/checkin-exchange', { requestId: expect.any(String) });
		expect(mocks.api).toHaveBeenLastCalledWith('i/checkin-status', { month: '2025-12' });
		expect(view.getByTestId('checkin-points').textContent).toBe('0');
		expect(publishCheckinStatus).toHaveBeenLastCalledWith('self', expect.objectContaining({ points: 0, makeupCards: 1 }), { broadcast: true });
	});

	test('retries an uncertain exchange with the same request ID to prevent double spending', async () => {
		mocks.api.mockResolvedValueOnce(status({ points: 14 }))
			.mockRejectedValueOnce(new Error('response lost'))
			.mockResolvedValueOnce({ points: 7, makeupCards: 1, exchanged: false })
			.mockResolvedValueOnce(status({ points: 7, makeupCards: 1 }));
		const view = await readyPage();
		await fireEvent.click(view.getByTestId('checkin-exchange'));
		await waitFor(() => expect(view.getByRole('alert').textContent).toContain(i18n.ts._checkin.cardExchangeFailed));
		const firstRequest = mocks.api.mock.calls[1];
		await fireEvent.click(within(view.getByRole('alert')).getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(view.getByTestId('checkin-makeup-cards').textContent).toBe('1'));
		expect(mocks.api.mock.calls[2]).toEqual(firstRequest);
		expect(view.getByTestId('checkin-points').textContent).toBe('7');
	});

	test('offers an exchange when a missed day has no card without automatically making up that day', async () => {
		mocks.api.mockResolvedValueOnce(status({ points: 7 }))
			.mockResolvedValueOnce({ points: 0, makeupCards: 1, exchanged: true })
			.mockResolvedValueOnce(status({ makeupCards: 1 }));
		const view = await readyPage();
		await fireEvent.click(view.getByRole('button', { name: i18n.tsx._checkin.makeupDate({ date: '2026-01-14' }) }));
		await waitFor(() => expect(view.getByTestId('checkin-makeup-cards').textContent).toBe('1'));
		expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: i18n.ts._checkin.noMakeupCardsTitle, text: i18n.tsx._checkin.noCardsExchange({ cost: 7 }) }));
		expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'i/checkin-makeup')).toBe(false);
	});

	test('does not exchange when canceled or when fewer than seven points are available', async () => {
		mocks.api.mockResolvedValueOnce(status({ points: 7 }));
		mocks.confirm.mockResolvedValueOnce({ canceled: true });
		let view = await readyPage();
		await fireEvent.click(view.getByTestId('checkin-exchange'));
		expect(mocks.api).toHaveBeenCalledTimes(1);
		view.unmount();
		mocks.api.mockResolvedValueOnce(status({ points: 6, makeupCardProgress: 6 }));
		view = await readyPage();
		await fireEvent.click(view.getByTestId('checkin-exchange'));
		expect(mocks.api).toHaveBeenCalledTimes(2);
		expect(mocks.alert).toHaveBeenCalledWith(expect.objectContaining({ text: i18n.tsx._checkin.noPointsForCard({ cost: 7, current: 6, target: 7 }) }));
	});

	test('spends one card to make up a past date and displays the server reward and updated streak', async () => {
		const pending = Promise.withResolvers<entities.ICheckinMakeupResponse>();
		mocks.api.mockResolvedValueOnce(status({ makeupCards: 2, points: 3 })).mockReturnValueOnce(pending.promise);
		const view = await readyPage();
		const button = view.getByRole('button', { name: i18n.tsx._checkin.makeupDate({ date: '2026-01-14' }) });
		await fireEvent.click(button);
		await waitFor(() => expect(mocks.api).toHaveBeenLastCalledWith('i/checkin-makeup', { date: '2026-01-14' }));
		await fireEvent.click(button);
		expect(mocks.confirm).toHaveBeenCalledTimes(1);
		expect(mocks.api).toHaveBeenCalledTimes(2);
		pending.resolve({ ...status({ points: 4, makeupCards: 1, makeupDates: ['2026-01-14'], checkedInDates: ['2026-01-14'], totalDays: 1, consecutiveDays: 1, monthlyDays: 1 }), newlyCheckedIn: true, earnedPoints: 1, earnedMakeupCards: 0, earnedAchievements: [] });
		await waitFor(() => expect(view.getByTestId('checkin-makeup-cards').textContent).toBe('1'));
		expect(view.getByTestId('checkin-points').textContent).toBe('4');
		expect(view.getByRole('status').textContent).toContain(i18n.tsx._checkin.makeupSuccess({ date: '2026-01-14', n: 1 }));
		expect(view.container.querySelector('[data-checkin-date="2026-01-14"]')!.getAttribute('aria-label')).toContain(i18n.ts._checkin.madeUp);
		expect((view.getByTestId('checkin-submit') as HTMLButtonElement).disabled).toBe(false);
	});

	test('does not offer makeup for registration or future boundaries and explains how to get cards when none remain', async () => {
		mocks.api.mockResolvedValueOnce(status({ registeredDate: '2026-01-10' }));
		const view = await readyPage();
		expect(view.queryByRole('button', { name: i18n.tsx._checkin.makeupDate({ date: '2026-01-09' }) })).toBeNull();
		expect(view.queryByRole('button', { name: i18n.tsx._checkin.makeupDate({ date: '2026-01-15' }) })).toBeNull();
		expect(view.queryByRole('button', { name: i18n.tsx._checkin.makeupDate({ date: '2026-01-16' }) })).toBeNull();
		const button = view.getByRole('button', { name: i18n.tsx._checkin.makeupDate({ date: '2026-01-10' }) }) as HTMLButtonElement;
		expect(button.disabled).toBe(false);
		expect(button.textContent).toBe(i18n.ts._checkin.pendingMakeup);
		await fireEvent.click(button);
		expect(mocks.api).toHaveBeenCalledTimes(1);
		expect(mocks.confirm).not.toHaveBeenCalled();
		expect(mocks.alert).toHaveBeenCalledExactlyOnceWith({ type: 'warning', title: i18n.ts._checkin.noMakeupCardsTitle, text: i18n.tsx._checkin.noPointsForCard({ cost: 7, current: 0, target: 7 }) });
	});

	test('shows compact rewards, today, missing days, and the card balance beside the month', async () => {
		mocks.api.mockResolvedValueOnce(status({ checkedInDates: ['2026-01-13', '2026-01-14'], makeupDates: ['2026-01-13'], makeupCards: 2 }));
		const view = await readyPage();
		const calendar = view.getByTestId('checkin-calendar');
		const cell = (date: string) => calendar.querySelector(`[data-checkin-date="${date}"]`)!;
		for (const date of ['2026-01-13', '2026-01-14']) {
			expect(cell(date).querySelector('.ti-check')).not.toBeNull();
			expect(cell(date).querySelector('.ti-diamond-filled')).not.toBeNull();
			expect(cell(date).textContent?.trim()).toBe(`${Number(date.slice(-2))}+1`);
			expect(cell(date).querySelector('button')).toBeNull();
			expect(cell(date).querySelector('[aria-label]')?.getAttribute('aria-label')).toBe(i18n.tsx._checkin.pointsEarned({ n: 1 }));
		}
		expect(cell('2026-01-13').getAttribute('aria-label')).toContain(i18n.ts._checkin.madeUp);
		expect(cell('2026-01-15').textContent).toContain(i18n.ts._checkin.todayLabel);
		expect(cell('2026-01-16').querySelector('.ti-diamond-filled')).not.toBeNull();
		expect(cell('2026-01-16').textContent).toContain('+1');
		expect(cell('2026-01-16').querySelector('button')).toBeNull();
		expect(cell('2026-01-12').querySelector('button')?.textContent).toBe(i18n.ts._checkin.pendingMakeup);
		const cardCount = view.getByTestId('checkin-makeup-cards');
		expect(cardCount.textContent).toBe('2');
		expect(cardCount.closest('section')?.getAttribute('aria-label')).toBe(i18n.ts._checkin.calendar);
		expect(view.queryAllByTestId('checkin-makeup-cards')).toHaveLength(1);
	});

	test.each([true, false])('does not spend a card when confirmation is canceled or the page unmounts (canceled: %s)', async canceled => {
		mocks.api.mockResolvedValueOnce(status({ makeupCards: 1 }));
		const confirmation = Promise.withResolvers<{ canceled: boolean }>();
		mocks.confirm.mockReturnValueOnce(confirmation.promise);
		const view = await readyPage();
		await fireEvent.click(view.getByRole('button', { name: i18n.tsx._checkin.makeupDate({ date: '2026-01-14' }) }));
		if (!canceled) view.unmount();
		confirmation.resolve({ canceled });
		await nextTick();
		expect(mocks.api).toHaveBeenCalledTimes(1);
	});

	test('keeps server balances unchanged after makeup fails and reports insufficient cards', async () => {
		mocks.api.mockResolvedValueOnce(status({ makeupCards: 1, points: 3 })).mockRejectedValueOnce({ code: 'NO_MAKEUP_CARDS' });
		const view = await readyPage();
		await fireEvent.click(view.getByRole('button', { name: i18n.tsx._checkin.makeupDate({ date: '2026-01-14' }) }));
		await waitFor(() => expect(view.getByRole('alert').textContent).toContain(i18n.ts._checkin.noMakeupCards));
		expect(view.getByTestId('checkin-points').textContent).toBe('3');
		expect(view.queryByRole('status')).toBeNull();
	});

	test('refreshes a check-in completed elsewhere without broadcasting its status read back', async () => {
		mocks.api.mockResolvedValueOnce(status()).mockResolvedValueOnce(signedIn());
		const view = await readyPage();
		publishCheckinStatus('self', signedIn());
		await waitFor(() => expect(view.getByTestId('checkin-points').textContent).toBe('1'));
		expect((view.getByTestId('checkin-submit') as HTMLButtonElement).disabled).toBe(false);
		expect(mocks.api).toHaveBeenCalledTimes(2);
		expect(publishCheckinStatus).toHaveBeenLastCalledWith('self', expect.objectContaining({ checkedInToday: true }), { broadcast: false });
	});

	test('revalidates an external update received while the initial calendar is still loading', async () => {
		const initial = Promise.withResolvers<entities.ICheckinStatusResponse>();
		mocks.api.mockReturnValueOnce(initial.promise).mockResolvedValueOnce(signedIn());
		const view = renderPage();
		publishCheckinStatus('self', signedIn());
		initial.resolve(status());
		await waitFor(() => expect(view.getByTestId('checkin-points').textContent).toBe('1'));
		expect((view.getByTestId('checkin-submit') as HTMLButtonElement).disabled).toBe(false);
		expect(mocks.api).toHaveBeenCalledTimes(2);
	});

	test('reloads balances changed elsewhere while a daily check-in request is pending', async () => {
		const mutation = Promise.withResolvers<entities.ICheckinResponse>();
		mocks.api.mockResolvedValueOnce(status({ makeupCards: 1 })).mockReturnValueOnce(mutation.promise).mockResolvedValueOnce(signedIn({ points: 2, makeupCards: 0, makeupDates: ['2026-01-14'], checkedInDates: ['2026-01-14', '2026-01-15'] }));
		const view = await readyPage();
		await fireEvent.click(view.getByTestId('checkin-submit'));
		publishCheckinStatus('self', status({ makeupCards: 0, points: 1, makeupDates: ['2026-01-14'] }));
		mutation.resolve(signedIn({ makeupCards: 1 }));
		await waitFor(() => expect(view.getByTestId('checkin-points').textContent).toBe('2'));
		expect(view.getByTestId('checkin-makeup-cards').textContent).toBe('0');
		expect(view.container.querySelector('[data-checkin-date="2026-01-14"]')!.getAttribute('aria-label')).toContain(i18n.ts._checkin.madeUp);
		expect(mocks.api).toHaveBeenCalledTimes(3);
	});

	test('reloads an external card update after canceling makeup confirmation', async () => {
		const confirmation = Promise.withResolvers<{ canceled: boolean }>();
		mocks.confirm.mockReturnValueOnce(confirmation.promise);
		mocks.api.mockResolvedValueOnce(status({ makeupCards: 1 })).mockResolvedValueOnce(status({ makeupCards: 0, points: 1, makeupDates: ['2026-01-14'], checkedInDates: ['2026-01-14'] }));
		const view = await readyPage();
		await fireEvent.click(view.getByRole('button', { name: i18n.tsx._checkin.makeupDate({ date: '2026-01-14' }) }));
		publishCheckinStatus('self', status());
		confirmation.resolve({ canceled: true });
		await waitFor(() => expect(view.getByTestId('checkin-makeup-cards').textContent).toBe('0'));
		expect(view.getByTestId('checkin-points').textContent).toBe('1');
		expect(mocks.api).toHaveBeenCalledTimes(2);
		expect(mocks.api.mock.calls.every(([endpoint]) => endpoint === 'i/checkin-status')).toBe(true);
	});

	test('preserves a requested future month through an external update then returns to the current month', async () => {
		const nextMonth = Promise.withResolvers<entities.ICheckinStatusResponse>();
		mocks.api.mockResolvedValueOnce(status()).mockReturnValueOnce(nextMonth.promise).mockResolvedValueOnce(signedIn({ month: '2026-02', checkedInDates: [] })).mockResolvedValueOnce(signedIn());
		const view = await readyPage();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.nextMonth }));
		publishCheckinStatus('self', signedIn());
		nextMonth.resolve(status({ month: '2026-02' }));
		await waitFor(() => expect(view.container.querySelector('[data-checkin-date="2026-02-01"]')).not.toBeNull());
		expect(mocks.api).toHaveBeenLastCalledWith('i/checkin-status', { month: '2026-02' });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.currentMonth }));
		await waitFor(() => expect(view.container.querySelector('[data-checkin-date="2026-01-15"]')).not.toBeNull());
		expect(mocks.api).toHaveBeenLastCalledWith('i/checkin-status', {});
		expect(mocks.api).toHaveBeenCalledTimes(4);
	});

	test('follows the current month when an external update crosses a month boundary during a refresh', async () => {
		const refresh = Promise.withResolvers<entities.ICheckinStatusResponse>();
		mocks.api.mockResolvedValueOnce(status({ today: '2026-01-31' })).mockReturnValueOnce(refresh.promise).mockResolvedValueOnce(status({ today: '2026-02-01', month: '2026-02' }));
		const view = await readyPage();
		window.dispatchEvent(new Event('focus'));
		publishCheckinStatus('self', status({ today: '2026-02-01', month: '2026-02' }));
		refresh.resolve(status({ today: '2026-01-31' }));
		await waitFor(() => expect(view.container.querySelector('[data-checkin-date="2026-02-01"]')).not.toBeNull());
		expect(mocks.api).toHaveBeenLastCalledWith('i/checkin-status', {});
		expect(mocks.api).toHaveBeenCalledTimes(3);
	});

	test('anchors the server date to the observed device date without continuously polling an offset clock', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-28T10:00:00Z'));
		renderPage();
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(mocks.api).toHaveBeenCalledTimes(1);
	});

	test('revalidates a status response requested before midnight before marking the new day as checked in', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-31T15:59:50Z'));
		const pending = Promise.withResolvers<entities.ICheckinStatusResponse>();
		mocks.api.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(status({ today: '2026-02-01', month: '2026-02' }));
		const view = renderPage();
		vi.setSystemTime(new Date('2026-01-31T16:00:01Z'));
		pending.resolve(signedIn({ today: '2026-01-31' }));
		await vi.advanceTimersByTimeAsync(0);
		expect(mocks.api).toHaveBeenCalledTimes(2);
		expect(view.container.querySelector('[data-checkin-date="2026-02-01"]')).not.toBeNull();
		expect((view.getByTestId('checkin-submit') as HTMLButtonElement).disabled).toBe(false);
	});

	test.each(['i/checkin', 'i/checkin-makeup'] as const)('broadcasts one fresh snapshot when %s finishes after midnight', async endpoint => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-31T15:59:50Z'));
		const mutation = Promise.withResolvers<entities.ICheckinResponse>();
		const current = Promise.withResolvers<entities.ICheckinStatusResponse>();
		mocks.api.mockResolvedValueOnce(status({ today: '2026-01-31', makeupCards: 1 })).mockReturnValueOnce(mutation.promise).mockReturnValueOnce(current.promise);
		const view = renderPage();
		await vi.advanceTimersByTimeAsync(0);
		if (endpoint === 'i/checkin') {
			await fireEvent.click(view.getByTestId('checkin-submit'));
		} else {
			await fireEvent.click(view.getByRole('button', { name: i18n.tsx._checkin.makeupDate({ date: '2026-01-30' }) }));
		}
		await vi.advanceTimersByTimeAsync(0);
		expect(mocks.api).toHaveBeenLastCalledWith(endpoint, endpoint === 'i/checkin' ? {} : { date: '2026-01-30' });
		vi.setSystemTime(new Date('2026-01-31T16:00:01Z'));
		mutation.resolve(signedIn({ today: '2026-01-31' }));
		await vi.advanceTimersByTimeAsync(0);
		expect(mocks.api).toHaveBeenCalledTimes(3);
		expect(vi.mocked(publishCheckinStatus).mock.calls.filter(([, , options]) => options?.broadcast)).toHaveLength(0);
		current.resolve(status({ today: '2026-02-01', month: '2026-02', points: 1 }));
		await vi.advanceTimersByTimeAsync(0);
		expect((view.getByTestId('checkin-submit') as HTMLButtonElement).disabled).toBe(false);
		expect(view.container.querySelector('[data-checkin-date="2026-02-01"]')).not.toBeNull();
		expect(publishCheckinStatus).toHaveBeenLastCalledWith('self', expect.objectContaining({ today: '2026-02-01' }), { broadcast: true });
		expect(vi.mocked(publishCheckinStatus).mock.calls.filter(([, , options]) => options?.broadcast)).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(mocks.api).toHaveBeenCalledTimes(3);
	});

	test('does not submit an already checked-in day and handles a check-in completed in another tab', async () => {
		mocks.api.mockResolvedValueOnce(signedIn());
		let view = await readyPage();
		await fireEvent.click(view.getByTestId('checkin-submit'));
		expect(mocks.api).toHaveBeenCalledTimes(1);
		view.unmount();
		mocks.api.mockResolvedValueOnce(status()).mockResolvedValueOnce(signedIn({ newlyCheckedIn: false, earnedAchievements: [] }));
		view = await readyPage();
		await fireEvent.click(view.getByTestId('checkin-submit'));
		await waitFor(() => expect(view.getByTestId('checkin-submit').textContent).toContain(i18n.ts._checkin.checkedIn));
		expect((view.getByTestId('checkin-submit') as HTMLButtonElement).disabled).toBe(false);
	});

	test('keeps the day unchecked after a failed submission and allows retry', async () => {
		mocks.api.mockResolvedValueOnce(status()).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(signedIn());
		const view = await readyPage();
		const button = view.getByTestId('checkin-submit') as HTMLButtonElement;
		await fireEvent.click(button);
		await waitFor(() => expect(view.getByRole('alert').textContent).toContain(i18n.ts._checkin.checkinFailed));
		expect(button.disabled).toBe(false);
		expect(view.container.querySelector('[data-checkin-date="2026-01-15"]')!.getAttribute('aria-label')).toContain(i18n.ts._checkin.notCheckedIn);
		await fireEvent.click(button);
		await waitFor(() => expect(button.textContent).toContain(i18n.ts._checkin.checkedIn));
		expect(view.queryByRole('alert')).toBeNull();
	});

	test('requests the previous server month across a year boundary and preserves it when retrying', async () => {
		mocks.api.mockResolvedValueOnce(status()).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(status({ month: '2025-12', checkedInDates: ['2025-12-31'] })).mockResolvedValueOnce(status());
		const view = await readyPage();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.previousMonth }));
		await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
		expect(mocks.api).toHaveBeenLastCalledWith('i/checkin-status', { month: '2025-12' });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(view.container.querySelector('[data-checkin-date="2025-12-31"]')).not.toBeNull());
		expect(mocks.api).toHaveBeenLastCalledWith('i/checkin-status', { month: '2025-12' });
		expect(view.container.querySelector('[data-checkin-date="2026-01-15"]')).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.currentMonth }));
		await waitFor(() => expect(view.container.querySelector('[data-checkin-date="2026-01-15"]')).not.toBeNull());
		expect(mocks.api).toHaveBeenLastCalledWith('i/checkin-status', {});
	});

	test('can browse months before registration and upcoming months without checking in', async () => {
		mocks.api.mockImplementation(async (_endpoint: string, params: { month?: string }) => status({ month: params.month ?? '2023-01' }));
		const view = await readyPage();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.previousMonth }));
		await waitFor(() => expect(view.container.querySelector('[data-checkin-date="2022-12-01"]')).not.toBeNull());
		mocks.api.mockResolvedValueOnce(status({ month: '2026-01' }));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.currentMonth }));
		await waitFor(() => expect(view.container.querySelector('[data-checkin-date="2026-01-01"]')).not.toBeNull());
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.nextMonth }));
		await waitFor(() => expect(view.container.querySelector('[data-checkin-date="2026-02-01"]')).not.toBeNull());
		expect(mocks.api).toHaveBeenLastCalledWith('i/checkin-status', { month: '2026-02' });
		expect(mocks.api.mock.calls.every(([endpoint]) => endpoint === 'i/checkin-status')).toBe(true);
	});

	test('uses the returned month to render leap February and returns to today after checking in from history', async () => {
		mocks.api.mockResolvedValueOnce(status({ month: '2024-03', today: '2024-03-01' })).mockResolvedValueOnce(status({ month: '2024-02', today: '2024-03-01', checkedInDates: ['2024-02-29'] })).mockResolvedValueOnce(signedIn({ month: '2024-03', today: '2024-03-01', checkedInDates: ['2024-03-01'] }));
		const view = await readyPage();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._checkin.previousMonth }));
		await waitFor(() => expect(view.container.querySelector('[data-checkin-date="2024-02-29"]')).not.toBeNull());
		expect(mocks.api).toHaveBeenLastCalledWith('i/checkin-status', { month: '2024-02' });
		expect(view.container.querySelectorAll('[data-checkin-date]')).toHaveLength(29);
		await fireEvent.click(view.getByTestId('checkin-submit'));
		await waitFor(() => expect(view.container.querySelector('[data-checkin-date="2024-03-01"]')).not.toBeNull());
		expect(view.container.querySelector('[data-checkin-date="2024-02-29"]')).toBeNull();
	});

	test('can retry an initial status error without creating a check-in', async () => {
		mocks.api.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(status());
		const view = renderPage();
		await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
		expect((view.getByTestId('checkin-submit') as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(view.getByTestId('checkin-calendar')).toBeTruthy());
		expect(mocks.api.mock.calls.every(([endpoint]) => endpoint === 'i/checkin-status')).toBe(true);
	});

	test('refreshes on stacked-page return and does not refresh a covered page on focus', async () => {
		const pageActive = ref(true);
		mocks.api.mockResolvedValueOnce(status({ today: '2026-01-31' })).mockResolvedValueOnce(status({ today: '2026-02-01', month: '2026-02', checkedInToday: true, checkedInDates: ['2026-02-01'] }));
		const view = renderPage(pageActive);
		await waitFor(() => expect(view.getByTestId('checkin-calendar')).toBeTruthy());
		pageActive.value = false;
		await nextTick();
		mocks.api.mockClear();
		window.dispatchEvent(new Event('focus'));
		document.dispatchEvent(new Event('visibilitychange'));
		await nextTick();
		expect(mocks.api).not.toHaveBeenCalled();
		pageActive.value = true;
		await waitFor(() => expect(view.container.querySelector('[data-checkin-date="2026-02-01"]')).not.toBeNull());
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('i/checkin-status', {});
		expect((view.getByTestId('checkin-submit') as HTMLButtonElement).disabled).toBe(false);
		expect(view.getByRole('group', { name: i18n.tsx._checkin.dateState({ date: '2026-02-01', state: i18n.ts._checkin.signed }) })).toBeTruthy();
	});
});

describe('server-awarded achievement protection', () => {
	test.each(SERVER_AWARDED_ACHIEVEMENT_TYPES)('does not locally claim or request %s', async name => {
		await claimAchievement(name);
		expect(mocks.api).not.toHaveBeenCalled();
		expect(claimedAchievements).not.toContain(name);
	});
});
