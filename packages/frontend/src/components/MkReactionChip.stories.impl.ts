/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import MkReactionChip from './MkReactionChip.vue';

export const Default = {
	render(args) {
		return {
			components: { MkReactionChip },
			setup() { return { args }; },
			template: '<MkReactionChip v-bind="args"/>',
		};
	},
	args: { reaction: '👍', count: 12, isMine: false },
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkReactionChip>;

export const Mine = {
	...Default,
	args: { ...Default.args, isMine: true },
} satisfies StoryObj<typeof MkReactionChip>;

export const Disabled = {
	...Default,
	args: { ...Default.args, disabled: true },
} satisfies StoryObj<typeof MkReactionChip>;

export const Multiple = {
	...Default,
	render() {
		return {
			components: { MkReactionChip },
			template: '<div style="display: flex; flex-wrap: wrap; gap: 4px;"><MkReactionChip reaction="👍" :count="12" :isMine="false"/><MkReactionChip reaction="🎉" :count="3" :isMine="true"/><MkReactionChip reaction="😀" :count="1" :isMine="true"/></div>',
		};
	},
} satisfies StoryObj<typeof MkReactionChip>;
