/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import MkCommentEmpty from './MkCommentEmpty.vue';

export const Default = {
	render() { return { components: { MkCommentEmpty }, template: '<MkCommentEmpty/>' }; },
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkCommentEmpty>;
