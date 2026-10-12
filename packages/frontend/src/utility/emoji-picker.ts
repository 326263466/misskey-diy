/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { shallowRef, ref, watch } from 'vue';
import MkEmojiPickerDialog from '@/components/MkEmojiPickerDialog.vue';
import { popup } from '@/os.js';
import { prefer } from '@/preferences.js';

/** 打开表情选择器，选中一个后关闭。 */
class EmojiPicker {
	private emojisRef = ref<string[]>([]);

	constructor() {
		// nop
	}

	public init() {
		watch([prefer.r.emojiPaletteForMain, prefer.r.emojiPalettes], ([newId, newPalettes]) => {
			this.emojisRef.value = newId == null ? newPalettes[0].emojis : newPalettes.find(palette => palette.id === newId)?.emojis ?? [];
		}, {
			immediate: true,
		});
	}

	public show(
		anchorElement: HTMLElement,
		onChosen?: (emoji: string) => void,
		onClosed?: () => void,
	) {
		const anchorRef = shallowRef(anchorElement);

		// defineAsyncComponentはiOS等でユーザーアクティベーションが失われてfocusが効かなくなるため使用不可
		const { dispose } = popup(MkEmojiPickerDialog, {
			anchorElement: anchorRef,
			pinnedEmojis: this.emojisRef,
			asReactionPicker: false,
			choseAndClose: true,
		}, {
			done: (emoji: string) => {
				if (onChosen) onChosen(emoji);
			},
			closed: () => {
				if (onClosed) onClosed();
				dispose();
			},
		});
	}
}

export const emojiPicker = new EmojiPicker();
