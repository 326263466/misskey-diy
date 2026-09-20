/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';
import type * as Misskey from 'misskey-js';
import * as os from '@/os.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { showMovedDialog } from '@/utility/show-moved-dialog.js';
import { globalEvents } from '@/events.js';

export function useLike(noteId: Misskey.entities.Note['id'], state: Misskey.entities.LikeState, options: { mock?: boolean; disabled?: () => boolean } = {}) {
	const liking = ref(false);

	async function toggleLike(): Promise<void> {
		if (options.mock || liking.value || options.disabled?.()) return;
		liking.value = true;
		try {
			if (!await pleaseLogin()) return;
			showMovedDialog();
			const updated = await os.apiWithDialog(state.isLiked ? 'notes/likes/delete' : 'notes/likes/create', { noteId });
			globalEvents.emit('likesUpdated', noteId, updated);
		} catch {
			// 错误由接口提示，失败时保留当前状态。
		} finally {
			liking.value = false;
		}
	}

	return { liking, toggleLike };
}
