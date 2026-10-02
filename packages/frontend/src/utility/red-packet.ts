/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';

export type RedPacketDraft = {
	kind: 'direct' | 'group' | 'tip';
	audience: 'public' | 'recipients' | 'room';
	roomId?: string;
	recipientIds: string[];
	mode: 'equal' | 'random';
	coverId: 'classic' | 'lucky' | 'sunset';
	coverFileId?: string | null;
	coverUrl?: string | null;
	totalCoins: number;
	count: number;
	message: string;
	expiresInHours: number;
	requestId: string;
};

export function createRedPacketDraft(kind: RedPacketDraft['kind'] = 'group', recipientIds: string[] = [], roomId?: string): RedPacketDraft {
	const recipients = [...new Set(recipientIds)];
	return { kind, roomId, audience: roomId ? 'room' : recipients.length > 0 || kind !== 'group' ? 'recipients' : 'public', recipientIds: recipients, coverId: 'classic', mode: kind === 'group' ? 'random' : 'equal', totalCoins: 10, count: kind === 'group' ? Math.min(5, recipients.length || 5) : 1, message: '', expiresInHours: 24, requestId: crypto.randomUUID() };
}

export function redPacketValidation(draft: RedPacketDraft, balance?: number | null): string | null {
	if (!['direct', 'group', 'tip'].includes(draft.kind) || !Array.isArray(draft.recipientIds) || draft.recipientIds.some(id => typeof id !== 'string' || !id)) return i18n.ts._redPacket.invalidDraft;
	if (!['public', 'recipients', 'room'].includes(draft.audience) || (draft.audience === 'recipients' && draft.recipientIds.length === 0) || (draft.audience === 'public' && (draft.kind !== 'group' || draft.recipientIds.length > 0))) return i18n.ts._redPacket.invalidDraft;
	if ((draft.audience === 'room' && (draft.kind !== 'group' || !draft.roomId || draft.recipientIds.length > 0)) || (draft.audience !== 'room' && draft.roomId != null)) return i18n.ts._redPacket.invalidDraft;
	if (draft.kind !== 'group' && (draft.recipientIds.length !== 1 || draft.count !== 1 || draft.mode !== 'equal')) return i18n.ts._redPacket.invalidDraft;
	if (!Number.isSafeInteger(draft.count) || draft.count < 1 || draft.count > 100) return i18n.ts._redPacket.invalidCount;
	if (draft.audience === 'recipients' && draft.count > new Set(draft.recipientIds).size) return i18n.ts._redPacket.tooManyRecipients;
	if (!Number.isSafeInteger(draft.totalCoins) || draft.totalCoins < draft.count || draft.totalCoins > 1000000) return i18n.ts._redPacket.invalidCoins;
	if (draft.mode === 'equal' && draft.totalCoins % draft.count !== 0) return i18n.ts._redPacket.equalNotDivisible;
	if (draft.mode !== 'equal' && draft.mode !== 'random') return i18n.ts._redPacket.invalidDraft;
	if (![1, 6, 24].includes(draft.expiresInHours) || typeof draft.message !== 'string' || Array.from(draft.message).length > 100) return i18n.ts._redPacket.invalidDraft;
	if (!['classic', 'lucky', 'sunset'].includes(draft.coverId)) return i18n.ts._redPacket.invalidDraft;
	if (typeof draft.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.requestId)) return i18n.ts._redPacket.invalidDraft;
	if (balance != null && draft.totalCoins > balance) return i18n.ts._redPacket.insufficientCoins;
	return null;
}

export function redPacketError(error: unknown): string {
	const code = (error as { code?: string } | null)?.code;
	switch (code) {
		case 'INSUFFICIENT_WALLET_BALANCE':
		case 'INSUFFICIENT_BALANCE':
		case 'INSUFFICIENT_COINS': return i18n.ts._redPacket.insufficientCoins;
		case 'RED_PACKET_EXPIRED': return i18n.ts._redPacket.expired;
		case 'RED_PACKET_EXHAUSTED': return i18n.ts._redPacket.exhausted;
		case 'RED_PACKET_CANCELLED': return i18n.ts._redPacket.cancelled;
		case 'CANNOT_CLAIM_OWN_RED_PACKET': return i18n.ts._redPacket.ownPacket;
		case 'ALREADY_CLAIMED': return i18n.ts._redPacket.alreadyClaimed;
		case 'NO_SUCH_NOTE':
		case 'NO_SUCH_RED_PACKET': return i18n.ts._redPacket.unavailable;
		case 'WALLET_BALANCE_LIMIT': return i18n.ts._wallet.balanceLimit;
		case 'RED_PACKET_REQUEST_CONFLICT':
		case 'REQUEST_CONFLICT':
		case 'REQUEST_ID_CONFLICT': return i18n.ts._redPacket.requestConflict;
		case 'INVALID_RED_PACKET': return i18n.ts._redPacket.invalidDraft;
		case 'BLOCKED':
		case 'BLOCKING':
		case 'FORBIDDEN':
		case 'RED_PACKET_NOT_ALLOWED':
		case 'RED_PACKET_ACCESS_DENIED':
		case 'ACCOUNT_SUSPENDED': return i18n.ts._redPacket.notAllowed;
		default: return i18n.ts._redPacket.operationFailed;
	}
}

export function redPacketRequestRejected(error: unknown): boolean {
	const code = (error as { code?: string } | null)?.code ?? '';
	return [
		'INSUFFICIENT_COINS', 'INSUFFICIENT_WALLET_BALANCE', 'INSUFFICIENT_BALANCE', 'INVALID_RED_PACKET', 'RED_PACKET_NOT_ALLOWED', 'INVALID_PARAM',
		'NO_SUCH_RENOTE_TARGET', 'CANNOT_RENOTE_TO_A_PURE_RENOTE', 'CANNOT_RENOTE_DUE_TO_VISIBILITY',
		'NO_SUCH_REPLY_TARGET', 'CANNOT_REPLY_TO_AN_INVISIBLE_NOTE', 'CANNOT_REPLY_TO_A_PURE_RENOTE',
		'CANNOT_REPLY_TO_SPECIFIED_VISIBILITY_NOTE_WITH_EXTENDED_VISIBILITY', 'CANNOT_CREATE_ALREADY_EXPIRED_POLL',
		'NO_SUCH_CHANNEL', 'YOU_HAVE_BEEN_BLOCKED', 'NO_SUCH_FILE', 'CANNOT_RENOTE_OUTSIDE_OF_CHANNEL',
		'CONTAINS_PROHIBITED_WORDS', 'CONTAINS_TOO_MANY_MENTIONS', 'RATE_LIMIT_EXCEEDED', 'ACCOUNT_SUSPENDED',
	].includes(code);
}
