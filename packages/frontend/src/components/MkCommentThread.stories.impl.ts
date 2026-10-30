/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import { note } from '../../.storybook/fakes.js';
import MkCommentThread from './MkCommentThread.vue';
import MkComment from './MkComment.vue';

export const Default = {
	render(args) {
		return {
			components: { MkCommentThread, MkComment },
			setup() { return { args, comment: note() }; },
			template: '<MkCommentThread v-bind="args"><MkComment :user="comment.user" :createdAt="comment.createdAt"><Mfm :text="comment.text" :author="comment.user"/></MkComment><template #replies><MkComment :user="comment.user" :createdAt="comment.createdAt" child><Mfm :text="comment.text" :author="comment.user"/></MkComment></template></MkCommentThread>',
		};
	},
	args: { active: false },
	parameters: { layout: 'padded' },
} satisfies StoryObj<typeof MkCommentThread>;
