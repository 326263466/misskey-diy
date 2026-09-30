/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@storybook/vue3';
import MkCommunityHub from './MkCommunityHub.vue';

export const Default = {
	render: args => ({ components: { MkCommunityHub }, setup: () => ({ args }), template: '<MkCommunityHub v-bind="args" />' }),
	args: { active: 'checkin' },
	parameters: { layout: 'fullscreen' },
} satisfies StoryObj<typeof MkCommunityHub>;

export const Dark = { ...Default, globals: { misskeyTheme: 'd-dark' } } satisfies StoryObj<typeof MkCommunityHub>;
