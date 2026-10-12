/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import ProfileSettings from '@/pages/settings/profile.vue';
import MkUserInfo from '@/components/MkUserInfo.vue';
import { i18n } from '@/i18n.js';
import { versatileLang } from '@@/js/intl-const.js';
import type * as Misskey from 'misskey-js';
import { markAccountSessionErrorHandled } from '@/utility/account-session-error.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(), update: vi.fn(), popupMenu: vi.fn(), popup: vi.fn(), toast: vi.fn(),
	chooseFileFromPc: vi.fn(), chooseDriveFile: vi.fn(), confirm: vi.fn(), cropImageFile: vi.fn(), launchUploader: vi.fn(),
	account: { id: 'self', username: 'alice', company: 'Example Company', jobTitle: 'Engineer', fields: [], lang: null, policies: {}, avatarId: null as string | null, bannerId: null as string | null, birthday: null as string | null },
}));

vi.mock('@/i.js', () => ({ $i: mocks.account, ensureSignin: () => mocks.account, iAmModerator: false, iAmAdmin: false }));
vi.mock('@/os.js', () => ({
	popupMenu: mocks.popupMenu, popup: mocks.popup, toast: mocks.toast,
	chooseFileFromPc: mocks.chooseFileFromPc, confirm: mocks.confirm, cropImageFile: mocks.cropImageFile, launchUploader: mocks.launchUploader,
}));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api, misskeyApiGet: vi.fn() }));
vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: mocks.update }));
vi.mock('@/utility/drive.js', () => ({ chooseDriveFile: mocks.chooseDriveFile }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: vi.fn() }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { detach() {} } }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/store.js', async () => {
	const { ref } = await import('vue');
	return { store: { model: () => ref(null) } };
});
vi.mock('@/composables/use-user-statistics.js', () => ({ useUserStatistics: vi.fn() }));
vi.mock('@/composables/use-user-statistics-visibility.js', () => ({ useUserStatisticsVisibility: vi.fn() }));
vi.mock('@@/js/use-lowres-time.js', async () => {
	const { ref } = await import('vue');
	return { useLowresTime: () => ref(Date.now()) };
});
vi.mock('@/components/MkModal.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ emits: ['closed', 'click', 'esc'], setup(_props, { slots, expose, emit }) {
		expose({ close: () => emit('closed') });
		return () => h('div', slots.default?.({ maxHeight: 600 }));
	} }) };
});

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

async function confirmField(input: HTMLElement): Promise<void> {
	await fireEvent.click(input.closest('div._selectable')!.querySelector('button')!);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.account.avatarId = null;
	mocks.account.bannerId = null;
	mocks.account.birthday = null;
	mocks.api.mockImplementation(async (_endpoint, params) => ({ ...mocks.account, ...params }));
});
afterEach(cleanup);

describe('birthday profile editing', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 9, 7, 0, 30));
	});
	afterEach(() => vi.useRealTimers());

	test('rejects tomorrow but allows saving today just after local midnight', async () => {
		const view = render(ProfileSettings, { global });
		await fireEvent.click(view.getByLabelText(i18n.ts.birthday));
		await view.findByRole('dialog', { name: i18n.ts._datePicker.title });
		const dateLabel = (day: number) => new Intl.DateTimeFormat(versatileLang, { dateStyle: 'full' }).format(new Date(2026, 9, day));
		const tomorrow = view.getByRole('button', { name: dateLabel(8) });
		expect(tomorrow).toHaveProperty('disabled', true);
		await fireEvent.click(tomorrow);
		expect(view.getByRole('dialog')).toBeTruthy();
		expect(view.queryByRole('button', { name: i18n.ts.save })).toBeNull();
		expect(mocks.api).not.toHaveBeenCalled();

		const today = view.getByRole('button', { name: dateLabel(7) });
		expect(today).toHaveProperty('disabled', false);
		await fireEvent.click(today);
		await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.save }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledExactlyOnceWith('i/update', { birthday: '2026-10-07' }));
		await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ birthday: '2026-10-07' }));
	});

	test('allows a historical leap day and clearing the birthday', async () => {
		mocks.account.birthday = '2024-02-28';
		const view = render(ProfileSettings, { global });
		await fireEvent.click(view.getByLabelText(i18n.ts.birthday));
		await view.findByRole('dialog', { name: i18n.ts._datePicker.title });
		const leapDay = view.getByRole('button', { name: new Intl.DateTimeFormat(versatileLang, { dateStyle: 'full' }).format(new Date(2024, 1, 29)) });
		expect(leapDay).toHaveProperty('disabled', false);
		await fireEvent.click(leapDay);
		await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.save }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledExactlyOnceWith('i/update', { birthday: '2024-02-29' }));
		await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ birthday: '2024-02-29' }));

		await fireEvent.click(view.getByLabelText(i18n.ts.birthday));
		await view.findByRole('dialog', { name: i18n.ts._datePicker.title });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.clear }));
		await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.save }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
		expect(mocks.api).toHaveBeenLastCalledWith('i/update', { birthday: null });
		await waitFor(() => expect(mocks.update).toHaveBeenLastCalledWith({ birthday: null }));
	});
});

