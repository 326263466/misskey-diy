/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import * as mfm from 'mfm-js';
import { getNoteTopics } from '@/utility/note-topics.js';

describe('note topic display', () => {
	test('moves parsed hashtags out of the displayed body and trims only its edges', () => {
		const text = '#Frontend\nPost with #Vue inside\n#TypeScript';
		const result = getNoteTopics({ text });
		expect(result.tags).toEqual(['Frontend', 'Vue', 'TypeScript']);
		expect(mfm.toString(result.nodes!)).toBe('Post with  inside');
	});

	test.each([
		'`#inline`',
		'```js\nconst topic = "#code";\n```',
		'https://example.com/path#fragment',
		'[Reference](https://example.com/path#fragment)',
		'<plain>#literal</plain>',
	])('keeps hash characters in literal content: %s', content => {
		const result = getNoteTopics({ text: `${content}\n#Topic` });
		expect(result.tags).toEqual(['Topic']);
		expect(result.nodes).toEqual(mfm.parse(content));
	});

	test('removes nested hashtags and empty formatting wrappers', () => {
		const result = getNoteTopics({ text: '<b>#Topic</b>\nVisible body\n<i>#Other</i>' });
		expect(result.tags).toEqual(['Topic', 'Other']);
		expect(mfm.toString(result.nodes!)).toBe('Visible body');
	});

	test('deduplicates parsed and server tags with case and Unicode normalization', () => {
		const result = getNoteTopics({ text: '#Vue #vue', tags: ['VUE', '\uff36\uff55\uff45', 'TypeScript', 'typescript'] });
		expect(result.tags).toEqual(['Vue', 'TypeScript']);
		expect(result.nodes).toEqual([]);
	});

	test('preserves the original note, supplied nodes and nested nodes for editing', () => {
		const note = { text: '<b>Visible #Topic</b>\n#Second', tags: ['Topic', 'Third'] };
		const nodes = mfm.parse(note.text);
		const originalNote = structuredClone(note);
		const originalNodes = structuredClone(nodes);
		const result = getNoteTopics(note, nodes);
		expect(result.tags).toEqual(['Topic', 'Second', 'Third']);
		expect(mfm.extract(result.nodes!, node => node.type === 'hashtag')).toEqual([]);
		expect(note).toEqual(originalNote);
		expect(nodes).toEqual(originalNodes);
	});

	test.each([{ isHidden: true }, { isDeleted: true }])('does not reveal topics on unavailable notes: %o', state => {
		expect(getNoteTopics({ text: 'Private #Topic', tags: ['Topic'], ...state })).toEqual({ nodes: null, tags: [] });
	});

	test('retains server tags for media notes and accepts absent text', () => {
		expect(getNoteTopics({ text: null, tags: ['Photo'] })).toEqual({ nodes: null, tags: ['Photo'] });
		expect(getNoteTopics({ text: null })).toEqual({ nodes: null, tags: [] });
	});
});
