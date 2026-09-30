/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@storybook/vue3';
import MkMediaPlayIcon from './MkMediaPlayIcon.vue';

export const Default = {
	render: () => ({
		components: { MkMediaPlayIcon },
		template: '<div style="display:flex; gap:32px; padding:32px; font-size:64px; background:var(--MI_THEME-bg)"><MkMediaPlayIcon/><MkMediaPlayIcon style="font-size:38px"/></div>',
	}),
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkMediaPlayIcon>;
