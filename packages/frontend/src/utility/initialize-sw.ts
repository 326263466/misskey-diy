/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { lang } from '@@/js/config.js';

export async function initializeSw() {
	if (!('serviceWorker' in navigator)) return;

	try {
		const registration = await navigator.serviceWorker.register('/sw.js', {
			scope: '/',
			type: 'classic',
			updateViaCache: 'none',
		});
		await registration.update();
		await navigator.serviceWorker.ready;
		registration.active?.postMessage({
			msg: 'initialize',
			lang,
		});
	} catch (error) {
		console.warn('Service Worker initialization failed', error);
	}
}
