/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { ref } from 'vue';
import type { StoryObj } from '@storybook/vue3';
import MkInput from './MkInput.vue';
import { i18n } from '@/i18n.js';

export const Default = {
	render(args) {
		return {
			components: { MkInput },
			setup() {
				const value = ref(args.modelValue);
				return { args, value, i18n };
			},
			template: '<div style="width: 320px"><MkInput v-bind="args" v-model="value"><template #label>{{ i18n.ts._profile.company }}</template></MkInput></div>',
		};
	},
	args: { modelValue: '', type: 'text', maxLength: 128 },
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkInput>;

export const SaveOnLeave = {
	...Default,
	args: { ...Default.args, saveOnLeave: async () => {} },
} satisfies StoryObj<typeof MkInput>;

export const ManualSave = {
	...Default,
	args: { ...Default.args, manualSave: true },
} satisfies StoryObj<typeof MkInput>;
