/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { shallowRef, ref, watch } from 'vue';
import MkEmojiPickerDialog from '@/components/MkEmojiPickerDialog.vue';
import { popup } from '@/os.js';
import { prefer } from '@/preferences.js';

class ReactionPicker {
	private reactionsRef = ref<string[]>([]);
	private activePicker: { anchorElement: HTMLElement | null; close: () => void } | null = null;

	public init() {
		watch([prefer.r.emojiPaletteForReaction, prefer.r.emojiPalettes], ([newId, newPalettes]) => {
			this.reactionsRef.value = newId == null ? newPalettes[0].emojis : newPalettes.find(palette => palette.id === newId)?.emojis ?? [];
		}, {
			immediate: true,
		});
	}

	public show(
		anchorElement: HTMLElement | null,
		targetNote: Misskey.entities.Note | null,
		onChosen?: (reaction: string) => void,
		onClosed?: () => void,
	) {
		if (this.activePicker) {
			const sameAnchor = this.activePicker.anchorElement === anchorElement;
			this.activePicker.close();
			if (sameAnchor) return;
		}

		const anchorRef = shallowRef(anchorElement);
		const targetNoteRef = ref(targetNote);
		let dialog: InstanceType<typeof MkEmojiPickerDialog> | null = null;
		let closing = false;
		const picker = {
			anchorElement,
			close: () => {
				closing = true;
				dialog?.close();
			},
		};
		this.activePicker = picker;

		// defineAsyncComponentはiOS等でユーザーアクティベーションが失われてfocusが効かなくなるため使用不可
		const { dispose } = popup(MkEmojiPickerDialog, {
			ref: instance => {
				dialog = instance as InstanceType<typeof MkEmojiPickerDialog> | null;
				if (closing) dialog?.close();
			},
			anchorElement: anchorRef,
			pinnedEmojis: this.reactionsRef,
			asReactionPicker: true,
			targetNote: targetNoteRef,
		}, {
			done: (reaction: string) => {
				if (onChosen) onChosen(reaction);
			},
			closed: () => {
				if (this.activePicker === picker) {
					this.activePicker = null;
					onClosed?.();
				}
				dispose();
			},
		});
	}
}

export const reactionPicker = new ReactionPicker();
