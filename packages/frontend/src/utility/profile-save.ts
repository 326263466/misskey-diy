/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

let pendingSave: Promise<unknown> = Promise.resolve();

// Keep request and confirmed-state application in one task, including across page navigation.
export function enqueueProfileSave<T>(save: () => Promise<T>): Promise<T> {
	const result = pendingSave.then(save);
	pendingSave = result.catch(() => {});
	return result;
}
