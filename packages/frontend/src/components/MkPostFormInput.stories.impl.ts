/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { ref } from 'vue';
import type { StoryObj } from '@storybook/vue3';
import MkPostFormInput from './MkPostFormInput.vue';

export const Default = {
	args: { maxLength: 500 },
	render(args) {
		return {
			components: { MkPostFormInput },
			setup() { return { text: ref(''), args }; },
			template: '<div style="width: min(600px, 100%);"><MkPostFormInput v-model="text" v-bind="args"/></div>',
		};
	},
} satisfies StoryObj<typeof MkPostFormInput>;

export const Feedback = { ...Default, args: { maxLength: 1000 } } satisfies StoryObj<typeof MkPostFormInput>;
