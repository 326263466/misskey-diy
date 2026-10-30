/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import MkNoteUnavailable from './MkNoteUnavailable.vue';

export const Default = {
	render: args => ({ components: { MkNoteUnavailable }, setup: () => ({ args }), template: '<MkNoteUnavailable v-bind="args"/>' }),
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkNoteUnavailable>;
