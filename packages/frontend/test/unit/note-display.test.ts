/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import * as mfm from 'mfm-js';
import type * as Misskey from 'misskey-js';
import { getNoteDisplayNodes, getNoteThreadAuthor } from '@/utility/note-display.js';

const author = { id: 'author', username: 'admin', host: null } as Misskey.entities.UserLite;
const participant = { id: 'participant', username: 'reader', host: null } as Misskey.entities.UserLite;

function makeNote(user: Misskey.entities.UserLite, text: string | null, reply: Misskey.entities.Note | null = null): Misskey.entities.Note {
	return {
		id: `${user.id}-${reply?.id ?? 'root'}`,
		userId: user.id,
		user,
		text,
		replyId: reply?.id ?? null,
		reply,
	} as Misskey.entities.Note;
}

const rootNote = makeNote(author, 'Original post');

describe('getNoteThreadAuthor', () => {
	test('finds the original author through nested replies', () => {
		const reply = makeNote(participant, 'Comment', rootNote);
		expect(getNoteThreadAuthor(makeNote(author, 'Response', reply))).toBe(author);
	});

	test('does not mistake an incomplete reply chain for the original post', () => {
		const reply = { ...makeNote(participant, 'Comment'), replyId: rootNote.id };
		expect(getNoteThreadAuthor(reply)).toBeNull();
	});
});

describe('getNoteDisplayNodes', () => {
	test.each([
		['@admin Nice post', 'Nice post'],
		['@ADMIN Nice post', 'Nice post'],
		['@admin\nNice post', 'Nice post'],
		['@admin @admin Nice post', 'Nice post'],
		['@admin @reader Nice post', '@reader Nice post'],
		['@admin **Nice post**', '**Nice post**'],
		['@admin', ''],
	])('omits the author reply prefix from %s', (text, expected) => {
		const note = makeNote(participant, text, rootNote);
		expect(mfm.toString(getNoteDisplayNodes(note)!)).toBe(expected);
		expect(note.text).toBe(text);
	});

	test.each([
		'@reader Nice post',
		'@administrator Nice post',
		'@admin@remote.example Nice post',
		'Nice post @admin',
		'`@admin` Nice post',
		'**@admin** Nice post',
		'@admin, Nice post',
	])('preserves other mentions and explicit content in %s', (text) => {
		const nodes = mfm.parse(text);
		expect(getNoteDisplayNodes(makeNote(participant, text, rootNote), author, nodes)).toBe(nodes);
	});

	test('preserves the mention when replying to another participant', () => {
		const reply = makeNote(participant, 'Comment', rootNote);
		const response = makeNote(author, '@reader Thank you', reply);
		expect(mfm.toString(getNoteDisplayNodes(response)!)).toBe(response.text);
	});

	test('omits a parent comment mention in detail while preserving it in the timeline', () => {
		const comment = makeNote(participant, 'Comment', rootNote);
		const reply = makeNote(author, '@reader Thank you', comment);
		expect(mfm.toString(getNoteDisplayNodes(reply, comment.user)!)).toBe('Thank you');
		expect(mfm.toString(getNoteDisplayNodes(reply)!)).toBe('@reader Thank you');
	});

	test('keeps the recipient of a reply to another flat child comment', () => {
		const comment = makeNote(participant, 'Comment', rootNote);
		const child = makeNote(author, '@reader Thank you', comment);
		const reply = makeNote(participant, '@admin You are welcome', child);
		expect(mfm.toString(getNoteDisplayNodes(reply, comment.user)!)).toBe('@admin You are welcome');
	});

	test('preserves every prefix when a flat child explicitly disables omission', () => {
		const comment = makeNote(participant, 'Comment', rootNote);
		const reply = makeNote(author, '@reader Thank you', comment);
		expect(mfm.toString(getNoteDisplayNodes(reply, null)!)).toBe('@reader Thank you');
	});

	test('preserves an explicit author mention when replying to another participant', () => {
		const reply = makeNote(participant, 'Comment', rootNote);
		const response = makeNote(participant, '@admin Please look at this', reply);
		expect(mfm.toString(getNoteDisplayNodes(response)!)).toBe(response.text);
	});

	test('omits the author prefix when replying to an author response', () => {
		const reply = makeNote(participant, 'Comment', rootNote);
		const response = makeNote(author, '@reader Thank you', reply);
		const note = makeNote(participant, '@admin You are welcome', response);
		expect(mfm.toString(getNoteDisplayNodes(note)!)).toBe('You are welcome');
	});

	test('uses the original author supplied by the loaded conversation', () => {
		const reply = { ...makeNote(author, 'Response'), replyId: 'unloaded-parent' };
		const note = makeNote(participant, '@admin You are welcome', reply);
		expect(mfm.toString(getNoteDisplayNodes(note, author)!)).toBe('You are welcome');
		expect(mfm.toString(getNoteDisplayNodes(note)!)).toBe(note.text);
	});

	test('resolves unqualified mentions relative to the posting account host', () => {
		const remoteAuthor = { ...author, host: 'remote.example' };
		const remoteParticipant = { ...participant, host: 'remote.example' };
		const remotePost = makeNote(remoteAuthor, 'Original post');
		const note = makeNote(remoteParticipant, '@admin Nice post', remotePost);
		expect(mfm.toString(getNoteDisplayNodes(note)!)).toBe('Nice post');
		const localReply = makeNote(participant, '@admin Nice post', remotePost);
		expect(mfm.toString(getNoteDisplayNodes(localReply)!)).toBe(localReply.text);
		const qualifiedReply = makeNote(participant, '@ADMIN@REMOTE.EXAMPLE Nice post', remotePost);
		expect(mfm.toString(getNoteDisplayNodes(qualifiedReply)!)).toBe('Nice post');
	});

	test('normalizes internationalized hostnames', () => {
		const remoteAuthor = { ...author, host: 'b\u00fccher.example' };
		const remotePost = makeNote(remoteAuthor, 'Original post');
		const note = makeNote(participant, '@admin@xn--bcher-kva.example Nice post', remotePost);
		expect(mfm.toString(getNoteDisplayNodes(note)!)).toBe('Nice post');
	});

	test('leaves original posts, missing text and parsed nodes unchanged', () => {
		const post = makeNote(author, '@admin Original post');
		expect(mfm.toString(getNoteDisplayNodes(post)!)).toBe(post.text);
		expect(getNoteDisplayNodes(makeNote(participant, null, rootNote))).toBeNull();
		const note = makeNote(participant, '@admin Nice post', rootNote);
		const nodes = mfm.parse(note.text!);
		const original = structuredClone(nodes);
		getNoteDisplayNodes(note, author, nodes);
		expect(nodes).toEqual(original);
	});
});
