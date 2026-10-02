/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { RedPacketService } from '@/core/RedPacketService.js';
import { WalletService } from '@/core/WalletService.js';
import { ApiError } from '@/server/api/error.js';

export const redPacketApiErrors = {
	noSuchRedPacket: { message: 'No such red packet.', code: 'NO_SUCH_RED_PACKET', id: '7d2ec1e0-9551-4b8b-95a0-d060ca290e57' },
	accessDenied: { message: 'This account cannot access the red packet.', code: 'RED_PACKET_ACCESS_DENIED', id: 'c224583a-8b12-474d-b68b-fce17df7c389' },
	cannotClaimOwn: { message: 'You cannot claim your own red packet.', code: 'CANNOT_CLAIM_OWN_RED_PACKET', id: '85821e7e-e583-4812-b7c9-c19ac2dc5121' },
	expired: { message: 'This red packet has expired.', code: 'RED_PACKET_EXPIRED', id: '10b531f1-60fc-4b66-8daf-65f01107c896' },
	exhausted: { message: 'All coins in this red packet have been claimed.', code: 'RED_PACKET_EXHAUSTED', id: 'cd5427d9-a560-470d-894b-9cf528a5ba74' },
	cancelled: { message: 'This red packet has been cancelled.', code: 'RED_PACKET_CANCELLED', id: '5cb79336-cd3a-4587-bc06-2f5d9a3292d6' },
	invalidDraft: { message: 'Invalid red packet parameters.', code: 'INVALID_RED_PACKET', id: '89fa1cad-7732-4f05-939f-860f1246a675' },
	requestIdConflict: { message: 'This red packet request conflicts with its existing parameters or attachment.', code: 'RED_PACKET_REQUEST_CONFLICT', id: '9baf9d29-d473-4748-a0eb-60c93ef43eb0' },
	insufficientBalance: { message: 'Insufficient wallet balance.', code: 'INSUFFICIENT_WALLET_BALANCE', id: 'b3c134f2-4a19-41b9-93ce-b2d17a3859c0' },
	balanceLimit: { message: 'Your wallet balance would exceed its limit.', code: 'WALLET_BALANCE_LIMIT', id: '32849171-b294-4fd3-9f01-ad91c04aaa6a' },
} as const;

export function throwRedPacketApiError(error: unknown): never {
	if (error instanceof RedPacketService.NoSuchRedPacketError) throw new ApiError(redPacketApiErrors.noSuchRedPacket);
	if (error instanceof RedPacketService.AccessDeniedError) throw new ApiError(redPacketApiErrors.accessDenied);
	if (error instanceof RedPacketService.CannotClaimOwnError) throw new ApiError(redPacketApiErrors.cannotClaimOwn);
	if (error instanceof RedPacketService.ExpiredError) throw new ApiError(redPacketApiErrors.expired);
	if (error instanceof RedPacketService.ExhaustedError) throw new ApiError(redPacketApiErrors.exhausted);
	if (error instanceof RedPacketService.CancelledError) throw new ApiError(redPacketApiErrors.cancelled);
	if (error instanceof RedPacketService.InvalidDraftError) throw new ApiError(redPacketApiErrors.invalidDraft);
	if (error instanceof RedPacketService.RequestIdConflictError) throw new ApiError(redPacketApiErrors.requestIdConflict);
	if (error instanceof WalletService.InsufficientBalanceError) throw new ApiError(redPacketApiErrors.insufficientBalance);
	if (error instanceof WalletService.BalanceLimitError) throw new ApiError(redPacketApiErrors.balanceLimit);
	if (error instanceof WalletService.NoSuchUserError || error instanceof WalletService.NotAllowedError) throw new ApiError(redPacketApiErrors.accessDenied);
	throw error;
}
