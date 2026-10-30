/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@storybook/vue3';
import { http, HttpResponse } from 'msw';
import { note } from '../../.storybook/fakes.js';
import { commonHandlers } from '../../.storybook/mocks.js';
import MkNoteCommentsDrawer from './MkNoteCommentsDrawer.vue';

const render: StoryObj<typeof MkNoteCommentsDrawer>['render'] = args => ({
	components: { MkNoteCommentsDrawer },
	setup: () => ({ args }),
	template: '<MkNoteCommentsDrawer v-bind="args"/>',
});

export const Default = {
	render,
	args: { note: note(), initialCount: 2 },
	parameters: { msw: { handlers: [...commonHandlers, http.post('/api/notes/children', () => HttpResponse.json([
		{ ...note('comment2'), replyId: 'somenoteid', text: 'second comment' },
		{ ...note('comment1'), replyId: 'somenoteid', text: 'first comment' },
	]))] } },
} satisfies StoryObj<typeof MkNoteCommentsDrawer>;

export const Empty = {
	render,
	args: { note: note(), initialCount: 0 },
	parameters: { msw: { handlers: [...commonHandlers, http.post('/api/notes/children', () => HttpResponse.json([]))] } },
} satisfies StoryObj<typeof MkNoteCommentsDrawer>;
