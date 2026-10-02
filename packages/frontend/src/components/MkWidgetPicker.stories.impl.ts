/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import MkWidgetPicker from './MkWidgetPicker.vue';
import { widgets, federationWidgets } from '@/widgets/index.js';

export const Default = {
	render(args) {
		return {
			components: { MkWidgetPicker },
			setup() { return { args }; },
			template: '<MkWidgetPicker v-bind="args"/>',
		};
	},
	args: { widgets },
	parameters: { layout: 'fullscreen' },
} satisfies StoryObj<typeof MkWidgetPicker>;

export const WithoutFederation = {
	...Default,
	args: { widgets: widgets.filter(name => !federationWidgets.some(federationName => federationName === name)) },
} satisfies StoryObj<typeof MkWidgetPicker>;

export const Manage = {
	...Default,
	args: { widgets, selectedWidgets: [{ name: 'clock', id: 'clock', data: {} }, { name: 'calendar', id: 'calendar', data: {} }], canReset: true },
} satisfies StoryObj<typeof MkWidgetPicker>;
