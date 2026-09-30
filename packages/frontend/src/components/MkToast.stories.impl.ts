/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { ref } from 'vue';
import { action } from 'storybook/actions';
import type { StoryObj } from '@storybook/vue3';
import MkToast from './MkToast.vue';
import MkButton from './MkButton.vue';
import { i18n } from '@/i18n.js';

export const Default = {
	render(args) {
		return {
			components: { MkToast, MkButton },
			setup() {
				const showing = ref(true);

				function onClosed() {
					showing.value = false;
					action('closed')();
				}

				return { args, showing, onClosed };
			},
			template: '<MkButton @click="showing = true">{{ args.message }}</MkButton><MkToast v-if="showing" v-bind="args" @closed="onClosed" />',
		};
	},
	args: {
		message: i18n.ts.copiedToClipboard,
	},
	parameters: {
		layout: 'fullscreen',
	},
} satisfies StoryObj<typeof MkToast>;

export const LongMessage = {
	...Default,
	args: {
		message: Array(8).fill(i18n.ts.copiedToClipboard).join('\n'),
	},
} satisfies StoryObj<typeof MkToast>;
