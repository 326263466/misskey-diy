/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { TransferService } from '@/core/TransferService.js';
import { WalletService } from '@/core/WalletService.js';
import { ApiError } from '@/server/api/error.js';

export const transferApiErrors = {
	noSuchTransfer: { message: 'No such transfer.', code: 'NO_SUCH_TRANSFER', id: 'd4758a2f-8c35-40f3-b9ec-ad826bb455cc' },
	accessDenied: { message: 'This account cannot access the transfer.', code: 'TRANSFER_ACCESS_DENIED', id: '5cbbd7ab-8cb1-4412-966d-50dfa7dd92e3' },
	invalidDraft: { message: 'Invalid transfer parameters.', code: 'INVALID_TRANSFER', id: '08638d24-eb05-454f-81fc-3c532d6d4ec0' },
	requestConflict: { message: 'This request ID was used for a different transfer.', code: 'TRANSFER_REQUEST_CONFLICT', id: '1fa51693-00d7-45fe-90bb-bec827c8c310' },
	alreadyCompleted: { message: 'This transfer has already been completed.', code: 'TRANSFER_ALREADY_COMPLETED', id: '5db36c62-69a5-406a-8816-4e1697241140' },
	insufficientBalance: { message: 'Insufficient wallet balance.', code: 'INSUFFICIENT_WALLET_BALANCE', id: '5194c859-3d43-4407-9eeb-d271550ab937' },
	balanceLimit: { message: 'The recipient wallet balance would exceed its limit.', code: 'WALLET_BALANCE_LIMIT', id: '08453d20-e62d-453d-9940-ef9c9e3baa5b' },
} as const;

export function throwTransferApiError(error: unknown): never {
	if (error instanceof TransferService.NoSuchTransferError) throw new ApiError(transferApiErrors.noSuchTransfer);
	if (error instanceof TransferService.AccessDeniedError || error instanceof WalletService.NoSuchUserError || error instanceof WalletService.NotAllowedError) throw new ApiError(transferApiErrors.accessDenied);
	if (error instanceof TransferService.InvalidDraftError || error instanceof WalletService.InvalidAmountError) throw new ApiError(transferApiErrors.invalidDraft);
	if (error instanceof TransferService.RequestConflictError) throw new ApiError(transferApiErrors.requestConflict);
	if (error instanceof TransferService.AlreadyCompletedError) throw new ApiError(transferApiErrors.alreadyCompleted);
	if (error instanceof WalletService.InsufficientBalanceError) throw new ApiError(transferApiErrors.insufficientBalance);
	if (error instanceof WalletService.BalanceLimitError) throw new ApiError(transferApiErrors.balanceLimit);
	throw error;
}
