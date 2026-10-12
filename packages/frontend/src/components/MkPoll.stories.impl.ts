/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import { HttpResponse, http } from 'msw';
import { commonHandlers } from '../../.storybook/mocks.js';
import MkPoll from './MkPoll.vue';

export const Default = {
	render(args) {
		return {
			components: { MkPoll },
			setup: () => ({ args }),
			template: '<div style="width:min(480px, calc(100vw - 40px))"><MkPoll v-bind="args"/></div>',
		};
	},
	args: {
		noteId: 'poll-preview',
		multiple: false,
		expiresAt: null,
		choices: [
			{ text: '有兴趣', votes: 48, isVoted: false },
			{ text: '没兴趣', votes: 20, isVoted: false },
			{ text: '路过', votes: 12, isVoted: false },
		],
	},
	parameters: {
		layout: 'centered',
		msw: { handlers: [...commonHandlers, http.post('/api/notes/polls/vote', () => new HttpResponse(null, { status: 204 }))] },
	},
} satisfies StoryObj<typeof MkPoll>;

export const Multiple = {
	...Default,
	args: { ...Default.args, multiple: true },
} satisfies StoryObj<typeof MkPoll>;

export const Results = {
	...Default,
	args: { ...Default.args, readOnly: true },
} satisfies StoryObj<typeof MkPoll>;
