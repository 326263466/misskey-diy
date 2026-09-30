/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import MkTextarea from './MkTextarea.vue';
import { i18n } from '@/i18n.js';

export const Default = {
	render(args) {
		return {
			components: { MkTextarea },
			setup() {
				return { args, i18n };
			},
			template: '<div style="width: 400px;"><MkTextarea v-bind="args"><template #label>{{ i18n.ts.moderationNote }}</template><template #caption>{{ i18n.ts.moderationNoteDescription }}</template></MkTextarea></div>',
		};
	},
	args: { modelValue: '', manualSave: true },
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkTextarea>;

export const Collapsible = {
	...Default,
	args: { ...Default.args, collapsible: true, collapsedPlaceholder: i18n.ts.addModerationNote },
} satisfies StoryObj<typeof MkTextarea>;

export const WithNote = {
	...Collapsible,
	args: { ...Collapsible.args, modelValue: 'First line\nSecond line\nThird line' },
} satisfies StoryObj<typeof MkTextarea>;
