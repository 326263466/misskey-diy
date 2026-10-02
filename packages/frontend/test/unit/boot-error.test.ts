/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, test, vi } from 'vitest';

const source = readFileSync(path.resolve(import.meta.dirname, '../../public/loader/boot.js'), 'utf8');

afterEach(() => {
	document.body.innerHTML = '';
	document.body.removeAttribute('inert');
	document.head.querySelectorAll('style').forEach(style => style.remove());
});

test.each([false, true])('boot errors restore interaction when the body was locked: %s', async (locked) => {
	if (locked) document.body.setAttribute('inert', 'true');
	document.body.innerHTML = '<div id="misskey_app"></div>';
	// Keep the app import pending so only the boot error handler runs.
	const windowStub = {
		addEventListener: vi.fn(),
		location: { href: 'http://localhost:3000/', search: '' },
		onunhandledrejection: null as null | ((event: { reason: Error }) => void),
	};
	await runInNewContext(source, {
		LANGS: ['en-US'],
		localStorage: { getItem: () => null, setItem: vi.fn() },
		navigator: { language: 'en-US' },
		URL,
		URLSearchParams,
		console: { error: vi.fn() },
		document: {
			readyState: 'loading',
			body: document.body,
			head: document.head,
			getElementById: document.getElementById.bind(document),
			createElement: document.createElement.bind(document),
			createTextNode: document.createTextNode.bind(document),
		},
		window: windowStub,
	});

	windowStub.onunhandledrejection!({ reason: new Error('Loading failed') });
	const readyCallback = windowStub.addEventListener.mock.calls.at(-1)![1];
	readyCallback();
	await Promise.resolve();
	await Promise.resolve();

	expect(document.body.hasAttribute('inert')).toBe(false);
	expect(document.querySelector('.button-big')).not.toBeNull();
	expect(document.querySelector('#errors')?.textContent).toContain('SOMETHING_HAPPENED_IN_PROMISE');
	const reloadButton = document.querySelector<HTMLButtonElement>('.button-big')!;
	reloadButton.focus();
	expect(document.activeElement).toBe(reloadButton);
});
