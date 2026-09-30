/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import { action } from 'storybook/actions';
import { expect, userEvent, within } from '@storybook/test';
import { file } from '../../.storybook/fakes.js';
import MkCwButton from './MkCwButton.vue';
import { i18n } from '@/i18n.js';

export const Default = {
	render(args) {
		return {
			components: {
				MkCwButton,
			},
			data() {
				return {
					showContent: false,
				};
			},
			setup() {
				return {
					args,
				};
			},
			computed: {
				props() {
					return {
						...this.args,
					};
				},
				events() {
					return {
						'update:modelValue': action('update:modelValue'),
					};
				},
			},
			template: '<div style="width: 340px; max-width: 100%;"><MkCwButton v-model="showContent" v-bind="props" v-on="events" /></div>',
		};
	},
	args: {
		text: 'Some CW content',
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const buttonElement = canvas.getByRole<HTMLButtonElement>('button');
		await expect(buttonElement).toHaveTextContent(i18n.ts._cw.showContent);
		await expect(buttonElement).toHaveAttribute('aria-expanded', 'false');
		await expect(canvas.getByText(i18n.tsx._cw.chars({ count: 15 }))).toBeVisible();
		await userEvent.click(buttonElement);
		await expect(buttonElement).toHaveTextContent(i18n.ts._cw.hideContent);
		await expect(buttonElement).toHaveAttribute('aria-expanded', 'true');
		await userEvent.click(buttonElement);
	},
	parameters: {
		chromatic: {
			// NOTE: テストが終わるまで待つ
			delay: 5000,
		},
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkCwButton>;
export const IncludesTextAndDriveFile = {
	...Default,
	args: {
		text: 'Some CW content',
		files: [file()],
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		await expect(canvas.getByText(`${i18n.tsx._cw.chars({ count: 15 })} / ${i18n.tsx._cw.files({ count: 1 })}`)).toBeVisible();
	},
} satisfies StoryObj<typeof MkCwButton>;

export const PublicSummary = {
	...Default,
	render(args) {
		return {
			components: { MkCwButton },
			data: () => ({ showContent: false }),
			setup: () => ({ args }),
			template: '<div style="width: 340px; max-width: 100%;"><MkCwButton v-model="showContent" v-bind="args">A public summary that remains visible before opening the hidden content.</MkCwButton></div>',
		};
	},
} satisfies StoryObj<typeof MkCwButton>;

export const Narrow = {
	...IncludesTextAndDriveFile,
	render(args) {
		return {
			components: { MkCwButton },
			data: () => ({ showContent: false }),
			setup: () => ({ args }),
			template: '<div style="width: 200px; max-width: 100%;"><MkCwButton v-model="showContent" v-bind="args">A_long_public_summary_without_spaces_keeps_the_warning_readable_on_small_screens.</MkCwButton></div>',
		};
	},
} satisfies StoryObj<typeof MkCwButton>;
