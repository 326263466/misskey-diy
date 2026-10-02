/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';

export function walletError(error: unknown): string {
	switch ((error as { code?: string } | null)?.code) {
		case 'EXCHANGE_DISABLED': return i18n.ts._wallet.exchangeDisabled;
		case 'INSUFFICIENT_CHECKIN_POINTS':
		case 'INSUFFICIENT_POINTS': return i18n.ts._wallet.insufficientPoints;
		case 'INSUFFICIENT_BALANCE': return i18n.ts._wallet.insufficientBalance;
		case 'BALANCE_LIMIT_EXCEEDED': return i18n.ts._wallet.balanceLimit;
		case 'REQUEST_CONFLICT':
		case 'REQUEST_ID_CONFLICT': return i18n.ts._wallet.requestConflict;
		case 'NO_SUCH_USER':
		case 'WALLET_NOT_ALLOWED':
		case 'REMOTE_USER': return i18n.ts._wallet.localUserRequired;
		default: return i18n.ts._wallet.operationFailed;
	}
}

/** An explicit validation rejection has no side effects; transport errors remain retryable. */
export function walletRequestRejected(error: unknown): boolean {
	return ['EXCHANGE_DISABLED', 'INSUFFICIENT_POINTS', 'INSUFFICIENT_CHECKIN_POINTS', 'WALLET_NOT_ALLOWED', 'INVALID_AMOUNT', 'INSUFFICIENT_BALANCE', 'BALANCE_LIMIT_EXCEEDED', 'NO_SUCH_USER', 'REMOTE_USER', 'INVALID_PARAM'].includes((error as { code?: string } | null)?.code ?? '');
}

export function validExchange(points: number, availablePoints: number, rate: number, balance: number, reservedBalance: number): boolean {
	return Number.isSafeInteger(points) && points > 0 && points <= availablePoints && Number.isSafeInteger(points * rate) && balance + reservedBalance + points * rate <= 2000000000;
}
