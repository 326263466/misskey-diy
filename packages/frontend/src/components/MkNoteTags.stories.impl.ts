/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import MkNoteTags from './MkNoteTags.vue';

export const Default = {
	render: args => ({
		components: { MkNoteTags },
		setup: () => ({ args }),
		template: '<div style="max-width: 100%; width: 480px;"><MkNoteTags v-bind="args"/></div>',
	}),
	args: { tags: ['TypeScript', 'Vue', 'Photography'] },
	parameters: { layout: 'padded' },
} satisfies StoryObj<typeof MkNoteTags>;

export const LongTag = {
	...Default,
	args: { tags: ['A_very_long_topic_tag_that_is_truncated_without_changing_its_destination', '日常记录', 'Photography'] },
} satisfies StoryObj<typeof MkNoteTags>;

export const WithChannel = {
	...Default,
	args: { tags: ['TypeScript', 'Vue'], channel: { id: 'channel', name: 'Frontend' } },
} satisfies StoryObj<typeof MkNoteTags>;

export const ChannelOnly = {
	...Default,
	args: { tags: [], channel: { id: 'channel', name: 'Photography' } },
} satisfies StoryObj<typeof MkNoteTags>;

export const Narrow = {
	...Default,
	render: args => ({
		components: { MkNoteTags },
		setup: () => ({ args }),
		template: '<div style="max-width: 100%; width: 240px;"><MkNoteTags v-bind="args"/></div>',
	}),
	args: { tags: ['今日话题', 'PhotoOfTheDay', 'A_very_long_topic_tag_that_is_truncated_on_a_small_screen', 'Vue', '旅の記録'], channel: { id: 'channel', name: 'A very long channel name that stays within the card' } },
} satisfies StoryObj<typeof MkNoteTags>;
