/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import MkReactionList from './MkReactionList.vue';
import MkReactionChip from './MkReactionChip.vue';

export const Default = {
	render() {
		return {
			components: { MkReactionList, MkReactionChip },
			template: '<MkReactionList><MkReactionChip reaction="👍" :count="101" :isMine="false"/><MkReactionChip reaction="🎉" :count="2" :isMine="true"/></MkReactionList>',
		};
	},
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkReactionList>;
