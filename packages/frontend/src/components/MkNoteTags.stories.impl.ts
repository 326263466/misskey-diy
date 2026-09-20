/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@storybook/vue3';
import MkNoteTags from './MkNoteTags.vue';

export const Default = { render: args => ({ components: { MkNoteTags }, setup: () => ({ args }), template: '<MkNoteTags v-bind="args"/>' }), args: { tags: ['TypeScript', 'Vue', 'Photography'] } } satisfies StoryObj<typeof MkNoteTags>;
export const LongTag = { ...Default, args: { tags: ['A_very_long_topic_tag_that_needs_to_wrap_on_small_screens'] } } satisfies StoryObj<typeof MkNoteTags>;
