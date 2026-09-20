/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import { useNoteContent } from '@/composables/use-note-content.js';
import { globalEvents } from '@/events.js';

const source = {
	id: 'note', text: 'Original', cw: null, fileIds: ['old'], files: [{ id: 'old' }],
	tags: ['old'], emojis: {}, reactions: { heart: 7 }, likeCount: 5, repliesCount: 3,
	poll: { choices: [{ text: 'One', votes: 2 }], multiple: false, expiresAt: null },
} as unknown as Misskey.entities.Note;

function mountContent() {
	let note!: Misskey.entities.Note;
	render(defineComponent({
		setup() { note = useNoteContent(source); return { note }; },
		template: '<p>{{ note.text }} {{ note.files?.map(file => file.id).join(",") }}</p>',
	}));
	return note;
}

describe('edited note content', () => {
	afterEach(cleanup);

	test('updates attachment previews while preserving counters and the published poll', async () => {
		const note = mountContent();
		globalEvents.emit('noteEdited', note.id, { text: 'Updated', cw: null, fileIds: ['new'], files: [{ id: 'new' }] as Misskey.entities.DriveFile[], tags: ['new'], reactionAcceptance: 'likeOnly' });
		await nextTick();
		expect(note.fileIds).toEqual(['new']);
		expect(note.files?.map(file => file.id)).toEqual(['new']);
		expect(note.poll).toEqual(source.poll);
		expect(note.likeCount).toBe(5);
		expect(note.reactions).toEqual({ heart: 7 });
		expect(source.fileIds).toEqual(['old']);
	});

	test('clears attachments explicitly and preserves them when old stream events omit those fields', () => {
		const note = mountContent();
		globalEvents.emit('noteEdited', note.id, { text: 'Text only edit', cw: null });
		expect(note.fileIds).toEqual(['old']);
		globalEvents.emit('noteEdited', note.id, { text: 'Remove media', cw: null, fileIds: [], files: [] });
		expect(note.files).toEqual([]);
		expect(note.fileIds).toEqual([]);
	});

	test('ignores a late save event for an already deleted note', () => {
		const note = mountContent();
		globalEvents.emit('noteDeleted', note.id);
		globalEvents.emit('noteEdited', note.id, { text: 'Late text', cw: null, fileIds: ['late'] });
		expect(note.text).toBe(source.text);
		expect(note.fileIds).toEqual(['old']);
	});
});
