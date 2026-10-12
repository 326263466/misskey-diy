/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { ref } from 'vue';
import type { StoryObj } from '@storybook/vue3';
import MkPollEditor from './MkPollEditor.vue';

export const Default = {
	render(args) {
		return {
			components: { MkPollEditor },
			setup: () => ({ model: ref({ ...args.modelValue, choices: [...args.modelValue.choices] }) }),
			template: '<div style="width: min(400px, 100%);"><MkPollEditor v-model="model"/></div>',
		};
	},
	args: { modelValue: { choices: ['', ''], multiple: false, expiresAt: null, expiredAfter: null } },
	parameters: { layout: 'padded' },
} satisfies StoryObj<typeof MkPollEditor>;
