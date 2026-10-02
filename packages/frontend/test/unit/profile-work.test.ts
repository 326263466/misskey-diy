/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import ProfileSettings from '@/pages/settings/profile.vue';
import MkUserInfo from '@/components/MkUserInfo.vue';
import { i18n } from '@/i18n.js';
import type * as Misskey from 'misskey-js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(), update: vi.fn(), popupMenu: vi.fn(), popup: vi.fn(),
	account: { id: 'self', username: 'alice', company: 'Example Company', jobTitle: 'Engineer', fields: [], lang: null, policies: {} },
}));

vi.mock('@/i.js', () => ({ $i: mocks.account, ensureSignin: () => mocks.account, iAmModerator: false }));
vi.mock('@/os.js', () => ({ apiWithDialog: mocks.api, popupMenu: mocks.popupMenu, popup: mocks.popup }));
vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: mocks.update }));
vi.mock('@/utility/drive.js', () => ({ chooseDriveFile: vi.fn() }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: vi.fn() }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { detach() {} } }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/store.js', async () => {
	const { ref } = await import('vue');
	return { store: { model: () => ref(null) } };
});
vi.mock('@/composables/use-user-statistics.js', () => ({ useUserStatistics: vi.fn() }));
vi.mock('@/composables/use-user-statistics-visibility.js', () => ({ useUserStatisticsVisibility: vi.fn() }));

const slot = { template: '<div><slot/></div>' };
const global = {
	directives: { 'adaptive-border': {}, tooltip: {}, panel: {} },
	stubs: {
		SearchMarker: slot, SearchLabel: slot, SearchText: slot,
		MkAvatar: true, MkTextarea: true, MkSelect: true, MkFolder: true,
		MkSwitch: true, MkFollowButton: true, MkAcct: true, Mfm: true,
		MkUserName: true, MkA: { template: '<a><slot/></a>' },
	},
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.api.mockImplementation(async (_endpoint, params) => ({ ...mocks.account, ...params }));
});
afterEach(cleanup);

