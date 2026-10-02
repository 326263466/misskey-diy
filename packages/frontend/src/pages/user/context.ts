/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ComputedRef, InjectionKey } from 'vue';
import type * as Misskey from 'misskey-js';

export const userPageContext = Symbol() as InjectionKey<{
	user: ComputedRef<Misskey.entities.UserDetailed | null>;
	refreshUser: () => Promise<void>;
	showMoreFiles: () => void;
}>;
