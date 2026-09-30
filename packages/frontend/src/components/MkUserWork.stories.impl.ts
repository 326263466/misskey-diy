/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import MkUserWork from './MkUserWork.vue';

export const Default = {
	render(args) {
		return {
			components: { MkUserWork },
			setup() { return { args }; },
			template: '<div style="width: 260px"><MkUserWork v-bind="args"/></div>',
		};
	},
	args: { user: { company: 'Misskey', jobTitle: 'Developer' } },
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkUserWork>;

export const CompanyOnly = {
	...Default,
	args: { user: { company: 'Misskey' } },
} satisfies StoryObj<typeof MkUserWork>;

export const JobTitleOnly = {
	...Default,
	args: { user: { jobTitle: 'Developer' } },
} satisfies StoryObj<typeof MkUserWork>;

export const Empty = {
	...Default,
	args: { user: {} },
} satisfies StoryObj<typeof MkUserWork>;

export const LongValues = {
	...Default,
	args: { user: { company: 'A very long company name that exceeds the available width', jobTitle: 'Software Development Engineer' } },
} satisfies StoryObj<typeof MkUserWork>;
