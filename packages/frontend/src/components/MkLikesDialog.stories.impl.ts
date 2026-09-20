/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@storybook/vue3';
import { http, HttpResponse } from 'msw';
import { userDetailed } from '../../.storybook/fakes.js';
import { commonHandlers } from '../../.storybook/mocks.js';
import MkLikesDialog from './MkLikesDialog.vue';

export const Default = {
	render: args => ({ components: { MkLikesDialog }, setup: () => ({ args }), template: '<MkLikesDialog v-bind="args"/>' }),
	args: { noteId: 'note', count: 3 },
	parameters: { msw: { handlers: [...commonHandlers, http.post('/api/notes/likes', () => HttpResponse.json([
		{ id: 'like3', createdAt: new Date().toISOString(), user: userDetailed('one', 'alice') },
		{ id: 'like2', createdAt: new Date().toISOString(), user: userDetailed('two', 'bob') },
		{ id: 'like1', createdAt: new Date().toISOString(), user: userDetailed('three', 'charlie') },
	]))] } },
} satisfies StoryObj<typeof MkLikesDialog>;
