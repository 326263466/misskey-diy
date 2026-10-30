/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import { note } from '../../.storybook/fakes.js';
import MkComment from './MkComment.vue';
import MkCommentThread from './MkCommentThread.vue';
import { i18n } from '@/i18n.js';

const comment = note();

export const Default = {
	render(args) {
		return {
			components: { MkComment, MkCommentThread },
			setup() { return { args, comment, i18n }; },
			template: '<MkCommentThread><MkComment v-bind="args"><Mfm :text="comment.text" :author="comment.user"/><template #actions="{ actionClass }"><button type="button" class="_button" :class="actionClass" :aria-label="i18n.ts.reply"><i class="ti ti-message-circle" aria-hidden="true"></i>{{ i18n.ts.reply }}</button></template></MkComment></MkCommentThread>',
		};
	},
	args: { user: comment.user, createdAt: comment.createdAt, authorId: comment.user.id },
	parameters: { layout: 'padded' },
} satisfies StoryObj<typeof MkComment>;
