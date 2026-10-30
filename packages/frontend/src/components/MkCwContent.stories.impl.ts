/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import { expect, userEvent, within } from '@storybook/test';
import MkCwContent from './MkCwContent.vue';
import { i18n } from '@/i18n.js';

export const Default = {
	render() {
		return {
			components: { MkCwContent },
			data: () => ({ showContent: false }),
			template: '<MkCwContent v-model="showContent" enabled><p>这是一段需要点击后查看的隐藏内容。再次点击上方的隐藏按钮即可重新模糊。</p></MkCwContent>',
		};
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const reveal = canvas.getByRole('button', { name: i18n.ts._cw.showContent });
		await userEvent.click(reveal);
		await expect(canvas.queryByRole('button', { name: i18n.ts._cw.showContent })).toBeNull();
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkCwContent>;

export const PlainContent = {
	...Default,
	render() {
		return {
			components: { MkCwContent },
			data: () => ({ showContent: true }),
			template: '<MkCwContent v-model="showContent" :enabled="false"><p>没有内容警告时，组件不会改变原来的内容布局。</p></MkCwContent>',
		};
	},
	play() {},
} satisfies StoryObj<typeof MkCwContent>;
