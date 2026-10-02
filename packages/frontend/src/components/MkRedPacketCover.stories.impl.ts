/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import MkRedPacketCover from './MkRedPacketCover.vue';
import type { StoryObj } from '@storybook/vue3';

export const Default = { args: { message: '' } } satisfies StoryObj<typeof MkRedPacketCover>;
