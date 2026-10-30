/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';

export function searchErrorMessage(error: unknown): string | null {
	switch ((error as { code?: string } | null)?.code) {
		case 'SEARCH_UNAVAILABLE': return i18n.ts._search.unavailable;
		case 'SEARCH_TIMEOUT': return i18n.ts._search.timeout;
		default: return null;
	}
}
