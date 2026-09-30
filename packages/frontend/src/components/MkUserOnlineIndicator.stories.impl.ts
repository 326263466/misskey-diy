/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import { userDetailed } from '../../.storybook/fakes.js';
import MkUserOnlineIndicator from './MkUserOnlineIndicator.vue';

export const Online = {
	render(args) {
		return {
			components: { MkUserOnlineIndicator },
			setup() { return { args }; },
			template: '<MkUserOnlineIndicator v-bind="args" style="width: 24px; height: 24px" />',
		};
	},
	args: { user: { ...userDetailed(), onlineStatus: 'online' } },
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkUserOnlineIndicator>;

export const Custom = {
	...Online,
	args: { user: { ...userDetailed(), onlineStatus: 'online', customStatus: { icon: 'music', text: '音楽を聴いています' } } },
} satisfies StoryObj<typeof MkUserOnlineIndicator>;

export const Offline = {
	...Online,
	args: { user: { ...userDetailed(), onlineStatus: 'offline' } },
} satisfies StoryObj<typeof MkUserOnlineIndicator>;

export const Unknown = {
	...Online,
	args: { user: { ...userDetailed(), onlineStatus: 'unknown' } },
} satisfies StoryObj<typeof MkUserOnlineIndicator>;

export const Invisible = {
	...Online,
	args: { user: { ...userDetailed(), onlineStatus: 'unknown', onlineStatusOverride: 'invisible', hideOnlineStatus: false } },
} satisfies StoryObj<typeof MkUserOnlineIndicator>;

export const Hidden = {
	...Online,
	args: { user: { ...userDetailed(), onlineStatus: null, hideOnlineStatus: true } },
} satisfies StoryObj<typeof MkUserOnlineIndicator>;
