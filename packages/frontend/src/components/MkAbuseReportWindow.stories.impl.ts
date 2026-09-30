/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { action } from 'storybook/actions';
import { userEvent, within } from '@storybook/test';
import { HttpResponse, http } from 'msw';
import { userDetailed } from '../../.storybook/fakes.js';
import { commonHandlers } from '../../.storybook/mocks.js';
import MkAbuseReportWindow from './MkAbuseReportWindow.vue';
import type { StoryObj } from '@storybook/vue3';
import { i18n } from '@/i18n.js';
export const Default = {
	render(args) {
		return {
			components: {
				MkAbuseReportWindow,
			},
			setup() {
				return {
					args,
					events: {
						'closed': action('closed'),
					},
				};
			},
			template: '<MkAbuseReportWindow v-bind="args" v-on="events" />',
		};
	},
	args: {
		user: userDetailed(),
		reportTarget: { reportType: 'user' },
	},
	parameters: {
		layout: 'fullscreen',
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/users/report-abuse', async ({ request }) => {
					action('POST /api/users/report-abuse')(await request.json());
					return HttpResponse.json({});
				}),
			],
		},
	},
} satisfies StoryObj<typeof MkAbuseReportWindow>;

export const WithContent = {
	...Default,
	args: {
		...Default.args,
		reportTarget: { reportType: 'boost', targetId: 'example', reaction: 'text:888' },
		context: {
			label: i18n.ts._boost.title,
			text: '888',
			url: 'https://example.com/notes/example',
		},
	},
} satisfies StoryObj<typeof MkAbuseReportWindow>;

export const SelectedReason = {
	...WithContent,
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole('radio', { name: i18n.ts._abuseReport._reasons.spam }));
	},
} satisfies StoryObj<typeof MkAbuseReportWindow>;

export const OtherReason = {
	...WithContent,
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole('radio', { name: i18n.ts._abuseReport._reasons.other }));
	},
} satisfies StoryObj<typeof MkAbuseReportWindow>;
