/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import { expect, userEvent, within } from '@storybook/test';
import MkCwButton from './MkCwButton.vue';

export const Default = {
	render() {
		return {
			components: { MkCwButton },
			data: () => ({ showContent: false }),
			template: '<div style="width: 340px; max-width: 100%;"><MkCwButton v-model="showContent">一段关于失眠的记录</MkCwButton></div>',
		};
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const title = canvas.getByRole('button', { name: '一段关于失眠的记录' });
		await expect(title).toHaveAttribute('aria-expanded', 'false');
		await userEvent.click(title);
		await expect(title).toHaveAttribute('aria-expanded', 'true');
		await userEvent.click(title);
		await expect(title).toHaveAttribute('aria-expanded', 'false');
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkCwButton>;

export const LongTitle = {
	...Default,
	render() {
		return {
			components: { MkCwButton },
			data: () => ({ showContent: false }),
			template: '<div style="width: 200px; max-width: 100%;"><MkCwButton v-model="showContent">A_long_content_warning_without_spaces_keeps_the_title_readable_on_small_screens.</MkCwButton></div>',
		};
	},
} satisfies StoryObj<typeof MkCwButton>;
