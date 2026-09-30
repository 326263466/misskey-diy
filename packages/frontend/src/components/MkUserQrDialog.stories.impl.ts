/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import { action } from 'storybook/actions';
import { userDetailed } from '../../.storybook/fakes.js';
import MkUserQrDialog from './MkUserQrDialog.vue';

export const Default = {
	render(args) {
		return {
			components: { MkUserQrDialog },
			setup() {
				return { args, closed: action('closed') };
			},
			template: '<MkUserQrDialog v-bind="args" @closed="closed"/>',
		};
	},
	args: { user: userDetailed('alice', 'alice', null, 'Alice') },
	parameters: { layout: 'fullscreen' },
} satisfies StoryObj<typeof MkUserQrDialog>;

export const Remote = {
	...Default,
	args: { user: userDetailed('bob', 'bob', 'example.com', 'Bob') },
} satisfies StoryObj<typeof MkUserQrDialog>;
