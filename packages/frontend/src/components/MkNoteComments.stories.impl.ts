/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import { http, HttpResponse } from 'msw';
import { note } from '../../.storybook/fakes.js';
import { commonHandlers } from '../../.storybook/mocks.js';
import MkNoteComments from './MkNoteComments.vue';

const source = note();

export const Default = {
	render: args => ({ components: { MkNoteComments }, setup: () => ({ args }), template: '<MkNoteComments v-bind="args"/>' }),
	args: { note: source, initialCount: 1 },
	parameters: { msw: { handlers: [...commonHandlers, http.post('/api/notes/children', () => HttpResponse.json([
		{ ...note('comment'), replyId: source.id, repliesCount: 0 },
	]))] } },
} satisfies StoryObj<typeof MkNoteComments>;

export const Empty = {
	...Default,
	args: { ...Default.args, initialCount: 0 },
	parameters: { msw: { handlers: [...commonHandlers, http.post('/api/notes/children', () => HttpResponse.json([]))] } },
} satisfies StoryObj<typeof MkNoteComments>;
