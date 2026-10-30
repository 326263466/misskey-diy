/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import MkInstanceRanking from './MkInstanceRanking.vue';

export const Default = {
	render(args) {
		return {
			components: { MkInstanceRanking },
			setup() { return { args }; },
			template: '<MkInstanceRanking v-bind="args"/>',
		};
	},
	args: {
		label: 'Followers',
		items: [
			{ host: 'misskey.example', value: 1280 },
			{ host: 'mastodon.example', value: 640 },
			{ host: 'social.example', value: 120 },
		],
		other: 36,
	},
	parameters: { layout: 'padded' },
} satisfies StoryObj<typeof MkInstanceRanking>;
