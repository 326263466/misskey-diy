/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { h, Suspense } from 'vue';
import Moderation from '@/pages/admin/moderation.vue';

const mocks = vi.hoisted(() => ({
	meta: {
		ugcVisibilityForVisitor: 'none', disableRegistration: true, emailRequiredForSignup: true,
		clientOptions: {} as { openGuestAccess?: boolean },
		sensitiveWords: [], prohibitedWords: [], prohibitedWordsForNameOfUser: [], hiddenTags: [], preservedUsernames: [], blockedHosts: [], silencedHosts: [], mediaSilencedHosts: [],
	},
	save: vi.fn(), refresh: vi.fn(),
}));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: (endpoint: string, data?: unknown) => endpoint === 'admin/meta' ? Promise.resolve(mocks.meta) : mocks.save(endpoint, data) }));
vi.mock('@/instance.js', () => ({ instance: {}, fetchInstance: mocks.refresh }));
vi.mock('@/os.js', () => ({ apiWithDialog: mocks.save, confirm: vi.fn() }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/pages/admin/server-rules.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkSwitch.vue', () => ({ default: {
	props: ['modelValue', 'disabled'], emits: ['update:modelValue'],
	template: '<input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)"/>',
} }));
vi.mock('@/components/MkSelect.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkInput.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkTextarea.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkFolder.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/form/link.vue', () => ({ default: { render: () => null } }));

beforeEach(() => {
	vi.resetAllMocks();
	mocks.save.mockResolvedValue({});
	mocks.refresh.mockResolvedValue({ disableRegistration: true });
	mocks.meta.disableRegistration = true;
	mocks.meta.ugcVisibilityForVisitor = 'none';
	mocks.meta.clientOptions = {};
});
afterEach(cleanup);

async function mountSetting() {
	const wrapper = { inheritAttrs: false, template: '<div><slot/></div>' };
	const view = render({ render: () => h('div', [h(Suspense, null, { default: () => h(Moderation) })]) }, {
		global: { components: { PageWithHeader: wrapper, SearchMarker: wrapper, SearchLabel: wrapper, SearchText: wrapper, SearchIcon: wrapper } },
	});
	await waitFor(() => expect(view.getByTestId('open-guest-access')).toBeTruthy());
	return { view, toggle: view.getByTestId('open-guest-access') as HTMLInputElement };
}

test.each(['all', 'local', 'none'])('defaults to legacy mode with saved %s visibility and enables browsing without altering it', async visibility => {
	mocks.meta.ugcVisibilityForVisitor = visibility;
	const { toggle } = await mountSetting();
	expect(toggle.checked).toBe(false);
	await fireEvent.click(toggle);
	await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('admin/update-meta', { clientOptions: { openGuestAccess: true } }, undefined, undefined, { toastOnInternalError: true }));
	expect(mocks.meta.ugcVisibilityForVisitor).toBe(visibility);
	expect(mocks.meta.disableRegistration).toBe(true);
	expect(mocks.refresh).toHaveBeenCalledWith(true);
});

test('switches modes without overwriting the selected scope', async () => {
	mocks.meta.ugcVisibilityForVisitor = 'all';
	mocks.meta.clientOptions.openGuestAccess = true;
	const { toggle } = await mountSetting();
	await fireEvent.click(toggle);
	await waitFor(() => expect(toggle.checked).toBe(false));
	expect(mocks.save).toHaveBeenLastCalledWith('admin/update-meta', { clientOptions: { openGuestAccess: false } }, undefined, undefined, { toastOnInternalError: true });
	await fireEvent.click(toggle);
	await waitFor(() => expect(toggle.checked).toBe(true));
	expect(mocks.save).toHaveBeenLastCalledWith('admin/update-meta', { clientOptions: { openGuestAccess: true } }, undefined, undefined, { toastOnInternalError: true });
	expect(mocks.meta.ugcVisibilityForVisitor).toBe('all');
});

test('locks registration until saving and server refresh finish', async () => {
	const saving = Promise.withResolvers<void>();
	const refreshing = Promise.withResolvers<{ disableRegistration: boolean }>();
	mocks.save.mockReturnValueOnce(saving.promise);
	mocks.refresh.mockReturnValueOnce(refreshing.promise);
	const { view } = await mountSetting();
	const registration = view.getAllByRole('checkbox')[0] as HTMLInputElement;
	await fireEvent.click(registration);
	await fireEvent.click(registration);
	expect(mocks.save).toHaveBeenCalledExactlyOnceWith('admin/update-meta', { disableRegistration: false }, undefined, undefined, { toastOnInternalError: true });
	expect(registration.disabled).toBe(true);
	expect(mocks.refresh).not.toHaveBeenCalled();
	saving.resolve();
	await waitFor(() => expect(mocks.refresh).toHaveBeenCalledWith(true));
	expect(registration.disabled).toBe(true);
	refreshing.resolve({ disableRegistration: true });
	await waitFor(() => expect(registration.disabled).toBe(false));
	expect(registration.checked).toBe(false);
});

test.each(['save', 'refresh'] as const)('registration %s failure unlocks the control without reversing a successful save', async failure => {
	if (failure === 'save') mocks.save.mockRejectedValueOnce(new Error('Save failed'));
	else mocks.refresh.mockRejectedValueOnce(new Error('Refresh failed'));
	const { view } = await mountSetting();
	const registration = view.getAllByRole('checkbox')[0] as HTMLInputElement;
	await fireEvent.click(registration);
	await waitFor(() => expect(registration.disabled).toBe(false));
	expect(registration.checked).toBe(failure === 'refresh');
	if (failure === 'save') expect(mocks.refresh).not.toHaveBeenCalled();
});
