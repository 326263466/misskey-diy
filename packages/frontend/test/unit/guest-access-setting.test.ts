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
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: async () => mocks.meta }));
vi.mock('@/instance.js', () => ({ instance: {}, fetchInstance: mocks.refresh }));
vi.mock('@/os.js', () => ({ apiWithDialog: mocks.save, confirm: vi.fn() }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/pages/admin/server-rules.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkSwitch.vue', () => ({ default: {
	props: ['modelValue'], emits: ['update:modelValue'],
	template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)"/>',
} }));
vi.mock('@/components/MkSelect.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkInput.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkTextarea.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkFolder.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/form/link.vue', () => ({ default: { render: () => null } }));

beforeEach(() => {
	vi.clearAllMocks();
	mocks.save.mockResolvedValue({});
	mocks.refresh.mockResolvedValue({});
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
	await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('admin/update-meta', { clientOptions: { openGuestAccess: true } }));
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
	expect(mocks.save).toHaveBeenLastCalledWith('admin/update-meta', { clientOptions: { openGuestAccess: false } });
	await fireEvent.click(toggle);
	await waitFor(() => expect(toggle.checked).toBe(true));
	expect(mocks.save).toHaveBeenLastCalledWith('admin/update-meta', { clientOptions: { openGuestAccess: true } });
	expect(mocks.meta.ugcVisibilityForVisitor).toBe('all');
});