describe('company and job title profile editing', () => {
	test('opens the profile QR code in a dialog without a route link', async () => {
		const dispose = vi.fn();
		mocks.popup.mockReturnValue({ dispose });
		const view = render(ProfileSettings, { global });
		const qr = view.getByTestId('profile-qr');
		expect(qr.tagName).toBe('BUTTON');
		expect(qr.querySelector('a')).toBeNull();
		await fireEvent.click(qr);
		expect(mocks.popup).toHaveBeenCalledTimes(1);
		expect(mocks.popup.mock.calls[0][1]).toEqual({ user: mocks.account });
		mocks.popup.mock.calls[0][2].closed();
		expect(dispose).toHaveBeenCalledTimes(1);
	});
	test('publishes the confirmed nickname without waiting for a streaming event', async () => {
		let confirmSave!: (user: unknown) => void;
		mocks.api.mockReturnValueOnce(new Promise(resolve => { confirmSave = resolve; }));
		const view = render(ProfileSettings, { global });
		const name = view.getByRole('combobox', { name: i18n.ts._profile.name, exact: true });
		await fireEvent.update(name, 'New name');
		await fireEvent.blur(name);
		await fireEvent.click(name.closest('div._selectable')!.querySelector('button')!);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
		expect(mocks.update).not.toHaveBeenCalled();
		const confirmed = { ...mocks.account, name: 'Confirmed name' };
		confirmSave(confirmed);
		await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ name: 'Confirmed name' })));
		expect(mocks.update.mock.lastCall![0]).toEqual({ name: 'Confirmed name' });
		expect(mocks.api.mock.calls[0][1]).toEqual({ name: 'New name' });
	});

	test('serializes nickname and work saves and applies each response before the next request', async () => {
		let finishFirst!: (value: unknown) => void;
		mocks.api.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }));
		const view = render(ProfileSettings, { global });
		const name = view.getByRole('combobox', { name: i18n.ts._profile.name, exact: true });
		await fireEvent.update(name, 'New name');
		await fireEvent.blur(name);
		await fireEvent.click(name.closest('div._selectable')!.querySelector('button')!);
		const company = view.getByRole('combobox', { name: i18n.ts._profile.company });
		await fireEvent.update(company, 'New Company');
		await fireEvent.blur(company);
		expect(mocks.api).toHaveBeenCalledOnce();
		mocks.api.mockImplementationOnce(async (_endpoint, params) => {
			expect(mocks.update).toHaveBeenCalledWith({ name: 'New name' });
			return { ...mocks.account, ...params };
		});
		finishFirst({ ...mocks.account, name: 'New name' });
		await waitFor(() => expect(mocks.update).toHaveBeenLastCalledWith({ company: 'New Company' }));
		expect(mocks.api.mock.calls[0][1]).toEqual({ name: 'New name' });
		expect(mocks.api.mock.calls[1][1]).toEqual({ company: 'New Company' });
	});

	test('shows automatic for the default language and lets a selected language return to automatic', async () => {
		const view = render(ProfileSettings, { global: { ...global, stubs: { ...global.stubs, MkSelect: false } } });
		expect(view.getByText(i18n.ts.auto)).toBeTruthy();
		const select = view.container.querySelector<HTMLElement>('[tabindex="0"]')!;
		await fireEvent.mouseDown(select);
		const options = mocks.popupMenu.mock.calls[0][0];
		const closeMenu = mocks.popupMenu.mock.calls[0][2].onClosing;
		const language = options.find((item: { text: string }) => item.text !== i18n.ts.auto);
		language.action();
		closeMenu();
		await waitFor(() => expect(view.getByText(language.text)).toBeTruthy());
		await fireEvent.mouseDown(select);
		options.find((item: { text: string }) => item.text === i18n.ts.auto).action();
		await waitFor(() => expect(view.getByText(i18n.ts.auto)).toBeTruthy());
		await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
		expect(mocks.api.mock.calls[0][1].lang).toBeTruthy();
		expect(mocks.api.mock.calls[1][1].lang).toBeNull();
	});

	test('restores fields and saves only the changed field when the pointer leaves, without a save button', async () => {
		const view = render(ProfileSettings, { global });
		const company = view.getByRole('combobox', { name: i18n.ts._profile.company }) as HTMLInputElement;
		const jobTitle = view.getByRole('combobox', { name: i18n.ts._profile.jobTitle }) as HTMLInputElement;
		expect(company.value).toBe('Example Company');
		expect(jobTitle.value).toBe('Engineer');
		expect(company.maxLength).toBe(128);
		expect(jobTitle.maxLength).toBe(128);
		expect(company.autocomplete).toBe('organization');
		expect(jobTitle.autocomplete).toBe('organization-title');
		await fireEvent.update(company, '  New Company  ');
		expect(mocks.api).not.toHaveBeenCalled();
		expect(view.queryByRole('button', { name: i18n.ts.save })).toBeNull();
		await fireEvent.mouseLeave(company.parentElement!);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
		expect(mocks.api.mock.calls[0][1]).toEqual({ company: 'New Company' });
		expect(mocks.update).toHaveBeenCalledWith({ company: 'New Company' });
		await fireEvent.blur(company);
		expect(mocks.api).toHaveBeenCalledOnce();
	});

	test.each(['Enter', 'NumpadEnter'])('%s finishes editing and saves once without submitting a form', async code => {
		const view = render(ProfileSettings, { global });
		const company = view.getByRole('combobox', { name: i18n.ts._profile.company }) as HTMLInputElement;
		company.focus();
		await fireEvent.update(company, 'New Company');
		const enter = new KeyboardEvent('keydown', { key: 'Enter', code, bubbles: true, cancelable: true });
		company.dispatchEvent(enter);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
		expect(enter.defaultPrevented).toBe(true);
		expect(document.activeElement).not.toBe(company);
		expect(mocks.api.mock.calls[0][1]).toEqual({ company: 'New Company' });
		await fireEvent.blur(company);
		expect(mocks.api).toHaveBeenCalledOnce();
	});

	test('keeps editing when Enter confirms an IME composition, then finishes on a separate Enter', async () => {
		const view = render(ProfileSettings, { global });
		const company = view.getByRole('combobox', { name: i18n.ts._profile.company }) as HTMLInputElement;
		company.focus();
		await fireEvent.compositionStart(company);
		await fireEvent.update(company, '新的公司');
		await fireEvent.keyDown(company, { key: 'Enter', code: 'Enter' });
		expect(document.activeElement).toBe(company);
		expect(mocks.api).not.toHaveBeenCalled();
		await fireEvent.compositionEnd(company);
		expect(mocks.api).not.toHaveBeenCalled();
		await fireEvent.keyDown(company, { key: 'Enter', code: 'Enter' });
		await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
		expect(document.activeElement).not.toBe(company);
		expect(mocks.api.mock.calls[0][1]).toEqual({ company: '新的公司' });
	});

	test('clears an optional value as null while preserving the other field', async () => {
		const view = render(ProfileSettings, { global });
		const jobTitle = view.getByRole('combobox', { name: i18n.ts._profile.jobTitle });
		await fireEvent.update(jobTitle, '   ');
		await fireEvent.blur(jobTitle);
		await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ jobTitle: null }));
		expect(mocks.api.mock.calls[0][1]).toEqual({ jobTitle: null });
	});

	test('keeps the draft and current account unchanged if saving fails', async () => {
		mocks.api.mockRejectedValueOnce(new Error('Connection failed'));
		const view = render(ProfileSettings, { global });
		const company = view.getByRole('combobox', { name: i18n.ts._profile.company }) as HTMLInputElement;
		await fireEvent.update(company, 'Unsaved Company');
		await fireEvent.blur(company);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
		expect(company.value).toBe('Unsaved Company');
		expect(mocks.update).not.toHaveBeenCalled();
		await fireEvent.focus(company);
		await fireEvent.blur(company);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ company: 'Unsaved Company' }));
	});

	test('waits for composition to finish after leaving the input', async () => {
		const view = render(ProfileSettings, { global });
		const company = view.getByRole('combobox', { name: i18n.ts._profile.company }) as HTMLInputElement;
		await fireEvent.compositionStart(company);
		await fireEvent.update(company, '新的公司');
		await fireEvent.mouseLeave(company.parentElement!);
		expect(mocks.api).not.toHaveBeenCalled();
		await fireEvent.compositionEnd(company);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
		expect(mocks.api.mock.calls[0][1]).toEqual({ company: '新的公司' });
	});

	test('serializes consecutive edits and only synchronizes the field saved by each response', async () => {
		let finishFirst!: (value: unknown) => void;
		mocks.api.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }));
		const view = render(ProfileSettings, { global });
		const company = view.getByRole('combobox', { name: i18n.ts._profile.company });
		const jobTitle = view.getByRole('combobox', { name: i18n.ts._profile.jobTitle });
		await fireEvent.update(company, 'New Company');
		await fireEvent.blur(company);
		await fireEvent.update(jobTitle, 'Designer');
		await fireEvent.blur(jobTitle);
		expect(mocks.api).toHaveBeenCalledOnce();
		finishFirst({ ...mocks.account, company: 'New Company' });
		await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
		expect(mocks.api.mock.calls[1][1]).toEqual({ jobTitle: 'Designer' });
		await waitFor(() => expect(mocks.update).toHaveBeenLastCalledWith({ jobTitle: 'Designer' }));
	});
});

describe('company and job title user card', () => {
	test.each([
		{ company: 'Example Company', jobTitle: 'Engineer' },
		{ company: 'Example Company', jobTitle: null },
		{ company: null, jobTitle: 'Engineer' },
		{ company: null, jobTitle: null },
	])('shows only the filled values: %j', fields => {
		const view = render(MkUserInfo, { props: { user: { id: 'self', username: 'alice', ...fields } as Misskey.entities.UserDetailed }, global });
		for (const [key, value] of Object.entries(fields)) {
			const label = i18n.ts._profile[key as 'company' | 'jobTitle'];
			if (value) {
				expect(view.getByText(label).tagName).toBe('DT');
				expect(view.getByText(value).tagName).toBe('DD');
			} else {
				expect(view.queryByText(label)).toBeNull();
			}
		}
	});
});
