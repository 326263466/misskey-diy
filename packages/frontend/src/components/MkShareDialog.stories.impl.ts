/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import { action } from 'storybook/actions';
import MkShareDialog from './MkShareDialog.vue';

export const Default = {
	render(args) {
		return {
			components: { MkShareDialog },
			setup() {
				return { args, closed: action('closed') };
			},
			template: '<MkShareDialog v-bind="args" @closed="closed"/>',
		};
	},
	args: {
		title: 'Misskeyのノート',
		text: 'みんなで共有する、小さな発見。',
		url: 'https://example.com/notes/example-note',
	},
	parameters: { layout: 'fullscreen' },
} satisfies StoryObj<typeof MkShareDialog>;

export const Restricted = {
	...Default,
	args: { ...Default.args, text: undefined, restricted: true },
} satisfies StoryObj<typeof MkShareDialog>;

export const LongContent = {
	...Default,
	args: {
		...Default.args,
		title: 'とても長い名前のユーザーが共有するノートのタイトル'.repeat(8),
		text: 'たくさんの内容があるノートでも、共有画面ではコンパクトなプレビューにまとめます。\n'.repeat(20),
		url: `https://example.com/notes/example-note?ref=${'long-link-'.repeat(30)}`,
	},
} satisfies StoryObj<typeof MkShareDialog>;

export const WithoutDescription = {
	...Default,
	args: { ...Default.args, text: undefined },
} satisfies StoryObj<typeof MkShareDialog>;
