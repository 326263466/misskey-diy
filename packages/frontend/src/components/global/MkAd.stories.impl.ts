/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, within } from '@storybook/test';
import MkAd from './MkAd.vue';
import type { StoryObj } from '@storybook/vue3';
import { i18n } from '@/i18n.js';

const common = {
	render(args) {
		return {
			components: {
				MkAd,
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
			},
			template: '<MkAd v-bind="props" />',
		};
	},
	async play({ canvasElement }) {
		const canvas = within(canvasElement);
		const a = canvas.getByRole<HTMLAnchorElement>('link');
		const img = within(a).getByRole('img');
		await expect(img).toBeInTheDocument();
		await expect(canvasElement).toHaveTextContent(i18n.ts.ads);
		const buttons = canvas.getAllByRole<HTMLButtonElement>('button');
		await expect(buttons).toHaveLength(1);
		await expect(buttons[0]).toHaveAttribute('aria-label', i18n.ts.more);
	},
	args: {
		preferForms: [],
		specify: {
			id: 'someadid',
			ratio: 1,
			url: '#test',
			place: '',
			imageUrl: '',
			dayOfWeek: 7,
			isSensitive: false,
		},
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkAd>;
export const Square = {
	...common,
	args: {
		...common.args,
		specify: {
			...common.args.specify,
			place: 'square',
			imageUrl:
				'https://github.com/misskey-dev/misskey/blob/master/packages/frontend/assets/about-icon.png?raw=true',
		},
	},
} satisfies StoryObj<typeof MkAd>;
export const Horizontal = {
	...common,
	args: {
		...common.args,
		specify: {
			...common.args.specify,
			place: 'horizontal',
			imageUrl:
				'https://github.com/misskey-dev/misskey/blob/master/packages/frontend/assets/fedi.jpg?raw=true',
		},
	},
} satisfies StoryObj<typeof MkAd>;
export const HorizontalBig = {
	...common,
	args: {
		...common.args,
		specify: {
			...common.args.specify,
			place: 'horizontal-big',
			imageUrl:
				'https://github.com/misskey-dev/misskey/blob/master/packages/frontend/assets/fedi.jpg?raw=true',
		},
	},
} satisfies StoryObj<typeof MkAd>;
export const ZeroRatio = {
	...Square,
	args: {
		...Square.args,
		specify: {
			...Square.args.specify,
			ratio: 0,
		},
	},
} satisfies StoryObj<typeof MkAd>;
