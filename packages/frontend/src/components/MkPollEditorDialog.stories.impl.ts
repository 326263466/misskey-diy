/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import { action } from 'storybook/actions';
import MkPollEditorDialog from './MkPollEditorDialog.vue';

export const Default = {
	render(args) {
		return {
			components: { MkPollEditorDialog },
			setup: () => ({ args, done: action('done'), closed: action('closed') }),
			template: '<MkPollEditorDialog v-bind="args" @done="done" @closed="closed"/>',
		};
	},
	args: { poll: null },
	parameters: { layout: 'fullscreen' },
} satisfies StoryObj<typeof MkPollEditorDialog>;

export const ExistingPoll = {
	...Default,
	args: { poll: { choices: ['有兴趣', '没兴趣', '路过'], multiple: false, expiresAt: null, expiredAfter: 86400000 } },
} satisfies StoryObj<typeof MkPollEditorDialog>;

export const TenChoices = {
	...Default,
	args: { poll: { choices: Array.from({ length: 10 }, (_, i) => `选项 ${i + 1}`), multiple: true, expiresAt: null, expiredAfter: null } },
} satisfies StoryObj<typeof MkPollEditorDialog>;
