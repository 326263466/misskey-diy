/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	user: null as null | { policies: { canSearchNotes: boolean; canSearchUsers: boolean } },
	instance: { ugcVisibilityForVisitor: 'local', clientOptions: { openGuestAccess: true as boolean | undefined }, policies: { canSearchNotes: false, canSearchUsers: false } },
}));
vi.mock('@/i.js', () => ({ get $i() { return mocks.user; } }));
vi.mock('@/instance.js', () => ({ instance: mocks.instance }));

beforeEach(() => {
	vi.resetModules();
	mocks.user = null;
	mocks.instance.ugcVisibilityForVisitor = 'local';
	mocks.instance.clientOptions.openGuestAccess = true;
});

test.each(['local', 'all', 'none'])('open-mode search ignores saved %s legacy scope', async visibility => {
	mocks.instance.ugcVisibilityForVisitor = visibility;
	const permissions = await import('@/utility/check-permissions.js');
	expect(permissions.notesSearchAvailable).toBe(true);
	expect(permissions.usersSearchAvailable).toBe(true);
});

test.each([true, false])('signed-in search retains role permissions (%s)', async allowed => {
	mocks.instance.ugcVisibilityForVisitor = 'none';
	mocks.user = { policies: { canSearchNotes: allowed, canSearchUsers: allowed } };
	const permissions = await import('@/utility/check-permissions.js');
	expect(permissions.notesSearchAvailable).toBe(allowed);
	expect(permissions.usersSearchAvailable).toBe(allowed);
});

test.each([undefined, false])('legacy mode (%s) retains each original visitor search policy', async enabled => {
	mocks.instance.clientOptions.openGuestAccess = enabled;
	mocks.instance.policies = { canSearchNotes: true, canSearchUsers: false };
	const permissions = await import('@/utility/check-permissions.js');
	expect(permissions.notesSearchAvailable).toBe(true);
	expect(permissions.usersSearchAvailable).toBe(false);
});
