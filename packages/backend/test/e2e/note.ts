/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { EntityManager, Repository } from "typeorm";

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { describe, beforeAll, afterAll, test, vi } from 'vitest';
import { MiNote } from '@/models/Note.js';
import { MiNoteReaction } from '@/models/NoteReaction.js';
import { MiPoll } from '@/models/Poll.js';
import { MiPollVote } from '@/models/PollVote.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { notifyNoteReplied } from '@/misc/note-comments.js';
import { MiNoteLike } from '@/models/NoteLike.js';
import { MiNoteFavorite } from '@/models/NoteFavorite.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import { NoteRepliesTotal1788850497013 } from '../../migration/1788850497013-NoteRepliesTotal.js';
import { MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import { api, castAsError, initTestDb, post, role, signup, uploadFile, uploadUrl } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('Note', () => {
	let Notes: Repository<MiNote>;

	let root: misskey.entities.SignupResponse;
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let tom: misskey.entities.SignupResponse;

	beforeAll(async () => {
		const connection = await initTestDb(true);
		Notes = connection.getRepository(MiNote);
		root = await signup({ username: 'root' });
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
		tom = await signup({ username: 'tom', host: 'example.com' });
	}, 1000 * 60 * 2);

	test('投稿できる', async () => {
		const post = {
			text: 'test',
		};

		const res = await api('notes/create', post, alice);

		assert.strictEqual(res.status, 200);
		assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
		assert.strictEqual(res.body.createdNote.text, post.text);
	});

	test('ファイルを添付できる', async () => {
		const file = await uploadUrl(alice, 'https://raw.githubusercontent.com/misskey-dev/misskey/develop/packages/backend/test/resources/192.jpg');

		const res = await api('notes/create', {
			fileIds: [file.id],
		}, alice);

		assert.strictEqual(res.status, 200);
		assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
		assert.deepStrictEqual(res.body.createdNote.fileIds, [file.id]);
	}, 1000 * 10);

	test('他人のファイルで怒られる', async () => {
		const file = await uploadUrl(bob, 'https://raw.githubusercontent.com/misskey-dev/misskey/develop/packages/backend/test/resources/192.jpg');

		const res = await api('notes/create', {
			text: 'test',
			fileIds: [file.id],
		}, alice);

		assert.strictEqual(res.status, 400);
		assert.strictEqual(castAsError(res.body).error.code, 'NO_SUCH_FILE');
		assert.strictEqual(castAsError(res.body).error.id, 'b6992544-63e7-67f0-fa7f-32444b1b5306');
	}, 1000 * 10);

	test('存在しないファイルで怒られる', async () => {
		const res = await api('notes/create', {
			text: 'test',
			fileIds: ['000000000000000000000000'],
		}, alice);

		assert.strictEqual(res.status, 400);
		assert.strictEqual(castAsError(res.body).error.code, 'NO_SUCH_FILE');
		assert.strictEqual(castAsError(res.body).error.id, 'b6992544-63e7-67f0-fa7f-32444b1b5306');
	});

	test('不正なファイルIDで怒られる', async () => {
		const res = await api('notes/create', {
			fileIds: ['kyoppie'],
		}, alice);
		assert.strictEqual(res.status, 400);
		assert.strictEqual(castAsError(res.body).error.code, 'NO_SUCH_FILE');
		assert.strictEqual(castAsError(res.body).error.id, 'b6992544-63e7-67f0-fa7f-32444b1b5306');
	});

	test('返信できる', async () => {
		const bobPost = await post(bob, {
			text: 'foo',
		});

		const alicePost = {
			text: 'bar',
			replyId: bobPost.id,
		};

		const res = await api('notes/create', alicePost, alice);

		assert.strictEqual(res.status, 200);
		assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
		assert.strictEqual(res.body.createdNote.text, alicePost.text);
		assert.strictEqual(res.body.createdNote.replyId, alicePost.replyId);
		assert.ok(res.body.createdNote.reply);
		assert.strictEqual(res.body.createdNote.reply.text, bobPost.text);
	});

	test('返信元ノートのお気に入り状態が再取得後も保持される', async () => {
		const parentNote = await post(bob, {
			text: 'favorite target',
		});
		const replyNote = await post(alice, {
			text: 'reply',
			replyId: parentNote.id,
		});

		const favoriteRes = await api('notes/favorites/create', {
			noteId: parentNote.id,
		}, alice);
		assert.strictEqual(favoriteRes.status, 204);

		const showRes = await api('notes/show', {
			noteId: replyNote.id,
		}, alice);
		assert.strictEqual(showRes.status, 200);
		assert.strictEqual(showRes.body.reply?.isFavorited, true);

		const repliesRes = await api('notes/replies', {
			noteId: parentNote.id,
			limit: 10,
		}, alice);
		assert.strictEqual(repliesRes.status, 200);
		const packedReply = repliesRes.body.find(note => note.id === replyNote.id);
		assert.ok(packedReply);
		assert.strictEqual(packedReply.reply?.isFavorited, true);
		assert.strictEqual(packedReply.reply?.favoritesCount, 1);
	});

	test('returns shared favorite totals and viewer-specific state in full and partial note responses', async () => {
		const note = await post(alice, { text: 'shared favorite totals' });
		await Notes.update(note.id, { viewsCount: 7 });
		for (const viewer of [alice, bob]) {
			assert.strictEqual((await api('notes/favorites/create', { noteId: note.id }, viewer)).status, 204);
		}

		for (const viewer of [alice, bob, root, undefined]) {
			const shown = (await api('notes/show', { noteId: note.id }, viewer)).body;
			const partial = (await api('notes/show-partial-bulk', { noteIds: [note.id] }, viewer)).body[0];
			assert.strictEqual(shown.favoritesCount, 2);
			assert.strictEqual(shown.viewsCount, 7);
			assert.strictEqual(partial.favoritesCount, 2);
			assert.strictEqual(partial.viewsCount, 7);
			assert.strictEqual(partial.isFavorited, viewer === alice || viewer === bob);
			if (viewer) assert.strictEqual(shown.isFavorited, partial.isFavorited);
		}

		assert.strictEqual((await api('notes/favorites/delete', { noteId: note.id }, bob)).status, 204);
		const partial = (await api('notes/show-partial-bulk', { noteIds: [note.id] }, bob)).body[0];
		assert.strictEqual(partial.favoritesCount, 1);
		assert.strictEqual(partial.isFavorited, false);
		const timeline = (await api('users/notes', { userId: alice.id }, alice)).body;
		assert.strictEqual(timeline.find(item => item.id === note.id)?.favoritesCount, 1);
	});

	test('hides views and favorite state for inaccessible notes and deleted comments', async () => {
		const note = await post(alice, { text: 'private counts', visibility: 'specified', visibleUserIds: [bob.id] });
		await Notes.update(note.id, { viewsCount: 9 });
		assert.strictEqual((await api('notes/favorites/create', { noteId: note.id }, bob)).status, 204);
		for (const viewer of [root, undefined]) {
			const partial = (await api('notes/show-partial-bulk', { noteIds: [note.id] }, viewer)).body[0];
			assert.strictEqual(partial.viewsCount, 0);
			assert.strictEqual(partial.favoritesCount, 0);
			assert.strictEqual(partial.isFavorited, false);
		}
		const comment = await post(bob, { text: 'deleted stats', replyId: note.id, visibility: 'specified', visibleUserIds: [alice.id] });
		assert.strictEqual((await api('notes/favorites/create', { noteId: comment.id }, alice)).status, 204);
		await Notes.update(comment.id, { viewsCount: 4 });
		assert.strictEqual((await api('notes/delete', { noteId: comment.id }, bob)).status, 204);
		const placeholder = (await api('notes/replies', { noteId: note.id }, alice)).body.find(item => item.id === comment.id);
		assert.ok(placeholder);
		assert.strictEqual(placeholder.viewsCount, 0);
		assert.strictEqual(placeholder.favoritesCount, 0);
		assert.strictEqual(placeholder.isFavorited, false);
	});

	test('renoteできる', async () => {
		const bobPost = await post(bob, {
			text: 'test',
		});

		const alicePost = {
			renoteId: bobPost.id,
		};

		const res = await api('notes/create', alicePost, alice);

		assert.strictEqual(res.status, 200);
		assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
		assert.strictEqual(res.body.createdNote.renoteId, alicePost.renoteId);
		assert.ok(res.body.createdNote.renote);
		assert.strictEqual(res.body.createdNote.renote.text, bobPost.text);
	});

	test('renoteを取り消すとrenoteCountが減る', async () => {
		const bobPost = await post(bob, {
			text: 'test',
		});

		const renoteRes = await api('notes/create', {
			renoteId: bobPost.id,
		}, alice);

		assert.strictEqual(renoteRes.status, 200);
		await vi.waitFor(async () => {
			const target = await Notes.findOneByOrFail({ id: bobPost.id });
			assert.strictEqual(target.renoteCount, 1);
		});

		const deleteRes = await api('notes/delete', {
			noteId: renoteRes.body.createdNote.id,
		}, alice);

		assert.strictEqual(deleteRes.status, 204);
		const target = await Notes.findOneByOrFail({ id: bobPost.id });
		assert.strictEqual(target.renoteCount, 0);
	});

	test('引用renoteできる', async () => {
		const bobPost = await post(bob, {
			text: 'test',
		});

		const alicePost = {
			text: 'test',
			renoteId: bobPost.id,
		};

		const res = await api('notes/create', alicePost, alice);

		assert.strictEqual(res.status, 200);
		assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
		assert.strictEqual(res.body.createdNote.text, alicePost.text);
		assert.strictEqual(res.body.createdNote.renoteId, alicePost.renoteId);
		assert.ok(res.body.createdNote.renote);
		assert.strictEqual(res.body.createdNote.renote.text, bobPost.text);
	});

	test('引用renoteで空白文字のみで構成されたtextにするとレスポンスがtext: nullになる', async () => {
		const bobPost = await post(bob, {
			text: 'test',
		});
		const res = await api('notes/create', {
			text: ' ',
			renoteId: bobPost.id,
		}, alice);

		assert.strictEqual(res.status, 200);
		assert.strictEqual(res.body.createdNote.text, null);
	});

	test('visibility: followersでrenoteできる', async () => {
		const createRes = await api('notes/create', {
			text: 'test',
			visibility: 'followers',
		}, alice);

		assert.strictEqual(createRes.status, 200);

		const renoteId = createRes.body.createdNote.id;
		const renoteRes = await api('notes/create', {
			visibility: 'followers',
			renoteId,
		}, alice);

		assert.strictEqual(renoteRes.status, 200);
		assert.strictEqual(renoteRes.body.createdNote.renoteId, renoteId);
		assert.strictEqual(renoteRes.body.createdNote.visibility, 'followers');

		const deleteRes = await api('notes/delete', {
			noteId: renoteRes.body.createdNote.id,
		}, alice);

		assert.strictEqual(deleteRes.status, 204);
	});

	test('visibility: followersなノートに対してフォロワーはリプライできる', async () => {
		await api('following/create', {
			userId: alice.id,
		}, bob);

		const aliceNote = await api('notes/create', {
			text: 'direct note to bob',
			visibility: 'followers',
		}, alice);

		assert.strictEqual(aliceNote.status, 200);

		const replyId = aliceNote.body.createdNote.id;
		const bobReply = await api('notes/create', {
			text: 'reply to alice note',
			replyId,
		}, bob);

		assert.strictEqual(bobReply.status, 200);
		assert.strictEqual(bobReply.body.createdNote.replyId, replyId);

		await api('following/delete', {
			userId: alice.id,
		}, bob);
	});

	test('visibility: followersなノートに対してフォロワーでないユーザーがリプライしようとすると怒られる', async () => {
		const aliceNote = await api('notes/create', {
			text: 'direct note to bob',
			visibility: 'followers',
		}, alice);

		assert.strictEqual(aliceNote.status, 200);

		const bobReply = await api('notes/create', {
			text: 'reply to alice note',
			replyId: aliceNote.body.createdNote.id,
		}, bob);

		assert.strictEqual(bobReply.status, 400);
		assert.strictEqual(castAsError(bobReply.body).error.code, 'CANNOT_REPLY_TO_AN_INVISIBLE_NOTE');
	});

	test('visibility: specifiedなノートに対してvisibility: specifiedで返信できる', async () => {
		const aliceNote = await api('notes/create', {
			text: 'direct note to bob',
			visibility: 'specified',
			visibleUserIds: [bob.id],
		}, alice);

		assert.strictEqual(aliceNote.status, 200);

		const bobReply = await api('notes/create', {
			text: 'reply to alice note',
			replyId: aliceNote.body.createdNote.id,
			visibility: 'specified',
			visibleUserIds: [alice.id],
		}, bob);

		assert.strictEqual(bobReply.status, 200);
	});

	test('visibility: specifiedなノートに対してvisibility: follwersで返信しようとすると怒られる', async () => {
		const aliceNote = await api('notes/create', {
			text: 'direct note to bob',
			visibility: 'specified',
			visibleUserIds: [bob.id],
		}, alice);

		assert.strictEqual(aliceNote.status, 200);

		const bobReply = await api('notes/create', {
			text: 'reply to alice note with visibility: followers',
			replyId: aliceNote.body.createdNote.id,
			visibility: 'followers',
		}, bob);

		assert.strictEqual(bobReply.status, 400);
		assert.strictEqual(castAsError(bobReply.body).error.code, 'CANNOT_REPLY_TO_SPECIFIED_VISIBILITY_NOTE_WITH_EXTENDED_VISIBILITY');
	});

	test('文字数ぎりぎりで怒られない', async () => {
		const post = {
			text: '!'.repeat(MAX_NOTE_TEXT_LENGTH), // 3000文字
		};
		const res = await api('notes/create', post, alice);
		assert.strictEqual(res.status, 200);
	});

	test('文字数オーバーで怒られる', async () => {
		const post = {
			text: '!'.repeat(MAX_NOTE_TEXT_LENGTH + 1), // 3001文字
		};
		const res = await api('notes/create', post, alice);
		assert.strictEqual(res.status, 400);
	});

	test('存在しないリプライ先で怒られる', async () => {
		const post = {
			text: 'test',
			replyId: '000000000000000000000000',
		};
		const res = await api('notes/create', post, alice);
		assert.strictEqual(res.status, 400);
	});

	test('存在しないrenote対象で怒られる', async () => {
		const post = {
			renoteId: '000000000000000000000000',
		};
		const res = await api('notes/create', post, alice);
		assert.strictEqual(res.status, 400);
	});

	test('不正なリプライ先IDで怒られる', async () => {
		const post = {
			text: 'test',
			replyId: 'foo',
		};
		const res = await api('notes/create', post, alice);
		assert.strictEqual(res.status, 400);
	});

	test('不正なrenote対象IDで怒られる', async () => {
		const post = {
			renoteId: 'foo',
		};
		const res = await api('notes/create', post, alice);
		assert.strictEqual(res.status, 400);
	});

	test('存在しないユーザーにメンションできる', async () => {
		const post = {
			text: '@ghost yo',
		};

		const res = await api('notes/create', post, alice);

		assert.strictEqual(res.status, 200);
		assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
		assert.strictEqual(res.body.createdNote.text, post.text);
	});

	test('同じユーザーに複数メンションしても内部的にまとめられる', async () => {
		const post = {
			text: '@bob @bob @bob yo',
		};

		const res = await api('notes/create', post, alice);

		assert.strictEqual(res.status, 200);
		assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
		assert.strictEqual(res.body.createdNote.text, post.text);

		const noteDoc = await Notes.findOneBy({ id: res.body.createdNote.id });
		assert.ok(noteDoc);
		assert.deepStrictEqual(noteDoc.mentions, [bob.id]);
	});

	describe('添付ファイル情報', () => {
		test('ファイルを添付した場合、投稿成功時にファイル情報入りのレスポンスが帰ってくる', async () => {
			const file = await uploadFile(alice);
			const res = await api('notes/create', {
				fileIds: [file.body!.id],
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.ok(res.body.createdNote.files);
			assert.strictEqual(res.body.createdNote.files.length, 1);
			assert.strictEqual(res.body.createdNote.files[0].id, file.body!.id);
		});

		test('ファイルを添付した場合、タイムラインでファイル情報入りのレスポンスが帰ってくる', async () => {
			const file = await uploadFile(alice);
			const createdNote = await api('notes/create', {
				fileIds: [file.body!.id],
			}, alice);

			assert.strictEqual(createdNote.status, 200);

			const res = await api('notes', {
				withFiles: true,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);
			const myNote = res.body.find(note => note.id === createdNote.body.createdNote.id);
			assert.ok(myNote);
			assert.ok(myNote.files);
			assert.strictEqual(myNote.files.length, 1);
			assert.strictEqual(myNote.files[0].id, file.body!.id);
		});

		test('ファイルが添付されたノートをリノートした場合、タイムラインでファイル情報入りのレスポンスが帰ってくる', async () => {
			const file = await uploadFile(alice);
			const createdNote = await api('notes/create', {
				fileIds: [file.body!.id],
			}, alice);

			assert.strictEqual(createdNote.status, 200);

			const renoted = await api('notes/create', {
				renoteId: createdNote.body.createdNote.id,
			}, alice);
			assert.strictEqual(renoted.status, 200);

			const res = await api('notes', {
				renote: true,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);
			const myNote = res.body.find((note: { id: string }) => note.id === renoted.body.createdNote.id);
			assert.ok(myNote);
			assert.ok(myNote.renote);
			assert.ok(myNote.renote.files);
			assert.strictEqual(myNote.renote.files.length, 1);
			assert.strictEqual(myNote.renote.files[0].id, file.body!.id);
		});

		test('ファイルが添付されたノートに返信した場合、タイムラインでファイル情報入りのレスポンスが帰ってくる', async () => {
			const file = await uploadFile(alice);
			const createdNote = await api('notes/create', {
				fileIds: [file.body!.id],
			}, alice);

			assert.strictEqual(createdNote.status, 200);

			const reply = await api('notes/create', {
				replyId: createdNote.body.createdNote.id,
				text: 'this is reply',
			}, alice);
			assert.strictEqual(reply.status, 200);

			const res = await api('notes', {
				reply: true,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);
			const myNote = res.body.find((note: { id: string }) => note.id === reply.body.createdNote.id);
			assert.ok(myNote);
			assert.ok(myNote.reply);
			assert.ok(myNote.reply.files);
			assert.strictEqual(myNote.reply.files.length, 1);
			assert.strictEqual(myNote.reply.files[0].id, file.body!.id);
		});

		test('ファイルが添付されたノートへの返信をリノートした場合、タイムラインでファイル情報入りのレスポンスが帰ってくる', async () => {
			const file = await uploadFile(alice);
			const createdNote = await api('notes/create', {
				fileIds: [file.body!.id],
			}, alice);

			assert.strictEqual(createdNote.status, 200);

			const reply = await api('notes/create', {
				replyId: createdNote.body.createdNote.id,
				text: 'this is reply',
			}, alice);
			assert.strictEqual(reply.status, 200);

			const renoted = await api('notes/create', {
				renoteId: reply.body.createdNote.id,
			}, alice);
			assert.strictEqual(renoted.status, 200);

			const res = await api('notes', {
				renote: true,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);
			const myNote = res.body.find((note: { id: string }) => note.id === renoted.body.createdNote.id);
			assert.ok(myNote);
			assert.ok(myNote.renote);
			assert.ok(myNote.renote.reply);
			assert.ok(myNote.renote.reply.files);
			assert.strictEqual(myNote.renote.reply.files.length, 1);
			assert.strictEqual(myNote.renote.reply.files[0].id, file.body!.id);
		});

		test('NSFWが強制されている場合変更できない', async () => {
			const file = await uploadFile(alice);

			const res = await api('admin/roles/create', {
				name: 'test',
				description: '',
				color: null,
				iconUrl: null,
				displayOrder: 0,
				target: 'manual',
				condFormula: {},
				isAdministrator: false,
				isModerator: false,
				isPublic: false,
				isExplorable: false,
				asBadge: false,
				canEditMembersByModerator: false,
				policies: {
					alwaysMarkNsfw: {
						useDefault: false,
						priority: 0,
						value: true,
					},
				},
			}, root);

			assert.strictEqual(res.status, 200);

			const assign = await api('admin/roles/assign', {
				userId: alice.id,
				roleId: res.body.id,
			}, root);

			assert.strictEqual(assign.status, 204);
			assert.strictEqual(file.body!.isSensitive, false);

			const nsfwfile = await uploadFile(alice);

			assert.strictEqual(nsfwfile.status, 200);
			assert.strictEqual(nsfwfile.body!.isSensitive, true);

			const liftnsfw = await api('drive/files/update', {
				fileId: nsfwfile.body!.id,
				isSensitive: false,
			}, alice);

			assert.strictEqual(liftnsfw.status, 400);
			assert.strictEqual(castAsError(liftnsfw.body).error.code, 'RESTRICTED_BY_ROLE');

			const oldaddnsfw = await api('drive/files/update', {
				fileId: file.body!.id,
				isSensitive: true,
			}, alice);

			assert.strictEqual(oldaddnsfw.status, 200);

			await api('admin/roles/unassign', {
				userId: alice.id,
				roleId: res.body.id,
			}, root);

			await api('admin/roles/delete', {
				roleId: res.body.id,
			}, root);
		});
	});

	describe('notes/create', () => {
		test('投票を添付できる', async () => {
			const res = await api('notes/create', {
				text: 'test',
				poll: {
					choices: ['foo', 'bar'],
				},
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.createdNote.poll != null, true);
		});

		test('投票の選択肢が無くて怒られる', async () => {
			const res = await api('notes/create', {
				// @ts-expect-error poll must not be empty
				poll: {},
			}, alice);
			assert.strictEqual(res.status, 400);
		});

		test('投票の選択肢が無くて怒られる (空の配列)', async () => {
			const res = await api('notes/create', {
				poll: {
					choices: [],
				},
			}, alice);
			assert.strictEqual(res.status, 400);
		});

		test('投票の選択肢が1つで怒られる', async () => {
			const res = await api('notes/create', {
				poll: {
					choices: ['Strawberry Pasta'],
				},
			}, alice);
			assert.strictEqual(res.status, 400);
		});

		test('投票できる', async () => {
			const { body } = await api('notes/create', {
				text: 'test',
				poll: {
					choices: ['sakura', 'izumi', 'ako'],
				},
			}, alice);

			const res = await api('notes/polls/vote', {
				noteId: body.createdNote.id,
				choice: 1,
			}, alice);

			assert.strictEqual(res.status, 204);
		});

		test('複数投票できない', async () => {
			const { body } = await api('notes/create', {
				text: 'test',
				poll: {
					choices: ['sakura', 'izumi', 'ako'],
				},
			}, alice);

			await api('notes/polls/vote', {
				noteId: body.createdNote.id,
				choice: 0,
			}, alice);

			const res = await api('notes/polls/vote', {
				noteId: body.createdNote.id,
				choice: 2,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('許可されている場合は複数投票できる', async () => {
			const { body } = await api('notes/create', {
				text: 'test',
				poll: {
					choices: ['sakura', 'izumi', 'ako'],
					multiple: true,
				},
			}, alice);

			await api('notes/polls/vote', {
				noteId: body.createdNote.id,
				choice: 0,
			}, alice);

			await api('notes/polls/vote', {
				noteId: body.createdNote.id,
				choice: 1,
			}, alice);

			const res = await api('notes/polls/vote', {
				noteId: body.createdNote.id,
				choice: 2,
			}, alice);

			assert.strictEqual(res.status, 204);
		});

		test('締め切られている場合は投票できない', async () => {
			const { body } = await api('notes/create', {
				text: 'test',
				poll: {
					choices: ['sakura', 'izumi', 'ako'],
					expiredAfter: 1,
				},
			}, alice);

			await new Promise(x => setTimeout(x, 2));

			const res = await api('notes/polls/vote', {
				noteId: body.createdNote.id,
				choice: 1,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('センシティブな投稿はhomeになる (単語指定)', async () => {
			const sensitive = await api('admin/update-meta', {
				sensitiveWords: [
					'test',
				],
			}, root);

			assert.strictEqual(sensitive.status, 204);

			await new Promise(x => setTimeout(x, 2));

			const note1 = await api('notes/create', {
				text: 'hogetesthuge',
			}, alice);

			assert.strictEqual(note1.status, 200);
			assert.strictEqual(note1.body.createdNote.visibility, 'home');
		});

		test('センシティブな投稿はhomeになる (正規表現)', async () => {
			const sensitive = await api('admin/update-meta', {
				sensitiveWords: [
					'/Test/i',
				],
			}, root);

			assert.strictEqual(sensitive.status, 204);

			const note2 = await api('notes/create', {
				text: 'hogetesthuge',
			}, alice);

			assert.strictEqual(note2.status, 200);
			assert.strictEqual(note2.body.createdNote.visibility, 'home');
		});

		test('センシティブな投稿はhomeになる (スペースアンド)', async () => {
			const sensitive = await api('admin/update-meta', {
				sensitiveWords: [
					'Test hoge',
				],
			}, root);

			assert.strictEqual(sensitive.status, 204);

			const note2 = await api('notes/create', {
				text: 'hogeTesthuge',
			}, alice);

			assert.strictEqual(note2.status, 200);
			assert.strictEqual(note2.body.createdNote.visibility, 'home');
		});

		test('禁止ワードを含む投稿はエラーになる (単語指定)', async () => {
			const prohibited = await api('admin/update-meta', {
				prohibitedWords: [
					'test',
				],
			}, root);

			assert.strictEqual(prohibited.status, 204);

			await new Promise(x => setTimeout(x, 2));

			const note1 = await api('notes/create', {
				text: 'hogetesthuge',
			}, alice);

			assert.strictEqual(note1.status, 400);
			assert.strictEqual(castAsError(note1.body).error.code, 'CONTAINS_PROHIBITED_WORDS');
		});

		test('禁止ワードを含む投稿はエラーになる (正規表現)', async () => {
			const prohibited = await api('admin/update-meta', {
				prohibitedWords: [
					'/Test/i',
				],
			}, root);

			assert.strictEqual(prohibited.status, 204);

			const note2 = await api('notes/create', {
				text: 'hogetesthuge',
			}, alice);

			assert.strictEqual(note2.status, 400);
			assert.strictEqual(castAsError(note2.body).error.code, 'CONTAINS_PROHIBITED_WORDS');
		});

		test('禁止ワードを含む投稿はエラーになる (スペースアンド)', async () => {
			const prohibited = await api('admin/update-meta', {
				prohibitedWords: [
					'Test hoge',
				],
			}, root);

			assert.strictEqual(prohibited.status, 204);

			const note2 = await api('notes/create', {
				text: 'hogeTesthuge',
			}, alice);

			assert.strictEqual(note2.status, 400);
			assert.strictEqual(castAsError(note2.body).error.code, 'CONTAINS_PROHIBITED_WORDS');
		});

		test('禁止ワードを含んでるリモートノートもエラーになる', async () => {
			const prohibited = await api('admin/update-meta', {
				prohibitedWords: [
					'test',
				],
			}, root);

			assert.strictEqual(prohibited.status, 204);

			await new Promise(x => setTimeout(x, 2));

			const note1 = await api('notes/create', {
				text: 'hogetesthuge',
			}, tom);

			assert.strictEqual(note1.status, 400);
		});

		test('メンションの数が上限を超えるとエラーになる', async () => {
			const res = await api('admin/roles/create', {
				name: 'test',
				description: '',
				color: null,
				iconUrl: null,
				displayOrder: 0,
				target: 'manual',
				condFormula: {},
				isAdministrator: false,
				isModerator: false,
				isPublic: false,
				isExplorable: false,
				asBadge: false,
				canEditMembersByModerator: false,
				policies: {
					mentionLimit: {
						useDefault: false,
						priority: 1,
						value: 0,
					},
				},
			}, root);

			assert.strictEqual(res.status, 200);

			await new Promise(x => setTimeout(x, 2));

			const assign = await api('admin/roles/assign', {
				userId: alice.id,
				roleId: res.body.id,
			}, root);

			assert.strictEqual(assign.status, 204);

			await new Promise(x => setTimeout(x, 2));

			const note = await api('notes/create', {
				text: '@bob potentially annoying text',
			}, alice);

			assert.strictEqual(note.status, 400);
			assert.strictEqual(castAsError(note.body).error.code, 'CONTAINS_TOO_MANY_MENTIONS');

			await api('admin/roles/unassign', {
				userId: alice.id,
				roleId: res.body.id,
			}, root);

			await api('admin/roles/delete', {
				roleId: res.body.id,
			}, root);
		});

		test('ダイレクト投稿もエラーになる', async () => {
			const res = await api('admin/roles/create', {
				name: 'test',
				description: '',
				color: null,
				iconUrl: null,
				displayOrder: 0,
				target: 'manual',
				condFormula: {},
				isAdministrator: false,
				isModerator: false,
				isPublic: false,
				isExplorable: false,
				asBadge: false,
				canEditMembersByModerator: false,
				policies: {
					mentionLimit: {
						useDefault: false,
						priority: 1,
						value: 0,
					},
				},
			}, root);

			assert.strictEqual(res.status, 200);

			await new Promise(x => setTimeout(x, 2));

			const assign = await api('admin/roles/assign', {
				userId: alice.id,
				roleId: res.body.id,
			}, root);

			assert.strictEqual(assign.status, 204);

			await new Promise(x => setTimeout(x, 2));

			const note = await api('notes/create', {
				text: 'potentially annoying text',
				visibility: 'specified',
				visibleUserIds: [bob.id],
			}, alice);

			assert.strictEqual(note.status, 400);
			assert.strictEqual(castAsError(note.body).error.code, 'CONTAINS_TOO_MANY_MENTIONS');

			await api('admin/roles/unassign', {
				userId: alice.id,
				roleId: res.body.id,
			}, root);

			await api('admin/roles/delete', {
				roleId: res.body.id,
			}, root);
		});

		test('ダイレクトの宛先とメンションが同じ場合は重複してカウントしない', async () => {
			const res = await api('admin/roles/create', {
				name: 'test',
				description: '',
				color: null,
				iconUrl: null,
				displayOrder: 0,
				target: 'manual',
				condFormula: {},
				isAdministrator: false,
				isModerator: false,
				isPublic: false,
				isExplorable: false,
				asBadge: false,
				canEditMembersByModerator: false,
				policies: {
					mentionLimit: {
						useDefault: false,
						priority: 1,
						value: 1,
					},
				},
			}, root);

			assert.strictEqual(res.status, 200);

			await new Promise(x => setTimeout(x, 2));

			const assign = await api('admin/roles/assign', {
				userId: alice.id,
				roleId: res.body.id,
			}, root);

			assert.strictEqual(assign.status, 204);

			await new Promise(x => setTimeout(x, 2));

			const note = await api('notes/create', {
				text: '@bob potentially annoying text',
				visibility: 'specified',
				visibleUserIds: [bob.id],
			}, alice);

			assert.strictEqual(note.status, 200);

			await api('admin/roles/unassign', {
				userId: alice.id,
				roleId: res.body.id,
			}, root);

			await api('admin/roles/delete', {
				roleId: res.body.id,
			}, root);
		});
	});

	describe('comment totals', () => {
		test.each([false, true])('includes own replies and every nested level, published: %s', async publishReply => {
			const parent = await post(alice, { text: 'Comment totals root' });
			await post(alice, { text: 'Own direct reply', replyId: parent.id, publishReply });
			const comment = await post(bob, { text: 'Other direct reply', replyId: parent.id });
			const child = await post(alice, { text: 'Own nested reply', replyId: comment.id, publishReply });
			const leaf = await post(alice, { text: 'Own reply to myself', replyId: child.id });
			const shown = (await api('notes/show', { noteId: parent.id }, alice)).body;
			assert.ok(!('commentsCount' in shown));
			assert.strictEqual(shown.repliesCount, 4);
			assert.strictEqual((await api('notes/show', { noteId: comment.id }, alice)).body.repliesCount, 2);
			const partial = (await api('notes/show-partial-bulk', { noteIds: [parent.id, comment.id, child.id, leaf.id] }, alice)).body;
			assert.deepStrictEqual(new Map(partial.map(note => [note.id, note.repliesCount])), new Map([[parent.id, 4], [comment.id, 2], [child.id, 1], [leaf.id, 0]]));
			const timeline = (await api('users/notes', { userId: alice.id, limit: 100 }, alice)).body;
			assert.strictEqual(timeline.find(note => note.id === parent.id)?.repliesCount, 4);

			const publishNoteStream = vi.fn();
			await notifyNoteReplied(Notes, { publishNoteStream } as never, await Notes.findOneByOrFail({ id: leaf.id }));
			assert.deepStrictEqual(new Set(publishNoteStream.mock.calls.map(([note]) => note.id)), new Set([parent.id, comment.id]));
			assert.ok(publishNoteStream.mock.calls.every(([, type, body]) => type === 'replied' && body.noteId === leaf.id));
		});

		test('keeps deleted placeholders and every descendant in the total', async () => {
			const parent = await post(alice, { text: 'Deletion total root' });
			const comment = await post(bob, { text: 'Comment to delete', replyId: parent.id });
			const child = await post(alice, { text: 'Retained child', replyId: comment.id });
			const leaf = await post(alice, { text: 'Retained leaf', replyId: child.id });
			assert.strictEqual((await api('notes/show', { noteId: parent.id }, alice)).body.repliesCount, 3);
			await api('notes/delete', { noteId: comment.id }, bob);
			assert.strictEqual((await api('notes/show', { noteId: parent.id }, alice)).body.repliesCount, 3);
			for (const note of [comment, child, leaf]) assert.strictEqual(await Notes.existsBy({ id: note.id }), true);
			assert.strictEqual((await Notes.findOneByOrFail({ id: comment.id })).text, null);
			await api('notes/delete', { noteId: leaf.id }, alice);
			assert.strictEqual((await api('notes/show', { noteId: parent.id }, alice)).body.repliesCount, 3);
		});

		test('migrates existing own and nested replies into the original counter and supports rollback', async () => {
			const parent = await post(alice, { text: 'Legacy own replies' });
			const comment = await post(alice, { text: 'Existing own comment', replyId: parent.id });
			await post(bob, { text: 'Existing nested reply', replyId: comment.id });
			await Notes.update(parent.id, { repliesCount: 0 });
			const runner = Notes.manager.connection.createQueryRunner();
			await runner.startTransaction();
			try {
				const migration = new NoteRepliesTotal1788850497013();
				await migration.up(runner);
				assert.strictEqual((await runner.manager.findOneByOrFail(MiNote, { id: parent.id })).repliesCount, 2);
				await migration.down(runner);
				assert.strictEqual((await runner.manager.findOneByOrFail(MiNote, { id: parent.id })).repliesCount, 1);
				await migration.up(runner);
				assert.strictEqual((await runner.manager.findOneByOrFail(MiNote, { id: parent.id })).repliesCount, 2);
				await runner.commitTransaction();
			} finally {
				if (runner.isTransactionActive) await runner.rollbackTransaction();
				await runner.release();
			}
		});
	});

	describe('notes/update', () => {
		test('edits a post in place while keeping reactions, votes and replies', async () => {
			const note = await post(alice, { text: 'original post', poll: { choices: ['one', 'two'] } });
			const child = await post(bob, { text: 'existing comment', replyId: note.id });
			assert.strictEqual((await api('notes/reactions/create', { noteId: note.id, reaction: '\u2764\ufe0f' }, bob)).status, 204);
			assert.strictEqual((await api('notes/polls/vote', { noteId: note.id, choice: 1 }, bob)).status, 204);
			const before = await Notes.findOneByOrFail({ id: note.id });

			const updated = await api('notes/update', { noteId: note.id, text: 'edited post', cw: 'content warning' }, alice);
			assert.strictEqual(updated.status, 200);
			assert.strictEqual(updated.body.id, note.id);
			assert.strictEqual(updated.body.text, 'edited post');
			const after = await Notes.findOneByOrFail({ id: note.id });
			assert.strictEqual(after.replyId, null);
			assert.strictEqual(after.repliesCount, 1);
			assert.deepStrictEqual(after.reactions, before.reactions);
			assert.deepStrictEqual(after.fileIds, before.fileIds);
			assert.strictEqual(await Notes.manager.count(MiPollVote, { where: { noteId: note.id } }), 1);
			assert.strictEqual((await Notes.findOneByOrFail({ id: child.id })).replyId, note.id);
		});
	});

	describe('notes/delete', () => {
		test('deletes a root post and its complete discussion while leaving other posts intact', async () => {
			const rootNote = await post(alice, { text: 'Delete root and discussion' });
			const comment = await post(bob, { text: 'child', replyId: rootNote.id });
			const nested = await post(alice, { text: 'nested', replyId: comment.id });
			const other = await post(bob, { text: 'Keep other root' });
			for (const note of [rootNote, comment, nested, other]) await api('notes/likes/create', { noteId: note.id }, alice);
			assert.strictEqual((await api('notes/delete', { noteId: rootNote.id }, alice)).status, 204);
			for (const note of [rootNote, comment, nested]) {
				assert.strictEqual(await Notes.existsBy({ id: note.id }), false);
				assert.strictEqual(await Notes.manager.count(MiNoteLike, { where: { noteId: note.id } }), 0);
			}
			assert.strictEqual(await Notes.existsBy({ id: other.id }), true);
			assert.strictEqual(await Notes.manager.count(MiNoteLike, { where: { noteId: other.id } }), 1);
		});

		test('does not leave orphan replies when posting races with deletion', async () => {
			const parent = await post(alice, { text: 'Concurrent parent' });
			const comment = await post(bob, { text: 'Concurrent comment', replyId: parent.id });
			const [removed, created] = await Promise.all([
				api('notes/delete', { noteId: comment.id }, bob),
				api('notes/create', { text: 'Concurrent child', replyId: comment.id }, alice),
			]);
			assert.strictEqual(removed.status, 204);
			assert.ok(created.status === 200 || created.status === 400);
			assert.strictEqual(await Notes.countBy({ replyId: comment.id }), created.status === 200 ? 1 : 0);
			assert.strictEqual((await Notes.findOneByOrFail({ id: parent.id })).repliesCount, created.status === 200 ? 2 : 1);
		});

		test('clears a deleted comment while preserving its likes, votes, favorites, child replies and mentions', async () => {
			const file = (await uploadFile(alice)).body!;
			const parent = await post(alice, { text: 'root', fileIds: [file.id] });
			const comment = await post(bob, { text: 'remove this text', replyId: parent.id, publishReply: true, poll: { choices: ['one', 'two'] } });
			const child = await post(alice, { text: '@bob Keep this reply', replyId: comment.id, fileIds: [file.id], poll: { choices: ['one', 'two'] } });
			const sibling = await post(alice, { text: 'keep this sibling', replyId: parent.id, poll: { choices: ['one', 'two'] } });
			const unrelated = await post(bob, { text: 'unrelated' });
			for (const note of [parent, comment, child, sibling, unrelated]) {
				assert.strictEqual((await api('notes/likes/create', { noteId: note.id }, alice)).status, 200);
				assert.strictEqual((await api('notes/reactions/create', { noteId: note.id, reaction: '\u2764\ufe0f' }, alice)).status, 204);
				assert.strictEqual((await api('notes/favorites/create', { noteId: note.id }, alice)).status, 204);
			}
			for (const note of [comment, child, sibling]) await api('notes/polls/vote', { noteId: note.id, choice: 0 }, alice);
			assert.strictEqual((await Notes.findOneByOrFail({ id: parent.id })).repliesCount, 3);
			assert.strictEqual((await api('notes/delete', { noteId: comment.id }, bob)).status, 204);

			for (const note of [comment, child]) {
				assert.strictEqual(await Notes.existsBy({ id: note.id }), true);
				assert.strictEqual(await Notes.manager.count(MiNoteLike, { where: { noteId: note.id } }), 1);
				for (const entity of [MiNoteReaction, MiNoteFavorite, MiPoll, MiPollVote]) assert.strictEqual(await Notes.manager.count(entity, { where: { noteId: note.id } }), 1);
			}
			for (const note of [parent, sibling, unrelated]) {
				assert.strictEqual(await Notes.existsBy({ id: note.id }), true);
				assert.strictEqual(await Notes.manager.count(MiNoteLike, { where: { noteId: note.id } }), 1);
				for (const entity of [MiNoteReaction, MiNoteFavorite]) assert.strictEqual(await Notes.manager.count(entity, { where: { noteId: note.id } }), 1);
			}
			assert.strictEqual(await Notes.manager.count(MiPollVote, { where: { noteId: sibling.id } }), 1);
			assert.strictEqual(await Notes.manager.existsBy(MiDriveFile, { id: file.id }), true);
			assert.strictEqual((await Notes.findOneByOrFail({ id: parent.id })).repliesCount, 3);
			const listed = (await api('notes/children', { noteId: parent.id }, alice)).body;
			assert.deepStrictEqual(listed.map(note => note.id), [sibling.id, comment.id]);
			assert.strictEqual(listed[1].isDeleted, true);
			assert.strictEqual(listed[1].text, null);
			assert.strictEqual(listed[1].poll, undefined);
			assert.strictEqual(listed[1].likeCount, 0);
			assert.deepStrictEqual(listed[1].reactions, {});
			assert.strictEqual((await Notes.findOneByOrFail({ id: child.id })).text, '@bob Keep this reply');
			assert.strictEqual(castAsError((await api('notes/update', { noteId: comment.id, text: 'restore' }, bob)).body).error.code, 'NO_SUCH_NOTE');
			assert.strictEqual(castAsError((await api('notes/reactions/create', { noteId: comment.id, reaction: '\u2764\ufe0f' }, alice)).body as any).error.code, 'NO_SUCH_NOTE');
			assert.strictEqual(castAsError((await api('notes/create', { replyId: comment.id, text: 'late reply' }, alice)).body as any).error.code, 'NO_SUCH_REPLY_TARGET');
		});

		test.each([false, true])('preserves a deleted comment\'s reactions and votes, publishReply: %s', async publishReply => {
			const parent = await post(alice, { text: 'parent' });
			const comment = await post(bob, {
				text: 'comment', replyId: parent.id, publishReply,
				poll: { choices: ['one', 'two'] },
			});
			assert.strictEqual((await Notes.findOneByOrFail({ id: parent.id })).repliesCount, 1);
			assert.strictEqual((await api('notes/reactions/create', { noteId: comment.id, reaction: '\u2764\ufe0f' }, alice)).status, 204);
			assert.strictEqual((await api('notes/polls/vote', { noteId: comment.id, choice: 0 }, alice)).status, 204);
			for (const model of [MiNoteReaction, MiPoll, MiPollVote]) {
				assert.strictEqual(await Notes.manager.count(model, { where: { noteId: comment.id } }), 1);
			}

			assert.strictEqual((await api('notes/delete', { noteId: comment.id }, bob)).status, 204);

			assert.strictEqual(await Notes.existsBy({ id: comment.id }), true);
			const savedParent = await Notes.findOneByOrFail({ id: parent.id });
			assert.strictEqual(savedParent.repliesCount, 1);
			assert.strictEqual(savedParent.renoteCount, 0);
			for (const model of [MiNoteReaction, MiPoll, MiPollVote]) {
				assert.strictEqual(await Notes.manager.count(model, { where: { noteId: comment.id } }), 1);
			}
			const remaining = (await api('notes/children', { noteId: parent.id }, alice)).body;
			assert.strictEqual(remaining.length, 1);
			assert.strictEqual(remaining[0].isDeleted, true);
			assert.strictEqual(castAsError((await api('notes/show', { noteId: comment.id }, alice)).body).error.code, 'NO_SUCH_NOTE');
		});

		test('deleting a nested reply preserves all ancestor totals', async () => {
			const parent = await post(alice, { text: 'root' });
			const comment = await post(bob, { text: 'comment', replyId: parent.id });
			const child = await post(alice, { text: 'child', replyId: comment.id });
			assert.strictEqual((await Notes.findOneByOrFail({ id: comment.id })).repliesCount, 1);

			assert.strictEqual((await api('notes/delete', { noteId: child.id }, alice)).status, 204);

			assert.strictEqual((await Notes.findOneByOrFail({ id: comment.id })).repliesCount, 1);
			assert.strictEqual((await Notes.findOneByOrFail({ id: parent.id })).repliesCount, 2);
			const children = (await api('notes/replies', { noteId: comment.id }, alice)).body;
			assert.strictEqual(children.length, 1);
			assert.strictEqual(children[0].isDeleted, true);
		});

		test('repeated deletion leaves surviving sibling counts unchanged', async () => {
			const parent = await post(alice, { text: 'root' });
			const comment = await post(bob, { text: 'comment', replyId: parent.id });
			const sibling = await post(alice, { text: 'sibling', replyId: parent.id });
			assert.strictEqual((await api('notes/delete', { noteId: comment.id }, bob)).status, 204);
			assert.strictEqual(castAsError((await api('notes/delete', { noteId: comment.id }, bob)).body as any).error.code, 'NO_SUCH_NOTE');
			assert.strictEqual((await Notes.findOneByOrFail({ id: parent.id })).repliesCount, 2);
			assert.deepStrictEqual((await api('notes/children', { noteId: parent.id }, alice)).body.map(note => note.id), [sibling.id, comment.id]);
		});

		test('concurrent deletion of the same comment preserves its parent total and runs once', async () => {
			const parent = await post(alice, { text: 'parent' });
			const comment = await post(bob, { text: 'comment', replyId: parent.id });
			await post(alice, { text: 'sibling', replyId: parent.id });
			const note = await Notes.findOneByOrFail({ id: comment.id });
			const unindexNote = vi.fn();
			const service = Object.assign(Object.create(NoteDeleteService.prototype), {
				db: Notes.manager.connection,
				notesRepository: Notes,
				searchService: { unindexNote },
			}) as NoteDeleteService;
			const user = { id: bob.id, uri: null, host: null, isBot: false };

			await Promise.all([service.delete(user, note, true), service.delete(user, note, true)]);

			assert.strictEqual(await Notes.existsBy({ id: comment.id }), true);
			assert.strictEqual((await Notes.findOneByOrFail({ id: parent.id })).repliesCount, 2);
			assert.strictEqual(unindexNote.mock.calls.length, 1);
		});

		test('rolls back both the comment deletion and its parent count when the transaction fails', async () => {
			const parent = await post(alice, { text: 'parent' });
			const comment = await post(bob, { text: 'comment', replyId: parent.id });
			const note = await Notes.findOneByOrFail({ id: comment.id });
			const unindexNote = vi.fn();
			const service = Object.assign(Object.create(NoteDeleteService.prototype), {
				notesRepository: Notes,
				db: {
					transaction: (work: (manager: EntityManager) => Promise<void>) => Notes.manager.transaction(async manager => {
						await work(manager);
						throw new Error('transaction failed');
					}),
				},
				searchService: { unindexNote },
			}) as NoteDeleteService;

			await assert.rejects(service.delete({ id: bob.id, uri: null, host: null, isBot: false }, note, true), /transaction failed/);

			assert.ok(await Notes.findOneBy({ id: comment.id }));
			assert.strictEqual((await Notes.findOneByOrFail({ id: comment.id })).text, 'comment');
			assert.strictEqual((await Notes.findOneByOrFail({ id: parent.id })).repliesCount, 1);
			assert.strictEqual(unindexNote.mock.calls.length, 0);
		});

		test('delete a reply', async () => {
			const mainNoteRes = await api('notes/create', {
				text: 'main post',
			}, alice);
			const replyOneRes = await api('notes/create', {
				text: 'reply one',
				replyId: mainNoteRes.body.createdNote.id,
			}, alice);
			const replyTwoRes = await api('notes/create', {
				text: 'reply two',
				replyId: mainNoteRes.body.createdNote.id,
			}, alice);

			const deleteOneRes = await api('notes/delete', {
				noteId: replyOneRes.body.createdNote.id,
			}, alice);

			assert.strictEqual(deleteOneRes.status, 204);
			let mainNote = await Notes.findOneBy({ id: mainNoteRes.body.createdNote.id });
			assert.ok(mainNote);
			assert.strictEqual(mainNote.repliesCount, 2);

			const deleteTwoRes = await api('notes/delete', {
				noteId: replyTwoRes.body.createdNote.id,
			}, alice);

			assert.strictEqual(deleteTwoRes.status, 204);
			mainNote = await Notes.findOneBy({ id: mainNoteRes.body.createdNote.id });
			assert.ok(mainNote);
			assert.strictEqual(mainNote.repliesCount, 2);
		});
	});

	describe('notes/translate', () => {
		describe('翻訳機能の利用が許可されていない場合', () => {
			let cannotTranslateRole: misskey.entities.Role;

			beforeAll(async () => {
				cannotTranslateRole = await role(root, {}, { canUseTranslator: false });
				await api('admin/roles/assign', { roleId: cannotTranslateRole.id, userId: alice.id }, root);
			});

			test('翻訳機能の利用が許可されていない場合翻訳できない', async () => {
				const aliceNote = await post(alice, { text: 'Hello' });
				const res = await api('notes/translate', {
					noteId: aliceNote.id,
					targetLang: 'ja',
				}, alice);

				assert.strictEqual(res.status, 400);
				assert.strictEqual(castAsError(res.body).error.code, 'UNAVAILABLE');
			});

			afterAll(async () => {
				await api('admin/roles/unassign', { roleId: cannotTranslateRole.id, userId: alice.id }, root);
			});
		});

		test('存在しないノートは翻訳できない', async () => {
			const res = await api('notes/translate', { noteId: 'foo', targetLang: 'ja' }, alice);

			assert.strictEqual(res.status, 400);
			assert.strictEqual(castAsError(res.body).error.code, 'NO_SUCH_NOTE');
		});

		test('不可視なノートは翻訳できない', async () => {
			const aliceNote = await post(alice, { visibility: 'followers', text: 'Hello' });
			const bobTranslateAttempt = await api('notes/translate', { noteId: aliceNote.id, targetLang: 'ja' }, bob);

			assert.strictEqual(bobTranslateAttempt.status, 400);
			assert.strictEqual(castAsError(bobTranslateAttempt.body).error.code, 'CANNOT_TRANSLATE_INVISIBLE_NOTE');
		});

		test('text: null なノートを翻訳すると空のレスポンスが返ってくる', async () => {
			const aliceNote = await post(alice, { text: null, poll: { choices: ['kinoko', 'takenoko'] } });
			const res = await api('notes/translate', { noteId: aliceNote.id, targetLang: 'ja' }, alice);

			assert.strictEqual(res.status, 204);
		});

		test('サーバーに DeepL 認証キーが登録されていない場合翻訳できない', async () => {
			const aliceNote = await post(alice, { text: 'Hello' });
			const res = await api('notes/translate', { noteId: aliceNote.id, targetLang: 'ja' }, alice);

			// NOTE: デフォルトでは登録されていないので落ちる
			assert.strictEqual(res.status, 400);
			assert.strictEqual(castAsError(res.body).error.code, 'UNAVAILABLE');
		});
	});
});
