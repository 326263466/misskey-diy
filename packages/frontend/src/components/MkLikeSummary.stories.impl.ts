/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@storybook/vue3';
import { userLite } from '../../.storybook/fakes.js';
import MkLikeSummary from './MkLikeSummary.vue';

const users = [userLite('one', 'alice'), userLite('two', 'bob'), userLite('three', 'charlie')];
export const Default = { render: args => ({ components: { MkLikeSummary }, setup: () => ({ args }), template: '<MkLikeSummary v-bind="args"/>' }), args: { noteId: 'note', count: 1, users: users.slice(0, 1) } } satisfies StoryObj<typeof MkLikeSummary>;
export const TwoUsers = { ...Default, args: { ...Default.args, count: 2, users: users.slice(0, 2) } } satisfies StoryObj<typeof MkLikeSummary>;
// 头像刚好列全 3 个点赞者，文案不加「等人」
export const ThreeUsers = { ...Default, args: { ...Default.args, count: 3, users } } satisfies StoryObj<typeof MkLikeSummary>;
export const ManyUsers = { ...Default, args: { ...Default.args, count: 30, users } } satisfies StoryObj<typeof MkLikeSummary>;
