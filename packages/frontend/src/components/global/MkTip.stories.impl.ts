/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useTemplateRef } from 'vue';
import type { StoryObj } from '@storybook/vue3';
import MkTip from './MkTip.vue';
import { i18n } from '@/i18n.js';
import { store } from '@/store.js';

export const Default = {
	render(args) {
		return {
			components: { MkTip },
			setup() {
				store.set('tips', { ...store.r.tips.value, play: false });
				return { args, i18n };
			},
			template: '<MkTip v-bind="args">{{ i18n.ts._play.tip }}</MkTip>',
		};
	},
	args: { k: 'play' },
	parameters: { layout: 'padded' },
} satisfies StoryObj<typeof MkTip>;

export const Mascot = {
	...Default,
	render(args) {
		return {
			components: { MkTip },
			setup() {
				store.set('tips', { ...store.r.tips.value, play: false });
				const anchor = useTemplateRef<HTMLElement>('anchor');
				return { args, i18n, anchor };
			},
			template: '<div class="_panel" style="width: min(480px, 100%); padding: 24px; box-sizing: border-box;"><button ref="anchor" type="button" class="_buttonPrimary">{{ i18n.ts._play.new }}</button></div><MkTip v-bind="args" :anchorElement="anchor" :actionLabel="i18n.ts._play.new"/>',
		};
	},
	args: {
		...Default.args,
		mascot: '/client-assets/tutorial/ai-tip.webp',
		title: i18n.ts._play.tipTitle,
	},
} satisfies StoryObj<typeof MkTip>;

export const Warning = {
	...Default,
	args: { ...Mascot.args, warn: true },
} satisfies StoryObj<typeof MkTip>;
