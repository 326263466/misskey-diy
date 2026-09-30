/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import AvatarDecorationSettings from '@/pages/settings/avatar-decoration.vue';
import { enqueueProfileSave } from '@/utility/profile-save.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(), alert: vi.fn(), popup: vi.fn(), update: vi.fn(),
	account: { avatarDecorations: [{ id: 'first', url: '/first' }, { id: 'second', url: '/second' }], policies: { avatarDecorationLimit: 4 } },
}));
vi.mock('@/i.js', () => ({ $i: mocks.account, iAmModerator: false, ensureSignin: () => mocks.account }));
vi.mock('@/os.js', () => ({ apiWithDialog: mocks.api, alert: mocks.alert, popup: mocks.popup }));
vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: mocks.update }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: async () => [] }));
vi.mock('@/store.js', () => ({ store: {} }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/pages/settings/avatar-decoration.dialog.vue', () => ({ default: {} }));

beforeEach(() => {
	vi.clearAllMocks();
	mocks.account.avatarDecorations = [{ id: 'first', url: '/first' }, { id: 'second', url: '/second' }];
	mocks.popup.mockReturnValue({ dispose: vi.fn() });
	mocks.api.mockImplementation(async (_endpoint, params) => params);
});
afterEach(cleanup);

async function openAttached() {
	const slot = { template: '<div><slot/></div>' };
	const view = render(AvatarDecorationSettings, { global: {
		directives: { panel: {} },
		stubs: {
			SearchMarker: slot, MkInfo: slot, MkAvatar: true, MkButton: true, MkLoading: true,
			MkFoldableSection: true,
			XDecoration: { template: '<button @click="$emit(\'click\')">edit decoration</button>' },
		},
	} });
	await waitFor(() => expect(view.getAllByRole('button', { name: 'edit decoration' })).toHaveLength(2));
	await fireEvent.click(view.getAllByRole('button', { name: 'edit decoration' })[0]);
	return mocks.popup.mock.calls[0][2];
}

test.each(['update', 'detach'])('does not %s an index shifted by an earlier queued save', async event => {
	const handlers = await openAttached();
	let complete!: () => void;
	const previous = enqueueProfileSave(async () => {
		await new Promise<void>(resolve => { complete = resolve; });
		mocks.account.avatarDecorations.shift();
	});
	const edit = handlers[event]({ angle: 0, flipH: false, offsetX: 0, offsetY: 0 });
	await waitFor(() => expect(complete).toBeDefined());
	complete();
	await Promise.all([previous, edit]);
	expect(mocks.api).not.toHaveBeenCalled();
	expect(mocks.update).not.toHaveBeenCalled();
	expect(mocks.alert).toHaveBeenCalledOnce();
	expect(mocks.account.avatarDecorations[0].id).toBe('second');
});

test('saves an unchanged attached decoration list normally', async () => {
	const handlers = await openAttached();
	await handlers.detach();
	expect(mocks.api).toHaveBeenCalledWith('i/update', { avatarDecorations: [{ id: 'second', url: '/second' }] });
	expect(mocks.alert).not.toHaveBeenCalled();
});
