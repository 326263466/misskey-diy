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
import MkTipListDialog from './MkTipListDialog.vue';

const items = [
	{ id: 'tip-3', createdAt: '2026-10-06T03:00:00.000Z', amount: 50, message: '期待下一篇！', user: userLite('tip-user-3', 'reader3', null, '读者三') },
	{ id: 'tip-2', createdAt: '2026-10-06T02:00:00.000Z', amount: 10, message: null, user: userLite('tip-user-2', 'reader2', null, '读者二') },
	{ id: 'tip-1', createdAt: '2026-10-06T01:00:00.000Z', amount: 5, message: '谢谢分享', user: userLite('tip-user-1', 'reader1', null, '读者一') },
];

export const Default = {
	render(args) { return { components: { MkTipListDialog }, setup() { return { args }; }, template: '<MkTipListDialog v-bind="args"/>' }; },
	args: { targetType: 'note', targetId: 'note' },
	parameters: { layout: 'fullscreen', msw: { handlers: [...commonHandlers, http.post('/api/tips/list', () => HttpResponse.json({ items, totalCount: items.length, totalAmount: 65 }))] } },
} satisfies StoryObj<typeof MkTipListDialog>;
