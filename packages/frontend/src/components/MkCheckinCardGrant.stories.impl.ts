/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import { ref } from 'vue';
import { HttpResponse, http } from 'msw';
import { action } from 'storybook/actions';
import { commonHandlers } from '../../.storybook/mocks.js';
import MkCheckinCardGrant from './MkCheckinCardGrant.vue';
import type { StoryObj } from '@storybook/vue3';

let mockMakeupCards = 0;

export const Default = {
	beforeEach({ args }) {
		mockMakeupCards = args.makeupCards;
	},
	render(args) {
		return {
			components: { MkCheckinCardGrant },
			setup() {
				return { args, makeupCards: ref(args.makeupCards) };
			},
			template: '<MkCheckinCardGrant v-bind="args" v-model:makeup-cards="makeupCards" />',
		};
	},
	args: {
		userId: 'example-user',
		points: 42,
		makeupCards: 3,
	},
	parameters: {
		layout: 'padded',
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/admin/checkin/grant-cards', async ({ request }) => {
					const body = await request.json() as { amount: number };
					action('POST /api/admin/checkin/grant-cards')(body);
					mockMakeupCards += body.amount;
					return HttpResponse.json({ makeupCards: mockMakeupCards });
				}),
			],
		},
	},
} satisfies StoryObj<typeof MkCheckinCardGrant>;

export const NoCards = {
	...Default,
	args: { ...Default.args, points: 0, makeupCards: 0 },
} satisfies StoryObj<typeof MkCheckinCardGrant>;
