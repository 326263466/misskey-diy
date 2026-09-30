/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { url as local } from '@@/js/config.js';
import { tryParseUrl } from '@@/js/url.js';
import * as os from '@/os.js';

let dialogOpen = false;

export async function confirmExternalLink(event: MouseEvent): Promise<void> {
	if (event.defaultPrevented || event.button > 1) return;
	const anchor = event.currentTarget;
	if (!(anchor instanceof HTMLAnchorElement)) return;

	// Read the actual href so the displayed destination is the one being opened.
	const destination = tryParseUrl(anchor.href);
	if (destination == null || !['http:', 'https:'].includes(destination.protocol)) return;
	if (destination.origin === new URL(local).origin) return;

	event.preventDefault();
	event.stopPropagation();
	if (dialogOpen) return;
	dialogOpen = true;

	try {
		const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkExternalLinkDialog.vue').then(x => x.default), {
			url: destination.href,
			returnFocusTo: anchor,
		}, {
			closed: () => {
				dialogOpen = false;
				dispose();
			},
		});
	} catch {
		// popupAsyncWithDialog reports loading errors; allow the user to retry.
		dialogOpen = false;
	}
}
