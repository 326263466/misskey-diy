/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import { action } from 'storybook/actions';
import MkCustomStatusDialog from './MkCustomStatusDialog.vue';

export const Default = {
	render(args) {
		return {
			components: { MkCustomStatusDialog },
			setup: () => ({ args }),
			template: '<MkCustomStatusDialog v-bind="args"/>',
		};
	},
	args: { save: async status => action('save')(status) },
	parameters: { layout: 'fullscreen' },
} satisfies StoryObj<typeof MkCustomStatusDialog>;

export const Editing = {
	...Default,
	args: { ...Default.args, initialStatus: { icon: 'coffee', text: 'ひと休み中' } },
} satisfies StoryObj<typeof MkCustomStatusDialog>;

export const EightCharacters = {
	...Default,
	args: { ...Default.args, initialStatus: { icon: 'book', text: '今天也在好好读书' } },
} satisfies StoryObj<typeof MkCustomStatusDialog>;
