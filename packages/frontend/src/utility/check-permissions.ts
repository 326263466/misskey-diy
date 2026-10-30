/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed } from 'vue';
import { instance } from '@/instance.js';
import { $i } from '@/i.js';

export const notesSearchAvailable = computed(() => $i == null
	? (instance.clientOptions.openGuestAccess === true || !!instance.policies?.canSearchNotes)
	: $i.policies.canSearchNotes);

export const articlesSearchAvailable = computed(() => $i == null
	? (instance.clientOptions.openGuestAccess === true || !!instance.policies?.canSearchArticles)
	: $i.policies.canSearchArticles);

export const canSearchNonLocalNotes = (
	instance.noteSearchableScope === 'global'
);

export const usersSearchAvailable = computed(() => $i == null
	? (instance.clientOptions.openGuestAccess === true || !!instance.policies?.canSearchUsers)
	: $i.policies.canSearchUsers);
