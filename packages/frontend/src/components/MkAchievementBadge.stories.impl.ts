/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@storybook/vue3';
import MkAchievementBadge from './MkAchievementBadge.vue';

export const CheckinBadges = {
	render: () => ({
		components: { MkAchievementBadge },
		setup: () => ({ names: ['checkin1', 'checkinStreak7', 'checkinStreak30', 'checkinTotal30', 'checkinTotal100', 'checkinTotal365'] }),
		template: '<div style="display:flex; gap:16px; padding:16px"><MkAchievementBadge v-for="name in names" :key="name" :name="name"/></div>',
	}),
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkAchievementBadge>;
