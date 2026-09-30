/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import MkNotification from './MkNotification.vue';

export const SystemWelcome = {
	render(args) {
		return {
			components: { MkNotification },
			setup() {
				return { args };
			},
			template: '<MkNotification v-bind="args"/>',
		};
	},
	args: {
		notification: {
			id: 'welcome-notification',
			createdAt: '2026-09-28T00:00:00.000Z',
			type: 'system',
			message: 'welcome',
		},
		full: true,
		withTime: true,
	},
	parameters: { layout: 'padded' },
} satisfies StoryObj<typeof MkNotification>;

export const SystemWelcomeToast = {
	...SystemWelcome,
	args: { ...SystemWelcome.args, full: false, withTime: false },
} satisfies StoryObj<typeof MkNotification>;
