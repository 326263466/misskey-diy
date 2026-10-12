/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { HttpResponse, http } from 'msw';
import { commonHandlers } from '../../.storybook/mocks.js';
import coverImage from '../../assets/fedi.jpg';
import MkRedPacketClaimDialog from './MkRedPacketClaimDialog.vue';
import type { entities } from 'misskey-js';
import type { StoryObj } from '@storybook/vue3';

const author: entities.UserLite = {
	id: 'author-example', name: 'woshikunyou', username: 'woshikunyou', host: null, avatarUrl: '', avatarBlurhash: null, avatarDecorations: [], emojis: {}, onlineStatus: 'unknown',
};

function claimUser(id: string, name: string, username: string): entities.UserLite {
	return { id, name, username, host: null, avatarUrl: '', avatarBlurhash: null, avatarDecorations: [], emojis: {}, onlineStatus: 'unknown' };
}

const claims: entities.RedPacketsShowResponse['claims'] = [
	{ id: 'claim-1', user: claimUser('user-a', 'CLucky', 'clucky'), coins: 4.08, createdAt: '2026-10-01T07:23:00.000Z' },
	{ id: 'claim-2', user: claimUser('user-b', 'Do-Linux', 'dolinux'), coins: 0.04, createdAt: '2026-10-01T07:23:30.000Z' },
	{ id: 'claim-3', user: claimUser('user-c', 'cheesesticks', 'cheesesticks'), coins: 1.32, createdAt: '2026-10-01T07:22:40.000Z' },
	{ id: 'claim-4', user: null, coins: 2, createdAt: '2026-10-01T07:22:10.000Z' },
	{ id: 'claim-5', user: claimUser('user-e', 'xuxianking', 'xuxianking'), coins: 0.37, createdAt: '2026-10-01T07:22:00.000Z' },
];

const packet: entities.RedPacketsCreateResponse = {
	id: 'packet-example', senderId: 'author-example', roomId: null, kind: 'group', audience: 'public', coverId: 'classic', mode: 'random', message: '', totalCoins: 20, count: 10,
	remainingCoins: 20, remainingCount: 10, expiresAt: '2099-01-01T00:00:00.000Z', startsAt: null, serverTime: '2026-10-03T00:00:00.000Z', status: 'active', coverFileId: null, coverUrl: null, password: null, claimedCoins: null,
};

export const Default = {
	render(args) { return { components: { MkRedPacketClaimDialog }, setup() { return { args }; }, template: '<MkRedPacketClaimDialog v-bind="args"/>' }; },
	args: { redPacketId: 'packet-example', authorId: 'author-example', redPacket: packet, author },
	parameters: {
		layout: 'padded',
		msw: { handlers: [...commonHandlers, http.post('/api/red-packets/show', () => HttpResponse.json({ ...packet, claims: [] }))] },
	},
} satisfies StoryObj<typeof MkRedPacketClaimDialog>;

function stateStory(overrides: Partial<entities.RedPacketsCreateResponse>, showClaims: entities.RedPacketsShowResponse['claims'] = []): StoryObj<typeof MkRedPacketClaimDialog> {
	const state = { ...packet, ...overrides };
	return {
		...Default,
		args: { ...Default.args, redPacket: state },
		parameters: { ...Default.parameters, msw: { handlers: [...commonHandlers, http.post('/api/red-packets/show', () => HttpResponse.json({ ...state, claims: showClaims }))] } },
	};
}

const exhausted = { status: 'exhausted', totalCoins: 7.81, count: claims.length, remainingCoins: 0, remainingCount: 0 } as const;
export const Claimed = stateStory({ claimedCoins: 4.08, remainingCoins: 12.19, remainingCount: 5 }, claims);
export const Exhausted = stateStory(exhausted, claims);
export const Expired = stateStory({ status: 'expired', expiresAt: '2020-01-01T00:00:00.000Z', remainingCoins: 0, remainingCount: 5 }, claims);
export const CustomCover = stateStory({ ...exhausted, coverFileId: 'cover-example', coverUrl: coverImage, message: '开心快乐！' }, claims);
export const CustomCoverUnopened = stateStory({ coverFileId: 'cover-example', coverUrl: coverImage });
export const CustomCoverClaimed = stateStory({ ...exhausted, claimedCoins: 0.04, coverFileId: 'cover-example', coverUrl: coverImage, message: '开心快乐！' }, claims);
export const EqualAmounts = stateStory({ ...exhausted, totalCoins: 10 }, claims.map(claim => ({ ...claim, coins: 2 })));
export const Scheduled = stateStory({ status: 'scheduled', startsAt: '2026-10-04T02:00:00.000Z', expiresAt: '2026-10-04T04:00:00.000Z' });