describe('default banner', () => {
	test('restores the default banner and applies the confirmed banner fields', async () => {
		mocks.account.bannerId = 'old-banner';
		mocks.api.mockResolvedValueOnce({ ...mocks.account, bannerId: null, bannerUrl: null, bannerBlurhash: null });
		const view = render(ProfileSettings, { global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._profile.changeBanner }));
		const reset = mocks.popupMenu.mock.calls[0][0].find((item: { text: string }) => item.text === i18n.ts.resetToDefaultValue);
		expect(reset.disabled).toBe(false);
		await reset.action();
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('i/update', { bannerId: null });
		expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ bannerId: null, bannerUrl: null, bannerBlurhash: null });
	});

	test('disables resetting an already default banner', async () => {
		const view = render(ProfileSettings, { global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._profile.changeBanner }));
		const reset = mocks.popupMenu.mock.calls[0][0].find((item: { text: string }) => item.text === i18n.ts.resetToDefaultValue);
		expect(reset.disabled).toBe(true);
		expect(mocks.api).not.toHaveBeenCalled();
	});

	test('keeps the current banner when resetting fails', async () => {
		mocks.account.bannerId = 'old-banner';
		const error = new Error('Connection failed');
		mocks.api.mockRejectedValueOnce(error);
		const view = render(ProfileSettings, { global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._profile.changeBanner }));
		const reset = mocks.popupMenu.mock.calls[0][0].find((item: { text: string }) => item.text === i18n.ts.resetToDefaultValue);
		await reset.action();
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.account.bannerId).toBe('old-banner');
		expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts.somethingHappened, 'error');
	});
});

describe('banner file validation', () => {
	test('rejects a local video before cropping or uploading', async () => {
		mocks.chooseFileFromPc.mockResolvedValueOnce([new File(['video'], 'banner.mp4', { type: 'video/mp4' })]);
		const view = render(ProfileSettings, { global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._profile.changeBanner }));
		const upload = mocks.popupMenu.mock.calls[0][0].find((item: { text: string }) => item.text === i18n.ts.upload);
		await upload.action();
		expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts._profile.bannerImageOnly, 'error');
		expect(mocks.confirm).not.toHaveBeenCalled();
		expect(mocks.cropImageFile).not.toHaveBeenCalled();
		expect(mocks.launchUploader).not.toHaveBeenCalled();
		expect(mocks.api).not.toHaveBeenCalled();
		expect(mocks.update).not.toHaveBeenCalled();
	});

	test('rejects a drive video without saving the profile', async () => {
		mocks.chooseDriveFile.mockResolvedValueOnce([{ id: 'video', type: 'video/mp4' }]);
		const view = render(ProfileSettings, { global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._profile.changeBanner }));
		const select = mocks.popupMenu.mock.calls[0][0].find((item: { text: string }) => item.text === i18n.ts.fromDrive);
		await select.action();
		expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts._profile.bannerImageOnly, 'error');
		expect(mocks.api).not.toHaveBeenCalled();
		expect(mocks.update).not.toHaveBeenCalled();
	});

	test('explains a server file type rejection without replacing the current banner', async () => {
		mocks.account.bannerId = 'old-banner';
		mocks.chooseDriveFile.mockResolvedValueOnce([{ id: 'image', type: 'image/png' }]);
		mocks.api.mockRejectedValueOnce({ code: 'BANNER_NOT_AN_IMAGE', id: '75aedb19-2afd-4e6d-87fc-67941256fa60' });
		const view = render(ProfileSettings, { global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._profile.changeBanner }));
		const select = mocks.popupMenu.mock.calls[0][0].find((item: { text: string }) => item.text === i18n.ts.fromDrive);
		await select.action();
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('i/update', { bannerId: 'image' });
		expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts._profile.bannerImageOnly, 'error');
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.account.bannerId).toBe('old-banner');
	});

	test.each(['image/png', ''])('saves a local image with MIME type %j', async type => {
		const file = new File(['image'], 'banner.png', { type });
		mocks.chooseFileFromPc.mockResolvedValueOnce([file]);
		mocks.confirm.mockResolvedValueOnce({ canceled: true });
		mocks.launchUploader.mockResolvedValueOnce([{ id: 'image', type: 'image/png' }]);
		const banner = { bannerId: 'image', bannerUrl: '/banner.png', bannerBlurhash: 'hash' };
		mocks.api.mockResolvedValueOnce({ ...mocks.account, ...banner });
		const view = render(ProfileSettings, { global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._profile.changeBanner }));
		const upload = mocks.popupMenu.mock.calls[0][0].find((item: { text: string }) => item.text === i18n.ts.upload);
		await upload.action();
		expect(mocks.launchUploader).toHaveBeenCalledExactlyOnceWith([file], { multiple: false });
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('i/update', { bannerId: 'image' });
		expect(mocks.update).toHaveBeenCalledExactlyOnceWith(banner);
		expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts.saved, 'success');
	});
});

