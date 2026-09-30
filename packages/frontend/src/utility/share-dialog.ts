/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent } from 'vue';
import * as os from '@/os.js';

export function openShareDialog(data: { title: string; text?: string; url: string; restricted?: boolean }, actions: { shareWithNote?: () => void; embed?: () => void } = {}): void {
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkShareDialog.vue')), {
		...data,
		canShareWithNote: actions.shareWithNote != null,
		canEmbed: actions.embed != null,
	}, {
		shareWithNote: actions.shareWithNote,
		embed: actions.embed,
		closed: () => dispose(),
	});
}
