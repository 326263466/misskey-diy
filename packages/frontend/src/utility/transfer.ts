/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';
import { redPacketError } from '@/utility/red-packet.js';

export function transferError(cause: unknown): string {
	switch ((cause as { code?: string } | null)?.code) {
		case 'TRANSFER_ACCESS_DENIED': return i18n.ts._transfer.notAllowed;
		case 'INVALID_TRANSFER': return i18n.ts._transfer.invalid;
		case 'TRANSFER_ALREADY_COMPLETED': return i18n.ts._transfer.completed;
		case 'TRANSFER_REQUEST_CONFLICT': return i18n.ts._wallet.requestConflict;
		case 'NO_SUCH_TRANSFER': return i18n.ts._transfer.unavailable;
		default: return redPacketError(cause, i18n.ts._wallet.operationFailed);
	}
}
