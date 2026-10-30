/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MkCommentComposer from './MkCommentComposer.vue';

export const Default = {
	render(args) {
		return {
			components: { MkCommentComposer },
			setup: () => ({ args, text: ref('') }),
			template: '<MkCommentComposer v-bind="args" v-model="text"/>',
		};
	},
	args: { modelValue: '' },
	parameters: { layout: 'padded' },
} satisfies StoryObj<typeof MkCommentComposer>;

export const Inline = {
	...Default,
	args: { ...Default.args, inline: true },
} satisfies StoryObj<typeof MkCommentComposer>;
