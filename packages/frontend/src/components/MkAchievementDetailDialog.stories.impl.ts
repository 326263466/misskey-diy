/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import { action } from 'storybook/actions';
import type { StoryObj } from '@storybook/vue3';
import MkAchievementDetailDialog from './MkAchievementDetailDialog.vue';

export const Default = {
	render(args) {
		return {
			components: { MkAchievementDetailDialog },
			setup() {
				return { args, closed: action('closed') };
			},
			template: '<MkAchievementDetailDialog v-bind="args" @closed="closed" />',
		};
	},
	args: {
		name: 'notes1',
		unlockedAt: Date.UTC(2026, 8, 30),
		withDescription: true,
	},
	parameters: {
		layout: 'fullscreen',
	},
} satisfies StoryObj<typeof MkAchievementDetailDialog>;
