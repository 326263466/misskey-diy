/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import { http, HttpResponse } from 'msw';
import { note } from '../../.storybook/fakes.js';
import { commonHandlers } from '../../.storybook/mocks.js';
import MkComments from './MkComments.vue';

const source = note();

export const Note = {
	render: args => ({ components: { MkComments }, setup: () => ({ args }), template: '<MkComments v-bind="args"/>' }),
	args: { source: { type: 'note', note: source, initialCount: 1 } },
	parameters: { msw: { handlers: [...commonHandlers, http.post('/api/notes/children', () => HttpResponse.json([
		{ ...note('comment'), replyId: source.id, repliesCount: 0 },
	]))] } },
} satisfies StoryObj<typeof MkComments>;

export const Article = {
	...Note,
	args: { source: { type: 'article', articleId: 'article', authorId: source.userId, count: 1 } },
	parameters: { msw: { handlers: [...commonHandlers, http.post('/api/articles/comments', () => HttpResponse.json([
		{ id: 'comment', articleId: 'article', text: source.text, user: source.user, files: [], createdAt: source.createdAt, canDelete: false, replyId: null, replyTo: null, repliesCount: 0, likedCount: 0, isLiked: false },
	]))] } },
} satisfies StoryObj<typeof MkComments>;
