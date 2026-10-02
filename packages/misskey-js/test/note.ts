import { describe, expect, test } from 'vitest';
import { isPureRenote } from '../src/note.js';
import type { Note } from '../src/entities.js';

describe('isPureRenote', () => {
	const renote = { renoteId: 'original', replyId: null, text: null, cw: null, fileIds: [] } as unknown as Note;
	test('recognizes an ordinary pure renote', () => {
		expect(isPureRenote(renote)).toBe(true);
	});
	test('treats red packet attachments as quote content, including lightweight note previews', () => {
		expect(isPureRenote({ ...renote, hasRedPacket: true })).toBe(false);
		expect(isPureRenote({ ...renote, redPacket: { totalCoins: 10 } as NonNullable<Note['redPacket']> })).toBe(false);
	});
});
