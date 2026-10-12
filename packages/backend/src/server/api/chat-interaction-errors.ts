/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ChatMessageEditError, ChatPokeError, ChatRoomSilencedError, ChatSilenceDurationError } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';

export const chatInteractionApiErrors = {
	roomSilenced: { message: 'You cannot send or edit messages while silenced in this room.', code: 'CHAT_ROOM_SILENCED', id: 'b2c45b47-1aca-4cc3-9176-7088c2241f3c' },
	invalidPoke: { message: 'The poke target must be an active conversation participant. Pokes cannot have other content.', code: 'INVALID_CHAT_POKE', id: '08df17e9-16f4-44ff-97dc-fb1909859494' },
	messageNotEditable: { message: 'Poke and system messages cannot be edited.', code: 'CHAT_MESSAGE_NOT_EDITABLE', id: '3b9ab79f-70a2-4121-a40f-417012477909' },
	invalidSilenceUntil: { message: 'The silence end time must be a future date.', code: 'INVALID_CHAT_SILENCE_UNTIL', id: '2b8aaf51-f097-4988-b685-6ea7d99e361a' },
} as const;

export function toChatInteractionApiError(error: unknown): ApiError | undefined {
	if (error instanceof ChatRoomSilencedError) return new ApiError(chatInteractionApiErrors.roomSilenced);
	if (error instanceof ChatPokeError) return new ApiError(chatInteractionApiErrors.invalidPoke);
	if (error instanceof ChatMessageEditError) return new ApiError(chatInteractionApiErrors.messageNotEditable);
	if (error instanceof ChatSilenceDurationError) return new ApiError(chatInteractionApiErrors.invalidSilenceUntil);
	return undefined;
}
