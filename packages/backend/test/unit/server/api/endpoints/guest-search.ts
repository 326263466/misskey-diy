/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import NotesSearch from '@/server/api/endpoints/notes/search.js';
import UsersSearch from '@/server/api/endpoints/users/search.js';
import UpdateMeta from '@/server/api/endpoints/admin/update-meta.js';
import { QueryService } from '@/core/QueryService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { NoteStreamingHidingService } from '@/server/api/stream/NoteStreamingHidingService.js';
import { getVisitorContentVisibility } from '@/misc/visitor-content.js';
import type { MiLocalUser } from '@/models/User.js';

const account = { id: 'account' } as MiLocalUser;

describe('guest and role search access', () => {
	function fixture(allowed = false, administrator = false, clientOptions: { openGuestAccess?: boolean } = { openGuestAccess: true }) {
		const roles = { getUserPolicies: vi.fn().mockResolvedValue({ canSearchNotes: allowed, canSearchUsers: allowed }), isAdministrator: vi.fn().mockResolvedValue(administrator) };
		const searchNotes = { searchNote: vi.fn().mockResolvedValue([]) };
		const searchUsers = { search: vi.fn().mockResolvedValue([]) };
		const packer = { packMany: vi.fn().mockResolvedValue([]) };
		return {
			roles, searchNotes, searchUsers,
			notes: new NotesSearch(packer as never, searchNotes as never, roles as never, {} as never, { clientOptions } as never),
			users: new UsersSearch(packer as never, searchUsers as never, roles as never, { clientOptions } as never),
		};
	}

	test('passes anonymous searches to the content visibility filters without applying account roles', async () => {
		const f = fixture();
		await f.notes.exec({ query: 'public' }, null, null);
		await f.users.exec({ query: 'public' }, null, null);
		expect(f.roles.getUserPolicies).not.toHaveBeenCalled();
		expect(f.searchNotes.searchNote).toHaveBeenCalledWith('public', null, expect.any(Object), expect.any(Object));
		expect(f.searchUsers.search).toHaveBeenCalledWith('public', null, expect.any(Object));
	});

	test('retains signed-in account policy denials', async () => {
		const f = fixture();
		await expect(f.notes.exec({ query: 'public' }, account, null)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
		await expect(f.users.exec({ query: 'public' }, account, null)).rejects.toMatchObject({ code: 'ROLE_PERMISSION_DENIED', kind: 'permission' });
		expect(f.searchNotes.searchNote).not.toHaveBeenCalled();
		expect(f.searchUsers.search).not.toHaveBeenCalled();
	});

	test('retains the administrator exception for user search', async () => {
		const f = fixture(false, true);
		await f.users.exec({ query: 'public' }, account, null);
		expect(f.searchUsers.search).toHaveBeenCalledOnce();
	});

	test('allows accounts with search permissions', async () => {
		const f = fixture(true);
		await f.notes.exec({ query: 'public' }, account, null);
		await f.users.exec({ query: 'public' }, account, null);
		expect(f.searchNotes.searchNote).toHaveBeenCalledOnce();
		expect(f.searchUsers.search).toHaveBeenCalledOnce();
	});

	test.each([false, undefined])('keeps the original anonymous search policies in legacy mode (%s)', async enabled => {
		const denied = fixture(false, true, { openGuestAccess: enabled });
		await expect(denied.notes.exec({ query: 'public' }, null, null)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
		await expect(denied.users.exec({ query: 'public' }, null, null)).rejects.toMatchObject({ code: 'ROLE_PERMISSION_DENIED' });
		expect(denied.roles.getUserPolicies).toHaveBeenCalledWith(null);
		expect(denied.roles.isAdministrator).not.toHaveBeenCalled();
		const allowed = fixture(true, false, { openGuestAccess: enabled });
		await allowed.notes.exec({ query: 'public' }, null, null);
		await allowed.users.exec({ query: 'public' }, null, null);
		expect(allowed.searchNotes.searchNote).toHaveBeenCalledOnce();
		expect(allowed.searchUsers.search).toHaveBeenCalledOnce();
	});
});

describe('public guest visibility', () => {
	test.each(['all', 'local', 'none'] as const)('opens public local and remote notes while retaining private restrictions with saved %s scope', async saved => {
		const settings = { clientOptions: { openGuestAccess: true }, ugcVisibilityForVisitor: saved };
		const queryService = Object.create(QueryService.prototype) as QueryService;
		Object.defineProperty(queryService, 'meta', { value: settings });
		const query = { alias: 'note', andWhere: vi.fn() };
		queryService.generateUgcVisibilityQueryForVisitor(query as never);
		expect(query.andWhere).not.toHaveBeenCalled();
		const notes = Object.create(NoteEntityService.prototype) as NoteEntityService;
		Object.defineProperty(notes, 'meta', { value: settings });
		const stream = new NoteStreamingHidingService(settings as never, notes);
		for (const host of [null, 'remote.test']) {
			for (const visibility of ['public', 'home', 'followers', 'specified'] as const) {
				const note = { id: 'note', text: 'content', userId: 'author', user: { host, requireSigninToViewContents: false }, visibility, createdAt: new Date().toISOString(), visibleUserIds: [], reply: null, renote: null };
				const hidden = visibility === 'followers' || visibility === 'specified';
				expect(await notes.shouldHideNote(note as never, null)).toBe(hidden);
				const result = await stream.filter(note as never, null);
				expect(result?.text).toBe(hidden ? null : 'content');
				note.user.requireSigninToViewContents = true;
				expect(await notes.shouldHideNote(note as never, null)).toBe(true);
			}
		}
		expect(settings.ugcVisibilityForVisitor).toBe(saved);
	});

	test.each(['all', 'local', 'none'] as const)('keeps saved %s scope in legacy mode', saved => {
		for (const enabled of [undefined, false]) {
			const settings = { clientOptions: { openGuestAccess: enabled }, ugcVisibilityForVisitor: saved };
			expect(getVisitorContentVisibility(settings as never)).toBe(saved);
			const service = Object.create(QueryService.prototype) as QueryService;
			Object.defineProperty(service, 'meta', { value: settings });
			const query = { alias: 'note', andWhere: vi.fn() };
			service.generateUgcVisibilityQueryForVisitor(query as never);
			if (saved === 'all') expect(query.andWhere).not.toHaveBeenCalled();
			else expect(query.andWhere).toHaveBeenCalledWith(saved === 'local' ? 'note.userHost IS NULL' : '1=0');
		}
	});
});

test('updates only the independent switch and preserves existing client, visibility and registration settings', async () => {
	const settings = { clientOptions: { entrancePageStyle: 'simple', showTimelineForVisitor: true }, ugcVisibilityForVisitor: 'all', disableRegistration: true };
	const metaService = { fetch: vi.fn().mockResolvedValue(settings), update: vi.fn() };
	const endpoint = new UpdateMeta(settings as never, metaService as never, { log: vi.fn() } as never);
	await endpoint.exec({ clientOptions: { openGuestAccess: true } }, account, null);
	expect(metaService.update).toHaveBeenCalledWith({ clientOptions: { ...settings.clientOptions, openGuestAccess: true } });
});
