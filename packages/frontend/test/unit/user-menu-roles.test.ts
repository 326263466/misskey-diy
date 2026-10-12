/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import type { MenuParent, MenuSwitch } from '@/types/menu.js';
import { getUserMenu } from '@/utility/get-user-menu.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(), apiWithDialog: vi.fn(), select: vi.fn(),
	viewer: { isAdmin: false },
}));

vi.mock('@@/js/config.js', () => ({ url: 'https://local.example', host: 'local.example' }));
vi.mock('@/i.js', () => ({
	$i: { id: 'viewer', username: 'viewer', policies: { chatAvailability: 'available' } },
	iAmModerator: true,
	get iAmAdmin() { return mocks.viewer.isAdmin; },
}));
vi.mock('@/os.js', () => ({ apiWithDialog: mocks.apiWithDialog, select: mocks.select }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/check-permissions.js', () => ({ notesSearchAvailable: false, canSearchNonLocalNotes: false }));
vi.mock('@/cache.js', () => ({ antennasCache: {}, userListsCache: {} }));
vi.mock('@/router.js', () => ({ mainRouter: { push: vi.fn() } }));
vi.mock('@/utility/get-embed-code.js', () => ({ genEmbedCode: vi.fn() }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { devMode: false } } }));
vi.mock('@/plugin.js', () => ({ getPluginHandlers: () => [] }));
vi.mock('@/utility/share-dialog.js', () => ({ openShareDialog: vi.fn() }));
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: vi.fn() }));

const target = { id: 'alice', username: 'alice', host: null } as Misskey.entities.UserDetailed;
const roles = [
	{ id: 'editor', name: 'Editor', target: 'manual', canEditMembersByModerator: true },
	{ id: 'staff', name: 'Staff', target: 'manual', canEditMembersByModerator: false },
	{ id: 'auto', name: 'Auto', target: 'conditional', canEditMembersByModerator: true },
];

async function openRoles(assignedRoleIds: string[]) {
	mocks.api.mockImplementation(async (endpoint: string) => {
		if (endpoint === 'admin/roles/list') return roles;
		if (endpoint === 'admin/show-user') return { roles: roles.filter(role => assignedRoleIds.includes(role.id)) };
		throw new Error(`Unexpected endpoint: ${endpoint}`);
	});
	const { menu, cleanup } = getUserMenu(target);
	const parent = menu.find((item): item is MenuParent => 'type' in item && item.type === 'parent' && item.text === i18n.ts.roles)!;
	const items = await (parent.children as () => Promise<MenuSwitch[]>)();
	return { items, cleanup, byName: (name: string) => items.find(item => item.text === name)! };
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.viewer.isAdmin = false;
	mocks.apiWithDialog.mockResolvedValue(undefined);
	mocks.select.mockResolvedValue({ canceled: false, result: 'indefinitely' });
});

describe('user menu roles', () => {
	test('reads the current assignment each time and marks only roles the viewer may change', async () => {
		const first = await openRoles(['staff']);
		expect(first.items.map(item => item.text)).toEqual(['Editor', 'Staff']);
		expect(first.byName('Editor')).toMatchObject({ type: 'switch', disabled: false });
		expect(first.byName('Editor').ref.value).toBe(false);
		expect(first.byName('Staff')).toMatchObject({ disabled: true });
		expect(first.byName('Staff').ref.value).toBe(true);
		first.cleanup();

		mocks.viewer.isAdmin = true;
		const second = await openRoles(['editor']);
		expect(second.byName('Editor').ref.value).toBe(true);
		expect(second.byName('Staff')).toMatchObject({ disabled: false });
		expect(mocks.api).toHaveBeenCalledTimes(4);
		expect(mocks.api).toHaveBeenCalledWith('admin/show-user', { userId: 'alice' });
		second.cleanup();
	});

	test('assigns after choosing a period and unassigns when switched off', async () => {
		const { byName, cleanup } = await openRoles([]);
		const editor = byName('Editor');
		editor.ref.value = true;
		await vi.waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledWith('admin/roles/assign', { roleId: 'editor', userId: 'alice', expiresAt: null }));
		editor.ref.value = false;
		await vi.waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledWith('admin/roles/unassign', { roleId: 'editor', userId: 'alice' }));
		expect(editor.ref.value).toBe(false);
		cleanup();
	});

	test('restores the switch when the period dialog is canceled or the request fails', async () => {
		const { byName, cleanup } = await openRoles(['editor']);
		const editor = byName('Editor');
		mocks.apiWithDialog.mockRejectedValueOnce(new Error('denied'));
		editor.ref.value = false;
		await vi.waitFor(() => expect(editor.ref.value).toBe(true));
		await nextTick();
		expect(mocks.apiWithDialog).toHaveBeenCalledTimes(1);

		mocks.select.mockResolvedValueOnce({ canceled: true });
		const unassigned = await openRoles([]);
		const pending = unassigned.byName('Editor');
		pending.ref.value = true;
		await vi.waitFor(() => expect(pending.ref.value).toBe(false));
		await nextTick();
		expect(mocks.apiWithDialog).toHaveBeenCalledTimes(1);
		cleanup();
		unassigned.cleanup();
	});
});
