/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import { action } from 'storybook/actions';
import MkAutoReplyDialog from './MkAutoReplyDialog.vue';

export const Default = {
	render(args) {
		return {
			components: { MkAutoReplyDialog },
			setup: () => ({ args }),
			template: '<MkAutoReplyDialog v-bind="args"/>',
		};
	},
	args: { status: 'away', save: async reply => action('save')(reply) },
	parameters: { layout: 'fullscreen' },
} satisfies StoryObj<typeof MkAutoReplyDialog>;

export const CustomReply = {
	...Default,
	args: { ...Default.args, status: 'busy', initialReply: '会議中です。終わったら連絡します。' },
} satisfies StoryObj<typeof MkAutoReplyDialog>;

export const DisabledReply = {
	...Default,
	args: { ...Default.args, status: 'doNotDisturb', initialReply: null },
} satisfies StoryObj<typeof MkAutoReplyDialog>;
