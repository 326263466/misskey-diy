/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { entities } from 'misskey-js';
import { BroadcastChannel } from 'broadcast-channel';
import { acct } from '@@/js/user.js';
import { i18n } from '@/i18n.js';

export type WalletTransaction = entities.IWalletTransactionsResponse[number];
export type WalletFlow = WalletTransaction['flow'];

/** 只通知其他标签页重读待确认请求，不传请求内容或凭据。 */
export function createPendingRequestChannel(name: string, onChanged: () => void) {
	const channel = new BroadcastChannel<'changed'>(name);
	channel.onmessage = onChanged;
	return {
		notify() {
			if (!channel.isClosed) void channel.postMessage('changed').catch(() => {});
		},
		close() {
			if (!channel.isClosed) void channel.close().catch(() => {});
		},
	};
}

/** 没有可显示的资金动向（如冻结释放）时返回空串，调用方据此隐藏对应行。 */
export function walletFlowName(kind: WalletFlow['from'] | undefined, user: entities.UserLite | null | undefined): string {
	if (kind === 'user' && user) return acct(user);
	if (kind === 'system') return i18n.ts._wallet._categories.system;
	if (kind === 'redPacket') return i18n.ts._wallet._categories.redPacket;
	if (kind === 'reserved') return i18n.ts._wallet.reservedBalance;
	if (kind === 'unknown' || kind == null) return '';
	return i18n.ts._wallet.unknownUser;
}

export function walletFlowDescription(flow: WalletFlow): string {
	const party = (label: string, kind: WalletFlow['from'], userId: string | null, user: entities.UserLite | null) => [
		label,
		...(userId ? [i18n.tsx._wallet.flowId({ id: userId })] : []),
		i18n.tsx._wallet.flowAccount({ account: walletFlowName(kind, user) || i18n.ts._wallet.unknownUser }),
	].join('\n');
	return `${party(i18n.ts._wallet._receipt.consumer, flow.from, flow.fromUserId, flow.fromUser)}\n\n${party(i18n.ts._wallet._receipt.provider, flow.to, flow.toUserId, flow.toUser)}`;
}

export function walletError(error: unknown): string {
	switch ((error as { code?: string } | null)?.code) {
		case 'EXCHANGE_DISABLED': return i18n.ts._wallet.exchangeDisabled;
		case 'INVALID_EXCHANGE_AMOUNT': return i18n.ts._wallet.invalidExchangeAmount;
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
	return ['EXCHANGE_DISABLED', 'INVALID_EXCHANGE_AMOUNT', 'INSUFFICIENT_POINTS', 'INSUFFICIENT_CHECKIN_POINTS', 'WALLET_NOT_ALLOWED', 'INVALID_AMOUNT', 'INSUFFICIENT_BALANCE', 'BALANCE_LIMIT_EXCEEDED', 'NO_SUCH_USER', 'REMOTE_USER', 'INVALID_PARAM'].includes((error as { code?: string } | null)?.code ?? '');
}
