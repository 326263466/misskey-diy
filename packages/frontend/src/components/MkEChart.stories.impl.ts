/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import MkEChart from './MkEChart.vue';

export const Default = {
	render(args) {
		return {
			components: { MkEChart },
			setup() { return { args }; },
			template: '<div style="height: 240px"><MkEChart v-bind="args"/></div>',
		};
	},
	args: {
		ariaLabel: 'Line chart',
		option: {
			grid: { left: 8, right: 8, top: 16, bottom: 8, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
			tooltip: { trigger: 'axis' },
			xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
			yAxis: { type: 'value' },
			series: [{ type: 'line', smooth: true, showSymbol: false, data: [120, 200, 150, 80, 70, 110, 130] }],
		},
	},
	parameters: { layout: 'padded' },
} satisfies StoryObj<typeof MkEChart>;
