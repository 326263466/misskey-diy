/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import { HttpResponse, http } from 'msw';
import { action } from 'storybook/actions';
import { commonHandlers } from '../../.storybook/mocks.js';
import MkChannelPicker from './MkChannelPicker.vue';

const channels = ['Misskey', 'Photography', '日常', 'Vue', '今日の小さな発見をみんなにシェアするチャンネル'].map((name, index) => ({
	id: `channel-${index}`,
	name,
	createdAt: '2026-01-01T00:00:00.000Z',
	lastNotedAt: null,
	description: null,
	userId: null,
	bannerUrl: null,
	usersCount: 12 + index,
	notesCount: 42 + index,
	isArchived: false,
	isSensitive: false,
	allowRenoteToExternal: true,
	isFollowing: index < 2,
}));

export const Default = {
	render(args) {
		return {
			components: { MkChannelPicker },
			setup() { return { args, choose: action('choose'), closed: action('closed') }; },
			template: '<MkChannelPicker v-bind="args" @choose="choose" @closed="closed"/>',
		};
	},
	args: { selectedId: 'channel-1' },
	parameters: {
		layout: 'fullscreen',
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/channels/featured', () => HttpResponse.json(channels)),
				http.post('/api/channels/followed', () => HttpResponse.json(channels.slice(0, 2))),
				http.post('/api/channels/owned', () => HttpResponse.json(channels.slice(1, 3))),
				http.post('/api/channels/search', async ({ request }) => {
					const { query } = await request.json() as { query: string };
					return HttpResponse.json(channels.filter(channel => channel.name.toLowerCase().includes(query.toLowerCase())));
				}),
			],
		},
	},
} satisfies StoryObj<typeof MkChannelPicker>;

export const Empty = {
	...Default,
	parameters: {
		...Default.parameters,
		msw: { handlers: [...commonHandlers, http.post('/api/channels/featured', () => HttpResponse.json([]))] },
	},
} satisfies StoryObj<typeof MkChannelPicker>;

export const Dark = {
	...Default,
	globals: { misskeyTheme: 'd-dark' },
} satisfies StoryObj<typeof MkChannelPicker>;

export const Botanical = {
	...Default,
	globals: { misskeyTheme: 'l-botanical' },
} satisfies StoryObj<typeof MkChannelPicker>;

export const Failed = {
	...Default,
	parameters: {
		...Default.parameters,
		msw: { handlers: [...commonHandlers, http.post('/api/channels/featured', () => HttpResponse.error())] },
	},
} satisfies StoryObj<typeof MkChannelPicker>;
