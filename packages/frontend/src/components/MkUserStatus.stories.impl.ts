/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import MkUserStatus from './MkUserStatus.vue';
import { userDetailed } from '../../.storybook/fakes.js';

export const Online = {
	render(args) {
		return {
			components: { MkUserStatus },
			setup: () => ({ args }),
			template: '<MkUserStatus v-bind="args"/>',
		};
	},
	args: { user: { ...userDetailed(), onlineStatus: 'online', customStatus: { icon: 'coffee', text: 'ひと休み中' } } },
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkUserStatus>;

export const Offline = {
	...Online,
	args: { user: { ...userDetailed(), onlineStatus: 'offline', customStatus: null } },
} satisfies StoryObj<typeof MkUserStatus>;
