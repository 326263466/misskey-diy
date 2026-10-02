/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll, describe, test, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';

import { CoreModule } from '@/core/CoreModule.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import { GlobalModule } from '@/GlobalModule.js';
import { MiNote } from '@/models/Note.js';
import { IPoll } from '@/models/Poll.js';
import { MiDriveFile } from '@/models/DriveFile.js';

describe('NoteCreateService', () => {
	let noteCreateService: NoteCreateService;

	beforeAll(async () => {
		const app = await Test.createTestingModule({
			imports: [GlobalModule, CoreModule],
		}).compile();
		noteCreateService = app.get<NoteCreateService>(NoteCreateService);
	});

	describe('is-renote', () => {
		const base: MiNote = {
			id: 'some-note-id',
			replyId: null,
			reply: null,
			renoteId: null,
			renote: null,
			threadId: null,
			deletedBy: null,
			text: null,
			name: null,
			cw: null,
			userId: 'some-user-id',
			user: null,
			localOnly: false,
			reactionAcceptance: null,
			renoteCount: 0,
			repliesCount: 0,
			viewsCount: 0,
			clippedCount: 0,
			pageCount: 0,
			reactions: {},
			visibility: 'public',
			uri: null,
			url: null,
			fileIds: [],
			attachedFileTypes: [],
			visibleUserIds: [],
			mentions: [],
			mentionedRemoteUsers: '',
			reactionAndUserPairCache: [],
			emojis: [],
			tags: [],
			hasPoll: false,
			hasRedPacket: false,
			redPacketId: null,
			channelId: null,
			channel: null,
			userHost: null,
			replyUserId: null,
			replyUserHost: null,
			renoteUserId: null,
			renoteUserHost: null,
			renoteChannelId: null,
		};

		const poll: IPoll = {
			choices: ['kinoko', 'takenoko'],
			multiple: false,
			expiresAt: null,
		};

		const file: MiDriveFile = {
			id: 'some-file-id',
			userId: null,
			user: null,
			userHost: null,
			md5: '',
			name: '',
			type: '',
			size: 0,
			comment: null,
			blurhash: null,
			properties: {},
			storedInternal: false,
			url: '',
			thumbnailUrl: null,
			webpublicUrl: null,
			webpublicType: null,
			accessKey: null,
			thumbnailAccessKey: null,
			webpublicAccessKey: null,
			uri: null,
			src: null,
			folderId: null,
			folder: null,
			isSensitive: false,
			maybeSensitive: false,
			maybePorn: false,
			isLink: false,
			requestHeaders: null,
			requestIp: null,
		};

		test('note without renote should not be Renote', () => {
			const note = { renote: null };
			expect(noteCreateService['isRenote'](note)).toBe(false);
		});

		test('note with renote should be Renote and not be Quote', () => {
			const note = { renote: base };
			expect(noteCreateService['isRenote'](note)).toBe(true);
			expect(noteCreateService['isQuote'](note)).toBe(false);
		});

		test('note with renote and text should be Quote', () => {
			const note = { renote: base, text: 'some-text' };
			expect(noteCreateService['isRenote'](note)).toBe(true);
			expect(noteCreateService['isQuote'](note)).toBe(true);
		});

		test('note with renote and cw should be Quote', () => {
			const note = { renote: base, cw: 'some-cw' };
			expect(noteCreateService['isRenote'](note)).toBe(true);
			expect(noteCreateService['isQuote'](note)).toBe(true);
		});

		test('note with renote and reply should be Quote', () => {
			const note = { renote: base, reply: { ...base, id: 'another-note-id' } };
			expect(noteCreateService['isRenote'](note)).toBe(true);
			expect(noteCreateService['isQuote'](note)).toBe(true);
		});

		test('note with renote and poll should be Quote', () => {
			const note = { renote: base, poll };
			expect(noteCreateService['isRenote'](note)).toBe(true);
			expect(noteCreateService['isQuote'](note)).toBe(true);
		});

		test('note with renote and non-empty files should be Quote', () => {
			const note = { renote: base, files: [file] };
			expect(noteCreateService['isRenote'](note)).toBe(true);
			expect(noteCreateService['isQuote'](note)).toBe(true);
		});
	});
});

