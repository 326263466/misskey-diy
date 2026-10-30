/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent } from 'vue';
import type * as Misskey from 'misskey-js';
import * as os from '@/os.js';

/** 在列表中直接以弹窗运行小程序，不离开当前页面。 */
export function openFlashPlayer(flash: Misskey.entities.Flash, events: { deleted?: () => void } = {}): void {
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkFlashPlayerDialog.vue')), {
		flash,
	}, {
		deleted: () => events.deleted?.(),
		closed: () => dispose(),
	});
}
