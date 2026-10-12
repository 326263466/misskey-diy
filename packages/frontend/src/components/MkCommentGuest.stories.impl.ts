/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import MkCommentGuest from './MkCommentGuest.vue';

export const Default = {
	render() { return { components: { MkCommentGuest }, template: '<div style="width: min(800px, 100%);"><MkCommentGuest/></div>' }; },
	parameters: { layout: 'padded' },
} satisfies StoryObj<typeof MkCommentGuest>;
