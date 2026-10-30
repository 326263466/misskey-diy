/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import { http, HttpResponse } from 'msw';
import { note } from '../../.storybook/fakes.js';
import { commonHandlers } from '../../.storybook/mocks.js';
import MkArticleComments from './MkArticleComments.vue';

const author = note().user;

export const Default = {
	render: args => ({ components: { MkArticleComments }, setup: () => ({ args }), template: '<MkArticleComments v-bind="args"/>' }),
	args: { articleId: 'article', authorId: author.id, count: 1 },
	parameters: { msw: { handlers: [...commonHandlers, http.post('/api/articles/comments', () => HttpResponse.json([
		{ id: 'comment', articleId: 'article', text: note().text, user: author, files: [], createdAt: note().createdAt, canDelete: false, replyId: null, replyTo: null, repliesCount: 0, likedCount: 0, isLiked: false },
	]))] } },
} satisfies StoryObj<typeof MkArticleComments>;
