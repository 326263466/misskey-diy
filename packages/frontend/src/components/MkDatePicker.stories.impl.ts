/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';
import MkDatePicker from './MkDatePicker.vue';
import type { StoryObj } from '@storybook/vue3';

export const Default = {
	render(args) {
		return {
			components: { MkDatePicker },
			setup() { return { args, value: ref(args.modelValue) }; },
			template: '<div style="max-width: 320px"><MkDatePicker v-bind="args" v-model="value"/></div>',
		};
	},
	args: { modelValue: '2026-10-01', type: 'date' },
} satisfies StoryObj<typeof MkDatePicker>;

export const DateTime = { ...Default, args: { modelValue: '2026-10-01T12:30', type: 'datetime-local' } } satisfies StoryObj<typeof MkDatePicker>;
