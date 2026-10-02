/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { shouldOpenNote } from '@/utility/note-card-click.js';

afterEach(() => {
	document.body.replaceChildren();
	document.getSelection()?.removeAllRanges();
});

function card(html: string): { root: HTMLDivElement; navigate: ReturnType<typeof vi.fn> } {
	const root = document.createElement('div');
	root.dataset.noteCard = '';
	root.tabIndex = 0;
	root.innerHTML = html;
	document.body.append(root);
	const navigate = vi.fn();
	root.addEventListener('click', event => { if (shouldOpenNote(event, root)) navigate(); });
	return { root, navigate };
}

function click(target: Element, options: MouseEventInit = {}): void {
	target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...options }));
}

describe('note card navigation', () => {
	test('opens the card from blank space', () => {
		const { root, navigate } = card('<p>Text <strong>with formatting</strong></p>');
		click(root);
		expect(navigate).toHaveBeenCalledOnce();
	});

	test.each([
		'<a href="/users/example"><span>Profile</span></a>',
		'<a><span>Poll results</span></a>',
		'<button><svg><path/></svg></button>',
		'<button disabled><span>Disabled action</span></button>',
		'<label><span>Form label</span><input/></label>',
		'<textarea/>', '<select><option>Choice</option></select>',
		'<video/>', '<audio/>', '<iframe/>', '<canvas/>', '<img/>',
		'<span alt="emoji">🙂</span>',
		'<span role="button"><span>Action</span></span>',
		'<span tabindex="0">Focusable</span>',
		'<div contenteditable="true"><span>Editor</span></div>',
		'<div data-note-interactive><ul><li>Poll</li></ul></div>',
		'<div data-note-card><p>Nested note</p></div>',
		'<details><summary>Expand</summary></details>',
		'<span class="_mfm">Text <strong>with formatting</strong></span>',
		'<pre><code>const value = 1;</code></pre>',
		'<code>inline code</code>',
	])('preserves existing interactive content: %s', html => {
		const { root, navigate } = card(html);
		const target = root.querySelectorAll('*');
		click(target[target.length - 1]);
		expect(navigate).not.toHaveBeenCalled();
	});

	test('keeps a link inside formatted text clickable without opening the note', () => {
		const { root, navigate } = card('<span class="_mfm"><a href="/tags/example">Topic</a></span>');
		const followLink = vi.fn();
		const link = root.querySelector('a')!;
		link.addEventListener('click', event => { event.preventDefault(); followLink(); });
		click(link);
		expect(followLink).toHaveBeenCalledOnce();
		expect(navigate).not.toHaveBeenCalled();
	});

	test('does not consume a child button click', () => {
		const { root, navigate } = card('<button>Like</button>');
		const child = vi.fn();
		root.querySelector('button')!.addEventListener('click', child);
		click(root.querySelector('button')!);
		expect(child).toHaveBeenCalledOnce();
		expect(navigate).not.toHaveBeenCalled();
	});

	test.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }, { detail: 2 }])('ignores modified and nonprimary clicks: %j', options => {
		const { root, navigate } = card('Text');
		click(root, options);
		expect(navigate).not.toHaveBeenCalled();
	});

	test('preserves selected text', () => {
		const { root, navigate } = card('<p>Selected text</p>');
		const range = document.createRange();
		range.selectNodeContents(root.querySelector('p')!);
		document.getSelection()!.addRange(range);
		click(root);
		expect(navigate).not.toHaveBeenCalled();
	});

	test('respects a child handler that prevents default', () => {
		const { root, navigate } = card('<span>Custom action</span>');
		root.firstElementChild!.addEventListener('click', event => event.preventDefault());
		click(root.firstElementChild!);
		expect(navigate).not.toHaveBeenCalled();
	});
});
