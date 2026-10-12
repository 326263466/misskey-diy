/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import { HttpResponse, http } from 'msw';
import type { StoryObj } from '@storybook/vue3';
import { commonHandlers } from '../../.storybook/mocks.js';
import { userLite } from '../../.storybook/fakes.js';
import MkTipSection from './MkTipSection.vue';

const items = [5, 10, 19.99, 20, 50, 100].map((amount, index) => ({ id: `tip-${index}`, createdAt: '2026-10-06T00:00:00.000Z', amount, message: index % 2 === 0 ? '谢谢分享，期待后续！' : null, user: userLite(`sender-${index}`, `reader${index + 1}`, null, ['Alice', 'Bob', '读者', 'Kitty', 'Miku', '分享者'][index]) }));

export const Default = {
	render(args) { return { components: { MkTipSection }, setup() { return { args }; }, template: '<div style="width: min(780px, 90vw)"><MkTipSection v-bind="args"/></div>' }; },
	args: { recipient: userLite('tip-recipient', 'alice', null, 'Alice'), targetType: 'page', targetId: 'article', targetTitle: 'Hello, Misskey' },
	parameters: { msw: { handlers: [...commonHandlers, http.post('/api/tips/list', () => HttpResponse.json({ items, totalCount: items.length, totalAmount: items.reduce((sum, item) => sum + item.amount, 0) })), http.post('/api/i/wallet', () => HttpResponse.json({ balance: 1000, points: 100, reservedBalance: 0, exchangeEnabled: true, exchangeRate: 1 })), http.post('/api/i/wallet/tip', async ({ request }) => {
		const { amount } = await request.json() as { amount: number };
		return HttpResponse.json({ balance: 1000 - amount, amount, sent: true });
	})] } },
} satisfies StoryObj<typeof MkTipSection>;
