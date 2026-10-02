/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import { ref } from 'vue';
import type { StoryObj } from '@storybook/vue3';
import MkArticleForm from './MkArticleForm.vue';

export const Default = {
	render(args) {
		return {
			components: { MkArticleForm },
			setup() { return { args, maximized: ref(args.maximized) }; },
			template: '<div :style="maximized ? { height: \'100vh\' } : { maxWidth: \'600px\' }"><MkArticleForm v-bind="args" v-model:maximized="maximized"/></div>',
		};
	},
	args: { mock: true, canMaximize: true, maximized: false },
	parameters: { layout: 'fullscreen' },
} satisfies StoryObj<typeof MkArticleForm>;

export const Maximized = {
	...Default,
	args: { ...Default.args, maximized: true },
} satisfies StoryObj<typeof MkArticleForm>;
