/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { instance } from '@/instance.js';
import { $i } from '@/i.js';

export const notesSearchAvailable = $i == null
	? (instance.clientOptions.openGuestAccess === true || !!instance.policies?.canSearchNotes)
	: $i.policies.canSearchNotes;

export const canSearchNonLocalNotes = (
	instance.noteSearchableScope === 'global'
);

export const usersSearchAvailable = $i == null
	? (instance.clientOptions.openGuestAccess === true || !!instance.policies?.canSearchUsers)
	: $i.policies.canSearchUsers;
