/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test, vi } from 'vitest';
import { RedPacketService, type RedPacketDraft } from '@/core/RedPacketService.js';
import { MiUser } from '@/models/User.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import DeleteFileEndpoint from '@/server/api/endpoints/drive/files/delete.js';

function fixture(file: object | null) {
	const user = { id: 'sender', host: null, isSuspended: false, isDeleted: false, movedToUri: null };
	let saved: unknown = null;
	const em = {
		query: vi.fn().mockResolvedValue([]),
		existsBy: vi.fn().mockResolvedValue(false),
		findOneBy: vi.fn().mockResolvedValue(file),
		findOneByOrFail: vi.fn().mockResolvedValue(user),
		create: vi.fn((_type, value) => value),
		insert: vi.fn((_type, value) => { saved = value; }),
	};
	const wallet = { lockWalletsInTransaction: vi.fn(), changeBalanceInTransaction: vi.fn() };
	const db = { getRepository: (entity: unknown) => ({ findOneBy: async () => entity === MiUser ? user : saved }), transaction: async (action: (manager: unknown) => unknown) => action(em) };
	const service = new RedPacketService(db as never, { gen: () => 'packet' } as never, wallet as never, {} as never, { getLogger: () => ({ error: vi.fn() }) } as never, { getPublicUrl: () => 'https://example.test/public-cover.png' } as never);
	const draft: RedPacketDraft = { kind: 'group', audience: 'public', mode: 'equal', count: 2, totalCoins: 10, message: '', expiresInHours: 24, requestId: '019a029d-4800-7000-8000-000000000001', coverFileId: 'file' };
	return { service, draft, user, em, wallet };
}

test.each([null, { id: 'file', type: 'text/html', isSensitive: false }, { id: 'file', type: 'image/png', isSensitive: true }])('invalid covers do not debit the wallet', async file => {
	const { service, draft, user, em, wallet } = fixture(file);
	await expect(service.create(draft, user)).rejects.toBeInstanceOf(RedPacketService.InvalidDraftError);
	expect(em.findOneBy).toHaveBeenCalledWith(MiDriveFile, { id: 'file', userId: 'sender' });
	expect(wallet.changeBalanceInTransaction).not.toHaveBeenCalled();
	expect(em.insert).not.toHaveBeenCalled();
});

test('stores the public image URL and retries without another lookup or debit', async () => {
	const { service, draft, user, em, wallet } = fixture({ id: 'file', type: 'image/png', isSensitive: false });
	const result = await service.create(draft, user);
	expect(result).toMatchObject({ coverFileId: 'file', coverUrl: 'https://example.test/public-cover.png' });
	expect(await service.create(draft, user)).toEqual(result);
	expect(em.findOneBy).toHaveBeenCalledTimes(1);
	expect(em.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['red-packet-cover:file']);
	expect(wallet.changeBalanceInTransaction).toHaveBeenCalledTimes(1);
	await expect(service.create({ ...draft, coverFileId: null }, user)).rejects.toBeInstanceOf(RedPacketService.RequestIdConflictError);
});

test.each([false, true])('cover cleanup checks server references under the creation lock: referenced=%s', async referenced => {
	const { service, em } = fixture(null);
	em.existsBy.mockResolvedValue(referenced);
	const remove = vi.fn().mockResolvedValue(undefined);
	await service.withUnusedCover('file', remove);
	expect(em.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['red-packet-cover:file']);
	expect(em.query.mock.invocationCallOrder[0]).toBeLessThan(em.existsBy.mock.invocationCallOrder[0]);
	expect(remove).toHaveBeenCalledTimes(referenced ? 0 : 1);
});

test('the cleanup endpoint waits for the synchronous deletion path before finishing', async () => {
	const { service, user } = fixture(null);
	let complete!: () => void;
	const drive = { deleteFile: vi.fn(), deleteFileSync: vi.fn(() => new Promise<void>(resolve => { complete = resolve; })) };
	const endpoint = new DeleteFileEndpoint({ findOneBy: async () => ({ id: 'file', userId: user.id }) } as never, drive as never, { isModerator: async () => false } as never, {} as never, service);
	let finished = false;
	const request = endpoint.exec({ fileId: 'file', ifUnusedForRedPacket: true }, user as never, null).then(() => { finished = true; });
	await vi.waitFor(() => expect(drive.deleteFileSync).toHaveBeenCalledTimes(1));
	expect(finished).toBe(false);
	expect(drive.deleteFile).not.toHaveBeenCalled();
	complete();
	await request;
	expect(finished).toBe(true);
});

test('a non-recipient cannot claim a one-to-one packet even with its ID', async () => {
	const { service, em, user, wallet } = fixture(null);
	Object.assign(em, {
		findOne: vi.fn().mockResolvedValue({ id: 'packet', userId: 'sender', kind: 'direct', audience: 'recipients' }),
		findBy: vi.fn().mockResolvedValue([user, { ...user, id: 'stranger' }]),
		existsBy: vi.fn().mockResolvedValue(false),
	});
	await expect(service.claim('packet', { id: 'stranger' })).rejects.toBeInstanceOf(RedPacketService.AccessDeniedError);
	expect(wallet.changeBalanceInTransaction).not.toHaveBeenCalled();
});
