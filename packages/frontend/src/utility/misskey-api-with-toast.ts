/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Endpoints } from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

export function getChatInvitationErrorMessage(error: unknown): string {
	const { code, info } = (typeof error === 'object' && error !== null ? error : {}) as { code?: string; info?: { reason?: string; chatScope?: string } };
	if (code === 'INVALID_INVITEE' || code === 'INVALID_INVITEES') {
		switch (info?.reason) {
			case 'privacy':
				switch (info.chatScope) {
					case 'none': return i18n.ts._chat.invitationChatDisabled;
					case 'followers': return i18n.ts._chat.invitationFollowersOnly;
					case 'following': return i18n.ts._chat.invitationFollowingOnly;
					case 'mutual': return i18n.ts._chat.invitationMutualOnly;
					default: return i18n.ts._chat.invitationRejectedByPrivacy;
				}
			case 'blocked': return i18n.ts._chat.invitationBlocked;
			case 'unavailable': return i18n.ts._chat.invitationUserUnavailable;
			case 'remote': return i18n.ts._chat.invitationLocalOnly;
			case 'alreadyMember': return i18n.ts._chat.invitationAlreadyMember;
			case 'closed': return i18n.ts._chat.invitationDisabled;
			default: return i18n.ts._chat.invitationInvalidUser;
		}
	}
	if (code === 'CHAT_ROOM_FULL') return i18n.ts._chat.roomFull;
	if (code === 'NO_SUCH_ROOM') return i18n.ts._chat.invitationRoomUnavailable;
	if (code === 'NO_SUCH_USER') return i18n.ts._chat.invitationUserUnavailable;
	if (code === 'PERMISSION_DENIED' || code === 'ROLE_PERMISSION_DENIED') return i18n.ts.permissionDeniedErrorDescription;
	if (code === 'RATE_LIMIT_EXCEEDED') return i18n.ts._chat.invitationTooFrequent;
	return i18n.ts.somethingHappened;
}

export async function misskeyApiWithToast<E extends keyof Endpoints>(endpoint: E, data: Endpoints[E]['req'] & { i?: string | null }, message: string | null = i18n.ts.saved) {
	try {
		const result = await misskeyApi<void, E>(endpoint, data);
		if (message != null) os.toast(message, 'success');
		return result;
	} catch (error) {
		if (!isAccountSessionErrorHandled(error)) os.toast(endpoint === 'chat/rooms/create' || endpoint === 'chat/rooms/invitations/create' ? getChatInvitationErrorMessage(error) : i18n.ts.somethingHappened, 'error');
		throw error;
	}
}

export function misskeyApiWithErrorToast<E extends keyof Endpoints>(endpoint: E, data: Endpoints[E]['req'] & { i?: string | null }) {
	const groupMessages: Partial<Record<keyof Endpoints, string>> = {
		'chat/rooms/create': i18n.ts._chat.roomCreated,
		'chat/rooms/update': i18n.ts.saved,
		'chat/rooms/delete': i18n.ts._chat.roomDeleted,
		'chat/rooms/join': i18n.ts._chat.roomJoined,
		'chat/rooms/leave': i18n.ts._chat.roomLeft,
		'chat/rooms/mute': i18n.ts.saved,
		'chat/rooms/members/update': i18n.ts.saved,
		'chat/rooms/members/delete': i18n.ts._chat.memberRemoved,
	};
	return misskeyApiWithToast(endpoint, data, groupMessages[endpoint] ?? null);
}
