/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@storybook/vue3';
import { HttpResponse, http } from 'msw';
import { commonHandlers } from '../../.storybook/mocks.js';
import { userDetailed } from '../../.storybook/fakes.js';
import MkUserCardMini from './MkUserCardMini.vue';

const author = {
	...userDetailed('author', 'author', null, '文章作者'),
	company: 'Misskey',
	jobTitle: '开发者',
};
const authorWithoutBanner = { ...author, id: 'author-without-banner', bannerUrl: null };

export const Default = {
	args: { user: author, withChart: false },
	render: args => ({
		components: { MkUserCardMini },
		setup: () => ({ args }),
		template: '<div style="width: 280px; max-width: 100%"><MkUserCardMini v-bind="args"/></div>',
	}),
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkUserCardMini>;

export const Author = {
	...Default,
	args: { ...Default.args, author: true },
	parameters: {
		...Default.parameters,
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/users/show', async ({ request }) => {
					const { userId } = await request.json() as { userId: string };
					return HttpResponse.json(userId === authorWithoutBanner.id ? authorWithoutBanner : author);
				}),
				http.post('/api/users/show-partial-bulk', async ({ request }) => {
					const { userIds } = await request.json() as { userIds: string[] };
					return HttpResponse.json(userIds.map(id => ({ ...author, id })));
				}),
				http.post('/api/articles/stats', () => HttpResponse.json({ articlesCount: 24, articleViewsCount: 12800 })),
			],
		},
	},
} satisfies StoryObj<typeof MkUserCardMini>;

export const WithoutBanner = {
	...Author,
	args: { ...Author.args, user: authorWithoutBanner },
} satisfies StoryObj<typeof MkUserCardMini>;
