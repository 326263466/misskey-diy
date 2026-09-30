/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { action } from 'storybook/actions';
import type { StoryObj } from '@storybook/vue3';
import MkUpdated from './MkUpdated.vue';

export const Default = {
	render() {
		return {
			components: { MkUpdated },
			setup() {
				return { onClosed: action('closed') };
			},
			template: '<MkUpdated @closed="onClosed" />',
		};
	},
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkUpdated>;
