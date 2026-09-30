/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import MkStatusIcon from './MkStatusIcon.vue';
import { customStatusIcons } from '@/utility/status-icons.js';

export const Online = {
	render(args) {
		return {
			components: { MkStatusIcon },
			setup() { return { args }; },
			template: '<MkStatusIcon v-bind="args" style="font-size: 32px" />',
		};
	},
	args: { status: 'online' },
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkStatusIcon>;

export const Away = {
	...Online,
	args: { status: 'away' },
} satisfies StoryObj<typeof MkStatusIcon>;

export const Active = {
	...Online,
	args: { status: 'active' },
} satisfies StoryObj<typeof MkStatusIcon>;

export const Busy = {
	...Online,
	args: { status: 'busy' },
} satisfies StoryObj<typeof MkStatusIcon>;

export const DoNotDisturb = {
	...Online,
	args: { status: 'doNotDisturb' },
} satisfies StoryObj<typeof MkStatusIcon>;

export const Invisible = {
	...Online,
	args: { status: 'invisible' },
} satisfies StoryObj<typeof MkStatusIcon>;

export const Custom = {
	...Online,
	args: { status: 'custom', icon: 'coffee' },
} satisfies StoryObj<typeof MkStatusIcon>;

export const Offline = {
	...Online,
	args: { status: 'offline' },
} satisfies StoryObj<typeof MkStatusIcon>;

export const Unknown = {
	...Online,
	args: { status: 'unknown' },
} satisfies StoryObj<typeof MkStatusIcon>;

export const BuiltInStatuses = {
	...Online,
	render() {
		return {
			components: { MkStatusIcon },
			setup() { return { statuses: ['online', 'active', 'away', 'busy', 'doNotDisturb', 'invisible', 'offline', 'unknown'] }; },
			template: '<div style="display: flex; gap: 16px"><MkStatusIcon v-for="status in statuses" :key="status" :status="status" style="font-size: 32px" /></div>',
		};
	},
} satisfies StoryObj<typeof MkStatusIcon>;

export const CustomIcons = {
	...Custom,
	render() {
		return {
			components: { MkStatusIcon },
			setup() { return { icons: customStatusIcons }; },
			template: '<div style="display: flex; gap: 16px"><MkStatusIcon v-for="icon in icons" :key="icon" status="custom" :icon="icon" style="font-size: 32px" /></div>',
		};
	},
} satisfies StoryObj<typeof MkStatusIcon>;

export const PlainStatuses = {
	...BuiltInStatuses,
	render() {
		return {
			components: { MkStatusIcon },
			setup() { return { statuses: ['online', 'away', 'busy', 'doNotDisturb', 'invisible'] }; },
			template: '<div style="display: flex; gap: 16px"><MkStatusIcon v-for="status in statuses" :key="status" :status="status" plain style="font-size: 32px" /></div>',
		};
	},
} satisfies StoryObj<typeof MkStatusIcon>;
