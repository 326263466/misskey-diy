/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import isChromatic from 'chromatic/isChromatic';
import MkAnalogClock from './MkAnalogClock.vue';
import type { StoryObj } from '@storybook/vue3';
export const Default = {
	render(args) {
		return {
			components: {
				MkAnalogClock,
			},
			setup() {
				return {
					args,
				};
			},
			computed: {
				props() {
					return {
						...this.args,
					};
				},
			},
			template: '<MkAnalogClock v-bind="props" />',
		};
	},
	args: {
		design: 'linear',
		now: isChromatic() ? () => new Date('2023-01-01T10:10:30') : undefined,
	},
	decorators: [
		() => ({
			template: '<div style="container-type:inline-size;height:100%"><div style="height:100cqmin;margin:auto;width:100cqmin"><story/></div></div>',
		}),
	],
	parameters: {
		layout: 'fullscreen',
	},
} satisfies StoryObj<typeof MkAnalogClock>;

export const Orbit = {
	...Default,
	args: { ...Default.args, design: 'orbit' },
} satisfies StoryObj<typeof MkAnalogClock>;

export const Satellite = {
	...Default,
	args: { ...Default.args, design: 'satellite' },
} satisfies StoryObj<typeof MkAnalogClock>;

export const Hud = {
	...Default,
	args: { ...Default.args, design: 'hud' },
} satisfies StoryObj<typeof MkAnalogClock>;

export const Digital = {
	...Default,
	args: { ...Default.args, design: 'digital' },
} satisfies StoryObj<typeof MkAnalogClock>;

export const Words = {
	...Default,
	args: { ...Default.args, design: 'words' },
} satisfies StoryObj<typeof MkAnalogClock>;
