/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import { ref } from 'vue';
import type { StoryObj } from '@storybook/vue3';
import { HttpResponse, http } from 'msw';
import { commonHandlers } from '../../.storybook/mocks.js';
import MkTopicPicker from './MkTopicPicker.vue';

const tags = ['Misskey', 'Vue', '日常', 'Photography', '旅行', '今日の小さな発見をみんなにシェアする話題', '音楽', '開発', '読書', '料理'];
export const Default = {
	render(args) {
		return {
			components: { MkTopicPicker },
			setup() { return { args, selected: ref([...args.selected ?? []]) }; },
			template: '<MkTopicPicker v-bind="args" :selected="selected" @choose="selected.push($event)"/>',
		};
	},
	args: { selected: [] },
	parameters: {
		layout: 'fullscreen',
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/hashtags/trend', () => HttpResponse.json(tags.map(tag => ({ tag, chart: [], usersCount: 10 })))),
				http.post('/api/hashtags/search', async ({ request }) => {
					const { query } = await request.json() as { query: string };
					return HttpResponse.json(tags.filter(tag => tag.toLowerCase().startsWith(query.toLowerCase())));
				}),
			],
		},
	},
} satisfies StoryObj<typeof MkTopicPicker>;
