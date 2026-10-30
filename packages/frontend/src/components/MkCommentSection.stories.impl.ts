/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import { note } from '../../.storybook/fakes.js';
import MkCommentSection from './MkCommentSection.vue';
import MkCommentThread from './MkCommentThread.vue';
import MkComment from './MkComment.vue';

export const Default = {
	render(args) {
		return {
			components: { MkCommentSection, MkCommentThread, MkComment },
			setup() { return { args, comment: note() }; },
			template: '<MkCommentSection v-bind="args"><template #default="{ items }"><MkCommentThread v-for="item in items" :key="item"><MkComment :user="comment.user" :createdAt="comment.createdAt"><Mfm :text="comment.text" :author="comment.user"/></MkComment></MkCommentThread></template></MkCommentSection>',
		};
	},
	args: { count: 1, active: false, items: [1], loadMore: async () => {} },
	parameters: { layout: 'padded' },
} satisfies StoryObj<typeof MkCommentSection>;

export const Empty = {
	...Default,
	args: { ...Default.args, count: 0, items: [] },
} satisfies StoryObj<typeof MkCommentSection>;
