/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import { action } from 'storybook/actions';
import type { StoryObj } from '@storybook/vue3';
import MkExternalLinkDialog from './MkExternalLinkDialog.vue';

export const Default = {
	render(args) {
		return {
			components: { MkExternalLinkDialog },
			setup() {
				return { args, onClosed: action('closed') };
			},
			template: '<MkExternalLinkDialog v-bind="args" @closed="onClosed" />',
		};
	},
	args: {
		url: 'https://www.bilibili.com/video/BV1SUhe6XEM2/?share_source=copy_web',
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkExternalLinkDialog>;

export const LongUrl = {
	...Default,
	args: {
		url: `https://example.com/watch?source=${'a'.repeat(300)}&title=%E5%8B%95%E7%94%BB`,
	},
} satisfies StoryObj<typeof MkExternalLinkDialog>;

export const InternationalDomain = {
	...Default,
	args: {
		url: 'https://xn--bcher-kva.example:8443/articles/1',
	},
} satisfies StoryObj<typeof MkExternalLinkDialog>;
