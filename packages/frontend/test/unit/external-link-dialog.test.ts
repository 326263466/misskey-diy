/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick } from 'vue';
import MkExternalLinkDialog from '@/components/MkExternalLinkDialog.vue';
import { hotkeyDirective } from '@/directives/hotkey.js';
import { i18n } from '@/i18n.js';

vi.mock('@/os.js', () => ({ claimZIndex: () => 100 }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { template: '<a><slot/></a>' } }));

function renderDialog(url = 'https://www.bilibili.com/video/1?from=note', returnFocusTo?: HTMLElement) {
	return render(MkExternalLinkDialog, {
		props: { url, returnFocusTo },
		global: {
			directives: { hotkey: hotkeyDirective },
			stubs: { transition: false },
		},
	});
}

describe('external link safety dialog', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	test('labels the warning and focuses cancel by default', async () => {
		const view = renderDialog();
		const dialog = view.getByRole('dialog', { name: i18n.ts._externalLink.title });
		expect(dialog.getAttribute('aria-modal')).toBe('true');
		expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe(i18n.ts._externalLink.description);
		await nextTick();
		expect(document.activeElement).toBe(view.getByRole('button', { name: i18n.ts.cancel }));
	});

	test('returns focus to the original external link when canceled', async () => {
		const anchor = document.createElement('a');
		anchor.href = 'https://example.com/';
		anchor.textContent = 'External link';
		document.body.append(anchor);
		anchor.focus();
		const view = renderDialog(anchor.href, anchor);
		try {
			await nextTick();
			expect(document.activeElement).toBe(view.getByRole('button', { name: i18n.ts.cancel }));
			await fireEvent.click(view.getByRole('button', { name: i18n.ts.cancel }));
			await waitFor(() => expect(view.emitted('closed')).toHaveLength(1));
			expect(document.activeElement).toBe(anchor);
		} finally {
			view.unmount();
			anchor.remove();
		}
	});

	test('emphasizes the actual ASCII host rather than URL credentials', () => {
		const url = 'https://trusted.example@xn--bcher-kva.example:8443/page?target=trusted.example';
		const view = renderDialog(url);
		expect(view.container.querySelector('strong')?.textContent).toBe('xn--bcher-kva.example:8443');
		expect(view.getByText(url).textContent).toBe(url);
		expect(view.getByText(url).closest('[dir="ltr"]')).not.toBeNull();
	});

	test('shows the entire URL as selectable plain text without rendering HTML or MFM', () => {
		const url = `https://example.com/?text=$[x2.test]&html=<img>&long=${'a'.repeat(500)}`;
		const view = renderDialog(url);
		const text = view.getByText(url);
		expect(text.textContent).toBe(url);
		expect(text.children).toHaveLength(0);
		expect(text.closest('._selectable')).not.toBeNull();
		expect(view.container.querySelector('img')).toBeNull();
	});

	test.each(['cancel', 'escape', 'background'])('closes without following the link on %s', async action => {
		const view = renderDialog();
		const link = view.getByRole('link', { name: i18n.ts._externalLink.continue });
		const clicked = vi.fn();
		link.addEventListener('click', clicked);
		if (action === 'cancel') await fireEvent.click(view.getByRole('button', { name: i18n.ts.cancel }));
		if (action === 'escape') await fireEvent.keyDown(document, { key: 'Escape', keyCode: 27 });
		if (action === 'background') await fireEvent.click(view.getByTestId('bg'));
		await waitFor(() => expect(view.emitted('closed')).toHaveLength(1));
		expect(clicked).not.toHaveBeenCalled();
	});

	test('preserves the native new-tab navigation while closing the dialog', async () => {
		const url = 'https://example.com/watch?a=1&b=2#details';
		const view = renderDialog(url);
		const link = view.getByRole('link', { name: i18n.ts._externalLink.continue }) as HTMLAnchorElement;
		expect(link.href).toBe(url);
		expect(link.target).toBe('_blank');
		expect(link.rel.split(' ')).toEqual(expect.arrayContaining(['nofollow', 'noopener', 'noreferrer']));
		const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
		await fireEvent(link, event);
		expect(event.defaultPrevented).toBe(false);
		await waitFor(() => expect(view.emitted('closed')).toHaveLength(1));
	});
});
