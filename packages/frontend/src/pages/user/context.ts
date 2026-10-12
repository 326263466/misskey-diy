/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ComputedRef, InjectionKey } from 'vue';
import type * as Misskey from 'misskey-js';
import type { PathResolvedResult } from '@/lib/nirax.js';

export function isUserOverviewRoute(resolved: PathResolvedResult): boolean {
	const page = resolved.child?.props.get('page');
	return resolved.route.name === 'user' && (page == null || page === 'home');
}

export const userPageContext = Symbol() as InjectionKey<{
	user: ComputedRef<Misskey.entities.UserDetailed | null>;
	refreshUser: () => Promise<void>;
	showMoreFiles: () => void;
}>;