describe('user note count completion', () => {
	test('waits for the stored user count before returning and increments it only once', async () => {
		const app = await Test.createTestingModule({ providers: [NoteCreateService] }).useMocker(() => ({})).compile();
		const service = app.get(NoteCreateService);
		const user = { id: 'author', username: 'author', host: null, isBot: false, isCat: false };
		let finishWrite!: () => void;
		let markWriteStarted!: () => void;
		let markPostCompleted!: () => void;
		let notesCount = 0;
		const publishUserStats = vi.fn();
		const writeGate = new Promise<void>(resolve => { finishWrite = resolve; });
		const writeStarted = new Promise<void>(resolve => { markWriteStarted = resolve; });
		const postCompleted = new Promise<void>(resolve => { markPostCompleted = resolve; });
		const execute = vi.fn(() => {
			markWriteStarted();
			return writeGate.then(() => { notesCount++; });
		});
		const query = {
			update: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(), execute,
		};
		Object.assign(service, {
			meta: {},
			usersRepository: { createQueryBuilder: () => query },
			globalEventService: { publishUserStats },
			utilityService: {
				concatNoteContentsForKeyWordCheck: () => '',
				isKeyWordIncluded: () => false,
				isSilencedHost: () => false,
				isMediaSilencedHost: () => false,
			},
			notesRepository: { insert: vi.fn().mockResolvedValue({}) },
			idService: { gen: () => 'note' },
			notesChart: { update: vi.fn() },
			perUserNotesChart: { update: vi.fn() },
			hashtagService: { updateHashtags: vi.fn() },
			antennaService: { addNoteToAntennas: vi.fn() },
			followingsRepository: { findBy: vi.fn().mockResolvedValue([]) },
			searchService: { indexNote: markPostCompleted },
		});
		let completed = false;
		const pending = service.create(user, {
			text: 'test', visibility: 'home', apHashtags: [], apEmojis: [], apMentions: [],
		}, true).then(result => {
			completed = true;
			return result;
		});
		await writeStarted;
		await new Promise<void>(resolve => setImmediate(resolve));
		try {
			expect(completed).toBe(false);
			expect(notesCount).toBe(0);
			expect(publishUserStats).not.toHaveBeenCalled();
		} finally {
			finishWrite();
			await pending;
			await postCompleted;
			await app.close();
		}
		expect(await pending).toMatchObject({ id: 'note', userId: user.id, text: 'test' });
		expect(notesCount).toBe(1);
		expect(execute).toHaveBeenCalledOnce();
		expect(publishUserStats).toHaveBeenCalledExactlyOnceWith(user.id);
	});
});

describe('renote count publication', () => {
	test.each([false, true])('publishes only after the count is stored (write fails: %s)', async fails => {
		let finish!: () => void;
		const execute = vi.fn(() => new Promise<void>((resolve, reject) => {
			finish = () => fails ? reject(new Error('database unavailable')) : resolve();
		}));
		const query = {
			update: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(), execute,
		};
		const publishNoteStream = vi.fn();
		const service = Object.assign(Object.create(NoteCreateService.prototype), {
			notesRepository: { createQueryBuilder: () => query },
			globalEventService: { publishNoteStream },
			idService: { parse: () => ({ date: new Date(0) }) },
		}) as NoteCreateService;
		const original = new MiNote({ id: 'original' });
		const renote = new MiNote({ id: 'renote' });
		const pending = service['incRenoteCount'](original, renote);
		expect(publishNoteStream).not.toHaveBeenCalled();
		finish();
		if (fails) {
			await expect(pending).rejects.toThrow('database unavailable');
			expect(publishNoteStream).not.toHaveBeenCalled();
		} else {
			await pending;
			expect(publishNoteStream).toHaveBeenCalledExactlyOnceWith(original, 'renoted', { noteId: renote.id });
		}
	});
});