describe('company and job title profile editing', () => {
	test('restores the default avatar and applies the confirmed avatar fields', async () => {
		mocks.account.avatarId = 'old-avatar';
		mocks.api.mockResolvedValueOnce({ ...mocks.account, avatarId: null, avatarUrl: '/identicon/self', avatarBlurhash: null });
		const view = render(ProfileSettings, { global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._profile.changeAvatar }));
		const reset = mocks.popupMenu.mock.calls[0][0].find((item: { text: string }) => item.text === i18n.ts.resetToDefaultValue);
		expect(reset.disabled).toBe(false);
		await reset.action();
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('i/update', { avatarId: null });
		expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ avatarId: null, avatarUrl: '/identicon/self', avatarBlurhash: null });
	});

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
		const name = view.getByRole('combobox', { name: i18n.ts._profile.name });
		await fireEvent.update(name, 'New name');
		await fireEvent.blur(name);
		await fireEvent.click(name.closest('div._selectable')!.querySelector('button')!);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.toast).not.toHaveBeenCalled();
		const confirmed = { ...mocks.account, name: 'Confirmed name' };
		confirmSave(confirmed);
		await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ name: 'Confirmed name' })));
		expect(mocks.update.mock.lastCall![0]).toEqual({ name: 'Confirmed name' });
		expect(mocks.api.mock.calls[0][1]).toEqual({ name: 'New name' });
		expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts.saved, 'success');
	});

	test('serializes nickname and work saves and applies each response before the next request', async () => {
		let finishFirst!: (value: unknown) => void;
		mocks.api.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }));
		const view = render(ProfileSettings, { global });
		const name = view.getByRole('combobox', { name: i18n.ts._profile.name });
		await fireEvent.update(name, 'New name');
		await fireEvent.blur(name);
		await fireEvent.click(name.closest('div._selectable')!.querySelector('button')!);
		const company = view.getByRole('combobox', { name: i18n.ts._profile.company });
		await fireEvent.update(company, 'New Company');
		await fireEvent.blur(company);
		await confirmField(company);
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

	test('restores fields and saves only the confirmed field, using the same flow as location and birthday', async () => {
		mocks.api.mockResolvedValueOnce({ ...mocks.account, company: 'New Company' });
		const view = render(ProfileSettings, { global });
		const company = view.getByRole('combobox', { name: i18n.ts._profile.company }) as HTMLInputElement;
		const jobTitle = view.getByRole('combobox', { name: i18n.ts._profile.jobTitle }) as HTMLInputElement;
		expect(company.value).toBe('Example Company');
		expect(jobTitle.value).toBe('Engineer');
		expect(company.autocomplete).toBe('organization');
		expect(jobTitle.autocomplete).toBe('organization-title');
		await fireEvent.update(company, '  New Company  ');
		expect(mocks.api).not.toHaveBeenCalled();
		expect(view.getByRole('button', { name: i18n.ts.save })).toBeTruthy();
		await fireEvent.mouseLeave(company.parentElement!);
		await fireEvent.blur(company);
		expect(mocks.api).not.toHaveBeenCalled();
		await confirmField(company);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
		expect(mocks.api.mock.calls[0][1]).toEqual({ company: '  New Company  ' });
		expect(mocks.update).toHaveBeenCalledWith({ company: 'New Company' });
		await fireEvent.blur(company);
		expect(mocks.api).toHaveBeenCalledOnce();
	});

	test('preserves over-limit work text and submits the full Unicode boundary after correction', async () => {
		const view = render(ProfileSettings, { global });
		const company = view.getByRole('combobox', { name: i18n.ts._profile.company }) as HTMLInputElement;
		const boundary = '😀'.repeat(128);
		await fireEvent.update(company, `${boundary}中`);
		await confirmField(company);
		expect(company.value).toBe(`${boundary}中`);
		expect(mocks.api).not.toHaveBeenCalled();
		expect(mocks.toast).toHaveBeenCalledWith(i18n.tsx.inputTooLong({ limit: 128 }), 'error');

		await fireEvent.update(company, boundary);
		await confirmField(company);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledExactlyOnceWith('i/update', { company: boundary }));
		expect(company.value).toBe(boundary);
	});

	test.each(['Enter', 'NumpadEnter'])('%s does not save work fields before confirmation', async code => {
		const view = render(ProfileSettings, { global });
		const company = view.getByRole('combobox', { name: i18n.ts._profile.company }) as HTMLInputElement;
		company.focus();
		await fireEvent.update(company, 'New Company');
		const enter = new KeyboardEvent('keydown', { key: 'Enter', code, bubbles: true, cancelable: true });
		company.dispatchEvent(enter);
		expect(mocks.api).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(company);
		await confirmField(company);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
		expect(mocks.api.mock.calls[0][1]).toEqual({ company: 'New Company' });
		await fireEvent.blur(company);
		expect(mocks.api).toHaveBeenCalledOnce();
	});

	test('keeps composition changes as a draft until the save button is clicked', async () => {
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
		expect(mocks.api).not.toHaveBeenCalled();
		await confirmField(company);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
		expect(mocks.api.mock.calls[0][1]).toEqual({ company: '新的公司' });
	});

	test('clears an optional value as null while preserving the other field', async () => {
		const view = render(ProfileSettings, { global });
		const jobTitle = view.getByRole('combobox', { name: i18n.ts._profile.jobTitle });
		await fireEvent.update(jobTitle, '');
		await fireEvent.blur(jobTitle);
		await confirmField(jobTitle);
		await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ jobTitle: null }));
		expect(mocks.api.mock.calls[0][1]).toEqual({ jobTitle: null });
	});

	test('keeps the draft and current account unchanged if saving fails', async () => {
		mocks.api.mockRejectedValueOnce(new Error('Connection failed'));
		const view = render(ProfileSettings, { global });
		const company = view.getByRole('combobox', { name: i18n.ts._profile.company }) as HTMLInputElement;
		await fireEvent.update(company, 'Unsaved Company');
		await fireEvent.blur(company);
		await confirmField(company);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
		expect(company.value).toBe('Unsaved Company');
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts.somethingHappened, 'error');
		expect(view.queryByRole('alert')).toBeNull();
		await fireEvent.focus(company);
		await fireEvent.blur(company);
		expect(mocks.api).toHaveBeenCalledOnce();
		await fireEvent.update(company, 'Corrected Company');
		await confirmField(company);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ company: 'Corrected Company' }));
		expect(mocks.toast).toHaveBeenLastCalledWith(i18n.ts.saved, 'success');
	});

	test('allows another confirmed edit without duplicating a handled session error', async () => {
		const failure = { code: 'AUTHENTICATION_FAILED' };
		markAccountSessionErrorHandled(failure);
		mocks.api.mockRejectedValueOnce(failure);
		const view = render(ProfileSettings, { global });
		const company = view.getByRole('combobox', { name: i18n.ts._profile.company }) as HTMLInputElement;
		await fireEvent.update(company, 'Unsaved Company');
		await fireEvent.blur(company);
		await confirmField(company);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
		await fireEvent.focus(company);
		await fireEvent.blur(company);
		await fireEvent.update(company, 'Corrected Company');
		await confirmField(company);
		await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ company: 'Corrected Company' }));
		expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts.saved, 'success');
	});

	test('does not save a completed composition after leaving the input without confirmation', async () => {
		const view = render(ProfileSettings, { global });
		const company = view.getByRole('combobox', { name: i18n.ts._profile.company }) as HTMLInputElement;
		await fireEvent.compositionStart(company);
		await fireEvent.update(company, '新的公司');
		await fireEvent.mouseLeave(company.parentElement!);
		expect(mocks.api).not.toHaveBeenCalled();
		await fireEvent.compositionEnd(company);
		expect(mocks.api).not.toHaveBeenCalled();
		await confirmField(company);
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
		await confirmField(company);
		await fireEvent.update(jobTitle, 'Designer');
		await fireEvent.blur(jobTitle);
		await confirmField(jobTitle);
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
