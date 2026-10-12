/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick } from 'vue';
import PrivacySettings from '@/pages/settings/privacy.vue';
import SetupPrivacy from '@/components/MkUserSetupDialog.Privacy.vue';
import MkUserOnlineIndicator from '@/components/MkUserOnlineIndicator.vue';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), updateAccount: vi.fn(), toast: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: mocks.updateAccount }));
vi.mock('@/i.js', async () => {
	const { reactive } = await import('vue');
	const account = reactive({ id: 'self', host: null, hideOnlineStatus: false, onlineStatus: 'unknown', onlineStatusOverride: 'invisible', policies: {} });
	return { $i: account, ensureSignin: () => account };
});
vi.mock('@/instance.js', () => ({ instance: {} }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/os.js', () => ({ toast: mocks.toast }));
vi.mock('@/components/MkSelect.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkInput.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkFolder.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/MkFeatureBanner.vue', () => ({ default: { template: '<div/>' } }));

beforeEach(() => {
	vi.resetAllMocks();
	Object.assign($i!, { hideOnlineStatus: false, onlineStatus: 'unknown', onlineStatusOverride: 'invisible', followApprovalLocalSeconds: null, followApprovalRemoteSeconds: null });
	mocks.updateAccount.mockImplementation(patch => Object.assign($i!, patch));
});
afterEach(cleanup);

function renderPrivacy(component = PrivacySettings) {
	const wrapper = { inheritAttrs: false, template: '<div><slot/><slot name="label"/></div>' };
	return render({
		components: { Privacy: component, MkUserOnlineIndicator },
		setup() { return { account: $i }; },
		template: '<Privacy/><MkUserOnlineIndicator :user="account"/>',
	}, {
		global: {
			directives: { tooltip: () => {} },
			stubs: {
				MkSwitch: { props: ['modelValue'], emits: ['update:modelValue'], template: '<button @click="$emit(\'update:modelValue\', !modelValue)"><slot/><slot name="label"/></button>' },
				MkSelect: { props: ['modelValue', 'items'], emits: ['update:modelValue'], template: '<label><slot name="label"/><select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>' }, MkInput: true, MkFeatureBanner: true,
				MkFolder: wrapper, FormSection: wrapper, FormSlot: wrapper, MkInfo: wrapper, MkDisableSection: wrapper,
				SearchMarker: wrapper, SearchLabel: wrapper, SearchText: wrapper,
			},
		},
	});
}

test.each([
	['settings', PrivacySettings],
	['setup', SetupPrivacy],
] as const)('%s updates the local badge after the privacy response without waiting for a stream', async (_name, component) => {
	const view = renderPrivacy(component);
	expect(view.getByRole('img', { name: i18n.ts._onlineStatus._display.invisible })).toBeTruthy();
	const response = Promise.withResolvers<object>();
	mocks.api.mockReturnValueOnce(response.promise);
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.hideOnlineStatus }));
	expect($i!.hideOnlineStatus).toBe(false);
	response.resolve({ ...$i, hideOnlineStatus: true, onlineStatus: null });
	await waitFor(() => expect($i!.hideOnlineStatus).toBe(true));
	await nextTick();
	expect(view.queryByRole('img')).toBeNull();
	expect($i!.onlineStatusOverride).toBe('invisible');
	mocks.api.mockResolvedValueOnce({ ...$i, hideOnlineStatus: false, onlineStatus: 'unknown' });
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.hideOnlineStatus }));
	await waitFor(() => expect($i!.hideOnlineStatus).toBe(false));
	await nextTick();
	expect(view.getByRole('img', { name: i18n.ts._onlineStatus._display.invisible })).toBeTruthy();
});

test('serializes rapid privacy changes and applies only confirmed account state', async () => {
	const first = Promise.withResolvers<object>();
	const second = Promise.withResolvers<object>();
	mocks.api.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
	const view = renderPrivacy();
	const toggle = view.getByRole('button', { name: i18n.ts.hideOnlineStatus });
	await fireEvent.click(toggle);
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
	await fireEvent.click(toggle);
	expect(mocks.api).toHaveBeenCalledTimes(1);
	expect(mocks.toast).not.toHaveBeenCalled();
	first.resolve({ hideOnlineStatus: true });
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
	expect(mocks.api.mock.calls.map(call => call[1].hideOnlineStatus)).toEqual([true, false]);
	expect($i!.hideOnlineStatus).toBe(true);
	second.resolve({ hideOnlineStatus: false });
	await waitFor(() => expect(mocks.updateAccount).toHaveBeenCalledTimes(2));
	expect($i!.hideOnlineStatus).toBe(false);
	expect(mocks.toast).not.toHaveBeenCalled();
});

test('reports a failed privacy change without confirming it and allows the next save', async () => {
	mocks.api.mockRejectedValueOnce(new Error('offline'));
	const view = renderPrivacy();
	const toggle = view.getByRole('button', { name: i18n.ts.hideOnlineStatus });
	await fireEvent.click(toggle);
	await waitFor(() => expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts.somethingHappened, 'error'));
	expect(mocks.updateAccount).not.toHaveBeenCalled();
	mocks.api.mockResolvedValueOnce({ hideOnlineStatus: false });
	await fireEvent.click(toggle);
	await waitFor(() => expect(mocks.updateAccount).toHaveBeenCalledTimes(1));
	expect(mocks.updateAccount).toHaveBeenCalledExactlyOnceWith({ hideOnlineStatus: false });
	expect(mocks.toast).toHaveBeenCalledTimes(1);
});

test('serializes follow approval changes and synchronizes only confirmed account settings', async () => {
	const first = Promise.withResolvers<object>();
	const second = Promise.withResolvers<object>();
	mocks.api.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
	const view = renderPrivacy();
	const setting = view.getByRole('combobox', { name: i18n.ts._followApproval.local });
	await fireEvent.update(setting, 'disabled');
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
	await fireEvent.update(setting, 'custom');
	expect(mocks.api).toHaveBeenCalledTimes(1);
	first.resolve({ followApprovalLocalSeconds: 0 });
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
	expect($i!.followApprovalLocalSeconds).toBe(0);
	expect(mocks.api.mock.calls.map(call => call[1])).toEqual([{ followApprovalLocalSeconds: 0 }, { followApprovalLocalSeconds: 604800 }]);
	second.resolve({ followApprovalLocalSeconds: 604800 });
	await waitFor(() => expect($i!.followApprovalLocalSeconds).toBe(604800));
	expect(mocks.toast).not.toHaveBeenCalled();
});

test('preserves confirmed follow approval settings after a failed save and allows retry', async () => {
	Object.assign($i!, { followApprovalLocalSeconds: 604800 });
	mocks.api.mockRejectedValueOnce(new Error('offline'));
	const view = renderPrivacy();
	const setting = view.getByRole('combobox', { name: i18n.ts._followApproval.local });
	await fireEvent.update(setting, 'disabled');
	await waitFor(() => expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts.somethingHappened, 'error'));
	expect($i!.followApprovalLocalSeconds).toBe(604800);
	expect(mocks.updateAccount).not.toHaveBeenCalled();
	mocks.api.mockResolvedValueOnce({ followApprovalLocalSeconds: null });
	await fireEvent.update(setting, 'default');
	await waitFor(() => expect($i!.followApprovalLocalSeconds).toBeNull());
});
