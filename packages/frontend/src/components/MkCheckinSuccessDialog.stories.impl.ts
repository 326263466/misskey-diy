/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import { action } from 'storybook/actions';
import type { StoryObj } from '@storybook/vue3';
import MkCheckinSuccessDialog from './MkCheckinSuccessDialog.vue';

export const Default = {
	render(args) {
		return {
			components: { MkCheckinSuccessDialog },
			setup() {
				return { args, closed: action('closed') };
			},
			template: '<MkCheckinSuccessDialog v-bind="args" @closed="closed" />',
		};
	},
	args: {
		points: 1,
		consecutiveDays: 1,
	},
	parameters: {
		layout: 'fullscreen',
	},
} satisfies StoryObj<typeof MkCheckinSuccessDialog>;

export const WithMakeupCard = {
	...Default,
	args: {
		...Default.args,
		consecutiveDays: 7,
		earnedMakeupCards: 1,
	},
} satisfies StoryObj<typeof MkCheckinSuccessDialog>;
