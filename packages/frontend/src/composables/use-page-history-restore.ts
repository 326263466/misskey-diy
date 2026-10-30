/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, inject } from 'vue';
import { DI } from '@/di.js';

export function usePageHistoryRestore() {
	const restoring = inject(DI.pageHistoryRestoring, null);
	return computed(() => restoring?.value ?? false);
}
