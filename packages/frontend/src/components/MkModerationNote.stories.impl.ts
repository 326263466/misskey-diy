/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import { ref } from 'vue';
import { action } from 'storybook/actions';
import type { StoryObj } from '@storybook/vue3';
import MkModerationNote from './MkModerationNote.vue';

export const Default = {
	render(args) {
		return {
			components: { MkModerationNote },
			setup() {
				const note = ref(args.modelValue ?? '');
				return { args, note };
			},
			template: '<MkModerationNote v-bind="args" v-model="note"/>',
		};
	},
	args: {
		modelValue: '',
		save: async (text: string) => { action('save')(text); },
	},
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkModerationNote>;

export const ExistingNote = {
	...Default,
	args: {
		...Default.args,
		modelValue: 'Follow up on the report.\nKeep this note for the moderation team.',
	},
} satisfies StoryObj<typeof MkModerationNote>;
