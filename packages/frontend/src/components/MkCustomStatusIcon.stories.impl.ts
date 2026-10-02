/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import MkCustomStatusIcon from './MkCustomStatusIcon.vue';
import { customStatusIcons } from '@/utility/status-icons.js';

export const Add = {
	render(args) {
		return {
			components: { MkCustomStatusIcon },
			setup() { return { args }; },
			template: '<MkCustomStatusIcon v-bind="args" style="--MI-statusIconSize: 22px" />',
		};
	},
	args: { icon: null },
	argTypes: {
		icon: { control: 'select', options: [null, ...customStatusIcons] },
	},
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkCustomStatusIcon>;

export const Coffee = {
	...Add,
	args: { icon: 'coffee' },
} satisfies StoryObj<typeof MkCustomStatusIcon>;

export const Charging = {
	...Add,
	args: { icon: 'battery' },
} satisfies StoryObj<typeof MkCustomStatusIcon>;

export const Sizes = {
	...Add,
	render() {
		return {
			components: { MkCustomStatusIcon },
			setup() { return { icons: [null, ...customStatusIcons], sizes: [12, 22, 28, 64] }; },
			template: '<div style="display: grid; gap: 24px; max-width: 720px"><div v-for="size in sizes" :key="size" style="display: flex; flex-wrap: wrap; align-items: center; gap: 16px"><MkCustomStatusIcon v-for="icon in icons" :key="icon ?? \'add\'" :icon="icon" :style="{ \'--MI-statusIconSize\': size + \'px\' }" /></div></div>',
		};
	},
} satisfies StoryObj<typeof MkCustomStatusIcon>;
