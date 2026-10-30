/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

export async function editUserMemo(userId: string, current: string | null | undefined): Promise<string | null> {
	const previous = current ?? '';
	const { canceled, result } = await os.form(previous ? i18n.ts.editMemo : i18n.ts.addMemo, {
		memo: {
			type: 'string',
			required: false,
			multiline: true,
			label: i18n.ts.memo,
			default: previous,
		},
	});
	if (canceled) return null;

	const memo = (result.memo ?? '').trim();
	if (memo === previous) return null;

	try {
		await os.apiWithDialog('users/update-memo', { userId, memo });
	} catch {
		return null;
	}
	return memo;
}
