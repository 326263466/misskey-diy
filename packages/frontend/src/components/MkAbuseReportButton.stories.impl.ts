/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import { note, userLite } from '../../.storybook/fakes.js';
import MkAbuseReportButton from './MkAbuseReportButton.vue';

const author = userLite('reporteduserid', 'reporteduser');

export const Default = {
	render: args => ({ components: { MkAbuseReportButton }, setup: () => ({ args }), template: '<MkAbuseReportButton v-bind="args"/>' }),
	args: { target: { type: 'note', note: { ...note(), userId: author.id, user: author } } },
} satisfies StoryObj<typeof MkAbuseReportButton>;

export const IconOnly = {
	...Default,
	args: { ...Default.args, iconOnly: true },
} satisfies StoryObj<typeof MkAbuseReportButton>;
