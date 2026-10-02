/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
 
import { ref } from 'vue';
import MkRedPacketEditor from './MkRedPacketEditor.vue';
import type { StoryObj } from '@storybook/vue3';

export const Default = {
	render(args) {
		return {
			components: { MkRedPacketEditor },
			setup() { return { args, draft: ref({ ...args.modelValue }) }; },
			template: '<MkRedPacketEditor v-bind="args" v-model="draft"/>',
		};
	},
	args: {
		modelValue: { kind: 'group', audience: 'public' as const, recipientIds: [], coverId: 'classic', mode: 'random', totalCoins: 100, count: 5, message: '', expiresInHours: 24, requestId: '019a029d-4800-7000-8000-000000000001' },
		balance: 500,
	},
	parameters: { layout: 'padded' },
} satisfies StoryObj<typeof MkRedPacketEditor>;

export const Equal = { ...Default, args: { ...Default.args, modelValue: { ...Default.args.modelValue, mode: 'equal' } } } satisfies StoryObj<typeof MkRedPacketEditor>;
export const InsufficientBalance = { ...Default, args: { ...Default.args, balance: 0 } } satisfies StoryObj<typeof MkRedPacketEditor>;
export const Pending = { ...Default, args: { ...Default.args, disabled: true } } satisfies StoryObj<typeof MkRedPacketEditor>;
