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

const mocks = vi.hoisted(() => ({ api: vi.fn(), updateAccount: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: mocks.updateAccount }));
vi.mock('@/i.js', async () => {
	const { reactive } = await import('vue');
	const account = reactive({ id: 'self', host: null, hideOnlineStatus: false, onlineStatus: 'unknown', onlineStatusOverride: 'invisible', policies: {} });
	return { $i: account, ensureSignin: () => account };
});
vi.mock('@/instance.js', () => ({ instance: {} }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/os.js', () => ({}));
vi.mock('@/components/MkSelect.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkInput.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkFolder.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/MkFeatureBanner.vue', () => ({ default: { template: '<div/>' } }));

beforeEach(() => {
	vi.resetAllMocks();
	Object.assign($i!, { hideOnlineStatus: false, onlineStatus: 'unknown', onlineStatusOverride: 'invisible' });
	mocks.updateAccount.mockImplementation(patch => Object.assign($i!, patch));
});
afterEach(cleanup);

test.each([
	['settings', PrivacySettings],
	['setup', SetupPrivacy],
] as const)('%s updates the local badge after the privacy response without waiting for a stream', async (_name, component) => {
	const wrapper = { inheritAttrs: false, template: '<div><slot/><slot name="label"/></div>' };
	const view = render({
		components: { Privacy: component, MkUserOnlineIndicator },
		setup() { return { account: $i }; },
		template: '<Privacy/><MkUserOnlineIndicator :user="account"/>',
	}, {
		global: {
			directives: { tooltip: () => {} },
			stubs: {
				MkSwitch: { props: ['modelValue'], emits: ['update:modelValue'], template: '<button @click="$emit(\'update:modelValue\', !modelValue)"><slot/><slot name="label"/></button>' },
				MkSelect: true, MkInput: true, MkFeatureBanner: true,
				MkFolder: wrapper, FormSection: wrapper, FormSlot: wrapper, MkInfo: wrapper, MkDisableSection: wrapper,
				SearchMarker: wrapper, SearchLabel: wrapper, SearchText: wrapper,
			},
		},
	});
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
