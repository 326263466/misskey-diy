/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import { $i } from '@/i.js';

type UserAvatar = Pick<Misskey.entities.UserLite, 'id' | 'host' | 'avatarUrl' | 'avatarBlurhash' | 'avatarDecorations' | 'isCat'>;

export function getUserAvatar(user: UserAvatar): UserAvatar {
	// Notes and other cached responses keep user snapshots after profile updates.
	return $i != null && user.id != null && user.id === $i.id && user.host === $i.host ? $i : user;
}
