/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import { ref } from 'vue';
import type { StoryObj } from '@storybook/vue3';
import MkPostFormTopics from './MkPostFormTopics.vue';

export const Default = {
	render(args) {
		return {
			components: { MkPostFormTopics },
			setup() { return { args, model: ref(args.modelValue), enabled: ref(args.enabled) }; },
			template: '<div style="max-width: 540px"><MkPostFormTopics v-bind="args" v-model="model" v-model:enabled="enabled"/></div>',
		};
	},
	args: { modelValue: '#Misskey', enabled: true },
	parameters: { layout: 'padded' },
} satisfies StoryObj<typeof MkPostFormTopics>;

export const LongTopics = {
	...Default,
	args: { ...Default.args, modelValue: '#今日の小さな発見をみんなにシェアする話題' },
} satisfies StoryObj<typeof MkPostFormTopics>;

export const LegacyMultipleTopics = {
	...Default,
	args: { ...Default.args, modelValue: '#Misskey #Vue #日常' },
} satisfies StoryObj<typeof MkPostFormTopics>;

export const Disabled = {
	...Default,
	args: { ...Default.args, disabled: true },
} satisfies StoryObj<typeof MkPostFormTopics>;
