/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
 
import { HttpResponse, http } from 'msw';
import { commonHandlers } from '../../.storybook/mocks.js';
import MkRedPacket from './MkRedPacket.vue';
import type { StoryObj } from '@storybook/vue3';

const packet = {
	id: 'packet-example', senderId: 'author-example', roomId: null, kind: 'group' as const, audience: 'public' as const, coverId: 'classic' as const, mode: 'random' as const, message: '', totalCoins: 100, count: 5,
	remainingCoins: 100, remainingCount: 5, expiresAt: '2099-01-01T00:00:00.000Z', status: 'active' as const, coverFileId: null, coverUrl: null, claimedCoins: null,
};

export const Default = {
	render(args) { return { components: { MkRedPacket }, setup() { return { args }; }, template: '<MkRedPacket v-bind="args"/>' }; },
	args: { redPacketId: 'packet-example', authorId: 'author-example', redPacket: packet },
	parameters: {
		layout: 'padded',
		msw: { handlers: [...commonHandlers, http.post('/api/red-packets/show', () => HttpResponse.json({ ...packet, claims: [] }))] },
	},
} satisfies StoryObj<typeof MkRedPacket>;

export const Claimed = { ...Default, args: { ...Default.args, redPacket: { ...packet, claimedCoins: 20, remainingCoins: 80, remainingCount: 4 } } } satisfies StoryObj<typeof MkRedPacket>;
export const Exhausted = { ...Default, args: { ...Default.args, redPacket: { ...packet, status: 'exhausted', remainingCoins: 0, remainingCount: 0 } } } satisfies StoryObj<typeof MkRedPacket>;
export const Expired = { ...Default, args: { ...Default.args, redPacket: { ...packet, status: 'expired', expiresAt: '2020-01-01T00:00:00.000Z' } } } satisfies StoryObj<typeof MkRedPacket>;
