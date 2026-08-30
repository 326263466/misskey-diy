/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import MkRollingNumber from './MkRollingNumber.vue';

export const Default = {
	render(args) {
		return {
			components: { MkRollingNumber },
			setup() {
				return { args };
			},
			template: '<MkRollingNumber v-bind="args"/>',
		};
	},
	args: {
		value: 42,
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkRollingNumber>;

export const Zero = {
	...Default,
	args: {
		value: 0,
	},
} satisfies StoryObj<typeof MkRollingNumber>;
