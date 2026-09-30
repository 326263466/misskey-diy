/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { ref, watch } from 'vue';
import type { StoryObj } from '@storybook/vue3';
import MkEmojiInputOverlay from './MkEmojiInputOverlay.vue';
import { i18n } from '@/i18n.js';

export const Multiline = {
	render(args) {
		return {
			components: { MkEmojiInputOverlay },
			setup() {
				const inputElement = ref<HTMLTextAreaElement | null>(null);
				const text = ref(args.text ?? '');
				watch(() => args.text, value => { text.value = value ?? ''; });
				return { args, inputElement, text, i18n };
			},
			template: `<div style="position: relative; width: 320px; background: var(--MI_THEME-panel); color: var(--MI_THEME-fg)">
				<textarea ref="inputElement" v-model="text" :aria-label="i18n.ts.text" style="display: block; width: 100%; height: 140px; box-sizing: border-box; resize: both; padding: 12px; font: inherit; line-height: 1.5; color: inherit; background: transparent; border: 1px solid var(--MI_THEME-divider)"></textarea>
				<MkEmojiInputOverlay :inputElement="inputElement" :text="text" :disabled="args.disabled"/>
			</div>`,
		};
	},
	args: {
		inputElement: null,
		text: '中文 deepseek 帖子 🎉\n👨‍👩‍👧‍👦 👍🏽 🇨🇳 ❤️\nText and emoji keep the native caret and wrapping. 🎉\n',
	},
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkEmojiInputOverlay>;

export const SingleLine = {
	render(args) {
		return {
			components: { MkEmojiInputOverlay },
			setup() {
				const inputElement = ref<HTMLInputElement | null>(null);
				const text = ref(args.text ?? '');
				watch(() => args.text, value => { text.value = value ?? ''; });
				return { args, inputElement, text, i18n };
			},
			template: `<div style="position: relative; width: 240px; background: var(--MI_THEME-panel); color: var(--MI_THEME-fg)">
				<input ref="inputElement" v-model="text" :aria-label="i18n.ts.text" style="display: block; width: 100%; height: 36px; box-sizing: border-box; padding: 0 8px; font: inherit; color: inherit; background: transparent; border: 1px solid var(--MI_THEME-divider)">
				<MkEmojiInputOverlay :inputElement="inputElement" :text="text" :disabled="args.disabled"/>
			</div>`,
		};
	},
	args: { inputElement: null, text: '中文🎉👨‍👩‍👧‍👦 — select and scroll this input 🎉' },
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkEmojiInputOverlay>;
